# Bounded encounter implementation — 21 November 2026

## Current implementation and verification

The existing rose/plum concept now links to `/encounter.html`. A server runtime calls two distinct actual OpenAI model IDs with different fictional adult personas, alternating streamed turns. No canned output or mock transport exists in the shipped runtime. Unit/integration tests inject fixture responses explicitly; those prove orchestration and failure behavior, not model quality or account availability.

At delivery no provider key exists in this project's local environment or Sites runtime. No real inference has been verified and no credits consumed. Hosted inference is disabled. The public UI displays this state rather than pretending that dialogue has been generated.

The API uses native fetch and the documented Responses SSE transport, with `store:false`, fixed model IDs, no tools and no retries. Lyra uses `gpt-5.4-mini-2026-03-17`; Milo uses `gpt-5.4-nano-2026-03-17`. The latter is marked deprecated in current official documentation; availability must be checked when a key is supplied. No silent substitution occurs. Confirmed returned model identity must match before a turn is marked complete. Google/Nemotron are possible later adapters, not currently supported providers. No SDK subscription or ChatGPT sign-in is treated as an API key.

Official sources inspected:
- https://developers.openai.com/api/docs/guides/streaming-responses
- https://developers.openai.com/api/reference/resources/responses/methods/create
- https://developers.openai.com/api/docs/models/gpt-5.4-mini
- https://developers.openai.com/api/docs/models/gpt-5.4-nano

## Local activation

Requires Node 22. No third-party package installation is needed.

1. Copy `config.example.env` to `.env.local` in the repository; it is ignored by Git.
2. Set `OPENAI_API_KEY` in that local file using an editor. Do not paste it into chat or commit it. Set a separate random `ENCOUNTER_ACCESS_TOKEN` of at least 32 characters using the example command. This is an operator start token, not the provider key.
3. Set `ENCOUNTERS_ENABLED=true`; run `npm run dev`. Open http://127.0.0.1:8080/encounter.html and enter the operator start token.
4. Run the smallest two-turn encounter first, confirm actual account/model access and compare observed usage to the provider dashboard. Export the transcript/settings if desired. Output/model behavior remains unvalidated until this real test.

The local server listens on loopback and checks Host. The durable spend journal is `work/spend-reservations.jsonl`. An exclusive `.lock` prevents concurrent live local servers. A crash may leave a stale lock: verify that the old server is stopped before manually removing only that lock. Never remove/reset the spend journal to bypass the authorized cap. Malformed journal data fails closed.

## Spend boundaries

Harsh authorized **up to €1 total for the initial live test** in this chat. The implementation uses a stricter fixed **US$0.50 total reservation ceiling** and makes no automatic daily reset. It reserves US$0.15 before each encounter, including failed/stopped encounters, and never refunds unused reservations. At most three runs can start. This is intentionally pessimistic; it is not the billed cost or a currency conversion guarantee. No additional tests, budget resets or increased ceilings are authorized by a restart.

The reservation bounds 8 turns with at most 15,000 UTF-8 input bytes plus 1,000 tokens of framing margin per turn, and 256 output tokens. Checked prices are below the conservative ceilings of US$1/M input and US$6/M output tokens. Maximum reservation calculation: 8 × (16,000 × 1 + 256 × 6) / 1,000,000 = US$0.140288. Fixed settings/personas prevent arbitrary visitor prompt growth; context and displayed output also have byte limits. Pinning model IDs and checking prices at activation are required. Revalidate the bound before any model/provider/price change. Provider project-level limits are an additional safeguard where available.

Requests require a secret operator token, same-origin browser starts, allowlisted settings and validated limits. An active run blocks another start in the same runtime; the durable global budget enforces the total across runtime instances. Stop/disconnect aborts upstream generation and prevents the next turn; already-generated tokens may still be billed. Per-turn 45s timeout; overall 120s timeout. Provider output is untrusted text, never executed as HTML or tools.

## Hosting and rollback

Existing Sites project ID, public audience and URL are retained. `npm run build` produces a self-contained Worker at `dist/server/index.js` embedding the accepted static pages and vendored art assets. It includes no `.env`, docs, local ledger, server source routes or Git data. The same build works with no secrets; API config reports unavailable and starts return 503.

Enabling hosted inference additionally requires a durable `DATING_BUDGET` D1 binding with a single initialized budget row. No database or other billable infrastructure is provisioned by this change. Do not enable paid public inference without configuring and verifying the shared budget store. The Worker expects an atomic conditional UPDATE on this schema, prepared by the hosting migration workflow rather than request-time creation:

```sql
CREATE TABLE encounter_budget (id INTEGER PRIMARY KEY CHECK (id = 1), reserved INTEGER NOT NULL DEFAULT 0 CHECK (reserved >= 0));
INSERT INTO encounter_budget (id, reserved) VALUES (1, 0);
```

Do not initialize a second budget store for the same approved test allowance after local spending: transfer existing reservations or reduce the remaining cap first. Runtime secrets are separate from source; configure via Sites environment tools/settings, never the hosting manifest. Live enablement requires all four gates: `ENCOUNTERS_ENABLED=true`, key, 32+ character access token, durable ledger. The public page can be viewed without these; starting a funded run requires the operator token.

Kill switch: set `ENCOUNTERS_ENABLED=false`. Existing in-flight turns must finish or time out; disabling prevents new runs after runtime refresh. Roll back through Sites to the previous saved static version (version 3) if necessary. Preserve the durable budget on rollback/redeploy and never overwrite its reserved total. No transcript persistence or recovery is promised: refreshing/leaving clears browser memory. The provider receives the synthetic personas and current transcript; `store:false` does not override its other retention/abuse-monitoring policies.

## Next action

Securely configure provider access, run the smallest real encounter under the existing cap, and review actual conversation quality and usage. Decide on hosted budget-store provisioning before activating public paid starts. X posts, tagging and scheduling remain prohibited.
