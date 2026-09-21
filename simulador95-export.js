// DICOM Part 10, Explicit VR Little Endian, Nuclear Medicine Image Storage.
// Encodes the reconstructed volume, never rendered canvases or CT data.
// PatientAge belongs to the Patient Study module, not to Patient: MicroDicom reconciles
// series by their study level attributes and refuses to fuse one whose age is missing or
// differs from the CT's, so it is copied from the projections like the rest.
function buildSpectDicom95(entry,s){
 const completed=true,volume=entry.data,valid=Array.from({length:s.n},(_,i)=>entry.rows.has(i)),meta={n:s.n,spacing:s.spacing,geometry:s,dicomSource:s.dicomSource,energy:(()=>{const w=s.windows.find(w=>w.id===entry.parameters.energyWindow);return [w.low,w.high];})()},settings={method:"OSEM",iterations:entry.parameters.iterations,subsets:entry.parameters.subsets,ac:entry.parameters.attenuationCorrection,offsets:entry.parameters.registrationOffsets};
 if(entry.kind!=="OSEM"||volume.length!==s.n**3)throw Error("Selecciona una reconstrucción OSEM terminada.");
 if(!completed||!volume||!meta.geometry)throw new Error('No hay un volumen completo con geometría para exportar.');
 const rows=Array.from(valid,(v,i)=>v?i:-1).filter(i=>i>=0).reverse(),n=meta.n,sp=meta.spacing;
 if(!rows.length||rows.some((r,i)=>i&&rows[i-1]-r!==1))throw new Error('La exportación requiere cortes reconstruidos contiguos.');
 const encoder=new TextEncoder(),concat=parts=>{const out=new Uint8Array(parts.reduce((s,p)=>s+p.length,0));let at=0;for(const p of parts){out.set(p,at);at+=p.length;}return out;};
 function uint(v,bytes=2){const a=new Uint8Array(bytes),d=new DataView(a.buffer);bytes===2?d.setUint16(0,v,true):d.setUint32(0,v,true);return a;}
 function element(group,tag,vr,value){let data;
  if(value instanceof Uint8Array)data=value;
  else if(vr==='US'||vr==='UL')data=concat((Array.isArray(value)?value:[value]).map(v=>uint(v,vr==='US'?2:4)));
  else if(vr==='FD'){data=new Uint8Array(8);new DataView(data.buffer).setFloat64(0,value,true);}
  else data=encoder.encode(Array.isArray(value)?value.join('\\'):String(value));
  if(data.length%2)data=concat([data,new Uint8Array([vr==='UI'||['OB','OW','SQ'].includes(vr)?0:32])]);
  const long=['OB','OW','SQ','UT','UN','OF','OD'].includes(vr),head=concat([uint(group),uint(tag),encoder.encode(vr),...(long?[uint(0),uint(data.length,4)]:[uint(data.length)])]);return concat([head,data]);
 }
 function sequence(g,t,items){return element(g,t,'SQ',concat(items.map(content=>concat([uint(0xfffe),uint(0xe000),uint(content.length,4),content]))));}
 const source=meta.dicomSource;if(!source?.StudyInstanceUID||!source?.FrameOfReferenceUID)throw new Error('Faltan referencias del estudio original. Abre el visor actualizado.');
 const uid=()=>{const bytes=crypto.getRandomValues(new Uint8Array(16));let v=0n;for(const b of bytes)v=(v<<8n)|BigInt(b);return '2.25.'+v.toString();},sop=uid(),study=source.StudyInstanceUID,series=uid(),frame=source.FrameOfReferenceUID,klass='1.2.840.10008.5.1.4.1.1.20';
 const now=new Date(),date=now.toISOString().slice(0,10).replaceAll('-',''),time=now.toISOString().slice(11,23).replaceAll(':','');
 let max=0;for(const r of rows)for(let j=0;j<n*n;j++){const v=volume[r*n*n+j];if(!Number.isFinite(v)||v<0)throw new Error('El volumen contiene valores inválidos.');max=Math.max(max,v);}
 const slopeText=(max?max/65535:1).toPrecision(10),slope=Number(slopeText),pixel=new Uint8Array(rows.length*n*n*2),pv=new DataView(pixel.buffer);
 rows.forEach((r,k)=>{for(let j=0;j<n*n;j++)pv.setUint16((k*n*n+j)*2,Math.min(65535,Math.round(volume[r*n*n+j]/slope)),true);});
 const ds=v=>Number(v).toPrecision(10),position=[meta.geometry.origin[0]-(n-1)*sp/2,meta.geometry.origin[1]-(n-1)*sp/2,meta.geometry.z0-rows[0]*sp].map(ds);
 const provenance={parameters:entry.parameters,reconstructionSeconds:entry.seconds,completedAt:entry.completedAt,method:settings.method,iterations:settings.iterations,subsets:settings.subsets,attenuationCorrection:settings.ac,ctOffsetsMM:settings.offsets,originalRowsZeroBased:rows,units:'relative arbitrary units',geometry:'Experimental approximate geometry; original frame of reference; not clinically validated',encoding:'uint16; global rescale slope; ascending patient Z',quantizationMaxError:slope/2};
 const derivation=`EXPERIMENTAL SPECT; ${settings.method}; iterations=${settings.iterations}; subsets=${settings.subsets}; AC=${settings.ac?'CT approximate':'none'}; original rows ${rows.at(-1)+1}-${rows[0]+1}. Relative units. Geometry not clinically validated. Original study/patient/frame preserved. No CT pixels included.`;
 const E=element,S=sequence,decode=b64=>Uint8Array.from(atob(b64),c=>c.charCodeAt(0));
 const rw=concat([S(0x0040,0x08ea,[concat([E(8,0x0100,'SH','1'),E(8,0x0102,'SH','UCUM'),E(8,0x0104,'LO','no units')])]),E(0x0040,0x9210,'SH','RELATIVE'),E(0x0040,0x9211,'US',65535),E(0x0040,0x9216,'US',0),E(0x0040,0x9224,'FD',0),E(0x0040,0x9225,'FD',slope)]);
 const dataset=concat([
 E(8,5,'CS','ISO_IR 192'),E(8,8,'CS',['DERIVED','PRIMARY','RECON TOMO','EMISSION']),E(8,0x16,'UI',klass),E(8,0x18,'UI',sop),
 E(8,0x20,'DA',source.StudyDate),E(8,0x23,'DA',date),E(8,0x30,'TM',source.StudyTime),E(8,0x33,'TM',time),E(8,0x50,'SH',source.AccessionNumber),E(8,0x60,'CS','NM'),E(8,0x70,'LO','Local SPECT prototype'),E(8,0x90,'PN',''),E(8,0x0201,'SH','+0000'),E(8,0x1030,'LO',source.StudyDescription||''),E(8,0x103e,'LO',`EXPERIMENTAL SPECT ${settings.method} ${settings.ac?'AC':'NAC'}`),E(8,0x2111,'ST',derivation),S(8,0x2112,[concat([E(8,0x1150,'UI',source.SOPClassUID),E(8,0x1155,'UI',source.SOPInstanceUID)])]),
 E(0x0010,0x0010,'PN',source.PatientName),E(0x0010,0x0020,'LO',source.PatientID),E(0x0010,0x0030,'DA',source.PatientBirthDate),E(0x0010,0x0040,'CS',source.PatientSex),E(0x0010,0x1010,'AS',source.PatientAge),
 E(0x0011,0x0010,'LO','LOCAL_SPECT_PROTOTYPE'),E(0x0011,0x1010,'UT',JSON.stringify(provenance)),
 E(0x0018,0x0050,'DS',ds(sp)),E(0x0018,0x0070,'IS',''),E(0x0018,0x0088,'DS',ds(sp)),E(0x0018,0x1020,'LO','SPECT-PROTOTYPE-1'),E(0x0018,0x1100,'DS',ds(n*sp)),E(0x0018,0x1210,'SH',settings.method),E(0x0018,0x5020,'LO',`${settings.method} ${settings.iterations} iterations ${settings.subsets} subsets`),E(0x0018,0x5100,'CS',source.PatientPosition||''),
 E(0x0020,0x000d,'UI',study),E(0x0020,0x000e,'UI',series),E(0x0020,0x0010,'SH',source.StudyID),E(0x0020,0x0011,'IS','901'),E(0x0020,0x0013,'IS','1'),E(0x0020,0x0032,'DS',position),E(0x0020,0x0037,'DS',['1','0','0','0','1','0']),E(0x0020,0x0052,'UI',frame),E(0x0020,0x1040,'LO',''),E(0x0020,0x4000,'LT','EXPERIMENTAL. Relative intensity; approximate orientation and AC. Not validated for diagnosis.'),
 E(0x0028,2,'US',1),E(0x0028,4,'CS','MONOCHROME2'),E(0x0028,8,'IS',rows.length),E(0x0028,9,'AT',concat([uint(0x0054),uint(0x0080)])),E(0x0028,0x0010,'US',n),E(0x0028,0x0011,'US',n),E(0x0028,0x0030,'DS',[ds(sp),ds(sp)]),...((settings.ac||entry.parameters.scatter)?[E(0x0028,0x0051,'CS',[...(settings.ac?['ATTN']:[]),...(entry.parameters.scatter?['SCAT']:[])])]:[]),E(0x0028,0x0100,'US',16),E(0x0028,0x0101,'US',16),E(0x0028,0x0102,'US',15),E(0x0028,0x0103,'US',0),E(0x0028,0x0106,'US',0),E(0x0028,0x0107,'US',max?65535:0),E(0x0028,0x1050,'DS',max?'32767.5':'0'),E(0x0028,0x1051,'DS',max?'65535':'1'),E(0x0028,0x2110,'CS','00'),S(0x0040,0x9096,[rw]),
 E(0x0054,0x0010,'US',rows.map(()=>1)),E(0x0054,0x0011,'US',1),S(0x0054,0x0012,[concat([S(0x0054,0x0013,[concat([E(0x0054,0x0014,'DS',ds(meta.energy[0])),E(0x0054,0x0015,'DS',ds(meta.energy[1]))])]),E(0x0054,0x0018,'SH','Photopeak')])]),S(0x0054,0x0016,[]),E(0x0054,0x0020,'US',rows.map(()=>1)),E(0x0054,0x0021,'US',1),S(0x0054,0x0022,[concat([E(0x0020,0x0032,'DS',position),E(0x0020,0x0037,'DS',['1','0','0','0','1','0'])])]),E(0x0054,0x0080,'US',rows.map((_,i)=>i+1)),E(0x0054,0x0081,'US',rows.length),E(0x7fe0,0x0010,'OW',pixel)
 ]);
 const fileMeta=concat([E(2,1,'OB',new Uint8Array([0,1])),E(2,2,'UI',klass),E(2,3,'UI',sop),E(2,0x10,'UI','1.2.840.10008.1.2.1'),E(2,0x12,'UI','2.25.260980434699510306077585833148324801201'),E(2,0x13,'SH','SPECT_PROTO_1')]);
 return new Blob([new Uint8Array(128),encoder.encode('DICM'),E(2,0,'UL',fileMeta.length),fileMeta,dataset],{type:'application/dicom'});
}
