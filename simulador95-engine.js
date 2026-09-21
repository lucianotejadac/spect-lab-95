/* Local educational import and preliminary FBP. No patient data leaves the browser. */
'use strict';
const Lab95 = (() => {
 const text=(d,t)=>(d.string(t)||'').trim(), nums=(d,t)=>text(d,t).split('\\').map(Number);
 const seq=(d,t)=>(d.elements[t]?.items||[]).map(i=>i.dataSet);
 const finite=(a,n)=>a.length===n&&a.every(Number.isFinite);
 function pixels(d){
  const syntax=text(d,'x00020010'),p=d.elements.x7fe00010;
  if(!['1.2.840.10008.1.2','1.2.840.10008.1.2.1','1.2.840.10008.1.2.2'].includes(syntax)||!p||p.encapsulatedPixelData)throw Error('Se requieren píxeles DICOM sin compresión.');
  const rows=d.uint16('x00280010'),cols=d.uint16('x00280011'),frames=Number(text(d,'x00280008')||1),bits=d.uint16('x00280100'),stored=d.uint16('x00280101'),high=d.uint16('x00280102'),signed=d.uint16('x00280103');
  if(!rows||!cols||!Number.isInteger(frames)||frames<1||![8,16].includes(bits)||!stored||stored>bits||high!==stored-1||![0,1].includes(signed)||(d.uint16('x00280002')||1)!==1)throw Error('Formato de píxeles no compatible.');
  const count=rows*cols*frames;if(count>64e6||p.length<count*bits/8)throw Error('Datos incompletos o tamaño superior al límite educativo.');
  const v=new DataView(d.byteArray.buffer,d.byteArray.byteOffset+p.dataOffset,p.length),out=new Float32Array(count),little=syntax!=='1.2.840.10008.1.2.2',mask=2**stored-1;
  for(let i=0;i<count;i++){let q=(bits===8?v.getUint8(i):v.getUint16(i*2,little))&mask;if(signed&&q>=2**(stored-1))q-=2**stored;out[i]=q;}
  return {rows,cols,frames,data:out};
 }
 async function read(file){return dicomParser.parseDicom(new Uint8Array(await file.arrayBuffer()));}
 function spect(d){
  if(text(d,'x00080060')!=='NM'||!text(d,'x00080008').includes('TOMO')||text(d,'x00080008').includes('RECON'))throw Error('Selecciona proyecciones NM tomográficas originales.');
  const a=pixels(d),sp=nums(d,'x00280030'),rot=seq(d,'x00540052'),det=seq(d,'x00540022');
  if(a.rows!==a.cols||a.cols>128||a.cols<16||!finite(sp,2)||sp[0]<=0||Math.abs(sp[0]-sp[1])>1e-4||rot.length!==1||!det.length)throw Error('Se admite una órbita paralela, matriz cuadrada hasta 128 y píxel isotrópico.');
  const step=Number(text(rot[0],'x00181144')),dir=text(rot[0],'x00181140'),height=Number(text(rot[0],'x00181130'));
  if(!Number.isFinite(step)||step<=0||!Number.isFinite(height)||!['CC','CW'].includes(dir)||!text(rot[0],'x00181130'))throw Error('Faltan el sentido, paso angular o altura de mesa.');
  const windows=seq(d,'x00540012').map((w,i)=>{const r=seq(w,'x00540013')[0];return {id:i+1,low:r?Number(text(r,'x00540014')):NaN,high:r?Number(text(r,'x00540015')):NaN};});
  const vector=(tag,i)=>d.uint16(tag,i);
  const ds=det.map(q=>{const u=nums(q,'x00200037'),pos=nums(q,'x00200032'),start=Number(text(q,'x00540200'));if(text(q,'x00181181')!=='PARA'||!finite(u,6)||!finite(pos,3)||!text(q,'x00540200')||!Number.isFinite(start)||Math.abs(u[2])+Math.abs(u[3])+Math.abs(u[4])+Math.abs(u[5]+1)>1e-4||Math.abs(u[0]**2+u[1]**2-1)>1e-4)throw Error('Orientación o colimador fuera de la geometría admitida.');return {u,pos,start,radii:nums(q,'x00181142')};});
  if(ds.some(q=>Math.abs(q.pos[2]-ds[0].pos[2])>.01))throw Error('Los detectores tienen distinto origen axial.');
  if(a.data.some(v=>v<0)||Number(text(d,'x00281053')||1)!==1||Number(text(d,'x00281052')||0)!==0)throw Error('Se requieren conteos NM no negativos y sin reescalado.');
  const views=[];for(let i=0;i<a.frames;i++){const dn=vector('x00540020',i),wn=vector('x00540010',i),vn=vector('x00540090',i),q=ds[dn-1];if(!q||!windows[wn-1]||!vn)throw Error('Vectores de detector, ventana o vista incompletos.');const delta=(vn-1)*step*(dir==='CC'?1:-1)*Math.PI/180;views.push({source:i,window:wn,radius:q.radii.length===1?q.radii[0]:q.radii[vn-1],angle:((q.start*Math.PI/180+delta)%(2*Math.PI)+2*Math.PI)%(2*Math.PI),ux:q.u[0]*Math.cos(delta)+q.u[1]*Math.sin(delta),uy:-q.u[0]*Math.sin(delta)+q.u[1]*Math.cos(delta)});}
  const tags={StudyInstanceUID:'x0020000d',FrameOfReferenceUID:'x00200052',SOPClassUID:'x00080016',SOPInstanceUID:'x00080018',StudyDate:'x00080020',StudyTime:'x00080030',AccessionNumber:'x00080050',StudyDescription:'x00081030',StudyID:'x00200010',PatientPosition:'x00185100',PatientName:'x00100010',PatientID:'x00100020',PatientBirthDate:'x00100030',PatientSex:'x00100040',PatientAge:'x00101010'};
  const dicomSource=Object.fromEntries(Object.entries(tags).map(([key,tag])=>[key,text(d,tag)]));
  return {...a,dicomSource,n:a.cols,spacing:sp[0],windows,views,frame:text(d,'x00200052'),origin:[0,-height],z0:ds[0].pos[2]};
 }
 function ct(d){
  if(text(d,'x00080060')!=='CT')throw Error('No es TC.');const a=pixels(d),pos=nums(d,'x00200032'),u=nums(d,'x00200037'),sp=nums(d,'x00280030');
  if(a.frames!==1||!finite(pos,3)||!finite(u,6)||!finite(sp,2)||sp.some(x=>x<=0)||u.some((x,i)=>Math.abs(x-[1,0,0,0,1,0][i])>1e-5))throw Error('Se requiere TC axial sin inclinación, un corte por archivo.');
  const slope=Number(text(d,'x00281053')),intercept=Number(text(d,'x00281052'));
  if(!text(d,'x00281053')||!text(d,'x00281052')||!Number.isFinite(slope)||!slope||!Number.isFinite(intercept))throw Error('Falta conversión HU.');
  for(let i=0;i<a.data.length;i++)a.data[i]=a.data[i]*slope+intercept;
  return {...a,pos,sp,frame:text(d,'x00200052'),series:text(d,'x0020000e'),name:text(d,'x0008103e')||'TC'};
 }
 function prepareCT(slices,s){
  const a=slices.slice().sort((x,y)=>x.pos[2]-y.pos[2]);if(a.length<2)throw Error('Carga al menos dos cortes TC.');
  if(!s.frame||a.some(q=>!q.frame||q.frame!==s.frame))throw Error('TC y SPECT tienen marcos espaciales distintos; este registro manual solo admite el mismo marco.');
  for(let i=1;i<a.length;i++)if(a[i].pos[2]-a[i-1].pos[2]<.01)throw Error('La serie tiene posiciones TC duplicadas.');
  const gaps=a.slice(1).map((q,i)=>q.pos[2]-a[i].pos[2]).sort((x,y)=>x-y);return {slices:a,maxGap:1.6*gaps[gaps.length>>1]};
 }
 function sampleCT(ct,p){
  if(!ct)return NaN;const a=ct.slices,z=p[2];if(z<a[0].pos[2]||z>a.at(-1).pos[2])return NaN;
  let lo=0,hi=a.length-1;while(hi-lo>1){const m=(hi+lo)>>1;if(a[m].pos[2]<=z)lo=m;else hi=m;}if(a[hi].pos[2]-a[lo].pos[2]>ct.maxGap)return NaN;
  function at(q){const x=(p[0]-q.pos[0])/q.sp[1],y=(p[1]-q.pos[1])/q.sp[0];if(x<0||y<0||x>q.cols-1||y>q.rows-1)return NaN;const ix=Math.min(q.cols-2,Math.floor(x)),iy=Math.min(q.rows-2,Math.floor(y)),wx=x-ix,wy=y-iy,i=iy*q.cols+ix;return (q.data[i]*(1-wx)+q.data[i+1]*wx)*(1-wy)+(q.data[i+q.cols]*(1-wx)+q.data[i+q.cols+1]*wx)*wy;}
  const w=(z-a[lo].pos[2])/(a[hi].pos[2]-a[lo].pos[2]);return at(a[lo])*(1-w)+at(a[hi])*w;
 }
 function point(s,x,y,z,offset){return [(x-(s.n-1)/2)*s.spacing+s.origin[0]-offset[0],(y-(s.n-1)/2)*s.spacing+s.origin[1]-offset[1],s.z0-z*s.spacing-offset[2]];}
 function fbpWorker(){
  function fft(re,im,inverse){const n=re.length;for(let i=1,j=0;i<n;i++){let bit=n>>1;for(;j&bit;bit>>=1)j^=bit;j^=bit;if(i<j){[re[i],re[j]]=[re[j],re[i]];[im[i],im[j]]=[im[j],im[i]];}}for(let len=2;len<=n;len*=2){const a=(inverse?2:-2)*Math.PI/len;for(let i=0;i<n;i+=len)for(let j=0;j<len/2;j++){const c=Math.cos(a*j),s=Math.sin(a*j),k=i+j,l=k+len/2,tr=re[l]*c-im[l]*s,ti=re[l]*s+im[l]*c;re[l]=re[k]-tr;im[l]=im[k]-ti;re[k]+=tr;im[k]+=ti;}}if(inverse)for(let i=0;i<n;i++){re[i]/=n;im[i]/=n;}}
  onmessage=({data:s})=>{try{const started=performance.now();let filterMs=0,backMs=0;const n=s.n,c=(n-1)/2,frames=s.views.filter(v=>v.window===s.window).sort((a,b)=>a.angle-b.angle),m=frames.length;if(m<8)throw Error('Muy pocas proyecciones.');const gaps=frames.map((f,i)=>(frames[(i+1)%m].angle-f.angle+2*Math.PI)%(2*Math.PI));if(gaps.some(g=>g<1e-5)||Math.max(...gaps)>3*2*Math.PI/m)throw Error('Se requiere una órbita completa de 360°, sin vistas duplicadas ni grandes huecos.');let pad=1;while(pad<4*n)pad*=2;const out=new Float32Array(n*n*n),re=new Float64Array(pad),im=new Float64Array(pad);
   for(let z=0;z<n;z++){for(let k=0;k<m;k++){re.fill(0);im.fill(0);const f=frames[k],base=f.source*n*n+z*n;for(let b=0;b<n;b++)re[b]=s.data[base+b];const filterStart=performance.now();if(s.ramp){fft(re,im,false);for(let j=0;j<pad;j++){const r=2*Math.min(j,pad-j)/pad;re[j]*=r;im[j]*=r;}fft(re,im,true);}filterMs+=performance.now()-filterStart;const backStart=performance.now();const w=(gaps[k]+gaps[(k+m-1)%m])/2;for(let y=0;y<n;y++)for(let x=0;x<n;x++){if((x-c)**2+(y-c)**2>c*c)continue;const t=(x-c)*f.ux+(y-c)*f.uy+c,b=Math.floor(t);if(b>=0&&b<n-1)out[z*n*n+y*n+x]+=w*(re[b]*(1-t+b)+re[b+1]*(t-b));}backMs+=performance.now()-backStart;}postMessage({progress:z+1,total:n});}
   postMessage({volume:out,fbpTimings:{filterSeconds:filterMs/1000,backSeconds:backMs/1000,otherSeconds:Math.max(0,performance.now()-started-filterMs-backMs)/1000}},[out.buffer]);}catch(e){postMessage({error:e.message});}};
 }
 async function gaussian3D(source,n,sigma,cancelled=()=>false){
  if(!Number.isFinite(sigma)||sigma<=0||source.length!==n*n*n)throw Error('Parámetros de suavizado inválidos.');
  const radius=Math.max(1,Math.ceil(4*sigma)),kernel=new Float64Array(2*radius+1);let sum=0;
  for(let k=-radius;k<=radius;k++){const w=Math.exp(-.5*(k/sigma)**2);kernel[k+radius]=w;sum+=w;}for(let i=0;i<kernel.length;i++)kernel[i]/=sum;
  // Reflect boundaries; retain signed intensities and never filter an already filtered volume.
  const reflect=i=>{while(i<0||i>=n)i=i<0?-i-1:2*n-i-1;return i;};
  let input=source;
  for(let axis=0;axis<3;axis++){
   const output=new Float32Array(source.length),stride=[1,n,n*n][axis];
   const neighbors=Array.from({length:n},(_,q)=>Int32Array.from(kernel,(_,k)=>(reflect(q+k-radius)-q)*stride));
   for(let z=0;z<n;z++){
    if(z%4===0){await new Promise(r=>setTimeout(r,0));if(cancelled())return null;}
    for(let y=0;y<n;y++)for(let x=0;x<n;x++){const j=z*n*n+y*n+x,offsets=neighbors[[x,y,z][axis]];let v=0;for(let k=0;k<kernel.length;k++)v+=input[j+offsets[k]]*kernel[k];output[j]=v;}
   }input=output;
  }return cancelled()?null:input;
 }
 return {read,spect,ct,prepareCT,sampleCT,point,gaussian3D,workerSource:'('+fbpWorker.toString()+')()'};
})();
