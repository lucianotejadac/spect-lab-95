'use strict';
(()=>{
 const result=document.getElementById('osemResult95'),table=result.querySelector('.historytable95'),save=document.getElementById('saveHistory95');
 const heading=save.previousElementSibling;const dialog=document.createElement('dialog');dialog.id='historyDialog95';dialog.innerHTML='<header class="titlebar">Historial y duración de los subprocesos</header><div class="historyContents95"></div><footer><button type="button">Cerrar</button></footer>';
 dialog.querySelector('.historyContents95').append(save,table);heading.remove();document.body.append(dialog);
 const button=document.createElement('button');button.type='button';button.textContent='Ver historial y tiempos…';button.onclick=()=>dialog.showModal();result.append(button);dialog.querySelector('footer button').onclick=()=>dialog.close();
 const notes=document.createElement('details');notes.className='compactNotes95';notes.innerHTML='<summary>Información de esta etapa</summary>';const stage=document.getElementById('step2');stage.querySelector('h1').after(notes);for(const p of stage.querySelectorAll(':scope > p:not([id])'))notes.append(p);
 for(const p of document.querySelectorAll('aside .notice,#osemResult95 > p')){const details=document.createElement('details');details.className='compactNotes95';const summary=document.createElement('summary');summary.textContent=p.closest('aside')?'Notas del modelo':p.parentElement===result?'Cómo comparar las imágenes':'Información de esta etapa';p.before(details);details.append(summary,p);}
 for(const id of ['historyTopInfo95','historyBottomInfo95']){const p=document.getElementById(id);new MutationObserver(()=>p.title=p.textContent).observe(p,{childList:true,characterData:true,subtree:true});}
 let frame;
 function fit(){cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{if(innerWidth<900||result.hidden)return;const article=result.closest('article');result.style.setProperty('--mpr-height95','64px');const room=article.getBoundingClientRect().bottom-article.querySelector(".actions").getBoundingClientRect().bottom-4;result.style.setProperty('--mpr-height95',Math.max(100,Math.min(700,64+room-6))+'px');});}
 new ResizeObserver(fit).observe(result.closest('article'));
 new MutationObserver(fit).observe(result,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['hidden']});
 document.addEventListener('toggle',fit,true);document.addEventListener('lab95navigate',fit);window.addEventListener('resize',fit);
})();
