// The transport carries model text only as data; it is never inserted as HTML.
export async function* readEvents(body) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const {value, done} = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, {stream:true});
      buffer = buffer.replace(/\r\n/g, '\n');
      let boundary;
      while ((boundary = buffer.indexOf('\n\n')) !== -1) {
        const block = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const data = block.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
        if (data) yield JSON.parse(data);
      }
      if (buffer.length > 1000000) throw new Error('The encounter service returned an oversized event.');
      if (done) {
        if (buffer.trim()) throw new Error('The connection ended during an event.');
        break;
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

if (typeof document !== 'undefined') {
  const $ = id => document.getElementById(id);
  const form = $('encounter-form');
  let config = null;
  let controller = null;
  let run = null;
  let currentTurn = null;
  let currentText = null;
  let currentCard = null;
  let userStopped = false;
  let terminalEvent = false;

  function state(message) { $('run-status').textContent = message; }
  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function renderParticipants(participants) {
    $('participants').replaceChildren();
    for (const person of participants) {
      const card = element('article', 'participant-card');
      card.append(element('div', 'eyebrow', person.id === 'a' ? 'First voice' : 'Second voice'));
      card.append(element('h3', '', person.name));
      card.append(element('div', 'model-id', `${person.provider} / ${person.model}`));
      card.append(element('p', 'persona', person.persona));
      $('participants').append(card);
    }
  }
  function lock(running) {
    for (const input of form.querySelectorAll('input, select')) input.disabled = running;
    $('start').disabled = running || !config?.available;
    $('stop').disabled = !running;
    $('refresh').disabled = running;
  }
  async function loadConfig() {
    $('refresh').disabled = true;
    $('start').disabled = true;
    $('availability').textContent = 'Checking model availability…';
    try {
      const response = await fetch('/api/config', {cache:'no-store',signal:AbortSignal.timeout(10000)});
      if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) throw new Error('unreachable');
      const incoming = await response.json();
      if (!Array.isArray(incoming.participants) || incoming.participants.length !== 2 || !incoming.limits) throw new Error('invalid config');
      config = incoming;
      renderParticipants(config.participants);
      const maxTurns = Math.min(8, Number(config.limits.maxTurns) || 8);
      const maxTokens = Math.min(256, Number(config.limits.maxOutputTokens) || 256);
      $('turns').max = String(maxTurns);
      $('turns').value = String(Math.min(Number($('turns').value), maxTurns));
      $('tokens').max = String(maxTokens);
      $('tokens').value = String(Math.min(Number($('tokens').value), maxTokens));
      $('limits-note').textContent = `At most ${maxTurns} alternating turns, up to ${maxTokens} output tokens per turn. A turn may end early when its token allowance is exhausted.`;
      $('availability').textContent = config.available ? 'Model service configured. An operator access token is required to start an encounter.' : `Live encounters unavailable. ${config.reason || 'The operator has not enabled inference.'}`;
      $('availability').parentElement.dataset.state = config.available ? 'ready' : 'unavailable';
      $('start').disabled = !config.available;
    } catch {
      config = null;
      $('availability').textContent = 'Live encounters unavailable. The encounter service is not reachable or has not been deployed. No model output is being shown.';
      $('availability').parentElement.dataset.state = 'unavailable';
    } finally {
      $('refresh').disabled = false;
    }
  }
  function finishTurn(interrupted = false) {
    if (!currentTurn) return;
    currentCard.dataset.state = interrupted ? 'interrupted' : 'complete';
    currentTurn.complete = !interrupted;
    if (!interrupted) {
      const person = run.participants.find(p => p.id === currentTurn.speaker);
      $('turn-announcement').textContent = `${person?.name || 'Participant'}: ${currentTurn.text}`;
    }
    if (interrupted) currentCard.append(element('p','turn-note','Partial turn — generation was interrupted.'));
    currentTurn = null;
    currentText = null;
    currentCard = null;
  }
  function accept(event) {
    switch (event.type) {
      case 'start':
        run.participants = event.participants;
        run.limits = event.limits;
        run.setting = event.setting;
        renderParticipants(event.participants);
        state('Encounter started. Waiting for the first response…');
        break;
      case 'turn': {
        if (currentTurn) throw new Error('The service started a turn before finishing the previous turn.');
        const person = run.participants.find(p => p.id === event.speaker);
        if (!person) throw new Error('The service returned an unknown participant.');
        currentTurn = {index:event.index,speaker:event.speaker,model:event.model,text:'',complete:false};
        run.transcript.push(currentTurn);
        currentCard = element('article','turn');
        currentCard.dataset.speaker = event.speaker;
        currentCard.dataset.state = 'generating';
        currentCard.append(element('div','turn-meta',`Turn ${event.index + 1} · ${person.name} · ${event.model}`));
        currentText = element('p','turn-text');
        currentCard.append(currentText);
        $('transcript').append(currentCard);
        state(`${person.name} is responding · turn ${event.index + 1} of ${run.settings.turns}`);
        break;
      }
      case 'delta':
        if (!currentTurn || typeof event.text !== 'string') throw new Error('The service returned an unexpected text event.');
        currentTurn.text += event.text;
        currentText.textContent = currentTurn.text;
        break;
      case 'turn_end':
        if (!currentTurn || currentTurn.index !== event.index) throw new Error('The service returned an unexpected turn ending.');
        currentTurn.usage = event.usage ?? null;
        finishTurn();
        state(`Turn ${event.index + 1} complete.`);
        break;
      case 'done':
        if (currentTurn) finishTurn(true);
        terminalEvent = true;
        run.status = event.reason === 'completed' ? 'completed' : 'stopped';
        run.reason = event.reason;
        state(run.status === 'completed' ? 'Encounter complete. You can export the transcript or start a new meeting.' : `Encounter ended: ${event.reason}.`);
        break;
      case 'error':
        throw new Error(event.message || 'The model service could not complete this encounter.');
    }
  }
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (controller || !config?.available || !form.reportValidity()) return;
    const settings = {setting:$('setting').value,turns:Number($('turns').value),maxOutputTokens:Number($('tokens').value)};
    const access = $('access-token').value.trim();
    controller = new AbortController();
    userStopped = false;
    terminalEvent = false;
    currentTurn = null;
    run = {version:1,startedAt:new Date().toISOString(),status:'running',settings,participants:structuredClone(config.participants),transcript:[]};
    $('transcript').replaceChildren();
    $('export').disabled = false;
    lock(true);
    state('Connecting to the model service…');
    try {
      const headers = {'Content-Type':'application/json','Accept':'text/event-stream'};
      if (access) headers.Authorization = `Bearer ${access}`;
      const response = await fetch('/api/encounter',{method:'POST',headers,body:JSON.stringify(settings),signal:controller.signal});
      // Clear the operator token after sending; never include it in run/export state.
      $('access-token').value = '';
      if (!response.ok) {
        let message = `The encounter could not start (HTTP ${response.status}).`;
        if (response.headers.get('content-type')?.includes('application/json')) {
          const failure = await response.json();
          message = failure.error || failure.message || message;
        }
        throw new Error(message);
      }
      if (!response.headers.get('content-type')?.includes('text/event-stream') || !response.body) throw new Error('The service did not return a conversation stream.');
      for await (const incoming of readEvents(response.body)) {
        accept(incoming);
        if (terminalEvent) break;
      }
      if (!terminalEvent) throw new Error('The connection ended before the encounter completed. The transcript may be partial.');
    } catch (error) {
      finishTurn(true);
      run.status = userStopped ? 'stopped' : 'error';
      run.error = userStopped ? null : error.message;
      run.reason = userStopped ? 'Stopped by spectator' : 'Interrupted or unavailable';
      state(userStopped ? 'Encounter stopped. Completed and partial turns remain available to export.' : `Encounter interrupted: ${error.message}`);
    } finally {
      $('access-token').value = '';
      run.endedAt = new Date().toISOString();
      controller = null;
      lock(false);
    }
  });
  $('stop').addEventListener('click', () => {
    if (!controller) return;
    userStopped = true;
    $('stop').disabled = true;
    state('Stopping the encounter…');
    controller.abort();
  });
  $('refresh').addEventListener('click',loadConfig);
  $('export').addEventListener('click', () => {
    if (!run) return;
    const blob = new Blob([JSON.stringify(run,null,2)],{type:'application/json'});
    const url = URL.createObjectURL(blob);
    const anchor = element('a');
    anchor.href = url;
    anchor.download = `dating-for-ai-encounter-${run.startedAt.replace(/[:.]/g,'-')}.json`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url),1000);
  });
  window.addEventListener('pagehide', () => controller?.abort());
  loadConfig();
}
