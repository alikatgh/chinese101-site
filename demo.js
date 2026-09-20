(() => {
  'use strict';
  const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const norm = value => value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  const asset = name => '/assets/demo/' + name;
  let dataPromise;
  let activeAudio;
  const cleanups = new Set();
  function data() {
    if (!dataPromise) dataPromise = Promise.all(['characters','keys','strokes'].map(async name => {
      const response = await fetch(asset(name + '.json'));
      if (!response.ok) throw new Error('Preview unavailable');
      return response.json();
    })).then(([dict, keys, strokes]) => ({characters:dict.characters, keys, strokes:strokes.characters})).catch(error => {dataPromise = null; throw error;});
    return dataPromise;
  }
  function stopAudio() { if (activeAudio) { activeAudio.pause(); activeAudio = null; } }
  function sound(file, button, status) {
    stopAudio();
    const player = new Audio(asset(file)); activeAudio = player;
    const label = button.textContent;
    button.textContent = 'Playing…'; button.disabled = true;
    const reset = () => {button.textContent = label; button.disabled = false;};
    player.addEventListener('ended', reset, {once:true});
    player.addEventListener('pause', reset, {once:true});
    player.play().catch(() => {reset(); status.textContent = 'Audio could not play. Please try Listen again.';});
  }
  function frame(root, title) {
    root.classList.add('demo-screen');
    root.innerHTML = `<div class="demo-status"><span>Chinese 101</span><span>WEB DEMO</span></div><div class="demo-app-title">${esc(title)}</div><div class="demo-body"></div>`;
    return root.querySelector('.demo-body');
  }
  function makeStroke(root, paths, han) {
    let step = 0, timer = null;
    root.innerHTML = `<div class="stroke-stage" role="img" aria-label="Stroke order for ${esc(han)}"><svg viewBox="0 0 1024 1024" aria-hidden="true"><path class="writing-grid" d="M512 0V1024 M0 512H1024 M0 0L1024 1024 M1024 0L0 1024"/><g transform="translate(0,900) scale(1,-1)">${paths.map(d=>`<path d="${esc(d)}"/>`).join('')}</g></svg></div><p class="stroke-count" aria-live="polite"></p><div class="stroke-controls"><button type="button" data-stroke="prev" aria-label="Previous stroke">←</button><button type="button" data-stroke="play">Play strokes</button><button type="button" data-stroke="next" aria-label="Next stroke">→</button></div><small class="stroke-credit">Stroke graphics © Arphic. <a href="/licenses/ARPHIC-LICENSE.txt" target="_blank" rel="noopener">License &amp; no warranty</a></small>`;
    const update=()=>{
      root.querySelectorAll('g path').forEach((path,i)=>path.setAttribute('fill',i<step?'#a33515':'#d8d2c8'));
      root.querySelector('.stroke-count').textContent=`${step} of ${paths.length} strokes`;
      root.querySelector('[data-stroke=prev]').disabled=step===0;
      root.querySelector('[data-stroke=next]').disabled=step===paths.length;
      root.querySelector('[data-stroke=play]').textContent=timer?'Pause':step===paths.length?'Replay':'Play strokes';
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
    const body=frame(root,'Shape by shape');
    let mode='characters',page=0,query='',selection=null,strokeCleanup=()=>{};
    const searchable=Object.fromEntries(['characters','keys'].map(key=>[key,content[key].map(c=>({...c,search:norm([c.han,c.py,c.en,...(c.readings||[])].join(' '))}))]));
    function results(){
      const matches=searchable[mode].filter(c=>c.search.includes(norm(query)));
      const total=Math.max(1,Math.ceil(matches.length/9));page=Math.min(page,total-1);
      const list=body.querySelector('.demo-char-grid');
      list.innerHTML=matches.slice(page*9,page*9+9).map(c=>`<button type="button" data-han="${esc(c.han)}" aria-label="${esc(c.han+' '+c.py+' '+c.en)}"><span lang="zh">${esc(c.han)}</span><small>${esc(c.py)}</small></button>`).join('')||'<p class="demo-empty">No characters found. Try “rain”, “yu” or “雨”.</p>';
      body.querySelector('.demo-result-count').textContent=`${matches.length.toLocaleString()} ${mode==='keys'?(matches.length===1?'key':'keys'):(matches.length===1?'character':'characters')}`;
      body.querySelector('.demo-page-count').textContent=`Page ${page+1} / ${total}`;
      body.querySelector('[data-library=prev]').disabled=page===0;
      body.querySelector('[data-library=next]').disabled=page===total-1;
    }
    function library(focus) {
      selection=null;strokeCleanup();
      body.innerHTML=`<label class="sr-only" for="${root.id}-search">Search Chinese characters by character, pinyin or meaning</label><div class="demo-search"><input id="${root.id}-search" type="search" placeholder="Character, pinyin or meaning" value="${esc(query)}" autocomplete="off" spellcheck="false"><button type="button" data-library="clear" aria-label="Clear character search">×</button></div><div class="demo-segments" aria-label="Library view"><button type="button" data-library="characters" aria-pressed="${mode==='characters'}">Characters · 3,500</button><button type="button" data-library="keys" aria-pressed="${mode==='keys'}">Keys · 101</button></div><p class="demo-result-count" role="status"></p><div class="demo-pager"><button type="button" data-library="prev" aria-label="Previous character page">‹</button><span class="demo-page-count"></span><button type="button" data-library="next" aria-label="Next character page">›</button></div><div class="demo-char-grid"></div><p class="demo-local-note">Tap a character to explore it.</p>`;
      body.querySelector('input').addEventListener('input',event=>{query=event.target.value;page=0;results();});results();
      if(focus)body.querySelector(`[data-library="${mode}"]`).focus();
    }
    function detail(han){
      selection=searchable[mode].find(c=>c.han===han);if(!selection)return;
      const c=selection;
      body.innerHTML=`<button type="button" class="demo-back" data-library="back">← Back to ${mode}</button><h3 class="demo-han" lang="zh" tabindex="-1">${esc(c.han)}</h3><p class="demo-pinyin">${esc(c.py)}</p><p class="demo-definition">${esc(c.en)}</p>${c.strokes?`<p class="demo-local-note">${c.strokes} strokes</p>`:''}<div class="demo-stroke"></div><p class="demo-local-note">${content.strokes[c.han]?'Use the arrows or play the stroke sequence.':'This web demo includes stroke guides for selected characters.'}</p>`;
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
    const body=frame(root,'Daily practice');let step=start,revealed=false,complete=false;
    function render(focus=false){
      stopAudio();
      if(complete){body.innerHTML='<div class="demo-complete"><span lang="zh">雨</span><h3>A little more familiar.</h3><p>You finished this sample character.</p><p class="demo-local-note">This demo does not save or sync app progress.</p><button type="button" class="demo-primary" data-practice="restart">Try again</button></div>';return;}
      body.innerHTML=`<p class="demo-local-note">One sample character · Rain</p><div class="demo-segments practice-tabs">${['discover','context','recall'].map((name,i)=>`<button type="button" data-practice="${name}" aria-pressed="${step===name}">${i+1} ${name[0].toUpperCase()+name.slice(1)}</button>`).join('')}</div><div class="practice-content"></div><p class="demo-audio-status" role="status"></p>`;
      const screen=body.querySelector('.practice-content');
      if(step==='discover')screen.innerHTML=`<div class="practice-glyph" lang="zh">雨</div><p class="demo-pinyin">yǔ</p><h3>rain</h3><details class="demo-memory" ${memory?'open':''}><summary>Memory picture</summary><img src="${asset('memory-rain.png')}" alt="An ink cloud with four falling raindrops, a memory illustration for rain" loading="lazy"><p>A cloud and falling drops. A visual association for 雨.</p></details><button type="button" class="demo-primary" data-practice="context">See an example →</button>`;
      if(step==='context')screen.innerHTML='<p class="demo-context-label">See it in a phrase</p><div class="demo-phrase"><span lang="zh">下雨</span><p class="demo-pinyin">xià yǔ</p><p>to rain</p></div><button type="button" class="demo-listen" data-practice="listen">▶ Listen</button><p class="demo-local-note">Listen, then say it aloud.</p><button type="button" class="demo-primary" data-practice="recall">Try to recall →</button>';
      if(step==='recall')screen.innerHTML=`<p class="demo-context-label">What does this character mean?</p><div class="practice-glyph" lang="zh">雨</div>${revealed?'<p class="demo-pinyin">yǔ</p><h3>rain</h3><p class="demo-local-note">Recall is self-assessed. There’s no speech scoring.</p><button type="button" class="demo-primary" data-practice="done">I remembered</button><button type="button" class="demo-secondary" data-practice="discover">Show me again</button>':'<button type="button" class="demo-primary" data-practice="reveal">Reveal meaning</button>'}`;
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
    strokes:{title:'Follow the strokes',description:'Watch 雨 take shape, one stroke at a time. This live guide uses the same stroke paths as the app.',steps:['Press Play strokes to follow the sequence.','Pause, or move forward and back with the arrows.','In the app, open a character’s stroke guide to study available stroke order.'],caption:'Interactive web guide · App stroke data'},
    context:{title:'Learn in context',description:'Move from the shape of a character to a phrase you can understand.',steps:['Start with Discover to meet 雨 (rain).','Switch to Context to see 下雨 (to rain).','Open Recall and reveal the meaning when you’re ready.'],caption:'Interactive browser version of the app’s learning flow',native:'/assets/context.png'},
    audio:{title:'Hear selected examples',description:'Try an actual recording from Chinese 101. Audio plays only when you press Listen.',steps:['Press Listen to hear 下雨.','Repeat the phrase at your own pace.','Try Recall when you’re ready. The app does not score your pronunciation.'],caption:'Original app audio · Some examples have recordings',native:'/assets/context.png'},
    memory:{title:'Make it memorable',description:'Connect the character 雨 with a cloud and its falling raindrops. This is one of the memory illustrations used in the app.',steps:['Expand or collapse Memory picture.','Notice the cloud and the four raindrops.','Continue to a phrase, then try recalling the character.'],caption:'Original app illustration · Available for selected characters',native:'/assets/demo/discover.png'},
    progress:{title:'Keep your place',description:'The Android app keeps a record of your learning days, practice completions and self-assessed recall.',steps:['Open Your progress from the app.','Review your recent learning days and the characters you practised.','Progress stays on that device. This website demo does not sync to the app.'],caption:'Real Android development screenshot · Example progress'},
    comfort:{title:'Choose your comfort',description:'See the character library in the app’s light and dark appearances.',steps:['Switch between the two real Android captures.','Characters and pinyin stay at the centre of attention.','The dark capture also shows Android’s larger system text setting.'],caption:'Real Android development screenshots · Dark uses larger system text'}
  };
  const dialog=document.getElementById('feature-dialog');let opener=null,destroy=()=>{},serial=0;
  async function openFeature(key,button){
    const info=features[key];if(!info)return;
    opener=button;destroy();stopAudio();const request=++serial;
    document.getElementById('feature-dialog-title').textContent=info.title;
    document.getElementById('feature-dialog-description').textContent=info.description;
    document.getElementById('feature-dialog-steps').innerHTML=info.steps.map(s=>`<li>${esc(s)}</li>`).join('');
    document.getElementById('feature-dialog-caption').textContent=info.caption;
    const preview=document.getElementById('feature-dialog-preview');preview.innerHTML='<p class="demo-loading">Loading preview…</p>';
    dialog.showModal();document.documentElement.classList.add('feature-modal-open');
    try{
      if(key==='progress'){preview.innerHTML='<img class="native-capture" src="/assets/demo/progress.png" alt="Chinese 101 Android progress screen showing a learning streak, weekly history and practised characters">';}
      else if(key==='comfort'){
        preview.innerHTML='<div class="theme-preview-controls"><button type="button" data-theme-preview="light" aria-pressed="true">Light</button><button type="button" data-theme-preview="dark" aria-pressed="false">Dark · larger text</button></div><img class="native-capture" src="/assets/characters.png" alt="Chinese 101 Android character library in light mode">';
        preview.querySelectorAll('[data-theme-preview]').forEach(control=>control.addEventListener('click',()=>{const dark=control.dataset.themePreview==='dark';preview.querySelector('img').src=dark?asset('characters-dark.png'):'/assets/characters.png';preview.querySelector('img').alt=`Chinese 101 Android character library in ${dark?'dark mode with larger text':'light mode'}`;preview.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b===control)));}));
      } else {
        const content=await data();if(request!==serial||!dialog.open)return;
        preview.innerHTML='<div class="phone interactive-phone modal-phone" id="feature-app-demo"></div>';
        const screen=preview.querySelector('.interactive-phone');
        if(key==='strokes'){const body=frame(screen,'Stroke order · 雨');destroy=makeStroke(body,content.strokes['雨'].strokes,'雨');}
        else destroy=makePractice(screen,key==='memory'?'discover':'context',key==='memory');
      }
      if(info.native){const details=document.createElement('details');details.className='native-comparison';details.innerHTML=`<summary>See the Android screenshot</summary><img class="native-capture" src="${info.native}" alt="Original Chinese 101 Android development screenshot" loading="lazy">`;preview.appendChild(details);}
      document.dispatchEvent(new CustomEvent('chinese101:demo',{detail:{feature:key}}));
    }catch(_){if(request===serial)preview.innerHTML='<p class="demo-loading">The preview could not load. Close this window and try again.</p>';}
  }
  document.querySelectorAll('[data-feature]').forEach(button=>button.addEventListener('click',()=>openFeature(button.dataset.feature,button)));
  dialog.querySelector('.dialog-close').addEventListener('click',()=>dialog.close());
  let backdropDown=false;
  dialog.addEventListener('pointerdown',event=>{backdropDown=event.target===dialog;});
  dialog.addEventListener('click',event=>{if(event.target===dialog&&backdropDown){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}backdropDown=false;});
  dialog.addEventListener('close',()=>{serial++;destroy();destroy=()=>{};stopAudio();document.documentElement.classList.remove('feature-modal-open');opener?.focus();});
  async function initialize(root,type){
    try{const content=await data();type==='library'?makeLibrary(root,content):makePractice(root);}
    catch(_){root.innerHTML='<p class="demo-loading">Couldn’t load this demo. <button type="button">Try again</button></p>';root.querySelector('button').addEventListener('click',()=>initialize(root,type),{once:true});}
  }
  initialize(document.getElementById('library-demo'),'library');initialize(document.getElementById('practice-demo'),'practice');
  document.addEventListener('visibilitychange',()=>{if(document.hidden){stopAudio();document.querySelectorAll('[data-stroke=play]').forEach(button=>{if(button.textContent==='Pause')button.click();});}});
  window.addEventListener('pagehide',event=>{stopAudio();if(!event.persisted)cleanups.forEach(fn=>fn());});
})();
