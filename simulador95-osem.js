'use strict';
// Worker entry: uses the existing matched parallel-beam projector, per axial slice.
function osem95Worker(){
 onmessage=async({data:s})=>{try{
  const now=()=>typeof performance==='undefined'?Date.now():performance.now(),began=now(),timings={preparation:0,attenuation:0,geometry:0,scatter:0,sensitivity:0,iterations:0};let stamp=now();
  const {n,data,views,settings:o}=s,p=n*n,frames=views.filter(v=>v.window===s.window).sort((a,b)=>a.angle-b.angle),m=frames.length;
  if(!m||m%o.subsets||!Number.isInteger(o.iterations)||o.iterations<1||o.iterations>40)throw Error('Iteraciones o subconjuntos incompatibles.');
  if(o.attenuationCorrection&&!s.mu)throw Error('Confirma el registro y prepara el mapa μ.');
  if(o.resolutionRecovery)throw Error('Se requiere el motor PSF.');
  const lower=views.filter(v=>v.window===s.scatterWindow),scatterFrames=frames.map(f=>lower.find(v=>Math.abs(Math.atan2(Math.sin(v.angle-f.angle),Math.cos(v.angle-f.angle)))<1e-5));
  if(o.scatter&&scatterFrames.some(v=>!v))throw Error('La ventana de dispersión no tiene las mismas vistas angulares.');
  timings.preparation+=now()-stamp;stamp=now();const scatterData=o.scatter&&o.scatterSmoothing?scatterFrames.map(f=>scatterBlur95(data.subarray(f.source*p,(f.source+1)*p),n,o.scatterFwhm/s.spacing/2.354820045)):null;
  timings.scatter+=now()-stamp;stamp=now();const rows=[],c=(n-1)/2;
  if(s.previewRow!==undefined&&(!Number.isInteger(s.previewRow)||s.previewRow<0||s.previewRow>=n))throw Error('Corte de vista previa inválido.');
  for(let z=0;z<n;z++){
   if(s.previewRow!==undefined&&Math.abs(z-s.previewRow)>(s.previewRadius||0))continue;
   if(s.requestedRows&&!s.requestedRows.includes(z))continue;
   if(!o.attenuationCorrection){rows.push(z);continue;}
   const mu=s.mu.subarray(z*p,(z+1)*p);if(!mu.some(Number.isFinite))continue;
   if(!s.outsideAir&&mu.some(v=>!Number.isFinite(v)))throw Error('El TC no cubre toda la matriz transversal. Revisa el registro; para el experimento puedes aceptar explícitamente aire fuera del campo TC.');
   rows.push(z);
  }
  if(!rows.length)throw Error('No hay cortes con cobertura TC.');
  if(s.previewRow!==undefined&&!rows.includes(s.previewRow))throw Error('El corte elegido no tiene cobertura TC. Elige otro corte o desactiva AC.');
  const volume=new Float32Array(n*p),middle=new Float32Array(n*p),checkpoint=Math.max(1,Math.floor(o.iterations/2));
  timings.preparation+=now()-stamp;stamp=now();const groups=Array.from({length:o.subsets},(_,g)=>Array.from({length:m/o.subsets},(_,j)=>g+j*o.subsets));
  const baseModels=groups.map(ids=>createModel(n,ids.map(k=>frames[k])));
  timings.geometry+=now()-stamp;for(let r=0;r<rows.length;r++){
   stamp=now();
   const z=rows[r];let weights=null;
   if(o.attenuationCorrection){const mu=Float32Array.from(s.mu.subarray(z*p,(z+1)*p),v=>Number.isFinite(v)?v:0);weights=await attenuationWeights(n,frames,mu,s.spacing,(k,total)=>{if(k%8===0)postMessage({progress:`Preparando AC: corte ${r+1}/${rows.length}, vista ${k}/${total}`,completed:r,total:rows.length});});}
   timings.attenuation+=now()-stamp;stamp=now();const models=!weights?baseModels:groups.map((ids,gid)=>{let a=null;if(weights){a=new Float32Array(ids.length*p);ids.forEach((k,j)=>a.set(weights.subarray(k*p,(k+1)*p),j*p));}return createModel(n,ids.map(k=>frames[k]),a,baseModels[gid].geometry);});
   timings.geometry+=now()-stamp;stamp=now();const g=groups.map(ids=>Float64Array.from(ids.flatMap(k=>Array.from(data.subarray(frames[k].source*p+z*n,frames[k].source*p+(z+1)*n)))));
   const bg=groups.map(ids=>Float64Array.from(ids.flatMap(k=>o.scatter?Array.from(scatterData?scatterData[k].subarray(z*n,(z+1)*n):data.subarray(scatterFrames[k].source*p+z*n,scatterFrames[k].source*p+(z+1)*n),v=>v*o.scatterWeight*o.scatterWindowScale):Array(n).fill(0))));
   timings.scatter+=now()-stamp;stamp=now();const sensitivity=new Float64Array(p);for(const model of models)for(let j=0;j<p;j++)sensitivity[j]+=model.sens[j];
   const counts=g.reduce((sum,v)=>sum+v.reduce((a,b)=>a+b,0),0),totalSensitivity=sensitivity.reduce((a,b)=>a+b,0),level=counts/Math.max(totalSensitivity,1e-12);
   let f=Float64Array.from(sensitivity,v=>v>0?level:0);
   if(o.initialization==='FBP'){
    if(!s.fbp)throw Error('Genera primero la FBP.');let sum=0,count=0;for(let j=0;j<p;j++)if(sensitivity[j]>0){f[j]=Math.max(s.fbp[z*p+j],0);sum+=f[j];count++;}
    if(sum>0){const mean=sum/count;let adjusted=0;for(let j=0;j<p;j++)if(sensitivity[j]>0){f[j]=Math.max(f[j],mean*.001);adjusted+=f[j];}for(let j=0;j<p;j++)f[j]*=level*count/adjusted;}
    else f=Float64Array.from(sensitivity,v=>v>0?level:0);
   }
   timings.sensitivity+=now()-stamp;stamp=now();for(let it=1;it<=o.iterations;it++){
    for(let k=0;k<models.length;k++){const model=models[k],pred=model.forward(f),ratio=Float64Array.from(pred,(v,j)=>g[k][j]/Math.max(v+bg[k][j],1e-12)),back=model.back(ratio);for(let j=0;j<p;j++)f[j]=model.sens[j]>0?f[j]*back[j]/model.sens[j]:0;}
    if(!f.every(Number.isFinite))throw Error('El cálculo produjo valores no finitos.');
    if(it===checkpoint)middle.set(f,z*p);
   }
   timings.iterations+=now()-stamp;volume.set(f,z*p);postMessage({progress:`OSEM: corte ${r+1}/${rows.length} terminado`,completed:r+1,total:rows.length});
  }
  postMessage({volume,middle,rows,checkpoint,settings:o,timings:Object.fromEntries(Object.entries(timings).map(([k,v])=>[k,v/1000])),workerSeconds:(now()-began)/1000},[volume.buffer,middle.buffer]);
 }catch(e){postMessage({error:e.message});}};
}

