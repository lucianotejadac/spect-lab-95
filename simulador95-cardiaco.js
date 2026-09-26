/* Tutorial cardiaco, primera parte: por cada fase (estres y reposo) controlar la calidad de las
   proyecciones, reconstruir con FBP, registrar el CT, reconstruir OSEM sin y con correccion de
   atenuacion, exportar ambas, y reconstruir y exportar el gatillado. Lee el estado del simulador
   (Lab95Live, Lab95Osem) y agrega dos bloques propios: el control de calidad (paso 1) y el
   gatillado (paso 3). Los casos viven en cardiaco-casos.js, compartido con simulador-cardiaco. */
'use strict';
(()=>{
 const e=id=>document.getElementById(id),panel=e('panelCardiaco95'),boton=e('tutorialCardiaco95'),botonPara=e('tutorialParatiroides95');
 const CLAVE='cardiaco95',receta=CARDIACO_RECETA,recetaGatillado=CARDIACO_GATILLADO;
 const nuevaFase=()=>({qc:{mov:null,extra:null,cine:false,medida:null,corregida:null},gated:{exportado:false,archivo:null},exportados:{}});
 const estado={caso:null,fase:'estres',hechos:{estres:nuevaFase(),reposo:nuevaFase()},abierto:false};
 // Memoria viva, no persistida: la adquisicion gatillada y sus reconstrucciones por fase.
 const vivo={qcCorregida:null,gated:{estres:null,reposo:null},recon:{estres:null,reposo:null},reconstruyendo:false,cancelar:false};

 function guardar(){try{sessionStorage.setItem(CLAVE,JSON.stringify({caso:estado.caso,fase:estado.fase,hechos:estado.hechos}));}catch(err){}}
 function recuperar(){try{const g=JSON.parse(sessionStorage.getItem(CLAVE)||'null');if(g&&CARDIACO_CASOS[g.caso]){estado.caso=g.caso;estado.fase=CARDIACO_FASES.includes(g.fase)?g.fase:'estres';for(const f of CARDIACO_FASES)estado.hechos[f]={...nuevaFase(),...(g.hechos?.[f]||{}),qc:{...nuevaFase().qc,...(g.hechos?.[f]?.qc||{})},gated:{...nuevaFase().gated,...(g.hechos?.[f]?.gated||{})}};}}catch(err){}}
 function abrir(valor){
  estado.abierto=valor;panel.hidden=!valor;
  // Un solo tutorial abierto a la vez: si el de paratiroides esta abierto, se cierra con su boton.
  if(valor&&botonPara&&botonPara.getAttribute('aria-pressed')==='true')botonPara.click();
  document.querySelector('.workspace').classList.toggle('conTutorial95',valor||(botonPara&&botonPara.getAttribute('aria-pressed')==='true'));
  boton.setAttribute('aria-pressed',valor);boton.textContent=valor?'Cerrar tutorial cardíaco':'Tutorial cardíaco';
  e('qc95').hidden=!valor;e('gated95').hidden=!valor;
  if(!valor)resaltar([]);render();if(valor)refrescarQc();
 }
 boton.onclick=()=>abrir(!estado.abierto);
 if(botonPara)new MutationObserver(()=>{if(botonPara.getAttribute('aria-pressed')==='true'&&estado.abierto)abrir(false);}).observe(botonPara,{attributes:true,attributeFilter:['aria-pressed']});

 // --- Lectura del estado del simulador ---------------------------------------------------
 function vivoLab(){return window.Lab95Live?Lab95Live.get():{};}
 function entradas(){return window.Lab95Osem?Lab95Osem.entradas():[];}
 const caso=()=>CARDIACO_CASOS[estado.caso];
 const faseDatos=f=>caso().fases[f];
 const otraFase=f=>f==='estres'?'reposo':'estres';
 const tieneCT=f=>Object.keys(faseDatos(f).ct||{}).length>0;
 function reconstruccionValida(r,ac){const p=r.parameters||{};return r.kind==='OSEM'&&p.iterations===receta.iteraciones&&p.subsets===receta.subconjuntos&&!!p.attenuationCorrection===ac&&!!p.postFilter&&Math.abs((p.postFilterFWHMmm||0)-receta.filtroMm)<0.05;}
 function faseDelMarco(marco){for(const f of CARDIACO_FASES)if(faseDatos(f).marco===marco)return f;return null;}
 function casoDelMarco(marco){for(const [n,c] of Object.entries(CARDIACO_CASOS))for(const f of CARDIACO_FASES)if(c.fases[f].marco===marco)return Number(n);return null;}

 // --- Pasos de una fase -------------------------------------------------------------------
 function pasos(f){
  const d=faseDatos(f),v=vivoLab(),s=v.spect,ct=v.ct,hechos=estado.hechos[f],nombreFase=CARDIACO_NOMBRE_FASE[f],carpeta=`Caso ${estado.caso}\\${CARDIACO_CARPETA_FASE[f]}`,conCT=tieneCT(f);
  const spectHash=s?cardiacoHash(s.frame):null,spectOk=spectHash===d.marco&&!!s&&s.slots===1&&!/orrected/i.test(s.description||''),spectOtra=spectHash===faseDatos(otraFase(f)).marco,spectOtroCaso=s&&!spectOk&&!spectOtra?casoDelMarco(spectHash):null;
  const spectInfo=e('spectInfo').textContent;
  const ctHash=ct?cardiacoHash(ct.marco):null,ctOk=spectOk&&ctHash===d.marco;
  const todas=entradas(),noac=todas.filter(r=>reconstruccionValida(r,false)),ac=todas.filter(r=>reconstruccionValida(r,true));
  const exportadoDe=(lista,tipo)=>lista.find(r=>r.exportado&&cardiacoReconoceNombre(r.exportado.nombre,estado.caso,f,tipo));
  const expNoac=exportadoDe(noac,'NoAC'),expAc=exportadoDe(ac,'AC');
  if(spectOk){if(expNoac){hechos.exportados.NoAC=expNoac.exportado.archivo;}if(expAc){hechos.exportados.AC=expAc.exportado.archivo;}guardar();}
  const ctInfo=e('ctInfo').textContent,ctSeries=e('ctSeries'),ctSinElegir=!ctSeries.disabled&&ctSeries.value===''&&ctSeries.options.length>1;
  let problemaCt=null;
  if(spectOk&&/marcos espaciales distintos/.test(ctInfo))problemaCt=`El simulador rechazó ese CT porque su marco de referencia no es el de este SPECT: es el de la fase ${CARDIACO_NOMBRE_FASE[otraFase(f)]} (o de otro caso). Carga el CT de la carpeta ${carpeta}.`;
  else if(spectOk&&ctSinElegir)problemaCt='Los archivos ya se leyeron. Falta elegir la serie en la lista «Serie TC encontrada».';
  else if(spectOk&&ct&&!ctOk)problemaCt='El CT cargado no corresponde a esta fase.';
  else if(spectOk&&/inclinación|No es TC|un corte por archivo/.test(ctInfo))problemaCt='El simulador no aceptó esos archivos como CT axial. Carga la carpeta «CT 512» o «CT 128» de la fase, no la de referencia del equipo.';
  const residuo=v.mu&&spectOk?[Math.abs(+e('rx95').value||0),Math.abs(+e('ry95').value||0)]:null;
  const detalleRegistro=residuo?(Math.max(...residuo)<=3?`Registro confirmado con un residuo de ${residuo[0]} mm en X y ${residuo[1]} mm en Y: dentro de un vóxel.`:Math.max(...residuo)<=8?`Registro confirmado con un residuo de ${residuo[0]} mm en X y ${residuo[1]} mm en Y, unos dos vóxeles. Aceptable; si quieres afinar, ajusta y confirma de nuevo.`:`Registro confirmado con un residuo de ${residuo[0]} mm en X y ${residuo[1]} mm en Y. Es mucho: el mapa μ corregirá de más una pared y de menos la opuesta. Ajusta y vuelve a confirmar.`):null;
  const esperandoBase=!!v.fbp&&spectOk&&!todas.some(r=>r.kind==='OSEM');
  // La exportacion mas reciente que no sirve: receta equivocada o nombre equivocado.
  const malExportada=tipo=>{const lista=todas.filter(r=>r.exportado&&!(reconstruccionValida(r,tipo==='AC')&&cardiacoReconoceNombre(r.exportado.nombre,estado.caso,f,tipo))).sort((a,b)=>String(b.exportado.cuando).localeCompare(String(a.exportado.cuando)));const r=lista[0];if(!r)return null;
   if(cardiacoReconoceNombre(r.exportado.nombre,estado.caso,f,tipo))return `Exportaste «${r.label}» con el nombre «${r.exportado.nombre}», pero esa reconstrucción no es la receta ${tipo==='AC'?'con':'sin'} AC (OSEM ${receta.iteraciones}×${receta.subconjuntos}, gaussiano ${receta.filtroMm} mm). Exporta la correcta con ese nombre.`;
   if(reconstruccionValida(r,tipo==='AC'))return `Exportaste la reconstrucción correcta pero ${r.exportado.nombre?`con el nombre «${r.exportado.nombre}»`:'sin nombre'}. Vuelve a exportar con «${cardiacoNombre(estado.caso,f,tipo)}»: el simulador de la segunda parte lo lee del propio archivo.`;
   return null;};
  const qc=hechos.qc,qcOk=spectOk&&!!qc.mov&&!!qc.extra&&qc.cine;
  const gatedS=vivo.gated[f],gatedOk=!!gatedS&&spectOk&&cardiacoHash(gatedS.frame)===d.marco;
  const gatedInfo=e('gatedInfo95').textContent;
  const recon=vivo.recon[f],reconOk=!!recon&&gatedOk;
  const lista=[
   {id:'spect',titulo:`Cargar las proyecciones de ${nombreFase}`,hecho:spectOk,resaltar:['spectFile'],paso:0,
    texto:`En el paso 1, «Seleccionar archivo DICOM» del bloque SPECT: el archivo «NM_${f}.dcm» de la carpeta ${carpeta}. Trae 128 imágenes: 32 vistas por cabezal, dos cabezales a 90° y dos ventanas de energía (fotopico de Tc-99m y dispersión), ${d.segundosPorVista} s por vista. No cargues aquí la copia «QC corregido» ni la gatillada: van en sus propios bloques.`,
    problema:s&&!spectOk?(s.slots>1?'Cargaste la adquisición gatillada. Aquí va «NM_'+f+'.dcm», la no gatillada; la gatillada se carga más abajo, en el bloque «Gatillado» del paso 3.':/orrected/i.test(s.description||'')&&spectHash===d.marco?'Cargaste la copia «QC corregido» del equipo. La cruda es «NM_'+f+'.dcm»; la corregida se carga en el bloque de control de calidad para compararla.':spectOtra?`Cargaste el SPECT de la fase ${CARDIACO_NOMBRE_FASE[otraFase(f)]}. Este paso pide ${nombreFase}: cada fase tiene su propio marco de referencia y su propio CT.`:spectOtroCaso?`Ese SPECT es del caso ${spectOtroCaso}, no del caso ${estado.caso}. Revisa la carpeta.`:'Ese SPECT no pertenece a ningún caso de este curso.'):(!s&&/gatillada/.test(spectInfo)?'El simulador rechazó la adquisición gatillada en este bloque: carga la no gatillada aquí y la gatillada en el bloque «Gatillado».':null)},
   {id:'qc',titulo:'Control de calidad de las proyecciones',hecho:qcOk,resaltar:['qcPlay95'],paso:0,
    texto:`Debajo del bloque de carga apareció el control de calidad. Reproduce el cine y mira el sinograma, el linograma y la imagen suma. ${d.guia} ${d.qc?'Tu carpeta trae la copia «NM_'+f+'_QC_corregido.dcm»: cárgala en el bloque para ver cuánto corrigió el equipo.':'Esta fase no trae copia corregida del equipo: el movimiento lo juzgas tú.'} Después responde las dos preguntas de «Tu evaluación».`,
    problema:spectOk&&!qcOk?[!qc.cine?'Falta reproducir el cine (botón ▶).':null,!qc.mov?'Falta responder si hubo movimiento.':null,!qc.extra?'Falta responder por la actividad extracardíaca.':null,qc.corregida&&qc.corregida.error?qc.corregida.error:null].filter(Boolean).join(' '):null,
    detalle:()=>qc.medida?`Medido en la cruda: salto axial máximo entre vistas vecinas ${qc.medida.axialMm} mm${qc.corregida&&!qc.corregida.error?(qc.corregida.modificadas===0?'; la copia corregida del equipo es idéntica a la cruda':qc.corregida.vistas===0?`; el equipo remuestreó ${qc.corregida.modificadas} vistas con corrimientos menores de un vóxel`:`; el equipo movió ${qc.corregida.vistas} de ${qc.corregida.total} vistas, hasta ${qc.corregida.maxMm} mm`):''}. Tu respuesta: movimiento ${qc.mov}, extracardíaca ${qc.extra}.`:null},
   ...(conCT?[{id:'ct',titulo:`Cargar el CT de ${nombreFase} y elegir su serie`,hecho:ctOk,resaltar:['ctFolder','ctSeries'],paso:0,
    texto:`«O seleccionar carpeta» del bloque TC, con la carpeta «CT 512» ${d.ct['CT 128']?'o «CT 128» ':''}de ${carpeta}: ${Object.entries(d.ct).map(([k,n])=>`${k} tiene ${n} cortes`).join(', ')}. El de 512 es el CT tal como salió del tomógrafo; el de 128 es el mismo remuestreado a la grilla del SPECT por el equipo. Cualquiera sirve para el mapa μ. Después elige la serie en la lista. Lo que decide si un CT sirve no es su nombre sino su marco de referencia: el simulador acepta el de esta fase y rechaza el de la otra.`,
    problema:spectOk?problemaCt:null,
    // Lo que el nombre de la serie no dice: si el rotulo contradice la fase, el marco de referencia manda.
    detalle:()=>ctOk&&ct.nombre?((f==='estres'&&/REST|REPOSO/i.test(ct.nombre))||(f==='reposo'&&/STRESS|ESTRES/i.test(ct.nombre))?`Aceptado: «${ct.nombre}», ${ct.cortes} cortes. Fíjate en el rótulo: el equipo lo nombró como si fuera de la otra fase, pero su marco de referencia es el de esta. El nombre lo escribe una persona; el marco lo escribe el equipo.`:`Aceptado: «${ct.nombre}», ${ct.cortes} cortes, mismo marco de referencia que el SPECT.`):null}]:[]),
   {id:'fbp',titulo:'Generar la FBP',hecho:!!v.fbp&&spectOk,resaltar:['fbp95'],paso:1,
    texto:'En el paso 2, «Generar FBP» con la ventana de fotopico (99m Technetium) y el filtro rampa. Es la reconstrucción preliminar: sirve para el registro y para ver el ruido en estrella y la pared inferior apagada por la atenuación. La órbita es de 180°: el simulador lo detecta y pesa cada vista por el paso angular.'},
   ...(conCT?[{id:'registro',titulo:'Revisar el registro y preparar el mapa μ',hecho:!!v.mu&&spectOk,resaltar:['confirm95'],paso:1,
    texto:'El ejercicio desplaza el CT algunos centímetros en X e Y. Elige un corte axial donde se vea el CT (fuera de su cobertura el fondo es azul), pon el preajuste «Contorno externo» y mueve el CT con + y − (mantén pulsado) hasta que la piel del tórax y el corazón coincidan con la emisión. Revisa también coronal y sagital. Luego «Confirmar registro y preparar mapa μ» o «Siguiente». Con el mapa preparado, la OSEM de referencia 1×1 parte sola.',
    detalle:detalleRegistro}]:[]),
   {id:'osemNoAC',titulo:`OSEM sin AC: ${receta.iteraciones}×${receta.subconjuntos}, gaussiano ${receta.filtroMm} mm`,hecho:noac.length>0&&spectOk,resaltar:['runOsem95'],paso:2,
    texto:(conCT?'':'Sin CT no hay registro: en el paso 2 pulsa «Siguiente» y el simulador pasa directo al paso 3 con la OSEM de referencia 1×1 partiendo sola. ')+(esperandoBase?'Primero corre sola la OSEM de referencia 1×1 sin correcciones: espera a que termine. ':'')+`En el paso 3, desmarca «Corrección de atenuación», deja «Suavizado final gaussiano» en ${receta.filtroMm} mm, ${receta.iteraciones} iteraciones y ${receta.subconjuntos} subconjuntos (64 vistas: 8 por subconjunto), y pulsa «Nueva reconstrucción». Es la imagen que el equipo llama «Recon - NoAC».`,
    accion:{etiqueta:'Aplicar la receta sin AC',fn:()=>aplicarReceta(false)}},
   ...(conCT?[{id:'osemAC',titulo:`OSEM con AC: la misma receta con el mapa μ`,hecho:ac.length>0&&spectOk,resaltar:['runOsem95'],paso:2,
    texto:`Marca «Corrección de atenuación» y repite «Nueva reconstrucción» con la misma receta. Solo se reconstruyen los cortes cubiertos por el CT (el corazón); el resto queda azul. Compara en los dos paneles la OSEM sin AC y con AC en el mismo corte: ${d.guia}`,
    accion:{etiqueta:'Aplicar la receta con AC',fn:()=>aplicarReceta(true)}}]:[]),
   {id:'exportNoAC',titulo:`Exportar como «${cardiacoNombre(estado.caso,f,'NoAC')}»`,hecho:!!hechos.exportados.NoAC,resaltar:['exportDicom95','exportName95'],paso:3,
    texto:`En el paso 4, elige la OSEM ${receta.iteraciones}×${receta.subconjuntos} sin AC (no la 1×1 de referencia), escribe «${cardiacoNombre(estado.caso,f,'NoAC')}» en Nombre y descarga.`,
    problema:!hechos.exportados.NoAC?malExportada('NoAC'):null,accion:{etiqueta:'Poner el nombre y abrir el paso 4',fn:()=>prepararExportacion(f,'NoAC')}},
   ...(conCT?[{id:'exportAC',titulo:`Exportar como «${cardiacoNombre(estado.caso,f,'AC')}»`,hecho:!!hechos.exportados.AC,resaltar:['exportDicom95','exportName95'],paso:3,
    texto:`Ahora la OSEM con AC, con el nombre «${cardiacoNombre(estado.caso,f,'AC')}». El nombre queda dentro del DICOM y es lo que el simulador de la segunda parte lee para saber qué volumen es.`,
    problema:!hechos.exportados.AC?malExportada('AC'):null,accion:{etiqueta:'Poner el nombre y abrir el paso 4',fn:()=>prepararExportacion(f,'AC')}}]:[]),
   {id:'gatedCargar',titulo:'Cargar la adquisición gatillada',hecho:gatedOk,resaltar:['gatedFile95'],paso:2,
    texto:`En el paso 3, bloque «Gatillado»: carga «NM_${f}_gatillado.dcm» (1024 imágenes: las 64 vistas × 2 ventanas × 8 intervalos del ciclo cardíaco, unos 34 MB).`,
    problema:gatedS&&!gatedOk?(cardiacoHash(gatedS.frame)===faseDatos(otraFase(f)).marco?`Esa gatillada es de la fase ${CARDIACO_NOMBRE_FASE[otraFase(f)]}.`:'Esa gatillada no es de esta fase ni de este caso.'):(/no es gatillada|No cargado/.test(gatedInfo)?gatedInfo:null)},
   {id:'gatedRecon',titulo:'Reconstruir los 8 intervalos en los cortes del corazón',hecho:reconOk,resaltar:['gatedRun95'],paso:2,
    texto:`Pulsa «Proponer el rango» (usa tu FBP para encontrar el corazón) y revísalo sobre la coronal: el corazón entero con dos o tres cortes de margen. Luego «Reconstruir 8 intervalos»: OSEM ${recetaGatillado.iteraciones}×${recetaGatillado.subconjuntos} sin AC, gaussiano ${recetaGatillado.filtroMm} mm, solo en esos cortes. Cada intervalo tiene un octavo de las cuentas: fíjate en el ruido del cine.`,
    detalle:()=>recon?`Reconstruidos ${recon.rows.length} cortes × 8 intervalos en ${Math.round(recon.seconds)} s.`:null},
   {id:'gatedExport',titulo:`Exportar como «${cardiacoNombre(estado.caso,f,'gatillado')}»`,hecho:!!hechos.gated.exportado,resaltar:['gatedExport95','gatedNombre95'],paso:2,
    texto:`Escribe «${cardiacoNombre(estado.caso,f,'gatillado')}» en el nombre del bloque gatillado y pulsa «Descargar DICOM gatillado». Es un solo archivo con los 8 intervalos.`,
    accion:{etiqueta:'Poner el nombre',fn:()=>{e('gatedNombre95').value=cardiacoNombre(estado.caso,f,'gatillado');refrescarGated();}}}
  ];
  if(lista.every(p=>p.hecho)){hechos.completa=true;guardar();}
  else if(hechos.completa&&!spectOk)for(const p of lista)p.hecho=true;
  return lista;
 }
 function aplicarReceta(ac){
  e('ac').checked=ac;e('filter').checked=true;e('fwhm').value=receta.filtroMm;e('iterations').value=receta.iteraciones;e('subsets').value=String(receta.subconjuntos);
  e('parameters').dispatchEvent(new Event('change',{bubbles:true}));
  if(typeof navigate==='function')navigate(2);
  status(`Receta aplicada: OSEM ${receta.iteraciones}×${receta.subconjuntos}, ${ac?'con':'sin'} AC, gaussiano ${receta.filtroMm} mm. Pulsa «Nueva reconstrucción».`);
 }
 function prepararExportacion(f,tipo){
  const nombre=cardiacoNombre(estado.caso,f,tipo),select=e('exportSeries95');
  e('exportName95').value=nombre;
  const objetivo=entradas().filter(r=>reconstruccionValida(r,tipo==='AC')).at(-1);
  if(objetivo&&[...select.options].some(o=>o.value===objetivo.id))select.value=objetivo.id;
  if(typeof navigate==='function')navigate(3);
  status(`Nombre «${nombre}» listo. Revisa que la reconstrucción elegida sea la ${receta.iteraciones}×${receta.subconjuntos} ${tipo==='AC'?'con':'sin'} AC y descarga.`);
 }

 // --- Control de calidad de proyecciones -------------------------------------------------
 const qcState={s:null,frames:[],max:1,k:0,timer:null};
 function ventanaActual(){return +e('energy95').value||1;}
 function vistas(s,w){return s.views.filter(v=>v.window===w&&v.slot===1).sort((a,b)=>a.angle-b.angle);}
 function pintar(canvas,img,w,h,max,invertir){const ctx=canvas.getContext('2d');if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}const id=ctx.createImageData(w,h);for(let i=0;i<w*h;i++){const c=color95(Math.max(0,img[i])/(max||1));id.data[i*4]=c[0];id.data[i*4+1]=c[1];id.data[i*4+2]=c[2];id.data[i*4+3]=255;}ctx.putImageData(id,0,0);}
 function refrescarQc(){
  if(!estado.abierto)return;const s=vivoLab().spect;
  if(!s||s.slots!==1){qcState.s=null;e('qcCuentas95').textContent='Carga las proyecciones para ver el control de calidad.';return;}
  const w=e('qcVentana95').checked?(s.windows.find(x=>x.id!==ventanaActual())?.id||ventanaActual()):ventanaActual();
  // Con la casilla marcada, el panel muestra la copia corregida del equipo en vez de la cruda;
  // la medida de movimiento se calcula siempre sobre la cruda.
  const hayCopia=!!vivo.qcCorregida&&vivo.qcCorregida.frame===s.frame,chk=e('qcVerCorregida95');if(chk){chk.disabled=!hayCopia;if(!hayCopia)chk.checked=false;}
  const src=chk&&chk.checked&&hayCopia?vivo.qcCorregida:s;
  const fr=vistas(src,w),n=s.n,p=n*n;if(!fr.length)return;
  const cambio=qcState.s!==s||qcState.w!==w||qcState.src!==src;qcState.s=s;qcState.w=w;qcState.src=src;qcState.frames=fr;
  if(cambio){let max=0;for(const v of fr){const a=src.data.subarray(v.source*p,(v.source+1)*p);for(let i=0;i<p;i++)if(a[i]>max)max=a[i];}qcState.max=max*.8||1;e('qcFrame95').max=fr.length-1;qcState.k=Math.min(qcState.k,fr.length-1);
   // Imagen suma, linograma y fila del sinograma por omision (fila del maximo de la suma).
   const suma=new Float32Array(p),lino=new Float32Array(fr.length*n);let total=0;
   fr.forEach((v,k)=>{const a=src.data.subarray(v.source*p,(v.source+1)*p);for(let i=0;i<p;i++){suma[i]+=a[i];total+=a[i];}for(let y=0;y<n;y++){let q=0;for(let x=0;x<n;x++)q+=a[y*n+x];lino[y*fr.length+k]=q;}});
   let mi=0;for(let i=1;i<p;i++)if(suma[i]>suma[mi])mi=i;const fila=Math.floor(mi/n);e('qcFila95').value=fila;
   pintar(e('qcSuma95'),suma,n,n,Math.max(...suma)*.9);let lmax=0;for(let i=0;i<lino.length;i++)if(lino[i]>lmax)lmax=lino[i];pintar(e('qcLino95'),lino,fr.length,n,lmax);
   const porVista=Math.round(total/fr.length);e('qcCuentas95').textContent=`${src===s?'Cruda':'Copia corregida'}: ${fr.length} vistas de ${s.arc}° · ${(total/1e6).toFixed(2)} M cuentas en la ventana ${w===ventanaActual()?'de fotopico':'de dispersión'} · ${(porVista/1000).toFixed(0)} k por vista.`;
   if(src===s)qcState.porVista=porVista;
   // Medida de movimiento axial: corrimiento entero del perfil axial de cada vista respecto a la
   // vista vecina (las proyecciones cambian poco entre angulos contiguos; un salto es movimiento).
   if(src===s){
   const perfil=k=>{const p=new Float64Array(n);for(let y=0;y<n;y++)p[y]=lino[y*fr.length+k];return p;};
   let salto=0,deriva=0,prev=perfil(0);
   for(let k=1;k<fr.length;k++){const cur=perfil(k);let mejor=Infinity,mdy=0;for(let dy=-6;dy<=6;dy++){let ssd=0;for(let y=8;y<n-8;y++){const q=cur[y]-prev[y+dy];ssd+=q*q;}if(ssd<mejor){mejor=ssd;mdy=dy;}}salto=Math.max(salto,Math.abs(mdy));deriva+=mdy;prev=cur;}
   const dev=salto,drift=Math.abs(deriva);
   if(estado.caso&&faseDelMarco(cardiacoHash(s.frame))){const f=faseDelMarco(cardiacoHash(s.frame));estado.hechos[f].qc.medida={axialMm:+(dev*s.spacing).toFixed(1),driftMm:+(drift*s.spacing).toFixed(1),porVista};guardar();}
   e('qcMedida95').textContent=`Medida automática sobre la cruda: el salto axial máximo entre vistas vecinas es de ${dev} vóxel(es) (${(dev*s.spacing).toFixed(1)} mm) y la deriva acumulada a lo largo de la órbita de ${(drift*s.spacing).toFixed(1)} mm. Un vóxel son ${s.spacing.toFixed(1)} mm; un salto de un vóxel ya se nota en la reconstrucción. Júzgalo junto con el cine y el linograma.`;
   }
   if(vivo.qcCorregida&&vivo.qcCorregida.frame!==s.frame){vivo.qcCorregida=null;e('qcCorregidaInfo95').textContent='La copia corregida cargada era de otra fase; cárgala de nuevo para esta.';}
  }
  dibujarCine();dibujarSino();
 }
 function dibujarCine(){const s=qcState.s;if(!s)return;const fr=qcState.frames,k=Math.max(0,Math.min(fr.length-1,qcState.k)),n=s.n,p=n*n;e('qcFrame95').value=k;e('qcVista95').textContent=`vista ${k+1}/${fr.length} · ${Math.round(fr[k].angle*180/Math.PI)}°`;pintar(e('qcCine95'),s.data.subarray(fr[k].source*p,(fr[k].source+1)*p),n,n,qcState.max);}
 function dibujarSino(){const s=qcState.s;if(!s)return;const fr=qcState.frames,n=s.n,p=n*n,y=+e('qcFila95').value;e('qcFilaValor95').textContent=y;const img=new Float32Array(fr.length*n);let max=0;fr.forEach((v,k)=>{for(let x=0;x<n;x++){const q=s.data[v.source*p+y*n+x];img[x*fr.length+k]=q;if(q>max)max=q;}});pintar(e('qcSino95'),img,fr.length,n,max*.9);}
 e('qcFrame95').oninput=()=>{qcState.k=+e('qcFrame95').value;dibujarCine();};
 e('qcFila95').oninput=dibujarSino;
 e('qcVentana95').onchange=()=>{refrescarQc();};if(e('qcVerCorregida95'))e('qcVerCorregida95').onchange=()=>{refrescarQc();};
 e('qcPlay95').onclick=()=>{
  if(qcState.timer){clearInterval(qcState.timer);qcState.timer=null;e('qcPlay95').textContent='▶ Reproducir';return;}
  if(!qcState.s)return;e('qcPlay95').textContent='■ Detener';let vueltas=0;
  qcState.timer=setInterval(()=>{qcState.k=(qcState.k+1)%qcState.frames.length;if(qcState.k===0)vueltas++;dibujarCine();if(vueltas>=1){const f=faseActualDelSpect();if(f&&!estado.hechos[f].qc.cine){estado.hechos[f].qc.cine=true;guardar();render();}}},110);
 };
 function faseActualDelSpect(){const s=vivoLab().spect;if(!s||!estado.caso)return null;return faseDelMarco(cardiacoHash(s.frame));}
 for(const nombre of ['qcMov95','qcExtra95'])document.addEventListener('change',ev=>{if(ev.target.name!==nombre)return;const f=faseActualDelSpect();if(!f)return;estado.hechos[f].qc[nombre==='qcMov95'?'mov':'extra']=ev.target.value;guardar();render();});
 function sincronizarRespuestas(){const f=faseActualDelSpect();for(const [nombre,clave] of [['qcMov95','mov'],['qcExtra95','extra']]){const valor=f?estado.hechos[f].qc[clave]:null;for(const r of document.getElementsByName(nombre))r.checked=!!valor&&r.value===valor;}}
 e('qcArchivo95').onchange=async()=>{
  const file=e('qcArchivo95').files[0];if(!file)return;const s=vivoLab().spect;
  try{const d=await Lab95.read(file),c=Lab95.spect(d);if(!s)throw Error('Carga primero la cruda en el bloque SPECT.');if(c.frame!==s.frame)throw Error('Esa copia no es de la fase cargada: su marco de referencia es otro.');if(!/orrected/i.test(c.description||''))throw Error('Ese archivo no es la copia «QC Corrected»: su descripción es «'+c.description+'».');
   vivo.qcCorregida=c;const r=compararCorregida(s,c);const f=faseActualDelSpect();if(f){estado.hechos[f].qc.corregida=r;guardar();}
   const resumen=r.modificadas===0?'Los píxeles son idénticos a los de la cruda: el equipo no encontró movimiento que corregir y la copia es la misma imagen.':r.vistas===0?`El equipo modificó ${r.modificadas} de ${r.total} vistas, pero con corrimientos menores de un vóxel (remuestreo fino, sin saltos enteros); las cuentas cambiaron un ${r.cambioPct} %.`:`El equipo desplazó ${r.vistas} de ${r.total} vistas con corrimientos enteros, el mayor de ${r.maxPx} píxeles (${r.maxMm} mm), ${r.axial>=r.transversal?'sobre todo axial (a lo largo de la camilla)':'sobre todo transversal'}; en total modificó ${r.modificadas} vistas.`;
   e('qcCorregidaInfo95').textContent=`Copia «${c.description}» comparada vista por vista con la cruda. ${resumen} Marca la casilla para verla en el cine y el sinograma.`;refrescarQc();render();
  }catch(err){const f=faseActualDelSpect();if(f){estado.hechos[f].qc.corregida={error:'Copia corregida: '+err.message};guardar();}e('qcCorregidaInfo95').textContent='No cargado: '+err.message;render();}
 };
 // Corrimiento entero (dx,dy) que mejor superpone cada vista cruda con su corregida.
 function compararCorregida(s,c){
  const w=ventanaActual(),a=vistas(s,w),b=vistas(c,w),n=s.n,p=n*n;let vistasMovidas=0,modificadas=0,maxPx=0,axial=0,transversal=0,sumaA=0,sumaB=0;
  for(let k=0;k<Math.min(a.length,b.length);k++){const A=s.data.subarray(a[k].source*p,(a[k].source+1)*p),B=c.data.subarray(b[k].source*p,(b[k].source+1)*p);let mejor=Infinity,mdx=0,mdy=0,distinta=false;
   for(let i=0;i<p;i++){sumaA+=A[i];sumaB+=B[i];if(A[i]!==B[i])distinta=true;}if(distinta)modificadas++;
   for(let dy=-6;dy<=6;dy++)for(let dx=-6;dx<=6;dx++){let ssd=0;for(let y=8;y<n-8;y+=2)for(let x=8;x<n-8;x+=2){const q=A[(y+dy)*n+x+dx]-B[y*n+x];ssd+=q*q;}if(ssd<mejor){mejor=ssd;mdx=dx;mdy=dy;}}
   if(mdx||mdy){vistasMovidas++;maxPx=Math.max(maxPx,Math.hypot(mdx,mdy));axial+=Math.abs(mdy);transversal+=Math.abs(mdx);}}
  return {vistas:vistasMovidas,modificadas,total:a.length,maxPx:+maxPx.toFixed(1),maxMm:+(maxPx*s.spacing).toFixed(1),axial,transversal,cambioPct:+(100*Math.abs(sumaB-sumaA)/(sumaA||1)).toFixed(2)};
 }

 // --- Gatillado ------------------------------------------------------------------------------
 const gatedUi={timer:null,t:0};
 function faseDeGated(g){return g?faseDelMarco(cardiacoHash(g.frame)):null;}
 e('gatedFile95').onchange=async()=>{
  const file=e('gatedFile95').files[0];if(!file)return;e('gatedInfo95').textContent='Leyendo la adquisición gatillada…';
  try{const d=await Lab95.read(file),g=Lab95.spect(d,{gated:true});const f=faseDeGated(g);
   if(!estado.caso)throw Error('Elige primero el caso en el tutorial.');if(!f)throw Error('Esa gatillada no es de este caso.');
   vivo.gated[f]=g;vivo.recon[f]=null;
   // Cuentas de fotopico por intervalo y por vista, y su proporcion respecto a la cruda no gatillada.
   const w=ventanaActual(),p=g.n*g.n,porSlot=new Float64Array(g.slots);for(const v of g.views){if(v.window!==w)continue;const a=g.data.subarray(v.source*p,(v.source+1)*p);let q=0;for(let i=0;i<p;i++)q+=a[i];porSlot[v.slot-1]+=q;}
   const nv=vistas(g,w).length,total=porSlot.reduce((x,y)=>x+y,0),medioSlot=total/g.slots,porVista=medioSlot/nv,crudaPorVista=qcState.porVista||0;
   e('gatedInfo95').textContent=`«${g.description}»: ${g.frames} imágenes, ${g.slots} intervalos, ${nv} vistas por intervalo. Fase ${CARDIACO_NOMBRE_FASE[f]}. Fotopico: ${(total/1e6).toFixed(2)} M cuentas en total, ${(medioSlot/1000).toFixed(0)} k por intervalo (de ${(Math.min(...porSlot)/1000).toFixed(0)} a ${(Math.max(...porSlot)/1000).toFixed(0)} k), ${(porVista/1000).toFixed(1)} k por vista${crudaPorVista?` frente a ${(crudaPorVista/1000).toFixed(0)} k por vista de la no gatillada: una fracción de ${(porVista/crudaPorVista).toFixed(2)}`:''}.`;
  }catch(err){e('gatedInfo95').textContent='No cargado: '+err.message;}
  refrescarGated();render();
 };
 function faseGatedActiva(){const s=vivoLab().spect;const f=s&&estado.caso?faseDelMarco(cardiacoHash(s.frame)):null;return f&&vivo.gated[f]&&vivo.gated[f].frame===s.frame?f:null;}
 function refrescarGated(){
  const f=faseGatedActiva(),v=vivoLab();
  e('gatedRun95').disabled=!f||!v.fbp||vivo.reconstruyendo;e('gatedAuto95').disabled=!v.fbp;
  const recon=f?vivo.recon[f]:null;e('gatedPlay95').disabled=!recon;e('gatedExport95').disabled=!recon;
  e('gatedEstado95').textContent=recon?`Reconstruidos ${recon.rows.length} cortes (${recon.rows[0]+1}–${recon.rows.at(-1)+1}) × ${recon.volumes.length} intervalos en ${Math.round(recon.seconds)} s. Mueve el corte y pulsa «Latir».`:(vivo.reconstruyendo?'Reconstruyendo…':'Sin reconstrucción gatillada.');
  if(recon){e('gatedCorte95').min=recon.rows[0];e('gatedCorte95').max=recon.rows.at(-1);if(+e('gatedCorte95').value<recon.rows[0]||+e('gatedCorte95').value>recon.rows.at(-1))e('gatedCorte95').value=recon.rows[Math.floor(recon.rows.length/2)];}
  dibujarCoronal();dibujarGated();
 }
 // El higado suele ser mas caliente que el corazon en la FBP, asi que el maximo por corte no
 // sirve para encontrarlo. Se busca el ventriculo como lo que es: un anillo cerrado con centro
 // oscuro en el eje corto, usando el eje de referencia del caso (o uno tipico si no lo hay).
 function muestraFbp(vol,n,x,y,z){if(x<0||y<0||z<0||x>n-1||y>n-1||z>n-1)return 0;const x0=Math.min(n-2,Math.floor(x)),y0=Math.min(n-2,Math.floor(y)),z0=Math.min(n-2,Math.floor(z)),fx=x-x0,fy=y-y0,fz=z-z0,p=n*n,at=(i,j,k)=>Math.max(0,vol[k*p+j*n+i]);
  const c00=at(x0,y0,z0)*(1-fx)+at(x0+1,y0,z0)*fx,c10=at(x0,y0+1,z0)*(1-fx)+at(x0+1,y0+1,z0)*fx,c01=at(x0,y0,z0+1)*(1-fx)+at(x0+1,y0,z0+1)*fx,c11=at(x0,y0+1,z0+1)*(1-fx)+at(x0+1,y0+1,z0+1)*fx;return (c00*(1-fy)+c10*fy)*(1-fz)+(c01*(1-fy)+c11*fy)*fz;}
 function buscarVentriculoFbp(vol,n,spacing,azimut,elevacion){
  // Marco del ventriculo en coordenadas de la matriz FBP (x izquierda, y posterior, z hacia
  // los pies: el indice crece hacia inferior, al reves del eje Z del paciente).
  const az=azimut*Math.PI/180,el=elevacion*Math.PI/180,a=[Math.sin(az)*Math.cos(el),-Math.cos(az)*Math.cos(el),Math.sin(el)];
  const inf=[0,0,1],dot=inf[2]*a[2];let v=[-dot*a[0],-dot*a[1],1-dot*a[2]];const lv=Math.hypot(...v)||1;v=v.map(q=>q/lv);const u=[a[1]*v[2]-a[2]*v[1],a[2]*v[0]-a[0]*v[2],a[0]*v[1]-a[1]*v[0]];
  // Dos tamanos de anillo: corazon normal (radio 11 a 21 mm) y dilatado (24 a 44 mm).
  const c=n>>1,anillos=[[11,21,7,1.5],[24,44,14,4]].map(([a0,b0,R,rIn])=>{const r0=a0/spacing,r1=b0/spacing,pts=[];for(let j=-R;j<=R;j++)for(let i=-R;i<=R;i++){const r=Math.hypot(i,j);if(r<=rIn)pts.push([i,j,-1]);else if(r>=r0&&r<=r1)pts.push([i,j,Math.floor(((Math.atan2(j,i)+Math.PI)/(2*Math.PI))*8)%8]);}return pts;});
  const puntajeCon=(pts,x,y,z)=>{const sec=new Float64Array(8),cnt=new Float64Array(8);let cen=0,ncen=0;for(const [i,j,s] of pts){const q=muestraFbp(vol,n,x+u[0]*i+v[0]*j,y+u[1]*i+v[1]*j,z+u[2]*i+v[2]*j);if(s<0){cen+=q;ncen++;}else{sec[s]+=q;cnt[s]++;}}
   // Promedio de los tres sectores mas debiles (no el minimo): con pocas cuentas (estres de 9 mCi
   // en el caso 1) el ruido hunde siempre algun sector y el anillo verdadero puntuaba negativo,
   // asi que el rango propuesto caia en otra parte. Igual que en simulador-cardiaco.
   const prom=[];for(let s=0;s<8;s++)prom.push(cnt[s]?sec[s]/cnt[s]:0);prom.sort((p1,p2)=>p1-p2);const min=(prom[0]+prom[1]+prom[2])/3,max=prom[7];return min-(ncen?cen/ncen:0)-.5*(max-min);};
  let mejor={p:-Infinity},pts=anillos[0];for(const cand of anillos)for(let z=4;z<n-4;z+=2)for(let y=c-26;y<=c+14;y+=2)for(let x=c-10;x<=c+30;x+=2){const p=puntajeCon(cand,x,y,z);if(p>mejor.p){mejor={p,x,y,z};pts=cand;}}
  if(!(mejor.p>0))return null;const puntaje=(x,y,z)=>puntajeCon(pts,x,y,z);
  const perfil=t=>puntaje(mejor.x+a[0]*t,mejor.y+a[1]*t,mejor.z+a[2]*t);let tA=0,tB=0;while(tA<25&&perfil(tA+1)>.25*mejor.p)tA++;while(tB>-25&&perfil(tB-1)>.25*mejor.p)tB--;tA+=3;tB-=2;
  const mid=(tA+tB)/2;return {C:[mejor.x+a[0]*mid,mejor.y+a[1]*mid,mejor.z+a[2]*mid],L:tA-tB,puntaje:mejor.p};
 }
 function rangoAuto(){
  const v=vivoLab();if(!v.fbp||!v.spect)return null;const n=v.spect.n,sp=v.spect.spacing,f=faseActualDelSpect();
  // Se prefiere la ultima OSEM terminada (mas limpia que la FBP); si hay mapa μ, el corazon
  // tiene que estar dentro de la cobertura del CT, y fuera de ella no se busca.
  const osem=entradas().filter(r=>r.kind==='OSEM').at(-1),volOsem=osem&&window.Lab95Osem.volumen?Lab95Osem.volumen(osem.id):null;
  let vol=volOsem?volOsem.data:(v.fbpDisplay||v.fbp);
  if(v.mu){const p=n*n;vol=Float32Array.from(vol);for(let z=0;z<n;z++){let hay=false;for(let j=0;j<p&&!hay;j+=7)if(Number.isFinite(v.mu[z*p+j]))hay=true;if(!hay)vol.fill(0,z*p,(z+1)*p);}}
  const eje=(f&&faseDatos(f).eje)||{azimut:35,elevacion:10};const b=buscarVentriculoFbp(vol,n,sp,eje.azimut,eje.elevacion);
  if(!b){const c=n>>1;return {z0:c-15,z1:c+15,y:c};}
  // Cortes que cubren el ventriculo entero: el largo mas el radio, con margen.
  const medio=b.L/2+25/sp+3;return {z0:Math.max(0,Math.round(b.C[2]-medio)),z1:Math.min(n-1,Math.round(b.C[2]+medio)),y:Math.round(b.C[1]),centro:b.C,largo:b.L};
 }
 e('gatedAuto95').onclick=()=>{const r=rangoAuto();if(!r){status('Genera primero la FBP: el rango se propone sobre ella.');return;}e('gatedZ0').value=r.z0;e('gatedZ1').value=r.z1;gatedUi.y=r.y;refrescarGated();status(`Rango propuesto: cortes ${r.z0+1} a ${r.z1+1}. Revísalo sobre la coronal.`);};
 for(const id of ['gatedZ0','gatedZ1'])e(id).oninput=()=>{dibujarCoronal();render();};
 function dibujarCoronal(){
  const v=vivoLab(),cv=e('gatedCoronal95');if(!v.fbp||!v.spect){cv.getContext('2d').clearRect(0,0,cv.width,cv.height);return;}const vol=v.fbpDisplay||v.fbp,n=v.spect.n;if(gatedUi.y===undefined){const r=rangoAuto();gatedUi.y=r?r.y:n>>1;}
  const img=new Float32Array(n*n);let max=0;for(let z=0;z<n;z++)for(let x=0;x<n;x++){const q=Math.max(0,vol[z*n*n+gatedUi.y*n+x]);img[z*n+x]=q;if(q>max)max=q;}
  pintar(cv,img,n,n,max*.9);const ctx=cv.getContext('2d');ctx.strokeStyle='#0f0';ctx.lineWidth=1;for(const id of ['gatedZ0','gatedZ1']){const z=+e(id).value+.5;ctx.beginPath();ctx.moveTo(0,z);ctx.lineTo(n,z);ctx.stroke();}
 }
 function suavizarSub(vol,n,K,sigma){
  const radius=Math.max(1,Math.ceil(3*sigma)),kernel=[];let sum=0;for(let k=-radius;k<=radius;k++){const w=Math.exp(-.5*(k/sigma)**2);kernel.push(w);sum+=w;}for(let i=0;i<kernel.length;i++)kernel[i]/=sum;
  const dims=[n,n,K],strides=[1,n,n*n];let input=vol;
  for(let axis=0;axis<3;axis++){const out=new Float32Array(vol.length),L=dims[axis],st=strides[axis];
   for(let i=0;i<vol.length;i++){const pos=Math.floor(i/st)%L;let acc=0;for(let k=-radius;k<=radius;k++){let q=pos+k;if(q<0)q=-q-1;if(q>=L)q=2*L-q-1;acc+=input[i+(q-pos)*st]*kernel[k+radius];}out[i]=acc;}input=out;}
  return input;
 }
 function reconstruirGate(g,slot,z0,z1,w){
  return new Promise((res,rej)=>{
   const sg=Lab95.gate(g,slot),settings={educational:true,attenuationCorrection:false,scatter:false,scatterWeight:0,resolutionRecovery:false,distanceDependent:false,axialRecovery:false,scatterSmoothing:false,scatterFwhm:0,psfFwhm100:6,psfIntrinsic:3.5,postFilter:false,postFilterFWHMmm:0,initialization:'uniform',iterations:recetaGatillado.iteraciones,subsets:recetaGatillado.subconjuntos,scatterWindowScale:0,status:'executed',algorithm:'OSEM 2D por cortes'};
   const code=[createModel.toString(),sampleGrid.toString(),attenuationWeights.toString(),gaussianKernel95.toString(),scatterBlur95.toString(),createPsfView95.toString(),'('+osem95Worker.toString()+')()'].join('\n');
   const pool=createOsem95Pool(code);vivo.pool=pool;const mid=Math.floor((z0+z1)/2),rad=Math.max(mid-z0,z1-mid);
   pool.onerror=err=>rej(err);
   pool.onmessage=({data:q})=>{if(q.error){rej(Error(q.error));return;}if(q.progress){e('gatedEstado95').textContent=`Intervalo ${slot}/${g.slots} · ${q.progress}`;return;}if(q.volume){pool.terminate();const rows=q.rows.filter(z=>z>=z0&&z<=z1).sort((a,b)=>a-b),n=g.n,p=n*n,sub=new Float32Array(rows.length*p);rows.forEach((z,i)=>sub.set(q.volume.subarray(z*p,(z+1)*p),i*p));res({rows,data:sub});}};
   pool.postMessage({n:g.n,data:sg.data,views:sg.views,spacing:g.spacing,window:w,scatterWindow:0,settings,mu:null,fbp:null,outsideAir:true,previewRow:mid,previewRadius:rad});
  });
 }
 e('gatedRun95').onclick=async()=>{
  const f=faseGatedActiva();if(!f||vivo.reconstruyendo)return;const g=vivo.gated[f],z0=Math.min(+e('gatedZ0').value,+e('gatedZ1').value),z1=Math.max(+e('gatedZ0').value,+e('gatedZ1').value);
  if(z1-z0<4||z1-z0>70){status('Elige un rango de 5 a 70 cortes alrededor del corazón.');return;}
  vivo.reconstruyendo=true;vivo.cancelar=false;e('gatedCancel95').disabled=false;e('gatedRun95').disabled=true;e('gatedProgress95').value=0;e('gatedProgress95').max=g.slots;const inicio=performance.now(),volumes=[];let rows=null;
  try{
   for(let t=1;t<=g.slots;t++){if(vivo.cancelar)throw Error('detenido');const r=await reconstruirGate(g,t,z0,z1,ventanaActual());rows=r.rows;volumes.push(suavizarSub(r.data,g.n,rows.length,recetaGatillado.filtroMm/g.spacing/2.354820045));e('gatedProgress95').value=t;}
   vivo.recon[f]={n:g.n,rows,volumes,parameters:{iterations:recetaGatillado.iteraciones,subsets:recetaGatillado.subconjuntos,postFilter:true,postFilterFWHMmm:recetaGatillado.filtroMm,attenuationCorrection:false},seconds:(performance.now()-inicio)/1000};
   // El nombre se propone siempre al terminar: si quedo el de la otra fase, se reemplaza.
   const actual=e('gatedNombre95').value.trim();if(!actual||CARDIACO_FASES.some(o=>o!==f&&cardiacoReconoceNombre(actual,estado.caso,o,'gatillado')))e('gatedNombre95').value=cardiacoNombre(estado.caso,f,'gatillado');
   status(`Gatillado reconstruido: ${rows.length} cortes × ${g.slots} intervalos en ${Math.round((performance.now()-inicio)/1000)} s.`);
  }catch(err){if(vivo.pool)vivo.pool.terminate();status(err.message==='detenido'?'Reconstrucción gatillada detenida.':'Error en el gatillado: '+err.message);}
  vivo.reconstruyendo=false;e('gatedCancel95').disabled=true;refrescarGated();render();
 };
 e('gatedCancel95').onclick=()=>{vivo.cancelar=true;if(vivo.pool)vivo.pool.terminate();};
 function dibujarGated(){const f=faseGatedActiva(),recon=f?vivo.recon[f]:null,cv=e('gatedCine95');if(!recon){cv.getContext('2d').clearRect(0,0,cv.width,cv.height);e('gatedCorteValor95').textContent='—';return;}const z=+e('gatedCorte95').value,i=recon.rows.indexOf(z);if(i<0)return;const n=recon.n,p=n*n,t=gatedUi.t%recon.volumes.length;let max=0;for(const vol of recon.volumes){const a=vol.subarray(i*p,(i+1)*p);for(let j=0;j<p;j++)if(a[j]>max)max=a[j];}pintar(cv,recon.volumes[t].subarray(i*p,(i+1)*p),n,n,max*.9);e('gatedCorteValor95').textContent=`${z+1} · intervalo ${t+1}/${recon.volumes.length}`;}
 e('gatedCorte95').oninput=dibujarGated;
 e('gatedPlay95').onclick=()=>{if(gatedUi.timer){clearInterval(gatedUi.timer);gatedUi.timer=null;e('gatedPlay95').textContent='▶ Latir';return;}e('gatedPlay95').textContent='■ Parar';gatedUi.timer=setInterval(()=>{gatedUi.t++;dibujarGated();},125);};
 e('gatedExport95').onclick=()=>{
  try{const f=faseGatedActiva(),recon=f?vivo.recon[f]:null,s=vivoLab().spect;if(!recon||!s)throw Error('No hay reconstrucción gatillada de la fase cargada.');
   const nombre=e('gatedNombre95').value.trim().replace(/\s+/g,' ').slice(0,40),limpio=nombre.replace(/[^\p{L}\p{N}]+/gu,'-').replace(/^-+|-+$/g,'').toLowerCase();
   const blob=buildGatedDicom95(recon,s,nombre),archivo=`${limpio?limpio+'-':''}gated-spect-${recetaGatillado.iteraciones}x${recetaGatillado.subconjuntos}-nac.dcm`;download(blob,archivo);
   const ok=cardiacoReconoceNombre(nombre,estado.caso,f,'gatillado');estado.hechos[f].gated.exportado=ok;estado.hechos[f].gated.archivo=archivo;guardar();
   e('gatedExportInfo95').textContent=ok?`Descargado ${archivo} (${(blob.size/1048576).toFixed(1)} MB): ${recon.volumes.length} intervalos × ${recon.rows.length} cortes.`:`Descargado ${archivo}, pero el nombre ${nombre?`«${nombre}»`:'vacío'} no es el que espera la segunda parte: vuelve a exportar como «${cardiacoNombre(estado.caso,f,'gatillado')}».`;render();
  }catch(err){e('gatedExportInfo95').textContent='No se pudo exportar: '+err.message;}
 };

 // --- Resaltado --------------------------------------------------------------------------
 let resaltados=[];
 function resaltar(ids){
  for(const el of resaltados)el.classList.remove('tutorialResaltado95');resaltados=[];
  for(const id of ids){const control=e(id);if(!control)continue;const objetivo=control.type==='file'?control.closest('label')||control:control;if(objetivo.closest('[hidden]'))continue;objetivo.classList.add('tutorialResaltado95');resaltados.push(objetivo);}
  if(window.TutorialLinea)TutorialLinea.apuntar(panel,resaltados);
 }

 // --- Render ------------------------------------------------------------------------------
 const h=(tag,attrs={},...hijos)=>{const el=document.createElement(tag);for(const [k,v] of Object.entries(attrs)){if(k==='onclick')el.onclick=v;else if(v!==null&&v!==undefined)el.setAttribute(k,v);}for(const hijo of hijos)if(hijo!=null)el.append(hijo);return el;};
 function render(){
  if(!estado.abierto)return;panel.replaceChildren();sincronizarRespuestas();
  if(!estado.caso){renderEleccion();return;}
  const c=caso();
  panel.append(h('div',{class:'tutorialCabecera95'},h('strong',{},`Cardíaco · caso ${estado.caso}`),h('button',{type:'button',class:'tutorialMini95',onclick:()=>{estado.caso=null;estado.hechos={estres:nuevaFase(),reposo:nuevaFase()};estado.fase='estres';vivo.gated={estres:null,reposo:null};vivo.recon={estres:null,reposo:null};guardar();resaltar([]);render();}},'Cambiar caso')));
  panel.append(h('p',{class:'tutorialTitulo95'},c.titulo),h('p',{class:'tutorialResumen95'},c.resumen));
  const clinica=h('details',{},h('summary',{},'Contexto clínico (desidentificado)'));
  for(const [k,titulo] of [['antecedentes','Antecedentes'],['procedimiento','Procedimiento']])clinica.append(h('h4',{},titulo),h('p',{},c.clinica[k]));
  clinica.append(h('p',{class:'tutorialNota95'},'Los hallazgos y la impresión del informe se revelan al terminar la segunda parte, en el simulador cardíaco.'));
  panel.append(clinica);
  const part=h('details',{open:''},h('summary',{},'Particularidades de este caso'));const ul=h('ul',{});for(const p of c.particularidades)ul.append(h('li',{},p));part.append(ul);panel.append(part);
  panel.append(h('p',{class:'tutorialNota95'},'Cada fase tiene su propio marco de referencia: el SPECT de estrés solo se registra con el CT de estrés, y la gatillada de estrés solo con la cruda de estrés. Si cruzas fases, el simulador lo dice.'));
  const pest=h('div',{class:'tutorialFases95'});
  for(const f of CARDIACO_FASES){const completa=pasos(f).every(p=>p.hecho);pest.append(h('button',{type:'button','aria-pressed':String(estado.fase===f),onclick:()=>{estado.fase=f;guardar();render();}},`${completa?'☑':'☐'} Fase ${CARDIACO_NOMBRE_FASE[f]}`));}
  panel.append(pest);
  const lista=pasos(estado.fase),actual=lista.find(p=>!p.hecho);
  const ol=h('ol',{class:'tutorialPasos95'});
  for(const p of lista){
   const li=h('li',{class:p.hecho?'hecho':p===actual?'actual':''},h('span',{class:'marca'},p.hecho?'☑':'☐'),' ',h('span',{},p.titulo));
   if(p===actual)li.append(h('p',{},p.texto));
   if(!p.hecho&&p.problema)li.append(h('p',{class:'tutorialProblema95'},p.problema));
   const detalle=typeof p.detalle==='function'?p.detalle():p.detalle;if(p.hecho&&detalle)li.append(h('p',{class:'tutorialDetalle95'},detalle));
   if(p===actual){const botones=h('div',{class:'tutorialBotones95'});
    if(p.paso!==undefined&&typeof navigate==='function'&&typeof step!=='undefined'&&step!==p.paso)botones.append(h('button',{type:'button',onclick:()=>navigate(p.paso)},`Ir al paso ${p.paso+1}`));
    if(p.accion)botones.append(h('button',{type:'button',onclick:p.accion.fn},p.accion.etiqueta));
    if(botones.childElementCount)li.append(botones);}
   ol.append(li);
  }
  panel.append(ol);
  resaltar(actual&&estado.abierto?actual.resaltar||[]:[]);
  const completas=CARDIACO_FASES.filter(f=>pasos(f).every(p=>p.hecho));
  if(!actual&&completas.length<CARDIACO_FASES.length){
   const siguiente=CARDIACO_FASES.find(f=>!completas.includes(f));
   panel.append(h('div',{class:'tutorialCierre95'},h('p',{},`Fase ${CARDIACO_NOMBRE_FASE[estado.fase]} terminada.`),
    h('button',{type:'button',onclick:()=>{estado.fase=siguiente;guardar();if(typeof navigate==='function')navigate(0);render();}},`Pasar a la fase ${CARDIACO_NOMBRE_FASE[siguiente]}`),
    h('p',{class:'tutorialNota95'},'Al cargar el otro SPECT, el simulador descarta de la memoria las reconstrucciones de esta fase. No importa: ya las descargaste, y este panel recuerda que las exportaste.')));
  }
  if(completas.length===CARDIACO_FASES.length){
   const productos=h('ul',{});
   for(const f of CARDIACO_FASES){const hh=estado.hechos[f];productos.append(h('li',{},`Fase ${CARDIACO_NOMBRE_FASE[f]}: ${[hh.exportados.NoAC,hh.exportados.AC,hh.gated.archivo].filter(Boolean).join(', ')||'volúmenes exportados'}.`));}
   panel.append(h('div',{class:'tutorialCierre95'},h('h4',{},'Primera parte completa'),h('p',{},'Llevas al simulador cardíaco estos archivos:'),productos,
    h('a',{class:'tutorialEnlace95',href:`${CARDIACO_SIMULADOR}?caso=${estado.caso}`,target:'_blank',rel:'noopener'},'Segunda parte: abrir el simulador cardíaco con este caso ▶'),
    h('p',{class:'tutorialNota95'},'Allí reorientas a eje corto y ejes largos, armas la página de cortes, el mapa polar y el gatillado, y comparas con el informe.')));
   const preguntas=h('details',{class:'tutorialPreguntas95',open:''},h('summary',{},'Preguntas para la discusión · procesamiento'));
   const oq=h('ol',{});for(const q of CARDIACO_PREGUNTAS_PROCESO)oq.append(h('li',{},q));preguntas.append(oq,h('p',{class:'tutorialNota95'},'Las preguntas sobre la imagen del caso están en el simulador cardíaco, al terminar la segunda parte.'));
   panel.append(preguntas);
  }
 }
 function renderEleccion(){
  panel.append(h('div',{class:'tutorialCabecera95'},h('strong',{},'Tutorial cardíaco')),h('p',{},'SPECT/CT de perfusión miocárdica con sestamibi, estrés y reposo. Elige el caso que te asignaron: el panel te dice qué archivo cargar en cada paso y comprueba que sea el correcto.'));
  const lista=h('div',{class:'tutorialCasos95'});
  for(const [n,c] of Object.entries(CARDIACO_CASOS))lista.append(h('button',{type:'button',onclick:()=>{estado.caso=Number(n);estado.fase='estres';estado.hechos={estres:nuevaFase(),reposo:nuevaFase()};guardar();if(typeof navigate==='function')navigate(0);render();}},h('b',{},`Caso ${n}`),h('span',{},c.titulo)));
  panel.append(lista,h('p',{class:'tutorialNota95'},'Primera parte, aquí: control de calidad, FBP, registro con el CT, OSEM sin y con corrección de atenuación, gatillado; todo por fase. Segunda parte, en el simulador cardíaco: reorientación, cortes, mapa polar, función ventricular y cierre.'));
 }

 // --- Arranque ---------------------------------------------------------------------------
 recuperar();
 const url=new URLSearchParams(location.search).get('cardiaco');
 if(url&&CARDIACO_CASOS[Number(url)]){if(Number(url)!==estado.caso){estado.hechos={estres:nuevaFase(),reposo:nuevaFase()};estado.fase='estres';}estado.caso=Number(url);guardar();}
 let temporizador=null;const refrescar=()=>{clearTimeout(temporizador);temporizador=setTimeout(()=>{refrescarQc();refrescarGated();render();},60);};
 for(const ev of ['lab95state','lab95navigate'])document.addEventListener(ev,refrescar);
 document.addEventListener('change',refrescar,true);document.addEventListener('input',ev=>{if(ev.target.closest&&ev.target.closest('#parameters,#step3,#gated95'))refrescar();},true);
 window.Lab95Cardiaco={estado,vivo,pasos:f=>pasos(f||estado.fase).map(p=>({id:p.id,hecho:p.hecho,problema:p.problema||null})),abrir,reconstruirGatillado:()=>e('gatedRun95').click(),rangoAuto};
 if(url)abrir(true);else if(estado.caso&&!new URLSearchParams(location.search).get('caso'))abrir(true);
})();
