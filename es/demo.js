(() => {
  'use strict';
  const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const labels = {characters: "Caracteres", keys: "Radicales", discover: "Descubre", context: "Contexto", recall: "Recordar"};
  const norm = value => value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  const asset = name => (['characters.json','keys.json'].includes(name) ? '/es/assets/demo/' : '/assets/demo/') + name;
  let dataPromise;
  let activeAudio;
  const cleanups = new Set();
  function data() {
    if (!dataPromise) dataPromise = Promise.all(['characters','keys','strokes'].map(async name => {
      const response = await fetch(asset(name + '.json'));
      if (!response.ok) throw new Error("Vista previa no disponible");
      return response.json();
    })).then(([dict, keys, strokes]) => ({characters:dict.characters, keys, strokes:strokes.characters})).catch(error => {dataPromise = null; throw error;});
    return dataPromise;
  }
  function stopAudio() { if (activeAudio) { activeAudio.pause(); activeAudio = null; } }
  function sound(file, button, status) {
    stopAudio();
    const player = new Audio(asset(file)); activeAudio = player;
    const label = button.textContent;
    button.textContent = "Reproduciendo…"; button.disabled = true;
    const reset = () => {button.textContent = label; button.disabled = false;};
    player.addEventListener('ended', reset, {once:true});
    player.addEventListener('pause', reset, {once:true});
    player.play().catch(() => {reset(); status.textContent = "No se ha podido reproducir el audio. Intenta volver a escuchar.";});
  }
  function frame(root, title) {
    root.classList.add('demo-screen');
    root.innerHTML = `<div class="demo-status"><span>Chinese 101</span><span>DEMOSTRACIÓN WEB</span></div><div class="demo-app-title">${esc(title)}</div><div class="demo-body"></div>`;
    return root.querySelector('.demo-body');
  }
  function makeStroke(root, paths, han) {
    let step = 0, timer = null;
    root.innerHTML = `<div class="stroke-stage" role="img" aria-label="Orden de trazos para ${esc(han)}"><svg viewbox="0 0 1024 1024" aria-hidden="true"><path class="writing-grid" d="M512 0V1024 M0 512H1024 M0 0L1024 1024 M1024 0L0 1024"/><g transform="translate(0,900) scale(1,-1)">${paths.map(d=>`<path d="${esc(d)}"/>`).join('')}</g></svg></div><p class="stroke-count" aria-live="polite"></p><div class="stroke-controls"><button type="button" data-stroke="prev" aria-label="Trazado anterior">←</button><button type="button" data-stroke="play">Reproducir trazos</button><button type="button" data-stroke="next" aria-label="Siguiente trazo">→</button></div><small class="stroke-credit">Gráficos de trazos © Arphic. <a href="/licenses/ARPHIC-LICENSE.txt" target="_blank" rel="noopener">Licencia &amp; Sin garantía</a></small>`;
    const update=()=>{
      root.querySelectorAll('g path').forEach((path,i)=>path.setAttribute('fill',i<step?'#a33515':'#d8d2c8'));
      root.querySelector('.stroke-count').textContent=`${step} de ${paths.length} trazos`;
      root.querySelector('[data-stroke=prev]').disabled=step===0;
      root.querySelector('[data-stroke=next]').disabled=step===paths.length;
      root.querySelector('[data-stroke=play]').textContent=timer?"Pausa":step===paths.length?"Repetir":"Reproducir trazos";
    };
    const stop=()=>{clearInterval(timer);timer=null;update();};
    const click=event=>{
      const action=event.target.closest('[data-stroke]')?.dataset.stroke;
      if(!action)return;
      if(action==='play') {
        if(timer){stop();return;}
        if(step===paths.length)step=0;
        step++;timer=setInterval(()=>{step++;if(step>=paths.length)stop();update();},650);
        if(step===paths.length)stop();
      } else {stop();step=Math.max(0,Math.min(paths.length,step+(action==='next'?1:-1)));}
      update();
    };
    root.addEventListener('click',click);update();
    const cleanup=()=>{clearInterval(timer);timer=null;root.removeEventListener('click',click);cleanups.delete(cleanup);};
    cleanups.add(cleanup);return cleanup;
  }
  function makeLibrary(root, content) {
    const body=frame(root,"Trazo a trazo");
    let mode='characters',page=0,query='',selection=null,strokeCleanup=()=>{};
    const searchable=Object.fromEntries(['characters','keys'].map(key=>[key,content[key].map(c=>({...c,search:norm([c.han,c.py,c.en,...(c.readings||[])].join(' '))}))]));
    function results(){
      const matches=searchable[mode].filter(c=>c.search.includes(norm(query)));
      const total=Math.max(1,Math.ceil(matches.length/9));page=Math.min(page,total-1);
      const list=body.querySelector('.demo-char-grid');
      list.innerHTML=matches.slice(page*9,page*9+9).map(c=>`<button type="button" data-han="${esc(c.han)}" aria-label="${esc(c.han+' '+c.py+' '+c.en)}"><span lang="zh">${esc(c.han)}</span><small>${esc(c.py)}</small></button>`).join('')||"<p class=\"demo-empty\">No se encontraron caracteres. Prueba con «lluvia», «yu» o «雨».</p>";
      body.querySelector('.demo-result-count').textContent=`${matches.length.toLocaleString()} ${labels[mode]}`;
      body.querySelector('.demo-page-count').textContent=`Página ${page+1} / ${total}`;
      body.querySelector('[data-library=prev]').disabled=page===0;
      body.querySelector('[data-library=next]').disabled=page===total-1;
    }
    function library(focus) {
      selection=null;strokeCleanup();
      body.innerHTML=`<label class="sr-only" for="${root.id}-search">Busca caracteres chinos por carácter, pinyin o significado</label><div class="demo-search"><input id="${root.id}-search" type="search" placeholder="Carácter, pinyin o significado" value="${esc(query)}" autocomplete="off" spellcheck="false"><button type="button" data-library="clear" aria-label="Borrar búsqueda de caracteres">×</button></div><div class="demo-segments" aria-label="Vista de biblioteca"><button type="button" data-library="characters" aria-pressed="${mode==='characters'}">Caracteres · 3.500</button><button type="button" data-library="keys" aria-pressed="${mode==='keys'}">Radicales · 101</button></div><p class="demo-result-count" role="status"></p><div class="demo-pager"><button type="button" data-library="prev" aria-label="Página anterior de caracteres">‹</button><span class="demo-page-count"></span><button type="button" data-library="next" aria-label="Página del siguiente carácter">›</button></div><div class="demo-char-grid"></div><p class="demo-local-note">Toca un carácter para explorarlo.</p>`;
      body.querySelector('input').addEventListener('input',event=>{query=event.target.value;page=0;results();});results();
      if(focus)body.querySelector(`[data-library="${mode}"]`).focus();
    }
    function detail(han){
      selection=searchable[mode].find(c=>c.han===han);if(!selection)return;
      const c=selection;
      body.innerHTML=`<button type="button" class="demo-back" data-library="back">← Volver a ${labels[mode]}</button><h3 class="demo-han" lang="zh" tabindex="-1">${esc(c.han)}</h3><p class="demo-pinyin">${esc(c.py)}</p><p class="demo-definition">${esc(c.en)}</p>${c.strokes?`<p class="demo-local-note">${c.strokes} trazos</p>`:''}<div class="demo-stroke"></div><p class="demo-local-note">${content.strokes[c.han]?"Utiliza las flechas o reproduce la secuencia de trazos.":"Esta demostración web incluye guías de trazos para determinados caracteres."}</p>`;
      if(content.strokes[c.han])strokeCleanup=makeStroke(body.querySelector('.demo-stroke'),content.strokes[c.han].strokes,c.han);
      body.querySelector('h3').focus();body.scrollTop=0;
    }
    const click=event=>{
      const tile=event.target.closest('[data-han]');if(tile){detail(tile.dataset.han);return;}
      const action=event.target.closest('[data-library]')?.dataset.library;
      if(!action)return;
      if(action==='back'){library(true);return;}
      if(action==='clear'){query='';page=0;body.querySelector('input').value='';results();body.querySelector('input').focus();return;}
      if(action==='prev'||action==='next'){page+=action==='next'?1:-1;results();return;}
      mode=action;page=0;library(true);
    };
    body.addEventListener('click',click);library();
    return()=>{strokeCleanup();body.removeEventListener('click',click);};
  }
  function makePractice(root, start='context', memory=false){
    const body=frame(root,"Práctica diaria");let step=start,revealed=false,complete=false;
    function render(focus=false){
      stopAudio();
      if(complete){body.innerHTML="<div class=\"demo-complete\"><span lang=\"zh\">雨</span><h3>Un poco más familiar.</h3><p>Has completado este carácter de ejemplo.</p><p class=\"demo-local-note\">Esta demo no guarda ni sincroniza el progreso de la aplicación.</p><button type=\"button\" class=\"demo-primary\" data-practice=\"restart\">Inténtalo de nuevo</button></div>";return;}
      body.innerHTML=`<p class="demo-local-note">Un carácter de ejemplo · Lluvia</p><div class="demo-segments practice-tabs">${['discover','context','recall'].map((name,i)=>`<button type="button" data-practice="${name}" aria-pressed="${step===name}">${i+1} ${labels[name]}</button>`).join('')}</div><div class="practice-content"></div><p class="demo-audio-status" role="status"></p>`;
      const screen=body.querySelector('.practice-content');
      if(step==='discover')screen.innerHTML=`<div class="practice-glyph" lang="zh">雨</div><p class="demo-pinyin">yǔ</p><h3>lluvia</h3><details class="demo-memory" c101var0x><summary>Imagen para recordar</summary><img src="${asset('memory-rain.png')}" alt="Una nube de tinta con cuatro gotas de lluvia cayendo, una ilustración mnemotécnica para la lluvia" loading="lazy"><p>Una nube y unas gotas que caen. Una asociación visual para 雨.</p></details><button type="button" class="demo-primary" data-practice="context">Ver un ejemplo →</button>`;
      if(step==='context')screen.innerHTML="<p class=\"demo-context-label\">Verlo en una frase</p><div class=\"demo-phrase\"><span lang=\"zh\">下雨</span><p class=\"demo-pinyin\">xià yǔ</p><p>llover</p></div><button type=\"button\" class=\"demo-listen\" data-practice=\"listen\">▶ Escuchar</button><p class=\"demo-local-note\">Escucha y luego repítelo en voz alta.</p><button type=\"button\" class=\"demo-primary\" data-practice=\"recall\">Intenta recordar →</button>";
      if(step==='recall')screen.innerHTML=`<p class="demo-context-label">¿Qué significa este carácter?</p><div class="practice-glyph" lang="zh">雨</div>${revealed?"<p class=\"demo-pinyin\">yǔ</p><h3>lluvia</h3><p class=\"demo-local-note\">La memorización se evalúa de forma autónoma. No hay puntuación del habla.</p><button type=\"button\" class=\"demo-primary\" data-practice=\"done\">Me acordé de</button><button type=\"button\" class=\"demo-secondary\" data-practice=\"discover\">Muéstrame de nuevo</button>":"<button type=\"button\" class=\"demo-primary\" data-practice=\"reveal\">Mostrar significado</button>"}`;
      if(focus)body.querySelector(`[data-practice="${step}"]`).focus();
    }
    const click=event=>{
      const button=event.target.closest('[data-practice]');if(!button)return;
      const action=button.dataset.practice;
      if(action==='listen'){sound('xiayu.m4a',button,body.querySelector('.demo-audio-status'));return;}
      if(action==='done'){complete=true;render();body.querySelector('button').focus();return;}
      if(action==='restart'){complete=false;step='discover';revealed=false;}
      else if(action==='reveal')revealed=true;
      else {step=action;revealed=false;}
      render(true);
    };
    body.addEventListener('click',click);render();return()=>{stopAudio();body.removeEventListener('click',click);};
  }
  const features={
    strokes:{title:"Sigue los trazos",description:"Observa cómo va tomando forma « 雨 », trazo a trazo. Esta guía en directo utiliza las mismas trayectorias de trazos que la aplicación.",steps:["Pulsa «Reproducir trazos» para seguir la secuencia.","Pausa, o avanza y retrocede con las flechas.","En la aplicación, abre la guía de trazos de un carácter para estudiar el orden de trazos disponible."],caption:"Guía web interactiva · Datos de trazos de la aplicación"},
    context:{title:"Aprende en contexto",description:"Pasa de la forma de un carácter a una frase que puedas entender.",steps:["Empieza por «Descubrir» para conocer el carácter « 雨 » (lluvia).","Cambia a «Contexto» para ver « 下雨 » (llover).","Abre «Recall» y descubre el significado cuando estés listo."],caption:"Versión interactiva para navegador del flujo de aprendizaje de la aplicación",native:'/assets/context.png'},
    audio:{title:"Escucha ejemplos seleccionados",description:"Prueba una grabación real en Chinese 101. El audio solo se reproduce al pulsar «Escuchar».",steps:["Pulsa «Escuchar» para oír « 下雨 ».","Repite la frase a tu propio ritmo.","Prueba la función «Recall» cuando estés listo. La aplicación no puntúa tu pronunciación."],caption:"Audio original de la aplicación · Algunos ejemplos incluyen grabaciones",native:'/assets/context.png'},
    memory:{title:"Haz que sea fácil de recordar",description:"Relaciona el carácter « 雨 » con una nube y las gotas de lluvia que caen de ella. Esta es una de las ilustraciones mnemotécnicas que se utilizan en la aplicación.",steps:["Expandir o contraer la imagen de memoria.","Fíjate en la nube y en las cuatro gotas de lluvia.","Pasa a una frase y, a continuación, intenta recordar el carácter."],caption:"Ilustración original de la aplicación · Disponible para determinados caracteres",native:'/assets/demo/discover.png'},
    progress:{title:"No pierdas el hilo",description:"La aplicación para Android lleva un registro de tus días de estudio, las prácticas completadas y la autoevaluación de lo aprendido.",steps:["Accede a tu progreso desde la aplicación.","Repasa tus últimas sesiones de aprendizaje y los caracteres que has practicado.","El progreso se guarda en ese dispositivo. La demostración de este sitio web no se sincroniza con la aplicación."],caption:"Captura de pantalla real del desarrollo en Android · Ejemplo de progreso"},
    comfort:{title:"Elige lo que te resulte más cómodo",description:"Echa un vistazo a la biblioteca de caracteres en los temas claro y oscuro de la aplicación.",steps:["Cambia entre las dos capturas reales de Android.","Los caracteres y el pinyin siguen siendo el centro de atención.","La captura en modo oscuro también muestra la configuración de texto más grande del sistema de Android."],caption:"Capturas de pantalla reales del desarrollo para Android · El modo oscuro utiliza un texto del sistema más grande"}
  };
  const dialog=document.getElementById('feature-dialog');let opener=null,destroy=()=>{},serial=0;
  async function openFeature(key,button){
    const info=features[key];if(!info)return;
    opener=button;destroy();stopAudio();const request=++serial;
    document.getElementById('feature-dialog-title').textContent=info.title;
    document.getElementById('feature-dialog-description').textContent=info.description;
    document.getElementById('feature-dialog-steps').innerHTML=info.steps.map(s=>`<li>${esc(s)}</li>`).join('');
    document.getElementById('feature-dialog-caption').textContent=info.caption;
    const preview=document.getElementById('feature-dialog-preview');preview.innerHTML="<p class=\"demo-loading\">Cargando vista previa…</p>";
    dialog.showModal();document.documentElement.classList.add('feature-modal-open');
    try{
      if(key==='progress'){preview.innerHTML="<img class=\"native-capture\" src=\"/assets/demo/progress.png\" alt=\"Chinese 101 Pantalla de progreso de Android que muestra la racha de aprendizaje, el historial semanal y los caracteres practicados\">";}
      else if(key==='comfort'){
        preview.innerHTML="<div class=\"theme-preview-controls\"><button type=\"button\" data-theme-preview=\"light\" aria-pressed=\"true\">Claro</button><button type=\"button\" data-theme-preview=\"dark\" aria-pressed=\"false\">Tema oscuro · texto más grande</button></div><img class=\"native-capture\" src=\"/assets/characters.png\" alt=\"Chinese 101 Biblioteca de caracteres de Android en modo claro\">";
        preview.querySelectorAll('[data-theme-preview]').forEach(control=>control.addEventListener('click',()=>{const dark=control.dataset.themePreview==='dark';preview.querySelector('img').src=dark?asset('characters-dark.png'):'/assets/characters.png';preview.querySelector('img').alt=`Chinese 101 Biblioteca de caracteres de Android en ${dark?"Modo oscuro con texto más grande":"modo claro"}`;preview.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b===control)));}));
      } else {
        const content=await data();if(request!==serial||!dialog.open)return;
        preview.innerHTML="<div class=\"phone interactive-phone modal-phone\" id=\"feature-app-demo\"></div>";
        const screen=preview.querySelector('.interactive-phone');
        if(key==='strokes'){const body=frame(screen,"Orden de los trazos · 雨");destroy=makeStroke(body,content.strokes['雨'].strokes,'雨');}
        else destroy=makePractice(screen,key==='memory'?'discover':'context',key==='memory');
      }
      if(info.native){const details=document.createElement('details');details.className='native-comparison';details.innerHTML=`<summary>Ver la captura de pantalla de Android</summary><img class="native-capture" src="${info.native}" alt="Captura de pantalla original del desarrollo para Android de « Chinese 101 »" loading="lazy">`;preview.appendChild(details);}
      document.dispatchEvent(new CustomEvent('chinese101:demo',{detail:{feature:key}}));
    }catch(_){if(request===serial)preview.innerHTML="<p class=\"demo-loading\">No se ha podido cargar la vista previa. Cierra esta ventana e inténtalo de nuevo.</p>";}
  }
  document.querySelectorAll('[data-feature]').forEach(button=>button.addEventListener('click',()=>openFeature(button.dataset.feature,button)));
  dialog.querySelector('.dialog-close').addEventListener('click',()=>dialog.close());
  let backdropDown=false;
  dialog.addEventListener('pointerdown',event=>{backdropDown=event.target===dialog;});
  dialog.addEventListener('click',event=>{if(event.target===dialog&&backdropDown){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}backdropDown=false;});
  dialog.addEventListener('close',()=>{serial++;destroy();destroy=()=>{};stopAudio();document.documentElement.classList.remove('feature-modal-open');opener?.focus();});
  async function initialize(root,type){
    try{const content=await data();type==='library'?makeLibrary(root,content):makePractice(root);}
    catch(_){root.innerHTML="<p class=\"demo-loading\">No se ha podido cargar esta demostración. <button type=\"button\">Inténtalo de nuevo</button></p>";root.querySelector('button').addEventListener('click',()=>initialize(root,type),{once:true});}
  }
  initialize(document.getElementById('library-demo'),'library');initialize(document.getElementById('practice-demo'),'practice');
  document.addEventListener('visibilitychange',()=>{if(document.hidden){stopAudio();document.querySelectorAll('[data-stroke=play]').forEach(button=>{if(button.textContent==="Pausa")button.click();});}});
  window.addEventListener('pagehide',event=>{stopAudio();if(!event.persisted)cleanups.forEach(fn=>fn());});
})();
