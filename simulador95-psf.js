'use strict';
function gaussianKernel95(sigma){
 if(sigma<=0)return new Float64Array([1]);const radius=Math.ceil(4*sigma),k=new Float64Array(2*radius+1);let sum=0;
 for(let i=-radius;i<=radius;i++){k[i+radius]=Math.exp(-.5*(i/sigma)**2);sum+=k[i+radius];}for(let i=0;i<k.length;i++)k[i]/=sum;return k;
}
function scatterBlur95(input,n,sigma){
 const k=gaussianKernel95(sigma),r=k.length>>1,reflect=x=>{while(x<0||x>=n)x=x<0?-x-1:2*n-x-1;return x;};let a=input;
 for(let axis=0;axis<2;axis++){const b=new Float32Array(n*n);for(let y=0;y<n;y++)for(let x=0;x<n;x++){let v=0;for(let h=-r;h<=r;h++)v+=k[h+r]*a[axis?reflect(y+h)*n+x:y*n+reflect(x+h)];b[y*n+x]=v;}a=b;}return a;
}
// Matched separable voxel-dependent PSF. Axial sigma quantized to 0.25 voxel,
// as in the earlier experimental model. Zero extension at the selected axial support.
function createPsfView95(n,frame,spacing,o,rows,ac=null){
 const p=n*n,c=(n-1)/2,ptr=new Int32Array(p+1),bins=[],weights=[],active=[],kernels=[],kid=new Int16Array(p),known=new Map(),valid=new Uint8Array(n);for(const z of rows)valid[z]=1;
 if(o.distanceDependent&&!(Number.isFinite(frame.radius)&&frame.radius>0))throw Error('Falta la distancia del detector para modelar la órbita.');
 for(let j=0;j<p;j++){
  ptr[j]=bins.length;const x=j%n-c,y=Math.floor(j/n)-c,t=x*frame.ux+y*frame.uy+c,b=Math.floor(t),w=t-b;
  if(x*x+y*y>c*c||b<0||b>=n-1)continue;
  const distance=o.distanceDependent?Math.max(0,frame.radius-spacing*(x*frame.uy-y*frame.ux)):100;
  const sigma=Math.sqrt(o.psfIntrinsic**2+(Math.sqrt(o.psfFwhm100**2-o.psfIntrinsic**2)*distance/100)**2)/(2.354820045*spacing),kernel=gaussianKernel95(sigma),radius=kernel.length>>1;
  // Merge the two linear-interpolation contributions to each detector bin.
  for(let bin=Math.max(0,b-radius);bin<=Math.min(n-1,b+radius+1);bin++){const a=bin-b+radius,d=a-1,weight=(a>=0&&a<kernel.length?kernel[a]*(1-w):0)+(d>=0&&d<kernel.length?kernel[d]*w:0);if(weight){bins.push(bin);weights.push(weight);}}
  const q=o.axialRecovery?Math.round(sigma*4):0;if(!known.has(q)){known.set(q,kernels.length);kernels.push(gaussianKernel95(q/4));}kid[j]=known.get(q);active.push(j);
 }ptr[p]=bins.length;const bi=Int16Array.from(bins),bw=Float32Array.from(weights),pixels=Int32Array.from(active);
 function forward(f){const out=new Float64Array(n*n);
  for(const j of pixels){const kernel=kernels[kid[j]],radius=kernel.length>>1;
   for(const z of rows){let value=0;for(let h=-radius;h<=radius;h++){const zz=z+h;if(zz>=0&&zz<n&&valid[zz]){const q=zz*p+j;value+=kernel[h+radius]*f[q]*(ac?ac[q]:1);}}
    for(let k=ptr[j];k<ptr[j+1];k++)out[z*n+bi[k]]+=value*bw[k];
   }
  }return out;
 }
 function back(q,out=new Float64Array(n*p)){const temp=new Float64Array(n);
  for(const j of pixels){temp.fill(0);for(const z of rows){let v=0;for(let k=ptr[j];k<ptr[j+1];k++)v+=q[z*n+bi[k]]*bw[k];temp[z]=v;}
   const kernel=kernels[kid[j]],radius=kernel.length>>1;
   for(const z of rows){let value=0;for(let h=-radius;h<=radius;h++){const zz=z+h;if(zz>=0&&zz<n&&valid[zz])value+=kernel[h+radius]*temp[zz];}const i=z*p+j;out[i]+=value*(ac?ac[i]:1);}
  }return out;
 }
 return {forward,back};
}
function psf95Worker(){
 onmessage=async({data:s})=>{try{
  const now=()=>typeof performance==='undefined'?Date.now():performance.now(),began=now(),timings={preparation:0,attenuation:0,geometry:0,scatter:0,sensitivity:0,iterations:0};let stamp=now();
  const {n,settings:o}=s,p=n*n,frames=s.views.filter(f=>f.window===s.window).sort((a,b)=>a.angle-b.angle),m=frames.length;
  if(!Number.isInteger(o.subsets)||o.subsets<1||m%o.subsets||!Number.isInteger(o.iterations)||o.iterations<1||o.iterations>40)throw Error('Iteraciones o subconjuntos inválidos.');
  if(!(o.psfIntrinsic>0&&o.psfFwhm100>=o.psfIntrinsic))throw Error('La FWHM a 100 mm debe ser mayor o igual a la intrínseca.');
  const rows=[];for(let z=0;z<n;z++){if(s.requestedRows&&!s.requestedRows.includes(z))continue;if(o.attenuationCorrection){if(!s.mu)throw Error('Falta mapa μ.');const a=s.mu.subarray(z*p,(z+1)*p);if(!a.some(Number.isFinite))continue;if(!s.outsideAir&&a.some(v=>!Number.isFinite(v)))throw Error('Cobertura TC incompleta.');}rows.push(z);}if(!rows.length)throw Error('No hay cortes reconstruibles.');
  const estimatedBytes=(o.attenuationCorrection?m*n*p*4:0)+o.subsets*n*p*8+n*p*32+m*p*160;
  if(estimatedBytes>1.25*1024**3)throw Error('Esta configuración PSF supera el límite de memoria del simulador. Reduce los subconjuntos o la matriz.');
  timings.preparation+=now()-stamp;stamp=now();const aw=o.attenuationCorrection?Array.from({length:m},()=>new Float32Array(n*p)):null;
  if(aw)for(let r=0;r<rows.length;r++){const z=rows[r],mu=Float32Array.from(s.mu.subarray(z*p,(z+1)*p),v=>Number.isFinite(v)?v:0),w=await attenuationWeights(n,frames,mu,s.spacing);for(let k=0;k<m;k++)aw[k].set(w.subarray(k*p,(k+1)*p),z*p);postMessage({progress:`AC para PSF: ${r+1}/${rows.length} cortes`,completed:0,total:o.iterations});}
  timings.attenuation+=now()-stamp;const models=[],g=[],background=[];for(let k=0;k<m;k++){
   stamp=now();models.push(createPsfView95(n,frames[k],s.spacing,o,rows,aw?aw[k]:null));timings.geometry+=now()-stamp;stamp=now();g.push(s.data.slice(frames[k].source*p,(frames[k].source+1)*p));
   let bg=new Float32Array(p);if(o.scatter){const lower=s.views.find(v=>v.window===s.scatterWindow&&Math.abs(Math.atan2(Math.sin(v.angle-frames[k].angle),Math.cos(v.angle-frames[k].angle)))<1e-5);if(!lower)throw Error('Dispersión sin vistas coincidentes.');bg=s.data.slice(lower.source*p,(lower.source+1)*p);if(o.scatterSmoothing)bg=scatterBlur95(bg,n,o.scatterFwhm/s.spacing/2.354820045);for(let j=0;j<p;j++)bg[j]*=o.scatterWeight*o.scatterWindowScale;}background.push(bg);timings.scatter+=now()-stamp;
   postMessage({progress:`Preparando respuesta del colimador: vista ${k+1}/${m}`,completed:0,total:o.iterations});
  }
  stamp=now();const groups=Array.from({length:o.subsets},(_,g)=>Array.from({length:m/o.subsets},(_,j)=>g+j*o.subsets)),one=new Float64Array(p);for(const z of rows)one.fill(1,z*n,(z+1)*n);
  const sensitivity=groups.map(()=>new Float64Array(n*p));for(let k=0;k<m;k++)models[k].back(one,sensitivity[k%o.subsets]);
  const f=new Float64Array(n*p),total=new Float64Array(n*p);for(const a of sensitivity)for(let j=0;j<f.length;j++)total[j]+=a[j];
  for(const z of rows){let counts=0,sum=0,count=0;for(let k=0;k<m;k++)for(let x=0;x<n;x++)counts+=g[k][z*n+x];for(let j=z*p;j<(z+1)*p;j++){sum+=total[j];if(total[j]>0)count++;}const level=counts/Math.max(sum,1e-12);let seedSum=0;for(let j=z*p;j<(z+1)*p;j++)if(total[j]>0){f[j]=o.initialization==='FBP'?Math.max(0,s.fbp[j]):level;seedSum+=f[j];}if(o.initialization==='FBP'){const mean=seedSum/Math.max(count,1);let norm=0;for(let j=z*p;j<(z+1)*p;j++)if(total[j]>0){f[j]=mean?Math.max(f[j],mean*.001):level;norm+=f[j];}if(norm)for(let j=z*p;j<(z+1)*p;j++)f[j]*=level*count/norm;}}
  let middle;const checkpoint=Math.max(1,Math.floor(o.iterations/2));
  timings.sensitivity+=now()-stamp;stamp=now();for(let it=1;it<=o.iterations;it++){
   for(let group=0;group<groups.length;group++){const update=new Float64Array(n*p);for(const k of groups[group]){const pred=models[k].forward(f);for(let j=0;j<p;j++)pred[j]=g[k][j]/Math.max(pred[j]+background[k][j],1e-12);models[k].back(pred,update);}for(let j=0;j<f.length;j++)f[j]=sensitivity[group][j]>0?f[j]*update[j]/sensitivity[group][j]:0;postMessage({progress:`OSEM PSF ${o.axialRecovery?'3D':'2D'}: iteración ${it}/${o.iterations}, subconjunto ${group+1}/${o.subsets}`,completed:it-1+(group+1)/o.subsets,total:o.iterations});}
   if(!f.every(Number.isFinite))throw Error('Resultado no finito.');if(it===checkpoint)middle=Float32Array.from(f);
  }
  timings.iterations+=now()-stamp;const volume=Float32Array.from(f);postMessage({volume,middle,rows,checkpoint,settings:o,timings:Object.fromEntries(Object.entries(timings).map(([k,v])=>[k,v/1000])),workerSeconds:(now()-began)/1000},[volume.buffer,middle.buffer]);
 }catch(e){postMessage({error:e.message});}};
}
