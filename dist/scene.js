
import * as THREE from './vendor/three.module.js';
const host=document.querySelector('.art');
const mode=document.body.dataset.scene;
if(host){
try{
const renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,powerPreference:'low-power'});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));
renderer.setClearColor(0x000000,0);
renderer.outputColorSpace=THREE.SRGBColorSpace;
host.appendChild(renderer.domElement);
renderer.domElement.setAttribute('aria-hidden','true');
const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(38,1,.1,80);
camera.position.set(0,0,9);
scene.add(new THREE.AmbientLight(0xc6b4ff,2));
const light=new THREE.DirectionalLight(0xffffff,5);light.position.set(3,4,5);scene.add(light);
const rim=new THREE.PointLight(mode==='dating'?0xff77ba:0xaaff33,35,20);rim.position.set(-3,-1,4);scene.add(rim);
const group=new THREE.Group();scene.add(group);
let actors=[],rings=[];
if(mode==='dating'){
 const colors=[0xffa5c9,0xbdb1ff];
 colors.forEach((color,i)=>{
   const node=new THREE.Group();
   const shape=new THREE.Mesh(new THREE.TorusKnotGeometry(.72,.24,128,20,2,3),new THREE.MeshPhysicalMaterial({color,metalness:.48,roughness:.22,clearcoat:1}));
   node.add(shape);node.position.x=i?1.32:-1.32;group.add(node);actors.push(node);
   const ring=new THREE.Mesh(new THREE.TorusGeometry(1.25,.014,8,160),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.7}));ring.rotation.x=1.1;node.add(ring);rings.push(ring);
 });
 const bridge=[];for(let i=0;i<80;i++){const x=-1.2+i/79*2.4;bridge.push(new THREE.Vector3(x,.22*Math.sin(i/79*Math.PI),0));}
 group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(bridge),new THREE.LineBasicMaterial({color:0xffd2e6,transparent:true,opacity:.6})));
}else{
 const geometry=new THREE.TorusKnotGeometry(1.28,.37,190,24,2,5);
 const mat=new THREE.ShaderMaterial({uniforms:{uTime:{value:0},uAmount:{value:.6}},vertexShader:`uniform float uTime;uniform float uAmount;varying vec3 vNormal;varying vec3 vPosition;void main(){vec3 p=position;float wave=sin(p.x*4.0+uTime)*sin(p.y*3.0-uTime*.7)*cos(p.z*4.0+uTime*.4);p+=normal*wave*.18*uAmount;vNormal=normalize(normalMatrix*normal);vPosition=p;gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0);}`,fragmentShader:`precision highp float;uniform float uTime;varying vec3 vNormal;varying vec3 vPosition;void main(){float band=sin(vPosition.y*3.0+vPosition.x*2.0+uTime*.2)*.5+.5;vec3 acid=vec3(.73,1.,.12);vec3 violet=vec3(.57,.16,.95);vec3 color=mix(violet,acid,smoothstep(.1,.9,band));float diffuse=max(dot(normalize(vNormal),normalize(vec3(1.,2.,3.))),0.);float fresnel=pow(1.-abs(normalize(vNormal).z),2.);gl_FragColor=vec4(color*(.38+diffuse*.7)+fresnel*.4,1.);}`});
 const knot=new THREE.Mesh(geometry,mat);group.add(knot);actors.push(knot);
 for(let i=0;i<3;i++){const ring=new THREE.Mesh(new THREE.TorusGeometry(2+i*.18,.012,6,180),new THREE.MeshBasicMaterial({color:[0xd5ff52,0xa464ff,0x67ffcf][i],transparent:true,opacity:.5}));ring.rotation.set(i*.9,.5+i*.6,0);group.add(ring);rings.push(ring);}
}
const points=[];for(let i=0;i<700;i++){const a=i*2.399963,b=Math.acos(1-2*(i+.5)/700),r=3.5+(i%7)/6*1.8;points.push(r*Math.sin(b)*Math.cos(a),r*Math.sin(b)*Math.sin(a),r*Math.cos(b)-1);}
const stars=new THREE.Points(new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(points,3)),new THREE.PointsMaterial({color:mode==='dating'?0xf3c1e9:0xcbff61,size:.018,transparent:true,opacity:.7}));scene.add(stars);
const motion=matchMedia('(prefers-reduced-motion: reduce)');
let dirty=true;
let paused=motion.matches,inView=true,time=0,last=0,px=0,py=0,amount=.6;
const pause=document.getElementById('motion-toggle');
const label=()=>{dirty=true;pause.textContent=paused?'Play motion':'Pause motion';pause.setAttribute('aria-pressed',String(paused));};label();
pause.addEventListener('click',()=>{paused=!paused;label();});
motion.addEventListener('change',e=>{paused=e.matches;label();});
document.getElementById('scene-amount').addEventListener('input',e=>{amount=Number(e.target.value)/100;dirty=true;});
host.addEventListener('pointermove',e=>{const b=host.getBoundingClientRect();px=(e.clientX-b.left)/b.width-.5;py=(e.clientY-b.top)/b.height-.5;});
host.addEventListener('pointerleave',()=>{px=0;py=0;});
const resize=()=>{const b=host.getBoundingClientRect();renderer.setSize(b.width,b.height,false);camera.aspect=b.width/b.height;camera.updateProjectionMatrix();dirty=true;};
new ResizeObserver(resize).observe(host);resize();
new IntersectionObserver(([entry])=>{inView=entry.isIntersecting;dirty=true;}).observe(host);
renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();host.classList.remove('is-3d');renderer.setAnimationLoop(null);document.querySelector('.scene-note').textContent='Static scene · graphics context unavailable';});
renderer.setAnimationLoop(ms=>{
 const dt=last?Math.min((ms-last)/1000,.05):0;last=ms;
 if(document.hidden||!inView||(paused&&!dirty))return;
 if(!paused)time+=dt;
 group.rotation.y=(!paused?Math.sin(time*.2)*.14+px*.45:.1);group.rotation.x=(!paused?py*.3:0);
 if(mode==='dating'){
   actors.forEach((n,i)=>{n.position.x=(i?1:-1)*(1.1+(1-amount)*.6);n.position.y=Math.sin(time*.7+i*Math.PI)*.3;n.rotation.set(time*.16*(i?1:-1),time*.22+i,.2);});
 }else{
   actors[0].rotation.set(time*.14,time*.19,.1);actors[0].material.uniforms.uTime.value=time;actors[0].material.uniforms.uAmount.value=amount;rings.forEach((r,i)=>{r.rotation.z=time*.08*(i%2?1:-1);});
 }
 stars.rotation.y=time*.025;renderer.render(scene,camera);dirty=false;
});
host.classList.add('is-3d');host.dataset.renderer='three-webgl';
}catch(error){document.querySelector('.scene-note').textContent='Static scene · 3D unavailable on this device';console.warn('Three.js scene fallback:',error.message);}
}
