// Matched pixel-driven forward/back projectors with linear detector bin weights.
// Pixel spacing is a constant scale, absorbed into arbitrary activity units.
function createModel(n,frames,attenuation=null,geometry=null){
 const p=n*n,m=frames.length,idx=geometry?geometry.idx:new Int16Array(m*p).fill(-1),wt=geometry?geometry.wt:new Float32Array(m*p),sens=new Float32Array(p),center=(n-1)/2;
 if(!geometry)for(let k=0;k<m;k++)for(let y=0;y<n;y++)for(let x=0;x<n;x++){
  const j=y*n+x,dx=x-center,dy=y-center;
  if(dx*dx+dy*dy>center*center)continue;
  const t=dx*frames[k].ux+dy*frames[k].uy+center,b=Math.floor(t);
  if(b<0||b>=n-1)continue;
  idx[k*p+j]=b;wt[k*p+j]=t-b;sens[j]+=attenuation?attenuation[k*p+j]:1;
 }
 if(geometry)for(let k=0;k<m;k++)for(let j=0;j<p;j++)if(idx[k*p+j]>=0)sens[j]+=attenuation?attenuation[k*p+j]:1;
 function forward(f){const out=new Float64Array(m*n);for(let k=0;k<m;k++)for(let j=0;j<p;j++){const z=k*p+j,b=idx[z];if(b<0)continue;const w=wt[z],v=f[j]*(attenuation?attenuation[z]:1);out[k*n+b]+=v*(1-w);out[k*n+b+1]+=v*w;}return out;}
 function back(g){const out=new Float64Array(p);for(let k=0;k<m;k++)for(let j=0;j<p;j++){const z=k*p+j,b=idx[z];if(b<0)continue;const w=wt[z];out[j]+=(g[k*n+b]*(1-w)+g[k*n+b+1]*w)*(attenuation?attenuation[z]:1);}return out;}
 function initial(g){let sum=0,ss=0;for(const v of g)sum+=v;for(const v of sens)ss+=v;return Float64Array.from(sens,v=>v?sum/ss:0);}
 function step(f,g){const pred=forward(f),ratio=Float64Array.from(pred,(v,i)=>g[i]/Math.max(v,1e-12)),b=back(ratio);return Float64Array.from(f,(v,j)=>sens[j]?v*b[j]/sens[j]:0);}
 function deviance(f,g){const pred=forward(f);let v=0;for(let i=0;i<g.length;i++){const mu=Math.max(pred[i],1e-12),y=g[i];v+=2*(mu-y+(y?y*Math.log(y/mu):0));}return Math.max(v,0);}
 return {forward,back,initial,step,deviance,sens,geometry:{idx,wt}};
}
function createOsem(n,frames,count,attenuation=null){
 if(!Number.isInteger(count)||count<1||frames.length%count!==0)throw new Error('Número de subconjuntos inválido');
 // Interleave angularly sorted views; each subset spans the complete orbit.
 const groups=Array.from({length:count},(_,s)=>Array.from({length:frames.length/count},(_,j)=>s+j*count));
 const models=groups.map(ids=>{let weights=null;if(attenuation){weights=new Float32Array(ids.length*n*n);ids.forEach((k,j)=>weights.set(attenuation.subarray(k*n*n,(k+1)*n*n),j*n*n));}return createModel(n,ids.map(i=>frames[i]),weights);});
 function prepare(g){return groups.map(ids=>Float64Array.from(ids.flatMap(i=>Array.from(g.subarray(i*n,(i+1)*n)))));}
 function step(f,observations){for(let s=0;s<count;s++)f=models[s].step(f,observations[s]);return f;}
 return {groups,prepare,step};
}
function sampleGrid(a,n,x,y){if(x<0||y<0||x>n-1||y>n-1)return 0;const ix=Math.min(n-2,Math.floor(x)),iy=Math.min(n-2,Math.floor(y)),wx=x-ix,wy=y-iy;return (a[iy*n+ix]*(1-wx)+a[iy*n+ix+1]*wx)*(1-wy)+(a[(iy+1)*n+ix]*(1-wx)+a[(iy+1)*n+ix+1]*wx)*wy;}
async function attenuationWeights(n,frames,mu,spacingMM,onProgress=()=>{},isCancelled=()=>false){
 const weights=new Float32Array(frames.length*n*n),step=.5,dsCM=spacingMM*step/10;
 for(let k=0;k<frames.length;k++){
  await new Promise(r=>setTimeout(r,0));if(isCancelled())throw new Error('Preparación AC detenida');
  // At DICOM start angle 0 the detector is posterior (+patient Y).
  // For the exported IOP tangent (-cos(angle), sin(angle)), outward is (uy,-ux).
  const vx=frames[k].uy,vy=-frames[k].ux;
  for(let y=0;y<n;y++)for(let x=0;x<n;x++){
   let integral=0;
   for(let t=step/2;t<3*n;t+=step){const px=x+vx*t,py=y+vy*t;if(px<0||py<0||px>n-1||py>n-1)break;integral+=sampleGrid(mu,n,px,py)*dsCM;}
   weights[k*n*n+y*n+x]=Math.exp(-integral);
  }
  onProgress(k+1,frames.length);
 }
 return weights;
}
if(typeof module!=='undefined')module.exports={createModel,createOsem,attenuationWeights,sampleGrid};
