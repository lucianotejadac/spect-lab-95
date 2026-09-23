'use strict';
(()=>{
 const e=id=>document.getElementById(id);let task=null,epoch=0,busy=false,source=null,sourceWindow=null,history=[],serial=0,autoDone=false,autoAttempt='',autoTimer=null;
 // Las opciones que no se muestran quedan apagadas, para que lo que se calcula sea
 // exactamente lo que se ve; el aire fuera del campo del TC, en cambio, se asume siempre.
 for(const id of ['scatter','psf','distance','axial','scatterFilter','fbpStart'])e(id).checked=false;
 e('outsideAir95').checked=true;dependencies();
 const tell=t=>{e('osemStatus95').textContent=t;status(t);};
 const duration=s=>s==null?'No registrado':s<60?s.toFixed(1)+' s':Math.floor(s/60)+' min '+(s%60).toFixed(1)+' s';
 function stop(){epoch++;if(task)task.terminate();task=null;busy=false;e('cancelOsem95').disabled=true;e('runOsem95').disabled=false;}
 function changed(){stop();tell('Opciones modificadas. Las reconstrucciones anteriores se conservan; genera una nueva para comparar.');draw();scheduleAuto();}
 document.addEventListener('lab95osemInvalidate',()=>{stop();autoAttempt='';queueMicrotask(()=>{synchronize();draw();});});
 e('parameters').addEventListener('input',changed);e('parameters').addEventListener('change',()=>{dependencies();changed();});
 e('outsideAir95').onchange=()=>{autoAttempt='';changed();};e('osemScatter95').onchange=changed;
 e('cancelOsem95').onclick=()=>{stop();tell('Cálculo detenido. El historial conserva solo las reconstrucciones terminadas.');};
 function summarize(o){return `${o.iterations}×${o.subsets} · inicio ${o.initialization==='uniform'?'uniforme':'FBP'} · AC ${o.attenuationCorrection?'sí':'no'} · dispersión ${o.scatter?'peso '+o.scatterWeight:'no'} · PSF ${o.resolutionRecovery?o.psfFwhm100+' mm a 100 mm, intrínseca '+o.psfIntrinsic+' mm':'no'} · distancia ${o.distanceDependent?'por órbita':'constante'} · axial ${o.axialRecovery?'3D':'no'} · suavizado dispersión ${o.scatterSmoothing?o.scatterFwhm+' mm':'no'} · filtro final ${o.postFilter?o.postFilterFWHMmm+' mm':'no'}`;}
 function addEntry(entry){entry.id='r'+(++serial);history.push(entry);refreshLists();document.dispatchEvent(new Event('lab95state'));return entry.id;}
 // Lectura del historial para el tutorial: que se reconstruyo, con que opciones y si se exporto.
 window.Lab95Osem={entradas:()=>history.map(r=>({id:r.id,kind:r.kind,label:r.label,parameters:r.parameters,cortes:r.rows?r.rows.size:r.n,exportado:r.exportado||null})),
  // El volumen de una reconstruccion terminada (Float32Array n^3, filas no reconstruidas en cero),
  // para quien necesite buscar algo en la imagen sin volver a calcularla.
  volumen:id=>{const r=history.find(x=>x.id===id);return r?{data:r.data,n:r.n,rows:r.rows?[...r.rows]:null}:null;}};
 function refreshLists(){
  refreshExport95();
  for(const id of ['historyTop95','historyBottom95']){const selected=e(id).value;e(id).replaceChildren(...history.map(r=>new Option(r.label+' · '+duration(r.seconds),r.id)));if(history.some(r=>r.id===selected))e(id).value=selected;}
  e('historyList95').replaceChildren(...history.map(r=>{const tr=document.createElement('tr');for(const value of [r.label,duration(r.seconds),r.description]){const td=document.createElement('td');td.textContent=value;if(value===duration(r.seconds))td.append(timingDetails(r));tr.append(td);}return tr;}));
 }
 function timingDetails(r){
  const box=document.createElement('details'),summary=document.createElement('summary');summary.textContent='Desglose de tiempos';box.append(summary);
  const entries=[];
  if(r.timing){const t=r.timing;entries.push(['Tiempo transcurrido del cálculo (incluye coordinación y caché)',t.poolWallSeconds]);const names={preparation:'Preparación y validación',attenuation:'Factores de atenuación (AC)',geometry:'Geometría y respuesta del colimador',scatter:'Proyecciones y dispersión (incluye suavizado)',sensitivity:'Sensibilidad e inicialización',iterations:'Iteraciones OSEM'};for(const [key,label]of Object.entries(names))entries.push([label+' · acumulado trabajadores',t.stageSeconds?.[key]||0]);entries.push(['Filtro final gaussiano',t.filterSeconds],['Preparación de escala de comparación',t.comparisonSeconds],['Total transcurrido',t.totalSeconds]);}
  else if(r.fbpTimings){entries.push(['Filtrado de proyecciones (rampa FFT)',r.fbpTimings.filterSeconds],['Retroproyección',r.fbpTimings.backSeconds],['Preparación y mensajes del trabajador',r.fbpTimings.otherSeconds],['Total FBP transcurrido, incluida comunicación',r.seconds],['Suavizado para registro (adicional; 0 si reutilizado)',r.fbpSmoothingSeconds]);}else entries.push(['Cálculo FBP; desglose no disponible en este registro',r.seconds]);
  const table=document.createElement('table');for(const [label,seconds]of entries){const row=document.createElement('tr');for(const value of [label,seconds==null?'No registrado':seconds<1?seconds.toFixed(3)+' s':duration(seconds)]){const td=document.createElement('td');td.textContent=value;row.append(td);}table.append(row);}box.append(table);
  const note=document.createElement('p');note.textContent=r.timing?'Los subprocesos de los trabajadores se solapan cuando hay paralelismo: sus tiempos acumulados no se suman al total transcurrido. En una ejecución reutilizada no se repiten esos subprocesos (0 s).':'El tiempo FBP excluye el suavizado de visualización.';box.append(note);return box;
 }
 function refreshExport95(){
  const select=e('exportSeries95'),selected=select.value,entries=history.slice();
  select.replaceChildren(...entries.map(r=>new Option(r.label+' · '+duration(r.seconds),r.id)));
  if(entries.some(r=>r.id===selected))select.value=selected;else if(entries.length)select.value=entries.at(-1).id;
  select.disabled=e('exportDicom95').disabled=!entries.length;
  e('exportInfo95').textContent=entries.length?'Selecciona una reconstrucción terminada, OSEM o FBP. Se guardarán sus opciones aplicadas y los cortes reconstruidos contiguos.':'Primero genera una FBP o completa una reconstrucción OSEM.';
 }
 e('exportDicom95').onclick=()=>{try{
  synchronize();const entry=history.find(r=>r.id===e('exportSeries95').value),s=Lab95Live.get().spect;
  if(!entry||!s)throw Error('No hay una reconstrucción disponible.');
  // El nombre que escribe el alumno encabeza el archivo y la descripcion de la serie, que es
  // lo que distingue una reconstruccion de otra en el visor.
  const nombre=e('exportName95').value.trim().replace(/\s+/g,' ').slice(0,40);
  const limpio=nombre.replace(/[^\p{L}\p{N}]+/gu,'-').replace(/^-+|-+$/g,'').toLowerCase();
  const receta=entry.kind==='FBP'?'fbp':`${entry.parameters.iterations}x${entry.parameters.subsets}-${entry.parameters.attenuationCorrection?'ac':'nac'}`;
  const blob=buildSpectDicom95(entry,s,nombre),archivo=`${limpio?limpio+'-':''}spect-${entry.id}-${receta}.dcm`;
  download(blob,archivo);
  entry.exportado={archivo,nombre,cuando:new Date().toISOString()};document.dispatchEvent(new Event('lab95state'));
  e('exportInfo95').textContent=`Descarga preparada: ${entry.label}, ${entry.rows?entry.rows.size:s.n} cortes, ${(blob.size/1048576).toFixed(1)} MB. Un archivo DICOM NM multiframe, solo SPECT. Se conserva la identificación del estudio original.`;
 }catch(err){e('exportInfo95').textContent='No se pudo exportar: '+err.message;}};
 function synchronize(){
  const state=Lab95Live.get(),s=state.spect;
  if(source!==s){stop();source=s;sourceWindow=null;history=[];serial=0;autoDone=false;autoAttempt='';osem95RawCache=null;refreshLists();if(s)for(const row of ['Top','Bottom']){e('history'+row+'Slice95').max=s.n-1;e('history'+row+'Slice95').value=Math.floor(s.n/2);}}
  if(s&&sourceWindow!==state.window){sourceWindow=state.window;const a=e('osemScatter95'),photo=s.windows.find(w=>w.id===state.window);a.replaceChildren(...s.windows.filter(w=>w.id!==state.window).map(w=>new Option(`${w.id}: ${w.low.toFixed(2)}–${w.high.toFixed(2)} keV`,w.id)));const lower=s.windows.filter(w=>w.high<=photo.low+.1).sort((a,b)=>b.high-a.high)[0];if(lower)a.value=lower.id;}
  if(s&&state.fbp&&state.fbpDisplay&&!history.some(r=>r.kind==='FBP'&&r.rawRef===state.fbp)){
   const id=addEntry({kind:'FBP',label:history.some(r=>r.kind==='FBP')?'FBP · variante '+(history.filter(r=>r.kind==='FBP').length+1):'FBP anterior',data:state.fbpDisplay,rawRef:state.fbp,n:s.n,scale:state.scale,rows:null,seconds:state.fbpSeconds,fbpTimings:state.fbpTimings,fbpSmoothingSeconds:state.fbpSmoothingSeconds,description:state.fbpLabel+' · tiempo del cálculo FBP (sin suavizado de visualización)',parameters:{stage:state.fbpLabel,energyWindow:state.window}});
   if(history.length===1)e('historyTop95').value=id;
  }
  if(!autoDone&&state.fbp){const previous=history.find(r=>r.rawRef===state.fbp);if(previous){previous.data=state.fbpDisplay;previous.fbpSmoothingSeconds=state.fbpSmoothingSeconds;previous.parameters.stage=state.fbpLabel;previous.description=state.fbpLabel+' · tiempo del cálculo FBP (sin suavizado de visualización)';}}
  e('osemResult95').hidden=!history.length||step!==2;if(history.length&&step===2)e('empty').hidden=true;
 }
 function scheduleAuto(){clearTimeout(autoTimer);autoTimer=setTimeout(()=>{synchronize();const st=Lab95Live.get();if(step!==2||autoDone||busy||!st.spect||!st.fbp)return;
   const sig=JSON.stringify([options(),e('outsideAir95').checked,e('osemScatter95').value,!!st.mu]);if(autoAttempt===sig)return;autoAttempt=sig;execute(true);
  },250);}
 document.addEventListener('lab95navigate',()=>{synchronize();refreshExport95();draw();scheduleAuto();});
 e('runOsem95').onclick=()=>execute(!autoDone);
 async function execute(initial){
  synchronize();if(busy)return;const state=Lab95Live.get(),s=state.spect;
  if(initial){e('iterations').value='1';e('subsets').value='1';}
  const o=options();if(initial)autoAttempt=JSON.stringify([o,e('outsideAir95').checked,e('osemScatter95').value,!!state.mu]);
  try{
   if(!s||!state.fbp)throw Error('Carga SPECT y genera primero la FBP.');
   for(const input of e('parameters').querySelectorAll('input[type=number]'))if(!input.disabled&&!input.checkValidity())throw Error('Revisa los parámetros numéricos.');
   if(o.attenuationCorrection&&!state.mu)throw Error('Para iniciar OSEM con AC confirma el registro y prepara el mapa μ, o desactiva AC.');
   if(o.initialization==='FBP'&&!e('ramp95').checked)throw Error('Activa el filtro rampa y genera la FBP para usarla como inicio.');
   const scatterWindow=+e('osemScatter95').value,photo=s.windows.find(w=>w.id===state.window),lower=s.windows.find(w=>w.id===scatterWindow);
   if(o.scatter&&(!lower||lower.high>photo.low+.1||!(photo.high>photo.low&&lower.high>lower.low)))throw Error('Selecciona una ventana inferior válida para dispersión.');
   o.scatterWindowScale=o.scatter?(photo.high-photo.low)/(lower.high-lower.low):0;o.status='executed';o.algorithm=o.resolutionRecovery?(o.axialRecovery?'OSEM PSF 3D':'OSEM PSF 2D'):'OSEM 2D por cortes';
   if(o.resolutionRecovery&&o.psfFwhm100<o.psfIntrinsic)throw Error('La FWHM a 100 mm debe ser mayor o igual a la intrínseca.');
   if(o.resolutionRecovery&&o.distanceDependent&&s.views.filter(f=>f.window===state.window).some(f=>!Number.isFinite(f.radius)||f.radius<=0))throw Error('Falta distancia del detector por vista; desactiva su dependencia para usar 100 mm constantes.');
   stop();busy=true;const token=epoch,start=performance.now(),air=e('outsideAir95').checked;e('runOsem95').disabled=true;e('cancelOsem95').disabled=false;e('osemProgress95').value=0;tell(initial?'Iniciando automáticamente OSEM 1×1 en todos los cortes…':'Reconstruyendo todos los cortes con las opciones seleccionadas…');
   const code=[createModel.toString(),sampleGrid.toString(),attenuationWeights.toString(),gaussianKernel95.toString(),scatterBlur95.toString(),createPsfView95.toString(),'('+(o.resolutionRecovery?psf95Worker:osem95Worker).toString()+')()'].join('\n');task=createOsem95Pool(code);
   task.onerror=err=>{stop();tell('Error OSEM: '+err.message);};
   task.onmessage=async({data:q})=>{
    if(token!==epoch)return;if(q.error){stop();tell(q.error);return;}if(q.progress){tell(q.progress);e('osemProgress95').max=q.total;e('osemProgress95').value=q.completed;return;}
    if(q.volume){task.terminate();task=null;tell('Aplicando filtro final y preparando comparación…');
     try{
      const filterStart=performance.now();const data=o.postFilter?await Lab95.gaussian3D(q.volume,s.n,o.postFilterFWHMmm/s.spacing/2.354820045,()=>token!==epoch):q.volume;if(token!==epoch)return;
      const filterSeconds=(performance.now()-filterStart)/1000,comparisonStart=performance.now(),values=[];for(let i=0;i<q.volume.length;i+=7)if(q.volume[i]>0)values.push(q.volume[i]);values.sort((a,b)=>a-b);
      const comparisonSeconds=(performance.now()-comparisonStart)/1000,seconds=(performance.now()-start)/1000;synchronize();const number=history.filter(r=>r.kind==='OSEM').length+1,id=addEntry({kind:'OSEM',label:`OSEM ${number} · ${o.iterations}×${o.subsets}`,n:s.n,data,scale:values[Math.floor(values.length*.995)]||1,rows:new Set(q.rows),seconds,parameters:{...o,energyWindow:state.window,scatterWindow,outsideAir:air,registrationOffsets:['rx95','ry95','rz95'].map(id=>+e(id).value)},performance:q.performance,timing:{poolWallSeconds:q.performance.seconds,filterSeconds,comparisonSeconds,totalSeconds:seconds,stageSeconds:q.performance.stageSeconds,workerTimings:q.performance.workerTimings},description:summarize(o)+` · ${q.rows.length}/${s.n} cortes`+(o.attenuationCorrection&&air?' · aire asumido fuera del campo TC':'')+` · ${q.performance.reused} cortes reutilizados`,completedAt:new Date().toISOString()});
      e('historyBottom95').value=id;autoDone=true;busy=false;e('runOsem95').disabled=false;e('cancelOsem95').disabled=true;e('osemProgress95').max=q.rows.length;e('osemProgress95').value=q.rows.length;e('mode').textContent='Estudio cargado · '+number+' reconstrucción(es) OSEM';tell(`OSEM ${number} terminado en ${duration(seconds)}. Cambia opciones y genera otra reconstrucción para compararla.`);synchronize();draw();
     }catch(err){if(token===epoch){stop();tell('No se pudo terminar la reconstrucción: '+err.message);}}
    }
   };
   task.postMessage({n:s.n,data:s.data,views:s.views,spacing:s.spacing,window:state.window,scatterWindow,settings:o,mu:state.mu,fbp:o.initialization==='FBP'?state.fbp:null,outsideAir:air});
  }catch(err){stop();tell(err.message);}
 }
 function draw(){
  if(!history.length)return;const chosen=['Top','Bottom'].map(row=>history.find(r=>r.id===e('history'+row+'95').value)),shared=Math.max(1e-12,...chosen.filter(r=>r?.kind==='OSEM').map(r=>r.scale)),gain=100/+e('osemWindow95').value;
  for(let r=0;r<2;r++){const entry=chosen[r],row=r?'bottom':'top';if(!entry)continue;e('history'+(r?'Bottom':'Top')+'Info95').textContent=entry.description+' · '+duration(entry.seconds);const n=entry.n;
   {const side=r?'Bottom':'Top',plane=e('history'+side+'Plane95').value,slider=e('history'+side+'Slice95');slider.max=n-1;const index=Math.max(0,Math.min(n-1,+slider.value));slider.value=index;e('history'+side+'Index95').textContent=`${index+1}/${n}`;const canvas=e(row+'View95');canvas.width=n;canvas.height=n;const ctx=canvas.getContext('2d'),im=ctx.createImageData(n,n),scale=entry.kind==='FBP'?entry.scale:shared;
    for(let v=0;v<n;v++)for(let u=0;u<n;u++){const [x,y,z]=plane==='Axial'?[u,v,index]:plane==='Coronal'?[u,index,v]:[index,u,v],i=(v*n+u)*4,valid=!entry.rows||entry.rows.has(z),tono=color95(entry.data[z*n*n+y*n+x]/scale*gain);for(let k=0;k<3;k++)im.data[i+k]=valid?tono[k]:k===2?60:0;im.data[i+3]=255;}ctx.putImageData(im,0,0);
   }
  }
 }
 // Comparing two reconstructions means looking at the same place in both: plane and slice
 // travel together unless the student unlinks them to inspect one panel on its own.
 const linked=()=>e('linkPanels95').checked;
 function mirror(from){
  const to=from==='Top'?'Bottom':'Top';
  e('history'+to+'Plane95').value=e('history'+from+'Plane95').value;
  const target=e('history'+to+'Slice95');target.value=Math.max(0,Math.min(+target.max,+e('history'+from+'Slice95').value));
 }
 for(const side of ['Top','Bottom'])for(const control of ['Plane95','Slice95'])
  e('history'+side+control).oninput=()=>{if(linked())mirror(side);draw();};
 e('linkPanels95').onchange=()=>{if(linked())mirror('Top');draw();};
 document.addEventListener('lab95repaint',()=>draw());
 for(const id of ['historyTop95','historyBottom95','osemWindow95'])e(id).oninput=draw;
 e('saveHistory95').onclick=()=>download(new Blob([JSON.stringify(history.map(({data,rawRef,rows,...r})=>({...r,rows:rows?[...rows]:null})),null,2)],{type:'application/json'}),'historial-reconstrucciones.json');
})();
