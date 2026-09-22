/* Tutorial de paratiroides, primera parte: reconstruir las dos fases de un caso y
   exportarlas para el visor. Lee el estado del simulador (Lab95Live, Lab95Osem) y no
   modifica el motor: solo guia, comprueba y rellena controles cuando el alumno lo pide.
   Los casos y sus datos esperados viven en paratiroides-casos.js, compartido con el visor. */
'use strict';
(()=>{
 const e=id=>document.getElementById(id),panel=e('tutorial95'),boton=e('tutorialParatiroides95');
 const CLAVE='paratiroides95';
 const estado={caso:null,fase:'precoz',hechos:{precoz:{},tardio:{}},abierto:false};
 const receta=PARATIROIDES_RECETA;

 function guardar(){try{sessionStorage.setItem(CLAVE,JSON.stringify({caso:estado.caso,fase:estado.fase,hechos:estado.hechos}));}catch(err){}}
 function recuperar(){try{const g=JSON.parse(sessionStorage.getItem(CLAVE)||'null');if(g&&PARATIROIDES_CASOS[g.caso]){estado.caso=g.caso;estado.fase=PARATIROIDES_FASES.includes(g.fase)?g.fase:'precoz';estado.hechos={precoz:{},tardio:{},...(g.hechos||{})};}}catch(err){}}
 function abrir(valor){estado.abierto=valor;panel.hidden=!valor;document.querySelector('.workspace').classList.toggle('conTutorial95',valor);boton.setAttribute('aria-pressed',valor);boton.textContent=valor?'Cerrar tutorial':'Tutorial paratiroides';if(!valor)resaltar([]);render();}
 boton.onclick=()=>abrir(!estado.abierto);

 // --- Lectura del estado del simulador ---------------------------------------------------
 function vivo(){return window.Lab95Live?Lab95Live.get():{};}
 function entradas(){return window.Lab95Osem?Lab95Osem.entradas():[];}
 const caso=()=>PARATIROIDES_CASOS[estado.caso];
 const faseDatos=f=>caso().fases[f];
 const otraFase=f=>f==='precoz'?'tardio':'precoz';
 function reconstruccionValida(r){const p=r.parameters||{};return r.kind==='OSEM'&&p.iterations===receta.iteraciones&&p.subsets===receta.subconjuntos&&!!p.attenuationCorrection===receta.ac&&!!p.postFilter&&Math.abs((p.postFilterFWHMmm||0)-receta.filtroMm)<0.05;}
 function nombreCoincide(nombre,f){return paratiroidesReconoceNombre(nombre,estado.caso,f);}

 // Cada paso devuelve si esta hecho y, si el alumno cargo algo equivocado, que fue.
 function pasos(f){
  const d=faseDatos(f),v=vivo(),s=v.spect,ct=v.ct,hechos=estado.hechos[f],nombreFase=PARATIROIDES_NOMBRE_FASE[f],nombre=paratiroidesNombre(estado.caso,f);
  if(d.nm.reconstruidaPorEquipo)return [{
   id:'equipo',titulo:`Fase ${nombreFase}: ya viene reconstruida por el equipo`,hecho:true,
   texto:'En este caso el tardío no tiene proyecciones: solo existe la reconstrucción del propio Symbia, con corrección de atenuación. El simulador no puede reconstruir lo que no tiene, así que esta fase no se procesa aquí. En la segunda parte, el visor la carga directo desde la carpeta «reconstruccion siemens tardio» y la compara con la OSEM que tú hiciste del precoz.'
  }];
  const spectHash=s?paratiroidesHash(s.frame):null,spectOk=spectHash===d.nm.marco,spectOtra=spectHash===faseDatos(otraFase(f)).nm.marco;
  const ctHash=ct?paratiroidesHash(ct.marco):null,ctOk=spectOk&&ctHash===d.ct.marco;
  const todas=entradas(),recon=todas.filter(reconstruccionValida),exportada=recon.find(r=>r.exportado&&nombreCoincide(r.exportado.nombre,f));
  if(exportada&&spectOk){hechos.exportado=true;hechos.archivo=exportada.exportado.archivo;guardar();}
  // Lo que el motor le dijo al alumno al elegir el CT, para traducirlo a este caso.
  const ctInfo=e('ctInfo').textContent,ctSeries=e('ctSeries'),ctSinElegir=!ctSeries.disabled&&ctSeries.value===''&&ctSeries.options.length>1;
  let problemaCt=null;
  if(spectOk&&/marcos espaciales distintos/.test(ctInfo))problemaCt=`El simulador rechazó ese CT: es el de la fase ${PARATIROIDES_NOMBRE_FASE[otraFase(f)]}. El SPECT ${nombreFase} solo comparte marco de referencia con el CT ${nombreFase}; carga la otra carpeta.`;
  else if(spectOk&&ctSinElegir)problemaCt='Los archivos ya se leyeron. Falta elegir la serie en la lista «Serie TC encontrada».';
  else if(spectOk&&ct&&!ctOk)problemaCt='El CT cargado no corresponde a esta fase.';
  else if(!s&&(!ctSeries.disabled||/cortes cargados/.test(ctInfo)))problemaCt='Ya hay un CT leído. Está bien: al cargar el SPECT se emparejan solos; si el marco no coincide, el simulador te lo dirá.';
  const notaCt=ctOk&&ct.cortes!==d.ct.cortes?` Se cargaron ${ct.cortes} cortes y la serie tiene ${d.ct.cortes}: revisa que la carpeta esté completa.`:'';
  // Con el mapa preparado se puede decir cuanto quedo desalineado: la alineacion real es
  // cero, porque el ejercicio inyecto el desfase sobre coordenadas ya compartidas.
  const residuo=v.mu&&spectOk?[Math.abs(+e('rx95').value||0),Math.abs(+e('ry95').value||0)]:null;
  const textoRegistro=(caso().registro?caso().registro+' ':'')+'El ejercicio desplaza el CT algunos centímetros en X e Y. Muévelo con los botones + y − (mantén pulsado para ir rápido) hasta que el contorno del cuello coincida con la emisión en los tres planos, y después «Confirmar registro y preparar mapa μ» o «Siguiente». Con el mapa preparado, la OSEM de referencia 1×1 parte sola.';
  const detalleRegistro=residuo?(Math.max(...residuo)<=3?`Registro confirmado con un residuo de ${residuo[0]} mm en X y ${residuo[1]} mm en Y: muy bien, dentro de un vóxel.`:Math.max(...residuo)<=8?`Registro confirmado con un residuo de ${residuo[0]} mm en X y ${residuo[1]} mm en Y, del orden de dos vóxeles. Aceptable para la AC; si quieres afinar, ajusta y confirma de nuevo.`:`Registro confirmado con un residuo de ${residuo[0]} mm en X y ${residuo[1]} mm en Y. Es bastante: el mapa μ quedará corrido respecto de la emisión. Ajusta con + y − y vuelve a confirmar; el mapa se recalcula.`):null;
  const esperandoBase=!!v.mu&&spectOk&&!todas.some(r=>r.kind==='OSEM');
  // Exportaciones que no sirven: la 1x1 de referencia, o la buena pero sin nombre.
  // Se juzga la exportacion mas reciente: es la que el alumno acaba de hacer.
  const exportadaMal=!exportada?todas.filter(r=>r.exportado&&!(reconstruccionValida(r)&&nombreCoincide(r.exportado.nombre,f))).sort((a,b)=>String(b.exportado.cuando).localeCompare(String(a.exportado.cuando)))[0]:null;
  const problemaExportar=exportadaMal?(!reconstruccionValida(exportadaMal)?`Exportaste «${exportadaMal.label}», que no es la receta del curso. Exporta la OSEM ${receta.iteraciones}×${receta.subconjuntos} con AC.`:`Exportaste la reconstrucción correcta pero ${exportadaMal.exportado.nombre?`con el nombre «${exportadaMal.exportado.nombre}»`:'sin nombre'}. Vuelve a exportar con «${nombre}»: el visor lo lee del propio archivo.`):null;
  const lista=[
   {id:'spect',titulo:`Cargar las proyecciones SPECT ${nombreFase}`,hecho:spectOk,resaltar:['spectFile'],paso:0,
    texto:`En el paso 1, «Seleccionar archivo DICOM» del bloque SPECT. En la carpeta «paratiroides ${estado.caso}» es el ${d.carpetaNm}: un solo archivo, sin extensión, con ${d.nm.frames} imágenes (${d.nm.vistas} vistas por cabezal cada ${d.nm.pasoGrados}°, dos cabezales y dos ventanas de energía).`,
    problema:s&&!spectOk?(spectOtra?`Cargaste el SPECT de la fase ${PARATIROIDES_NOMBRE_FASE[otraFase(f)]}. Este paso pide el ${nombreFase}: cada fase tiene su propio marco de referencia y su propio CT.`:`Ese SPECT no pertenece al caso ${estado.caso}. Revisa que abriste la carpeta correcta.`):(!s&&problemaCt?problemaCt:null)},
   {id:'ct',titulo:`Cargar el CT ${nombreFase} y elegir su serie`,hecho:ctOk,resaltar:['ctFolder','ctSeries'],paso:0,
    texto:`«O seleccionar carpeta» del bloque TC, con la carpeta «${d.carpetaCt}»: ${d.ct.cortes} cortes de ${d.ct.espesorMm} mm cada ${d.ct.dzMm} mm, píxel de ${d.ct.pixelMm} mm, kernel ${d.ct.kernel}. Después elige la serie en la lista.${notaCt}`,
    problema:spectOk?problemaCt:null},
   {id:'fbp',titulo:'Generar la FBP',hecho:!!v.fbp&&spectOk,resaltar:['fbp95'],paso:1,
    texto:'En el paso 2, «Generar FBP» con la ventana de fotopico (99m Technetium) y el filtro rampa. Es la reconstrucción preliminar que sirve para revisar el registro; no lleva corrección de atenuación.'},
   {id:'registro',titulo:'Revisar el registro y preparar el mapa μ',hecho:!!v.mu&&spectOk,resaltar:['confirm95'],paso:1,texto:textoRegistro,detalle:detalleRegistro},
   {id:'osem',titulo:`Reconstruir con la receta del curso: OSEM ${receta.iteraciones}×${receta.subconjuntos}, AC, gaussiano ${receta.filtroMm} mm`,hecho:recon.length>0&&spectOk,resaltar:['runOsem95'],paso:2,
    texto:(esperandoBase?'Primero corre sola la OSEM de referencia 1×1, sin correcciones: espera a que termine. ':'')+`En el paso 3, marca «Corrección de atenuación», deja «Suavizado final gaussiano» en ${receta.filtroMm} mm, ${receta.iteraciones} iteraciones y ${receta.subconjuntos} subconjuntos, y pulsa «Nueva reconstrucción». La misma receta en las dos fases y en los cinco casos, para que las diferencias que veas sean del paciente y no del procesamiento. Cuando termine, compárala con la 1×1 en los dos paneles: ${d.guia}`,
    accion:{etiqueta:'Aplicar la receta',fn:aplicarReceta}},
   {id:'exportar',titulo:`Exportar como «${nombre}»`,hecho:!!hechos.exportado,resaltar:['exportDicom95','exportName95'],paso:3,
    texto:`En el paso 4, elige la OSEM ${receta.iteraciones}×${receta.subconjuntos} con AC (no la 1×1 de referencia), escribe «${nombre}» en Nombre y descarga. Ese nombre queda dentro del DICOM, en la descripción de la serie: es lo que le permite al visor reconocer qué fase de qué caso le estás dando.`,
    problema:problemaExportar,accion:{etiqueta:'Poner el nombre y abrir el paso 4',fn:()=>prepararExportacion(f)}}
  ];
  // Una fase terminada queda terminada: al cargar el SPECT de la otra fase, el simulador
  // descarta esta de la memoria y las comprobaciones en vivo dejarian de cumplirse.
  if(lista.every(p=>p.hecho)){hechos.completa=true;guardar();}
  else if(hechos.completa&&!spectOk)for(const p of lista)p.hecho=true;
  return lista;
 }
 function aplicarReceta(){
  e('ac').checked=receta.ac;e('filter').checked=true;e('fwhm').value=receta.filtroMm;e('iterations').value=receta.iteraciones;e('subsets').value=String(receta.subconjuntos);
  e('parameters').dispatchEvent(new Event('change',{bubbles:true}));
  if(typeof navigate==='function')navigate(2);
  status(`Receta aplicada: OSEM ${receta.iteraciones}×${receta.subconjuntos}, AC, gaussiano ${receta.filtroMm} mm. Pulsa «Nueva reconstrucción».`);
 }
 function prepararExportacion(f){
  const nombre=paratiroidesNombre(estado.caso,f),select=e('exportSeries95');
  e('exportName95').value=nombre;
  const objetivo=entradas().filter(reconstruccionValida).at(-1);
  if(objetivo&&[...select.options].some(o=>o.value===objetivo.id))select.value=objetivo.id;
  if(typeof navigate==='function')navigate(3);
  status(`Nombre «${nombre}» listo. Revisa que la reconstrucción elegida sea la ${receta.iteraciones}×${receta.subconjuntos} con AC y descarga.`);
 }

 // --- Resaltado del control que toca usar ------------------------------------------------
 let resaltados=[];
 function resaltar(ids){
  for(const el of resaltados)el.classList.remove('tutorialResaltado95');
  resaltados=[];
  for(const id of ids){const control=e(id);if(!control)continue;const objetivo=control.type==='file'?control.closest('label')||control:control;if(objetivo.closest('[hidden]'))continue;objetivo.classList.add('tutorialResaltado95');resaltados.push(objetivo);}
 }

 // --- Render -----------------------------------------------------------------------------
 const h=(tag,attrs={},...hijos)=>{const el=document.createElement(tag);for(const [k,v] of Object.entries(attrs)){if(k==='onclick')el.onclick=v;else if(k==='html')el.innerHTML=v;else if(v!==null&&v!==undefined)el.setAttribute(k,v);}for(const hijo of hijos)if(hijo!=null)el.append(hijo);return el;};
 function render(){
  if(!estado.abierto)return;
  panel.replaceChildren();
  if(!estado.caso){renderEleccion();return;}
  const c=caso();
  panel.append(h('div',{class:'tutorialCabecera95'},h('strong',{},`Paratiroides · caso ${estado.caso}`),h('button',{type:'button',class:'tutorialMini95',onclick:()=>{estado.caso=null;estado.hechos={precoz:{},tardio:{}};estado.fase='precoz';guardar();resaltar([]);render();}},'Cambiar caso')));
  panel.append(h('p',{class:'tutorialTitulo95'},c.titulo),h('p',{class:'tutorialResumen95'},c.resumen));
  const clinica=h('details',{},h('summary',{},'Contexto clínico (desidentificado)'));
  for(const [k,titulo] of [['antecedentes','Antecedentes'],['procedimiento','Procedimiento'],['hallazgos','Hallazgos: qué buscar en la imagen']])clinica.append(h('h4',{},titulo),h('p',{},c.clinica[k]));
  clinica.append(h('p',{class:'tutorialNota95'},'La impresión diagnóstica se revela al terminar la segunda parte, en el visor.'));
  panel.append(clinica);
  const part=h('details',{open:''},h('summary',{},'Particularidades de este caso'));const ul=h('ul',{});for(const p of c.particularidades)ul.append(h('li',{},p));part.append(ul);panel.append(part);
  panel.append(h('p',{class:'tutorialNota95'},'Trampa común a los cinco casos: el SPECT precoz solo comparte marco de referencia con el CT precoz, y el tardío con el tardío. Si cruzas las fases, ni este simulador ni el visor los combinan.'));

  // Pestanas de fase con su estado.
  const pest=h('div',{class:'tutorialFases95'});
  for(const f of PARATIROIDES_FASES){const completa=pasos(f).every(p=>p.hecho);pest.append(h('button',{type:'button','aria-pressed':String(estado.fase===f),onclick:()=>{estado.fase=f;guardar();render();}},`${completa?'☑':'☐'} Fase ${PARATIROIDES_NOMBRE_FASE[f]}`));}
  panel.append(pest);

  const lista=pasos(estado.fase),actual=lista.find(p=>!p.hecho);
  const ol=h('ol',{class:'tutorialPasos95'});
  for(const p of lista){
   const li=h('li',{class:p.hecho?'hecho':p===actual?'actual':''},h('span',{class:'marca'},p.hecho?'☑':'☐'),' ',h('span',{},p.titulo));
   if(p===actual||(p.hecho&&p.id==='equipo'))li.append(h('p',{},p.texto));
   // Un tropiezo se senala donde ocurrio, aunque el alumno vaya saltando pasos.
   if(!p.hecho&&p.problema)li.append(h('p',{class:'tutorialProblema95'},p.problema));
   if(p.hecho&&p.detalle)li.append(h('p',{class:'tutorialDetalle95'},p.detalle));
   if(p===actual){
    const botones=h('div',{class:'tutorialBotones95'});
    if(p.paso!==undefined&&typeof navigate==='function'&&typeof step!=='undefined'&&step!==p.paso)botones.append(h('button',{type:'button',onclick:()=>navigate(p.paso)},`Ir al paso ${p.paso+1}`));
    if(p.accion)botones.append(h('button',{type:'button',onclick:p.accion.fn},p.accion.etiqueta));
    if(botones.childElementCount)li.append(botones);}
   ol.append(li);
  }
  panel.append(ol);
  resaltar(actual&&estado.abierto?actual.resaltar||[]:[]);

  const completas=PARATIROIDES_FASES.filter(f=>pasos(f).every(p=>p.hecho));
  if(!actual&&completas.length<PARATIROIDES_FASES.length){
   const siguiente=PARATIROIDES_FASES.find(f=>!completas.includes(f));
   panel.append(h('div',{class:'tutorialCierre95'},h('p',{},`Fase ${PARATIROIDES_NOMBRE_FASE[estado.fase]} terminada${estado.hechos[estado.fase].archivo?`: ${estado.hechos[estado.fase].archivo}`:''}.`),
    h('button',{type:'button',onclick:()=>{estado.fase=siguiente;guardar();if(typeof navigate==='function')navigate(0);render();}},`Pasar a la fase ${PARATIROIDES_NOMBRE_FASE[siguiente]}`),
    h('p',{class:'tutorialNota95'},'Al cargar el otro SPECT, el simulador descarta la reconstrucción anterior de la memoria. No importa: ya la descargaste, y este panel recuerda que la exportaste.')));
  }
  if(completas.length===PARATIROIDES_FASES.length){
   const productos=h('ul',{});
   for(const f of PARATIROIDES_FASES){const d=faseDatos(f);productos.append(h('li',{},d.nm.reconstruidaPorEquipo?`Fase ${PARATIROIDES_NOMBRE_FASE[f]}: reconstrucción del equipo, ya en la carpeta del caso.`:`Fase ${PARATIROIDES_NOMBRE_FASE[f]}: ${estado.hechos[f].archivo||'DICOM exportado'}.`));}
   panel.append(h('div',{class:'tutorialCierre95'},h('h4',{},'Primera parte completa'),h('p',{},'Llevas al visor estos archivos, más los dos CT del caso:'),productos,
    h('a',{class:'tutorialEnlace95',href:`${PARATIROIDES_VISOR}?caso=${estado.caso}`,target:'_blank',rel:'noopener'},'Segunda parte: abrir el visor con este caso ▶'),
    h('p',{class:'tutorialNota95'},'El visor pregunta lo mismo que este panel y sigue guiando: fusión de cada fase con su CT, cortes axiales fusionados de 3 mm y captura del MIP.')));
  }
 }
 function renderEleccion(){
  panel.append(h('div',{class:'tutorialCabecera95'},h('strong',{},'Tutorial de paratiroides')),h('p',{},'Cinco casos reales de SPECT/CT con sestamibi, en dos fases. Elige el que te asignaron: el panel te va a decir qué archivo cargar en cada paso y va a comprobar que sea el correcto.'));
  const lista=h('div',{class:'tutorialCasos95'});
  for(const [n,c] of Object.entries(PARATIROIDES_CASOS))lista.append(h('button',{type:'button',onclick:()=>{estado.caso=Number(n);estado.fase='precoz';estado.hechos={precoz:{},tardio:{}};guardar();if(typeof navigate==='function')navigate(0);render();}},h('b',{},`Caso ${n}`),h('span',{},c.titulo)));
  panel.append(lista,h('p',{class:'tutorialNota95'},'Primera parte, aquí: reconstruir precoz y tardío con corrección de atenuación y exportarlos. Segunda parte, en el visor: fusionar cada uno con su CT y generar los cortes.'));
 }

 // --- Arranque ---------------------------------------------------------------------------
 recuperar();
 const url=new URLSearchParams(location.search).get('caso');
 if(url&&PARATIROIDES_CASOS[Number(url)]){if(Number(url)!==estado.caso){estado.hechos={precoz:{},tardio:{}};estado.fase='precoz';}estado.caso=Number(url);guardar();}
 let temporizador=null;const refrescar=()=>{clearTimeout(temporizador);temporizador=setTimeout(render,60);};
 for(const ev of ['lab95state','lab95navigate'])document.addEventListener(ev,refrescar);
 document.addEventListener('change',refrescar,true);document.addEventListener('input',ev=>{if(ev.target.closest&&ev.target.closest('#parameters,#step3'))refrescar();},true);
 if(url||estado.caso)abrir(true);
})();
