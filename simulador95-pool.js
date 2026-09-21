'use strict';
// One bounded raw-volume cache; no filtered result is ever used as reconstruction input.
let osem95RawCache=null;
function createOsem95Pool(code){
 let workers=[],cancelled=false;const pool={onmessage:null,onerror:null,terminate(){cancelled=true;workers.forEach(w=>w.terminate());workers=[];},postMessage(s){
  try{
   const workerTimings=[];const started=performance.now(),n=s.n,p=n*n,o={...s.settings};delete o.postFilter;delete o.postFilterFWHMmm;
   const key=JSON.stringify([o,s.window,s.scatterWindow,s.outsideAir,s.spacing]);
   const hit=osem95RawCache&&osem95RawCache.key===key&&osem95RawCache.data===s.data&&osem95RawCache.mu===s.mu&&osem95RawCache.fbp===s.fbp;
   const cache=hit?osem95RawCache:{key,data:s.data,mu:s.mu,fbp:s.fbp,rows:new Set(),volume:new Float32Array(n*p),middle:new Float32Array(n*p)};
   const rows=[];
   for(let z=0;z<n;z++){
    if(!(o.resolutionRecovery&&o.axialRecovery)&&s.previewRow!==undefined&&Math.abs(z-s.previewRow)>(s.previewRadius||0))continue;
    if(o.attenuationCorrection){if(!s.mu)throw Error('Confirma el mapa μ.');const a=s.mu.subarray(z*p,(z+1)*p);if(!a.some(Number.isFinite))continue;if(!s.outsideAir&&a.some(v=>!Number.isFinite(v)))throw Error('El TC no cubre toda la matriz transversal. Revisa el registro o acepta explícitamente la hipótesis de aire fuera del campo TC.');}
    rows.push(z);
   }
   if(!rows.length||s.previewRow!==undefined&&!rows.includes(s.previewRow))throw Error('No hay cobertura TC para el corte elegido.');
   const pending=rows.filter(z=>!cache.rows.has(z)),reused=rows.length-pending.length;
   const count=Math.min(pending.length,o.resolutionRecovery&&o.axialRecovery?1:2,Math.max(1,(navigator.hardwareConcurrency||2)-1),navigator.deviceMemory&&navigator.deviceMemory<4?1:2);
   const finish=()=>{if(cancelled)return;osem95RawCache=cache;const volume=new Float32Array(n*p),middle=new Float32Array(n*p);for(const z of rows){volume.set(cache.volume.subarray(z*p,(z+1)*p),z*p);middle.set(cache.middle.subarray(z*p,(z+1)*p),z*p);}pool.onmessage?.({data:{volume,middle,rows,checkpoint:Math.max(1,Math.floor(o.iterations/2)),settings:s.settings,performance:{workers:count,reused,computed:pending.length,seconds:(performance.now()-started)/1000,workerTimings,stageSeconds:workerTimings.reduce((sum,r)=>{for(const [k,v] of Object.entries(r.stages))sum[k]=(sum[k]||0)+v;return sum;},{})}}});};
   if(!pending.length){queueMicrotask(finish);return;}
   const progress=Array(count).fill(0);let remaining=count;const results=[];
   const url=URL.createObjectURL(new Blob([code],{type:'text/javascript'}));
   for(let i=0;i<count;i++){
    const w=new Worker(url);workers.push(w);w.onerror=err=>{pool.terminate();pool.onerror?.(err);};
    w.onmessage=({data:q})=>{if(cancelled)return;if(q.error){pool.terminate();pool.onmessage?.({data:q});return;}
     if(q.progress){progress[i]=q.total?Math.min(1,q.completed/q.total)*pending.filter((_,j)=>j%count===i).length:0;pool.onmessage?.({data:{progress:`${count} trabajadores · ${reused} cortes reutilizados · ${q.progress}`,completed:reused+progress.reduce((a,b)=>a+b,0),total:rows.length}});}
     if(q.volume){results.push(q);workerTimings.push({worker:i+1,seconds:q.workerSeconds,stages:q.timings||{}});w.terminate();remaining--;if(!remaining){for(const r of results)for(const z of r.rows){cache.volume.set(r.volume.subarray(z*p,(z+1)*p),z*p);cache.middle.set(r.middle.subarray(z*p,(z+1)*p),z*p);cache.rows.add(z);}finish();}}
    };
    w.postMessage({...s,previewRow:undefined,requestedRows:pending.filter((_,j)=>j%count===i)});
   }URL.revokeObjectURL(url);
  }catch(err){queueMicrotask(()=>{if(!cancelled)pool.onmessage?.({data:{error:err.message}});});}
 }};return pool;
}
