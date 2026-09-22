'use strict';
(() => {
 const el=id=>document.getElementById(id);let S=null,spectCandidates=[],groups=new Map(),CT=null,V=null,M=null,worker=null,spEpoch=0,ctEpoch=0,mapEpoch=0,scale=1,loadingCT=false;let displayVolume=null,smoothEpoch=0,smoothCache=null;let fbpStarted=0,fbpSeconds=null,fbpTimings=null,fbpSmoothingSeconds=0;
 const message=t=>{el('liveStatus95').textContent=t;status(t);};
 function randomUnit(){
  if(globalThis.crypto?.getRandomValues){const q=new Uint32Array(1);crypto.getRandomValues(q);return q[0]/4294967296;}
  return Math.random();
 }
 function randomOffset(min,max){const magnitude=Math.round(min+randomUnit()*(max-min));return (randomUnit()<.5?-1:1)*magnitude;}
 function startRegistrationExercise(){
  const values=[randomOffset(35,70),randomOffset(35,70),randomOffset(20,45)];
  ['rx95','ry95','rz95'].forEach((id,i)=>el(id).value=values[i]);
  planeCache95=null;invalidateMap();
 }
 function invalidateMap(){document.dispatchEvent(new Event("lab95osemInvalidate"));mapEpoch++;M=null;el('mu95').hidden=true;el('mapInfo95').textContent='Registro sin confirmar. Mapa de atenuación sin calcular.';el('confirm95').disabled=!V||!CT;}
 function stop(){if(worker){worker.terminate();worker=null;}el('cancel95').disabled=true;el('fbp95').disabled=!S;}
 function invalidate(){stop();planeCache95=null;smoothEpoch++;smoothCache=null;displayVolume=null;V=null;el('empty').hidden=false;invalidateMap();el('registration95').hidden=true;el('progress95').value=0;}
 document.addEventListener('lab95invalidate',invalidate);
 document.addEventListener('lab95navigate',()=>{if(V&&step===1)el('empty').hidden=true;});
 function resetLive(){spEpoch++;ctEpoch++;S=null;CT=null;spectCandidates=[];groups.clear();loadingCT=false;invalidate();el('energy95').replaceChildren();el('energy95').disabled=true;el('spectSeries').replaceChildren(new Option('Sin adquisiciones',''));el('spectSeries').disabled=true;message('Carga las proyecciones SPECT en el paso 1.');}
 el('new').addEventListener('click',resetLive);
 async function loadSpect(f){
  if(!f)return;clearResults();S=null;CT=null;el('fbp95').disabled=true;el('energy95').disabled=true;const epoch=++spEpoch;el('caseName').textContent='Estudio importado';message('Leyendo proyecciones SPECT…');
  try{const d=await Lab95.read(f);if(epoch!==spEpoch)return;S=Lab95.spect(d);el('energy95').replaceChildren(...S.windows.map(w=>new Option(`${w.id}: ${w.low.toFixed(2)}–${w.high.toFixed(2)} keV`,w.id)));el('energy95').disabled=false;el('fbp95').disabled=false;el('spectInfo').textContent=`${f.name} · ${S.n} × ${S.n} · ${S.frames} imágenes · ${S.windows.length} ventanas. Píxeles y geometría de proyección cargados.`;el('caseInfo').textContent='Estudio local: FBP y registro disponibles en el paso 2.';selectCT();message('SPECT listo. Selecciona la ventana de fotopico y genera la FBP en el paso 2.');}
  catch(e){if(epoch!==spEpoch)return;S=null;el('spectInfo').textContent='No cargado: '+e.message;message(e.message);}
 }
 el('spectFile').onchange=()=>{const f=el('spectFile').files[0];if(!f)return;el('spectFolder').value='';spectCandidates=[];el('spectSeries').replaceChildren(new Option('Archivo seleccionado directamente',''));el('spectSeries').disabled=true;loadSpect(f);};
 async function scanStudyFolder(files){
  if(!files.length)return;el('spectFile').value='';el('ctFiles').value='';clearResults();S=null;CT=null;spectCandidates=[];groups=new Map();loadingCT=true;el('fbp95').disabled=true;el('energy95').disabled=true;el('spectSeries').disabled=el('ctSeries').disabled=true;el('spectSeries').replaceChildren(new Option('Examinando carpeta…',''));el('ctSeries').replaceChildren(new Option('Examinando carpeta…',''));const spectEpoch=++spEpoch,ctToken=++ctEpoch;let ignored=0,bytes=0,lastError='';
  try{for(let i=0;i<files.length;i++){if(spectEpoch!==spEpoch||ctToken!==ctEpoch)return;try{const d=await Lab95.read(files[i]),text=tag=>(d.string(tag)||'').trim(),modality=text('x00080060');if(modality==='NM'){const type=text('x00080008'),frames=Number(text('x00280008')||1);if(!type.includes('TOMO')||type.includes('RECON')||frames<2)throw Error('NM no tomográfico original');spectCandidates.push({file:files[i],name:text('x0008103e')||text('x00081030')||'Adquisición NM',frames,rows:d.uint16('x00280010'),cols:d.uint16('x00280011')});}else if(modality==='CT'){const q=Lab95.ct(d);if(!q.series)throw Error('TC sin identificación de serie');bytes+=q.data.byteLength;if(bytes>512*1024*1024)throw Error('LIMIT');if(!groups.has(q.series))groups.set(q.series,{name:q.name,slices:[]});groups.get(q.series).slices.push(q);}else throw Error('Modalidad no utilizada');}catch(e){if(e.message==='LIMIT')throw Error('TC superior al límite de 512 MB. Elige una carpeta que contenga solo las series necesarias.');ignored++;lastError=e.message||String(e);}
    if(i%8===0){const progress=`Examinando carpeta compartida: ${i+1}/${files.length}…`;el('spectInfo').textContent=el('ctInfo').textContent=progress;await new Promise(r=>setTimeout(r,0));}
   }
   if(spectEpoch!==spEpoch||ctToken!==ctEpoch)return;const sp=el('spectSeries'),ct=el('ctSeries');sp.replaceChildren(new Option(spectCandidates.length?'Elige una adquisición SPECT…':'Sin adquisiciones SPECT',''));spectCandidates.forEach((q,i)=>sp.add(new Option(`${q.name} · ${q.rows||'?'} × ${q.cols||'?'} · ${q.frames} imágenes · ${q.file.webkitRelativePath||q.file.name}`,String(i))));sp.disabled=!spectCandidates.length;ct.replaceChildren(new Option(groups.size?'Elige una serie TC…':'Sin series TC',''));for(const [key,g]of [...groups].sort((a,b)=>b[1].slices.length-a[1].slices.length))ct.add(new Option(`${g.name} · ${g.slices.length} cortes`,key));ct.disabled=!groups.size;el('spectInfo').textContent=spectCandidates.length?`${spectCandidates.length} adquisición(es) SPECT encontrada(s). Elige cuál cargar.`:'No se encontraron proyecciones SPECT tomográficas originales.';el('ctInfo').textContent=groups.size?`${groups.size} serie(s) TC encontrada(s). Elige cuál cargar.`:'No se encontraron series TC axiales compatibles.';message(`Carpeta examinada: ${spectCandidates.length} SPECT, ${groups.size} serie(s) TC y ${ignored} archivo(s) no utilizados.`);
  }catch(e){if(spectEpoch!==spEpoch||ctToken!==ctEpoch)return;spectCandidates=[];groups.clear();el('spectSeries').replaceChildren(new Option('Sin adquisiciones',''));el('ctSeries').replaceChildren(new Option('Sin series',''));el('spectInfo').textContent=el('ctInfo').textContent=e.message+(lastError?' Último archivo: '+lastError:'');message(e.message);}finally{if(spectEpoch===spEpoch&&ctToken===ctEpoch){loadingCT=false;el('fbp95').disabled=!S;}}
 }
 el('spectFolder').onchange=()=>scanStudyFolder([...el('spectFolder').files]);
 el('spectSeries').onchange=()=>{const i=Number(el('spectSeries').value);if(el('spectSeries').value===''||!spectCandidates[i])return;loadSpect(spectCandidates[i].file);};
 async function load(files){
  if(!files.length)return;clearResults();const epoch=++ctEpoch;CT=null;groups=new Map();loadingCT=true;el('fbp95').disabled=true;el('ctSeries').disabled=true;el('ctSeries').replaceChildren();let omitted=0,lastError='',bytes=0;
  try{for(let i=0;i<files.length;i++){const d=await Lab95.read(files[i]).catch(e=>{lastError=e.message;return null;});if(epoch!==ctEpoch)return;
    try{if(!d)throw Error(lastError);const q=Lab95.ct(d);if(!q.series)throw Error('Sin identificación de serie.');bytes+=q.data.byteLength;if(bytes>512*1024*1024)throw Error('LIMIT');if(!groups.has(q.series))groups.set(q.series,{name:q.name,slices:[]});groups.get(q.series).slices.push(q);}catch(e){if(e.message==='LIMIT')throw Error('TC superior al límite de 512 MB. Carga solo la serie necesaria.');omitted++;lastError=e.message;}
    if(i%8===0){el('ctInfo').textContent=`Cargando TC ${i+1}/${files.length}…`;await new Promise(r=>setTimeout(r,0));if(epoch!==ctEpoch)return;}
   }
   if(!groups.size)throw Error('No hay TC compatible. '+lastError);el('ctSeries').add(new Option('Elige una serie TC…',''));for(const [key,g] of [...groups].sort((a,b)=>b[1].slices.length-a[1].slices.length))el('ctSeries').add(new Option(`${g.name} · ${g.slices.length} cortes`,key));el('ctSeries').value='';el('ctSeries').disabled=false;loadingCT=false;el('ctInfo').textContent=`${groups.size} serie(s) TC encontrada(s). Elige cuál cargar. ${omitted} archivo(s) omitidos.`;message('Carpeta o archivos TC examinados. Elige una serie.');
  }catch(e){if(epoch!==ctEpoch)return;groups.clear();CT=null;el('ctInfo').textContent=e.message;message(e.message);}finally{if(epoch===ctEpoch){loadingCT=false;el('fbp95').disabled=!S;}}
 }
 function selectCT(){CT=null;invalidateMap();const g=groups.get(el('ctSeries').value);if(!g){if(groups.size)el('ctInfo').textContent=`${groups.size} serie(s) TC encontrada(s). Elige cuál cargar.`;return;}
  try{if(!S){el('ctInfo').textContent=`${g.slices.length} cortes cargados. Carga SPECT para revisar el marco espacial.`;return;}CT=Lab95.prepareCT(g.slices,S);startRegistrationExercise();el('ctInfo').textContent=`${g.slices.length} cortes · ${g.slices[0].cols} × ${g.slices[0].rows} · mismo marco espacial. Registro pendiente de revisión.`;el('confirm95').disabled=!V;renderLive();}
  catch(e){el('ctInfo').textContent=e.message;renderLive();}
 }
 el('ctFiles').onchange=()=>load([...el('ctFiles').files]);el('ctFolder').onchange=()=>scanStudyFolder([...el('ctFolder').files]);el('ctSeries').onchange=selectCT;
 for(const id of ['energy95','ramp95'])el(id).onchange=()=>{invalidate();message('Selección modificada. Genera de nuevo la reconstrucción preliminar.');};
 el('cancel95').onclick=()=>{stop();message('Cálculo detenido. No se conserva un volumen incompleto.');};
 el('fbp95').onclick=()=>{
  if(!S||loadingCT)return;invalidate();el('fbp95').disabled=true;el('cancel95').disabled=false;
  fbpStarted=performance.now();const ramp=el('ramp95').checked;const url=URL.createObjectURL(new Blob([Lab95.workerSource],{type:'text/javascript'}));worker=new Worker(url);URL.revokeObjectURL(url);
  worker.onerror=e=>{stop();message('Error del cálculo: '+e.message);};
  worker.onmessage=({data:q})=>{if(q.error){stop();message(q.error);return;}if(q.progress){el('progress95').max=q.total;el('progress95').value=q.progress;message(`Calculando ${ramp?'FBP':'retroproyección sin filtrar'}: corte ${q.progress}/${q.total}`);return;}
   if(q.volume){fbpTimings=q.fbpTimings;fbpSeconds=(performance.now()-fbpStarted)/1000;V=q.volume;stop();const sample=[];for(let i=0;i<V.length;i+=7)if(V[i]>0)sample.push(V[i]);sample.sort((a,b)=>a-b);scale=sample[Math.floor(sample.length*.995)]||1;el('liveSlice95').max=S.n-1;el('liveSlice95').value=Math.floor(S.n/2);el('registration95').hidden=false;el('empty').hidden=true;el('confirm95').disabled=!CT;el('fbpTitle95').textContent=ramp?'FBP · filtro rampa':'Retroproyección sin filtrar';el('mode').textContent='Estudio cargado · reconstrucción preliminar';message('Volumen preliminar calculado. Revisa el registro en los tres planos.');displayVolume=V;renderLive();updateSmoothing();}
  };worker.postMessage({n:S.n,views:S.views,data:S.data,window:+el('energy95').value,ramp});
 };
 async function updateSmoothing(){
  const token=++smoothEpoch,enabled=el('smooth95').checked;el('smoothWidth95').disabled=!enabled;
  if(!V||!S)return;
  const title=el('ramp95').checked?'FBP · filtro rampa':'Retroproyección sin filtrar';
  if(!enabled){fbpSmoothingSeconds=0;displayVolume=V;el('fbpTitle95').textContent=title+' · sin suavizado';el('smoothInfo95').textContent='Original sin suavizado adicional. No se modifican el TC ni el mapa μ.';renderLive();return;}
  if(!el('smoothWidth95').checkValidity()||!el('smoothWidth95').value){el('smoothWidth95').reportValidity();return;}
  const fwhm=+el('smoothWidth95').value;
  if(smoothCache?.fwhm===fwhm){fbpSmoothingSeconds=0;displayVolume=smoothCache.volume;}
  else{
   displayVolume=V;el('fbpTitle95').textContent=title+' · original mientras se suaviza';el('smoothInfo95').textContent='Aplicando gaussiano 3D…';renderLive();
   const smoothingStarted=performance.now();const result=await Lab95.gaussian3D(V,S.n,fwhm/S.spacing/2.354820045,()=>token!==smoothEpoch);
   if(!result||token!==smoothEpoch)return;
   fbpSmoothingSeconds=(performance.now()-smoothingStarted)/1000;smoothCache={fwhm,volume:result};displayVolume=result;
  }
  if(token!==smoothEpoch)return;
  el('fbpTitle95').textContent=title+` · Gauss ${fwhm.toFixed(1)} mm`;
  el('smoothInfo95').textContent=`Gaussiano 3D activo: FWHM ${fwhm.toFixed(1)} mm. Aplicado una vez sobre el original, antes de la visualización positiva. El TC y el mapa μ conservan sus valores.`;renderLive();
 }
 el('smooth95').onchange=updateSmoothing;el('smoothWidth95').onchange=updateSmoothing;
 const offsets=()=>['rx95','ry95','rz95'].map(id=>+el(id).value);
 function validOffsets(){return ['rx95','ry95','rz95'].every(id=>el(id).value!==''&&el(id).checkValidity());}
 let planeCache95=null;
 function renderLive(){
  if(!V||!S)return;const n=S.n,size=256,index=+el('liveSlice95').value,plane=el('livePlane95').value,off=offsets();if(!validOffsets())return;
  const volume=displayVolume||V,key=[plane,index,...off].join('|');
  const coordinates=(u,v)=>plane==='axial'?[u,v,index]:plane==='coronal'?[u,index,v]:[index,u,v];
  if(!planeCache95||planeCache95.source!==S||planeCache95.ct!==CT||planeCache95.key!==key){
   const hu=new Float32Array(size*size);for(let v=0;v<size;v++)for(let u=0;u<size;u++){const xyz=coordinates(u*(n-1)/(size-1),v*(n-1)/(size-1));hu[v*size+u]=Lab95.sampleCT(CT,Lab95.point(S,...xyz,off));}
   planeCache95={source:S,ct:CT,key,hu,volume:null};
  }
  if(planeCache95.volume!==volume){
   // Bilinear sampling of the selected SPECT plane, at the same patient coordinates as CT.
   const emission=new Float32Array(size*size);
   const at=(u,v)=>{const [x,y,z]=coordinates(u,v);return volume[z*n*n+y*n+x];};
   for(let v=0;v<size;v++)for(let u=0;u<size;u++){const x=u*(n-1)/(size-1),y=v*(n-1)/(size-1),ix=Math.min(n-2,Math.floor(x)),iy=Math.min(n-2,Math.floor(y)),wx=x-ix,wy=y-iy;emission[v*size+u]=(at(ix,iy)*(1-wx)+at(ix+1,iy)*wx)*(1-wy)+(at(ix,iy+1)*(1-wx)+at(ix+1,iy+1)*wx)*wy;}
   planeCache95.volume=volume;planeCache95.emission=emission;
  }
  el('liveIndex95').textContent=`${index+1}/${n}`;const canvases=['liveA95','liveB95'].map(id=>el(id)),ctx=canvases.map(c=>{if(c.width!==size)c.width=size;if(c.height!==size)c.height=size;return c.getContext('2d');}),im=ctx.map(c=>c.createImageData(size,size)),alpha=+el('blend95').value/100,spectWidth=+el('spectWidth95').value/100,spectLevel=+el('spectLevel95').value/100,width=+el('ctWidth95').value,center=+el('ctLevel95').value;
  for(let j=0;j<size*size;j++){const i=j*4,em=Math.max(0,Math.min(1,(planeCache95.emission[j]/scale-spectLevel)/spectWidth+.5)),hu=planeCache95.hu[j],gray=255*Math.max(0,Math.min(1,(hu-center)/width+.5)),color=color95(em),a=em>.01?alpha:0;
   for(let k=0;k<3;k++){im[0].data[i+k]=color[k];im[1].data[i+k]=Number.isFinite(hu)?gray*(1-a)+color[k]*a:(k===2?50:color[k]);}for(const q of im)q.data[i+3]=255;
  }ctx.forEach((c,i)=>c.putImageData(im[i],0,0));
  // The attenuation preview and reconstruction grid retain their original size.
  const c=el('mu95');c.width=n;c.height=n;const mc=c.getContext('2d'),mi=mc.createImageData(n,n);
  for(let v=0;v<n;v++)for(let u=0;u<n;u++){const [x,y,z]=coordinates(u,v),j=z*n*n+y*n+x,i=(v*n+u)*4;for(let k=0;k<3;k++)mi.data[i+k]=M&&Number.isFinite(M[j])?255*Math.min(1,M[j]/.4):(k===2?50:0);mi.data[i+3]=255;}mc.putImageData(mi,0,0);
 }
 document.addEventListener('lab95repaint',()=>renderLive());
 for(const id of ['livePlane95','liveSlice95','blend95'])el(id).oninput=()=>{el('blendValue95').textContent=el('blend95').value+' %';renderLive();};
 const windowPairs=[['spectLevel95','spectLevelNumber95'],['spectWidth95','spectWidthNumber95'],['ctLevel95','ctLevelNumber95'],['ctWidth95','ctWidthNumber95']];
 for(const [slider,number] of windowPairs){
  el(slider).oninput=()=>{el(number).value=el(slider).value;if(slider.startsWith('ct'))el('ctWindow95').value='custom';renderLive();};
  el(number).oninput=()=>{if(el(number).value===''||!el(number).checkValidity())return;el(slider).value=el(number).value;if(slider.startsWith('ct'))el('ctWindow95').value='custom';renderLive();};
  el(number).onchange=()=>{if(el(number).value===''||!el(number).checkValidity())el(number).value=el(slider).value;};
 }
 function setWindow(id,value){el(id+'95').value=value;el(id+'Number95').value=value;}
 el('ctWindow95').onchange=()=>{const preset={bone:[450,1800],soft:[40,400],outline:[-400,1000]}[el('ctWindow95').value];if(preset){setWindow('ctLevel',preset[0]);setWindow('ctWidth',preset[1]);renderLive();}};
 el('resetWindows95').onclick=()=>{setWindow('spectLevel',50);setWindow('spectWidth',100);setWindow('ctLevel',450);setWindow('ctWidth',1800);el('ctWindow95').value='bone';renderLive();};
 for(const id of ['rx95','ry95','rz95'])el(id).oninput=()=>{invalidateMap();renderLive();};
 async function confirmRegistration(){
  if(!V){message('Genera la FBP antes de confirmar el registro.');return false;}if(!CT){message('Elige una serie TC antes de confirmar el registro.');return false;}if(!validOffsets()){message('Revisa los desplazamientos X, Y y Z.');return false;}invalidateMap();const epoch=mapEpoch,n=S.n,off=offsets(),map=new Float32Array(n*n*n).fill(NaN);el('confirm95').disabled=true;let valid=0;
  for(let z=0;z<n;z++){if(epoch!==mapEpoch)return;for(let y=0;y<n;y++)for(let x=0;x<n;x++){const hu=Lab95.sampleCT(CT,Lab95.point(S,x,y,z,off));if(!Number.isFinite(hu))continue;const h=Math.max(-1000,Math.min(3000,hu));map[z*n*n+y*n+x]=h<=0?.15*(1+h/1000):.15+.0001*h;valid++;}if(z%4===0){message(`Preparando mapa μ: ${z+1}/${n}`);await new Promise(r=>setTimeout(r,0));}}
  if(epoch!==mapEpoch)return false;if(!valid){el('confirm95').disabled=false;message('No hay cobertura TC en la matriz SPECT. Revisa el registro; no se ha confirmado.');return false;}M=map;el('mu95').hidden=false;el('mapInfo95').textContent=`Registro confirmado por el usuario. Mapa μ aproximado (cm⁻¹), ${Math.round(valid/map.length*100)} % de cobertura de la matriz. Azul: sin TC, no utilizable para AC. La FBP continúa sin AC.`;el('confirm95').disabled=false;message('Mapa educativo preparado. Puedes continuar con OSEM en el paso 3.');renderLive();return true;
 }
 el('confirm95').onclick=confirmRegistration;
 function prepareBaselineOptions(){for(const id of ['ac','scatter','psf','distance','axial','scatterFilter','filter','fbpStart','outsideAir95'])el(id).checked=false;el('iterations').value='1';el('subsets').value='1';dependencies();}
 let advancing=false;
 async function advanceFromRegistration(){
  if(advancing)return false;advancing=true;el('next').disabled=true;
  try{if(!await confirmRegistration())return false;prepareBaselineOptions();el('osemStatus95').textContent='Preparando OSEM de referencia 1×1, sin correcciones ni filtros…';message('Registro confirmado. Iniciando OSEM de referencia 1×1 sin correcciones ni filtros.');navigate(2);return true;}
  finally{advancing=false;if(step===1)el('next').disabled=false;}
 }
window.Lab95Live={get:()=>({spect:S,fbpSeconds,fbpTimings,fbpSmoothingSeconds,fbp:V,fbpDisplay:displayVolume||V,fbpLabel:el('fbpTitle95').textContent,mu:M,window:+el('energy95').value,scale}),confirmRegistration,prepareBaselineOptions,advanceFromRegistration};
})();
