/* Chinese 101: interactive browser previews, using the bundled source selection. */
(() => {
  'use strict';

  const DATA_URL = '/assets/native-preview/data.json';
  const MODES = new Set(['daily', 'remember', 'components', 'vocabulary', 'quick', 'sentence']);
  const instances = new Set();
  let dataPromise;
  let failedLoad = false;
  let activeAudio = null;
  let nextId = 0;

  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[char]));
  const array = value => Array.isArray(value) ? value : [];
  const records = value => array(value).filter(item => item !== null && typeof item === 'object' && !Array.isArray(item));
  const number = (value, fallback, min, max) => Number.isFinite(Number(value)) ? Math.max(min, Math.min(max, Number(value))) : fallback;
  const hanCharacters = text => Array.from(String(text ?? '')).filter(char => /\p{Script=Han}/u.test(char));
  const safeURL = value => /^https?:\/\//i.test(String(value ?? '')) ? String(value) : '';
  const link = (url, label) => safeURL(url) ? `<a href="${escape(safeURL(url))}" target="_blank" rel="noopener noreferrer">${escape(label)}</a>` : escape(label);
  const icons = {
    back: '<path d="m14 6-6 6 6 6M8 12h12"/>',
    home: '<path d="m3 10 9-7 9 7M5 9v12h14V9M9 21v-8h6v8"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
    moon: '<path d="M20.4 14.2A8.8 8.8 0 0 1 9.8 3.6a8.8 8.8 0 1 0 10.6 10.6Z"/>',
    today: '<rect x="4" y="5" width="16" height="16" rx="3"/><path d="M8 3v4m8-4v4M4 11h16m-12 5h3"/>',
    characters: '<path d="M4 5h16M12 3v3M7 8c2 6 6 10 12 12M17 8c-2 6-6 10-12 12M9 14h6"/>',
    you: '<circle cx="12" cy="8" r="4"/><path d="M4 22v-3a8 8 0 0 1 16 0v3"/>',
    sound: '<path d="m11 5-6 4H2v6h3l6 4V5Zm4 3a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
    expand: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
    close: '<path d="m6 6 12 12M6 18 18 6"/>',
    arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    search: '<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>',
    repeat: '<path d="m19 3 3 3-3 3M2 11V9a3 3 0 0 1 3-3h17M5 21l-3-3 3-3m17-2v2a3 3 0 0 1-3 3H2"/>'
  };
  const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.arrow}</svg>`;
  const button = (action, label, className = '', attrs = '') => `<button type="button" class="np-button ${className}" data-action="${escape(action)}" ${attrs}>${label}</button>`;
  const pill = (action, label, selected, attrs = '') => button(action, escape(label), `np-pill${selected ? ' is-selected' : ''}`, `aria-pressed="${selected}" ${attrs}`);
  const technicalDetails = (values = [], raw, context = '', extra = '') => {
    const rows = values.filter(([, value]) => value !== undefined && value !== null && value !== '');
    if (!rows.length && !raw && !extra) return '';
    return `<details class="np-technical"><summary${context ? ` aria-label="Technical details for ${escape(context)}"` : ''}>Technical details</summary>${metadata(rows)}${extra}${raw ? `<pre class="np-technical-raw">${escape(JSON.stringify(raw, null, 2))}</pre>` : ''}</details>`;
  };
  const assetLink = (url, label) => /^\/assets\/native-preview\/licenses\/[A-Za-z0-9._-]+$/.test(String(url || '')) ? `<a href="${escape(url)}" target="_blank" rel="noopener noreferrer">${escape(label)}</a>` : '';
  const metadata = values => `<dl class="np-metadata">${values.filter(([, value]) => value !== undefined && value !== null && value !== '').map(([key, value]) => `<div><dt>${escape(key)}</dt><dd>${escape(Array.isArray(value) ? value.join(', ') : value)}</dd></div>`).join('')}</dl>`;

  function loadData(retry = false) {
    if (retry && failedLoad) dataPromise = undefined;
    if (!dataPromise) {
      failedLoad = false;
      const abort = new AbortController();
      let timeout;
      const deadline = new Promise((_, reject) => {
        timeout = setTimeout(() => {
          abort.abort();
          reject(new Error('The preview content took too long to load.'));
        }, 8000);
      });
      const request = fetch(DATA_URL, {signal: abort.signal, credentials: 'same-origin'})
        .then(response => {
          if (!response.ok) throw new Error('The preview content could not be loaded.');
          return response.json();
        })
        .then(data => {
          if (!data || data.schemaVersion !== 1) throw new Error('The preview content is not available in this version.');
          return {...data, characters: records(data.characters), cards: records(data.cards), words: records(data.words), sources: records(data.sources), pictureObjects: records(data.pictureObjects), initial: data.initial || {}};
        });
      dataPromise = Promise.race([request, deadline]).catch(error => {
        failedLoad = true;
        throw error;
      }).finally(() => clearTimeout(timeout));
    }
    return dataPromise;
  }

  function stopAudio() {
    if (!activeAudio) return;
    const previous = activeAudio;
    activeAudio = null;
    clearTimeout(previous.timeout);
    previous.element.pause();
    try { previous.element.currentTime = 0; } catch (_) { /* A not-yet-loaded clip has no seekable range. */ }
    previous.owner.audioUI('idle');
  }

  class Preview {
    constructor(host) {
      this.host = host;
      this.id = `native-preview-${++nextId}`;
      this.startMode = MODES.has(host.dataset.nativePreview) ? host.dataset.nativePreview : 'daily';
      this.view = this.startMode;
      this.history = [];
      this.theme = 'light';
      this.han = '';
      this.dailyStep = 0;
      this.dailyRevealed = false;
      this.dailyResult = null;
      this.dailySession = null;
      this.memoryTab = 'picture';
      this.componentTab = 'structure';
      this.wordTab = 'definitions';
      this.wordId = null;
      this.sentenceId = null;
      this.query = '';
      this.quick = null;
      this.modal = null;
      this.restoreControl = null;
      this.practice = [];
      this.destroyed = false;
      this.loading = false;
      this.pointer = null;
      this.shell = null;
      this.contentMarkup = null;
      this.modalMarkup = null;
      this.renderedView = null;
      this.motion = null;
      this.motionPreference = window.matchMedia?.('(prefers-reduced-motion: reduce)');
      this.onMotionPreference = () => { if (this.motionPreference?.matches) this.cancelMotion(); };
      this.motionPreference?.addEventListener?.('change', this.onMotionPreference);
      this.onClick = event => this.click(event);
      this.onInput = event => this.input(event);
      this.onKeydown = event => this.keydown(event);
      this.onPointerDown = event => this.pointerDown(event);
      this.onPointerMove = event => this.pointerMove(event);
      this.onPointerUp = event => this.pointerUp(event);
      this.onPointerCancel = () => this.cancelSwipe();
      host.classList.add('native-preview');
      if (!host.getAttribute('aria-label')) host.setAttribute('aria-label', 'Chinese 101 interactive browser preview');
      host.addEventListener('click', this.onClick);
      host.addEventListener('input', this.onInput);
      host.addEventListener('change', this.onInput);
      host.addEventListener('keydown', this.onKeydown);
      host.addEventListener('pointerdown', this.onPointerDown);
      host.addEventListener('pointermove', this.onPointerMove);
      host.addEventListener('pointerup', this.onPointerUp);
      host.addEventListener('pointercancel', this.onPointerCancel);
      host.addEventListener('error', event => {
        if (event.target instanceof HTMLImageElement && event.target.classList.contains('np-art-image')) {
          const stage = event.target.closest('.np-art-stage');
          if (stage) stage.innerHTML = '<p class="np-empty">The source picture could not be loaded. Character and Shape remain available.</p>';
        }
      }, true);
      instances.add(this);
      this.load();
    }

    async load(retry = false) {
      if (this.loading || this.destroyed) return;
      this.loading = true;
      this.host.innerHTML = `<div class="np-phone"><div class="np-screen"><div class="np-loading" role="status"><span class="np-wordmark">Chinese 101</span><p>Loading the interactive preview…</p></div></div></div>`;
      try {
        this.data = await loadData(retry);
        if (this.destroyed) return;
        this.characters = new Map(this.data.characters.filter(item => item && item.han).map(item => [String(item.han), item]));
        this.words = new Map(this.data.words.filter(item => item && item.id !== undefined).map(item => [String(item.id), item]));
        this.cards = new Map(this.data.cards.filter(item => item && item.id).map(item => [String(item.id), item]));
        this.sources = new Map(this.data.sources.filter(item => item && item.id).map(item => [String(item.id), item]));
        this.objects = new Map(this.data.pictureObjects.filter(item => item && item.id).map(item => [String(item.id), item]));
        const preferred = this.data.initial[this.startMode];
        this.han = this.characters.has(preferred) ? preferred : this.data.characters.find(item => item && item.han)?.han || '';
        this.dailySession = {han: this.initialHan('daily'), step: 0, revealed: false, result: null};
        this.query = this.startMode === 'vocabulary' ? this.han : '';
        this.sentenceId = this.data.initial.sentence || this.data.cards[0]?.id || null;
        this.resetQuick();
        this.render();
      } catch (error) {
        if (!this.destroyed) this.host.innerHTML = `<div class="np-phone"><div class="np-screen"><div class="np-loading" role="alert"><span class="np-wordmark">Chinese 101</span><h3>Preview unavailable</h3><p>${escape(error?.message || 'The content could not be loaded.')}</p>${button('retry-load', 'Try again', 'np-primary')}</div></div></div><p class="np-preview-caption">Interactive browser preview · selected content</p>`;
      } finally {
        this.loading = false;
      }
    }

    character() { return this.characters.get(this.han); }
    formation(character = this.character()) { return character?.formation || null; }
    initialHan(view) {
      const candidate = this.data.initial[view];
      return this.characters.has(candidate) ? candidate : this.han;
    }
    card() {
      if (this.view === 'sentence') return this.cards.get(String(this.sentenceId)) || this.data.cards[0];
      const character = this.character();
      return array(character?.contextIds).map(id => this.cards.get(String(id))).find(Boolean) || this.data.cards.find(card => String(card.zh || '').includes(this.han));
    }
    source(id) {
      if (id && typeof id === 'object') return id;
      return this.sources.get(String(id || ''));
    }
    sourceHTML(source, extra = [], record) {
      if (!source) return `<p class="np-muted">No source record is included for this item in the preview selection.</p>${technicalDetails(extra, record)}`;
      const name = source.name || source.id || 'Source';
      return `<div class="np-source"><strong>${source.url ? link(source.url, name) : escape(name)}</strong>${source.attribution ? `<p>${escape(source.attribution)}</p>` : ''}${source.license ? `<p class="np-license">${link(source.license_url || source.licenseUrl, source.license)}</p>` : ''}${source.licenseFileUrl ? `<p>${assetLink(source.licenseFileUrl, 'Read bundled license')}</p>` : ''}${technicalDetails([...extra, ['Revision', source.revision], ['SHA-256', source.sha256 || source.dictionarySha256]], {source, ...(record ? {record} : {})}, name, assetLink(source.sourceArchiveUrl, 'Original source archive'))}</div>`;
    }
    characterSource(character = this.character()) {
      const source = this.source(character?.source);
      if (!source) return undefined;
      const complete = this.sources.get(String(source.id)) || this.data.sources.find(record => record.name === source.name);
      return complete ? {...complete, ...source} : source;
    }
    formationSource(character = this.character()) {
      const formation = this.formation(character);
      return this.source(formation?.sourceId || formation?.source_id) || this.data.sources.find(source => /make\s*me\s*a\s*hanzi/i.test(`${source.id} ${source.name}`));
    }
    characterSourceHTML(character = this.character()) {
      const formation = this.formation(character) || {};
      const definition = this.sourceHTML(this.characterSource(character), [['Ordinal', character?.source?.ordinal], ['Strokes', character?.strokes]], character);
      const formationSource = this.sourceHTML(this.formationSource(character), [
        ['Record', formation.sourceRecordId || formation.source_record_id || character?.sourceRecordId || character?.source_record_id],
        ['Source line', formation.sourceLine], ['Record SHA-256', formation.sourceRecordSha256]
      ], formation);
      return `<h4 class="np-source-heading">Character definition</h4>${definition}${this.formation(character) ? `<h4 class="np-source-heading">Formation record</h4>${formationSource}` : ''}`;
    }

    dailyState() {
      return {han: this.han, step: this.dailyStep, revealed: this.dailyRevealed, result: this.dailyResult?.han === this.han ? {...this.dailyResult} : null};
    }
    restoreDaily(han = this.dailySession?.han, saved = this.dailySession) {
      this.han = this.characters.has(han) ? han : this.initialHan('daily');
      const matches = saved?.han === this.han;
      this.dailyStep = matches ? number(saved.step, 0, 0, 2) : 0;
      this.dailyRevealed = matches && Boolean(saved.revealed);
      this.dailyResult = matches && saved.result?.han === this.han ? {...saved.result} : null;
      this.dailySession = this.dailyState();
    }
    snapshot() {
      return {view: this.view, han: this.han, wordId: this.wordId, wordTab: this.wordTab, query: this.query, sentenceId: this.sentenceId, daily: this.view === 'daily' ? this.dailyState() : null, scroll: this.host.querySelector('.np-content')?.scrollTop || 0};
    }
    navigate(view, options = {}) {
      const previous = this.snapshot();
      if (previous.daily) this.dailySession = previous.daily;
      this.history.push(previous);
      this.view = view;
      this.modal = null;
      if (view === 'daily') this.restoreDaily(options.han);
      else if (options.han && this.characters.has(options.han)) this.han = options.han;
      if (options.query !== undefined) this.query = options.query;
      if (options.cardId !== undefined) this.sentenceId = options.cardId;
      if (options.wordId !== undefined) { this.wordId = String(options.wordId); this.wordTab = 'definitions'; }
      this.render({top: true, focusHeading: true, motion: 'navigation'});
    }
    back() {
      if (this.modal) { this.closeModal(); return; }
      if (this.view === 'daily') this.dailySession = this.dailyState();
      const previous = this.history.pop();
      if (previous) {
        Object.assign(this, {view: previous.view, han: previous.han, wordId: previous.wordId, wordTab: previous.wordTab, query: previous.query, sentenceId: previous.sentenceId});
        if (previous.view === 'daily') this.restoreDaily(previous.han, previous.daily);
        this.render({scroll: previous.scroll, focusHeading: true, motion: 'back'});
      } else this.navigate('daily');
    }
    resetQuick(hans) {
      const initial = array(this.data?.initial?.quick).filter(han => this.characters.has(han));
      const queue = hans || (initial.length ? initial : Array.from(this.characters.keys()).slice(0, 5));
      this.quick = {queue: [...queue], index: 0, revealed: false, grades: [], epoch: (this.quick?.epoch || 0) + 1};
    }
    turn() { return `${this.quick.epoch}:${this.quick.index}`; }
    gradeQuick(known, turn) {
      if (!this.quick || !this.quick.revealed || turn !== this.turn() || this.quick.index >= this.quick.queue.length) return;
      const han = this.quick.queue[this.quick.index];
      this.quick.grades.push({han, known});
      this.practice.push({han, known});
      this.quick.index++;
      this.quick.revealed = false;
      this.pointer = null;
      this.render({top: true, focusHeading: true});
    }
    setCharacter(han) {
      if (!this.characters.has(han) || han === this.han) return;
      this.han = han;
      if (this.view === 'daily') {
        this.dailyStep = 0;
        this.dailyRevealed = false;
        this.dailyResult = null;
        this.dailySession = this.dailyState();
      }
      this.render();
    }
    nextCharacter() {
      const all = Array.from(this.characters.keys());
      this.han = all[(Math.max(0, all.indexOf(this.han)) + 1) % all.length] || '';
      this.dailyStep = 0;
      this.dailyRevealed = false;
      this.dailyResult = null;
      this.dailySession = this.dailyState();
      this.render({top: true, focusHeading: true});
    }

    mountShell() {
      if (this.shell) return false;
      this.host.innerHTML = `<div class="np-phone"><div class="np-screen"><div class="np-app">
        <header class="np-header">${button('home', icon('home'), 'np-icon-button', 'data-shell-back aria-label="Go to Today"')}<h3 class="np-title" tabindex="-1">Chinese 101</h3>${button('theme', icon('moon'), 'np-icon-button', 'data-shell-theme aria-label="Use dark preview theme"')}</header>
        <div class="np-content"><div class="np-view"></div></div>
        <p class="np-announcement" data-announcement role="status" aria-live="polite"></p>
        <nav class="np-bottom-nav" aria-label="Preview navigation">${[['daily','Today','today'], ['characters','Characters','characters'], ['profile','You','you']].map(([view, label, symbol]) => button('nav', `${icon(symbol)}<span>${label}</span>`, '', `data-view="${view}"`)).join('')}</nav>
      </div><div class="np-overlay-root" data-open="false" aria-hidden="true" inert></div></div></div><p class="np-preview-caption">Interactive browser preview · selected content</p>`;
      this.shell = {
        app: this.host.querySelector('.np-app'),
        content: this.host.querySelector('.np-content'),
        view: this.host.querySelector('.np-view'),
        title: this.host.querySelector('.np-title'),
        back: this.host.querySelector('[data-shell-back]'),
        theme: this.host.querySelector('[data-shell-theme]'),
        navigation: Array.from(this.host.querySelectorAll('.np-bottom-nav [data-view]')),
        overlay: this.host.querySelector('.np-overlay-root')
      };
      return true;
    }
    cancelMotion() {
      this.motion?.cancel();
      this.motion = null;
    }
    animateContent(target, kind = 'content') {
      this.cancelMotion();
      if (!target?.animate || this.motionPreference?.matches) return;
      const transform = kind === 'back' ? 'translateX(-10px)' : kind === 'navigation' ? 'translateX(10px)' : kind === 'reveal' ? 'scale(.985)' : 'translateY(5px)';
      this.motion = target.animate(
        [{opacity: .35, transform}, {opacity: 1, transform: 'none'}],
        {duration: 160, easing: 'cubic-bezier(.2,0,0,1)', fill: 'none'}
      );
    }
    render(options = {}) {
      if (this.destroyed) return;
      if (activeAudio?.owner === this) stopAudio();
      this.cancelSwipe();
      this.cancelMotion();
      const active = this.host.contains(document.activeElement) ? document.activeElement : null;
      const focused = this.controlIdentity(active);
      const persistentFocus = Boolean(active?.closest?.('.np-header, .np-bottom-nav'));
      const initial = this.mountShell();
      const {app, content, view, title, back, theme, navigation, overlay} = this.shell;
      this.announce('');
      const scroll = options.top ? 0 : options.scroll ?? content.scrollTop;
      const titles = {daily: 'Today', remember: 'Remember', components: 'Components', vocabulary: 'Vocabulary', word: 'Word details', quick: 'Quick test', sentence: 'In a sentence', characters: 'Characters', profile: 'You'};
      const nav = this.view === 'daily' ? 'daily' : ['profile', 'quick'].includes(this.view) ? 'profile' : 'characters';
      this.host.dataset.previewTheme = this.theme;
      this.host.dataset.previewView = this.view;
      title.textContent = titles[this.view] || 'Chinese 101';
      back.dataset.action = this.history.length ? 'back' : 'home';
      back.setAttribute('aria-label', this.history.length ? 'Back' : 'Go to Today');
      const backIcon = icon(this.history.length ? 'back' : 'home');
      if (back.innerHTML !== backIcon) back.innerHTML = backIcon;
      const themeIcon = icon(this.theme === 'light' ? 'moon' : 'sun');
      if (theme.innerHTML !== themeIcon) theme.innerHTML = themeIcon;
      theme.setAttribute('aria-label', `Use ${this.theme === 'light' ? 'dark' : 'light'} preview theme`);
      for (const control of navigation) {
        const current = control.dataset.view === nav;
        control.classList.toggle('is-current', current);
        if (current) control.setAttribute('aria-current', 'page');
        else control.removeAttribute('aria-current');
      }
      const markup = this.content();
      const contentChanged = markup !== this.contentMarkup;
      if (contentChanged) {
        view.innerHTML = markup;
        this.contentMarkup = markup;
        if (!initial) this.animateContent(view, options.motion || (this.renderedView !== this.view ? 'navigation' : 'content'));
      }
      content.scrollTop = scroll;
      const wasModalOpen = overlay.dataset.open === 'true';
      const modalKey = this.modal ? JSON.stringify({dialog: this.modal, character: this.han}) : null;
      const modalChanged = modalKey !== this.modalMarkup;
      if (this.modal && modalChanged) {
        overlay.innerHTML = this.modalHTML();
        this.modalMarkup = modalKey;
        if (wasModalOpen) this.animateContent(overlay.querySelector('.np-dialog-content'));
      }
      app.inert = Boolean(this.modal);
      overlay.inert = !this.modal;
      overlay.setAttribute('aria-hidden', String(!this.modal));
      overlay.dataset.open = String(Boolean(this.modal));
      if (this.modal && (!wasModalOpen || modalChanged)) overlay.querySelector('[data-action="close-modal"]')?.focus({preventScroll: true});
      else if (!this.modal && options.focusHeading && !persistentFocus) title.focus({preventScroll: true});
      else if (!this.modal && !persistentFocus && focused && contentChanged) this.findControl(focused)?.focus({preventScroll: true});
      this.renderedView = this.view;
    }

    content() {
      if (!this.characters.size && this.view !== 'vocabulary' && this.view !== 'profile' && this.view !== 'sentence') return `<div class="np-empty"><h4>No characters in this selection</h4><p>The preview data loaded, but it does not include character records.</p>${button('nav', 'Browse vocabulary', 'np-primary', 'data-view="vocabulary"')}</div>`;
      switch (this.view) {
        case 'daily': return this.dailyHTML();
        case 'remember': return this.rememberHTML();
        case 'components': return this.componentsHTML();
        case 'vocabulary': return this.vocabularyHTML();
        case 'word': return this.wordHTML();
        case 'quick': return this.quickHTML();
        case 'sentence': return this.sentenceHTML();
        case 'characters': return this.charactersHTML();
        case 'profile': return this.profileHTML();
        default: return this.dailyHTML();
      }
    }
    characterPicker() {
      return `<label class="np-character-picker"><span>Character</span><select data-character-picker aria-label="Choose a preview character">${Array.from(this.characters.values()).map(character => `<option value="${escape(character.han)}" ${character.han === this.han ? 'selected' : ''}>${escape(character.han)} · ${escape(character.py || character.en || '')}</option>`).join('')}</select></label>`;
    }
    glyphHTML(character = this.character(), size = '') {
      if (!character) return '<p class="np-empty">No character record in this selection.</p>';
      return `<div class="np-glyph-card ${size}"><span class="np-glyph" lang="zh-Hans">${escape(character.han)}</span>${button('expand', icon('expand'), 'np-icon-button np-expand', `aria-label="Expand ${escape(character.han)}" data-han="${escape(character.han)}"`)}</div>`;
    }
    meaningHTML(character = this.character()) {
      return character ? `<div class="np-character-meaning">${character.py ? `<p class="np-pinyin">${escape(character.py)}</p>` : ''}${character.en ? `<p>${escape(character.en)}</p>` : ''}</div>` : '';
    }
    dailyHTML() {
      const character = this.character();
      const steps = ['Discover', 'Context', 'Recall'];
      let body;
      if (this.dailyStep === 0) body = `${this.glyphHTML(character)}${this.meaningHTML(character)}<div class="np-stack">${button('open-remember', 'Remember the shape', 'np-outline')}${button('daily-step', `See it in context ${icon('arrow')}`, 'np-primary', 'data-step="1"')}</div>`;
      else if (this.dailyStep === 1) body = `${this.contextHTML(this.card())}<div class="np-stack">${button('daily-step', `Try to recall it ${icon('arrow')}`, 'np-primary', 'data-step="2"')}</div>`;
      else if (this.dailyResult) body = `<div class="np-result"><span class="np-result-icon">${this.dailyResult.known ? icon('check') : icon('repeat')}</span><h4>${this.dailyResult.known ? 'Marked Know' : 'Marked Not yet'}</h4><p><span lang="zh-Hans">${escape(character.han)}</span> · ${escape(character.py || '')}</p><p>${escape(character.en || '')}</p><p class="np-muted">Your response stays in this browser preview.</p></div><div class="np-stack">${button('next-character', `Next character ${icon('arrow')}`, 'np-primary')}${button('daily-again', 'Repeat this character', 'np-outline')}</div>`;
      else body = `<div class="np-recall-card"><p class="np-kicker">What does this mean?</p><span class="np-glyph" lang="zh-Hans">${escape(character.han)}</span>${this.dailyRevealed ? this.meaningHTML(character) : '<p class="np-muted">Recall the reading and meaning.</p>'}</div>${this.dailyRevealed ? `<div class="np-grade-actions">${button('daily-grade', 'Not yet', 'np-outline', 'data-known="false"')}${button('daily-grade', 'Know', 'np-primary', 'data-known="true"')}</div>` : button('daily-reveal', 'Reveal answer', 'np-primary np-wide')}`;
      return `<p class="np-kicker">A character, in three steps</p>${this.characterPicker()}<div class="np-steps" role="group" aria-label="Daily character steps">${steps.map((step, index) => button('daily-step', `<span>${index + 1}</span>${step}`, this.dailyStep === index ? 'is-selected' : '', `data-step="${index}" aria-pressed="${this.dailyStep === index}"`)).join('')}</div>${body}<div class="np-section-line">${button('open-quick', 'Quick test', 'np-text-button')}${button('next-character', 'Change character', 'np-text-button')}</div>`;
    }
    contextHTML(card) {
      if (!card) return '<div class="np-empty"><h4>No context card in this selection</h4><p>Try another character from the selector.</p></div>';
      return `<article class="np-context"><p class="np-kicker">From a bundled lesson</p><p class="np-sentence" lang="zh-Hans">${this.sentenceCharacters(card.zh)}</p>${card.pinyin ? `<p class="np-pinyin">${escape(card.pinyin)}</p>` : ''}${card.en ? `<p class="np-translation">${escape(card.en)}</p>` : ''}${this.audioHTML(card)}<p class="np-source-note">${escape(this.source(card.source_id || card.sourceId || 'native-lessons')?.name || 'Bundled lesson')}</p><div class="np-context-links">${button('card-source', 'Card source', 'np-text-button', `data-card="${escape(card.id)}"`)}${this.view !== 'sentence' ? button('open-sentence', 'Character notes', 'np-text-button', `data-card="${escape(card.id)}"`) : ''}</div></article>`;
    }
    audioHTML(card) {
      return card?.audio ? button('audio', `${icon('sound')}<span data-audio-label>Listen</span>`, 'np-audio np-outline', `data-card="${escape(card.id)}" aria-label="Listen to sentence"`) : '<p class="np-muted np-recording-note">No audio recording in this selection.</p>';
    }
    pictureLayers(character = this.character()) {
      const picture = character?.picture;
      return array(picture?.layers || picture?.originalPictureRecipe?.layers).map(layer => ({...layer, object: this.objects.get(String(layer.objectId))})).filter(layer => layer.object);
    }
    pictureHTML(character = this.character()) {
      const layers = this.pictureLayers(character);
      if (!layers.length) return `<div class="np-art-stage np-no-art"><p>No source picture is included for <span lang="zh-Hans">${escape(character?.han || '')}</span>.</p><p class="np-muted">Use Character or Shape to continue.</p></div>`;
      const description = layers.map(layer => layer.object.annotation).filter(Boolean).join(', ');
      return `<div class="np-art-stage" role="img" aria-label="${escape(`Source picture for ${character.han}${description ? ': ' + description : ''}`)}"><div class="np-art-canvas">${layers.map(layer => `<img class="np-art-image" src="${escape(layer.object.file)}" alt="" loading="lazy" draggable="false" style="left:${number(layer.x, .5, 0, 1) * 100}%;top:${number(layer.y, .5, 0, 1) * 100}%;width:${number(layer.scale, .82, .01, 2) * 100}%;transform:translate(-50%,-50%) rotate(${number(layer.rotation, 0, -360, 360)}deg)">`).join('')}</div></div>`;
    }
    rememberHTML() {
      const character = this.character();
      return `${this.characterPicker()}<div class="np-character-heading"><span lang="zh-Hans">${escape(character.han)}</span><div>${character.py ? `<p class="np-pinyin">${escape(character.py)}</p>` : ''}<p>${escape(character.en || '')}</p></div></div><div class="np-tabs" role="group" aria-label="Remember view">${['picture','character','shape'].map(tab => pill('memory-tab', tab[0].toUpperCase() + tab.slice(1), this.memoryTab === tab, `data-tab="${tab}"`)).join('')}</div>${this.memoryTab === 'picture' ? this.pictureHTML(character) : this.memoryTab === 'character' ? this.glyphHTML(character) : this.structureHTML(character)}<div class="np-source-action">${button('picture-credits', 'Picture & character credits', 'np-text-button')}</div><div class="np-stack">${button('open-components', `Explore components ${icon('arrow')}`, 'np-outline')}${button('open-vocabulary', `Related vocabulary ${icon('arrow')}`, 'np-outline')}</div>`;
    }
    componentLeaves(formation) {
      const leaves = [];
      const visit = (node, depth = 0) => {
        if (!node || depth > 8) return;
        if (node.han) leaves.push(node.han);
        else array(node.children).forEach(child => visit(child, depth + 1));
      };
      visit(formation?.layout);
      return [...new Set(leaves.length ? leaves : hanCharacters(formation?.decomposition))].slice(0, 16);
    }
    structureHTML(character = this.character()) {
      const formation = this.formation(character);
      if (!formation) return '<p class="np-empty">No sourced formation record is included for this character.</p>';
      const etymology = formation.etymology || {};
      const tokens = this.componentLeaves(formation);
      return `<section class="np-structure"><div class="np-structure-glyph" lang="zh-Hans">${escape(character.han)}</div>${tokens.length ? '<p class="np-kicker np-component-caption">Components</p>' : ''}${tokens.length ? `<p class="np-muted">Tap a sourced component to inspect it.</p><div class="np-component-tokens">${tokens.map(han => button('inspect', `<span lang="zh-Hans">${escape(han)}</span>`, 'np-component-token', `data-han="${escape(han)}" aria-label="Inspect component ${escape(han)}"`)).join('')}</div>` : ''}${metadata([['Radical', formation.radical], ['Type', etymology.type], ['Semantic', etymology.semantic], ['Phonetic', etymology.phonetic]])}${etymology.hint ? `<blockquote class="np-source-hint">${escape(etymology.hint)}</blockquote>` : ''}${technicalDetails([['Decomposition', formation.decomposition]], formation, 'character formation')}<p class="np-source-note">${escape(this.formationSource(character)?.name || 'Source record unavailable')}</p></section>`;
    }
    componentsHTML() {
      return `${this.characterPicker()}<div class="np-tabs" role="group" aria-label="Component view">${pill('component-tab', 'Structure', this.componentTab === 'structure', 'data-tab="structure"')}${pill('component-tab', 'Source', this.componentTab === 'source', 'data-tab="source"')}</div>${this.componentTab === 'structure' ? this.structureHTML() : `${this.formation()?.definition ? `<p class="np-source-definition">${escape(this.formation().definition)}</p>` : ''}${metadata([['Source pinyin', this.formation()?.pinyin]])}${this.characterSourceHTML()}`}<div class="np-stack">${button('open-remember', 'Picture & character', 'np-outline')}${button('open-vocabulary', 'Related vocabulary', 'np-outline')}</div>`;
    }
    filteredWords() {
      const query = this.query.trim().toLocaleLowerCase();
      const words = Array.from(this.words.values());
      if (!query) return words;
      return words.filter(word => [word.simplified, word.traditional, word.pinyin_display, word.pinyin, word.pinyin_search, ...array(word.definitions)].join('\n').toLocaleLowerCase().includes(query));
    }
    wordDefinitions(word) { return array(word.definitions).filter(definition => typeof definition === 'string' && definition.trim() !== ''); }
    wordExamples(word) { return records(word.examples).filter(example => (typeof example.zh === 'string' && example.zh.trim()) || (typeof example.en === 'string' && example.en.trim())); }
    wordListHTML() {
      const words = this.filteredWords();
      if (!words.length) return `<div class="np-empty"><p>${this.words.size ? 'No matches in this preview selection.' : 'No vocabulary records in this selection.'}</p>${this.query ? button('clear-search', 'Show all preview words', 'np-outline') : ''}</div>`;
      return words.map(word => button('word', `<span class="np-word-head"><span lang="zh-Hans">${escape(word.simplified)}</span>${word.hsk_level ? `<span class="np-badge">HSK ${escape(word.hsk_level)}</span>` : ''}</span><span class="np-word-pinyin">${escape(word.pinyin_display || 'Reading not supplied')}</span><span class="np-word-summary">${escape(this.wordDefinitions(word).length ? this.wordDefinitions(word).join('; ') : 'No definition supplied by this source.')}</span>${icon('arrow')}`, 'np-word-row', `data-word="${escape(word.id)}"`)).join('');
    }
    vocabularyHTML() {
      const words = this.filteredWords();
      return `<p class="np-kicker">Preview selection</p><label class="np-search">${icon('search')}<input type="search" data-word-search value="${escape(this.query)}" placeholder="Character, pinyin, or meaning" aria-label="Search the preview vocabulary selection" autocomplete="off" spellcheck="false"></label><p class="np-selection-count" data-word-count>${words.length} of ${this.words.size} supplied words</p><div class="np-word-list" data-word-list>${this.wordListHTML()}</div><p class="np-source-note">This searches the supplied preview selection. The app’s full dictionary is separate.</p>${button('all-sources', 'Dictionary sources & licenses', 'np-text-button')}`;
    }
    wordHTML() {
      const word = this.words.get(String(this.wordId));
      if (!word) return `<div class="np-empty"><h4>Word unavailable</h4>${button('back', 'Back to vocabulary', 'np-outline')}</div>`;
      const examples = this.wordExamples(word);
      const exampleGap = examples.length < array(word.examples).length ? '<p class="np-muted">Some example records are unavailable in this preview selection.</p>' : '';
      let content;
      if (this.wordTab === 'examples') content = `${exampleGap}${examples.length ? examples.map(example => {
        const source = this.source(example.source_id);
        return `<article class="np-example">${example.zh ? `<p class="np-example-zh" lang="zh-Hans">${this.sentenceCharacters(example.zh)}</p>` : '<p class="np-muted">No Chinese text supplied for this example.</p>'}<p>${escape(example.en || 'No English text supplied for this example.')}</p><p class="np-example-authors">${example.zh_author ? `Chinese: ${escape(example.zh_author)}` : 'Chinese author not supplied'}<br>${example.en_author ? `English: ${escape(example.en_author)}` : 'English author not supplied'}</p>${source ? `<p class="np-source-note">${link(source.url, source.name || source.id)}${source.license ? ` · ${link(source.license_url || source.licenseUrl, source.license)}` : ''}</p>` : '<p class="np-source-note">No source record supplied for this example.</p>'}${!example.attribution ? '<p class="np-source-note">No attribution supplied for this example.</p>' : ''}${technicalDetails([['Chinese record', example.zh_id], ['English record', example.en_id], ['Source', example.source_id], ['Attribution', example.attribution]], example, 'sentence example')}</article>`;
      }).join('') : '<p class="np-empty">No attributable examples are included for this word in the preview selection.</p>'}`;
      else if (this.wordTab === 'sources') content = `${this.sourceHTML(this.source(word.source_id), [['Source record', word.source_record_id]], word)}${examples.map(example => this.source(example.source_id)).filter((source, index, sources) => source && sources.indexOf(source) === index).map(source => this.sourceHTML(source)).join('')}${exampleGap}${examples.some(example => !this.source(example.source_id)) ? '<p class="np-muted">No source record is supplied for one or more examples.</p>' : ''}`;
      else content = `${word.traditional && word.traditional !== word.simplified ? `<p class="np-muted">Traditional: <span lang="zh-Hant">${escape(word.traditional)}</span></p>` : ''}${this.wordDefinitions(word).length ? `<ol class="np-definitions">${this.wordDefinitions(word).map(definition => `<li>${escape(definition)}</li>`).join('')}</ol>` : '<p class="np-empty">No definition is included in the supplied record.</p>'}<p class="np-source-note">${escape(this.source(word.source_id)?.name || 'Source record unavailable')}</p>`;
      return `<div class="np-word-detail-heading"><span lang="zh-Hans">${escape(word.simplified)}</span>${word.pinyin_display ? `<p class="np-pinyin">${escape(word.pinyin_display)}</p>` : '<p class="np-muted">No reading supplied in this source record.</p>'}</div><div class="np-tabs np-word-tabs" role="group" aria-label="Word details">${pill('word-tab', 'Meaning', this.wordTab === 'definitions', 'data-tab="definitions"')}${pill('word-tab', `Examples (${examples.length})`, this.wordTab === 'examples', 'data-tab="examples"')}${pill('word-tab', 'Sources', this.wordTab === 'sources', 'data-tab="sources"')}</div>${content}`;
    }
    quickHTML() {
      const quick = this.quick;
      if (!quick?.queue.length) return '<p class="np-empty">No characters are available for this preview test.</p>';
      if (quick.index >= quick.queue.length) {
        const known = quick.grades.filter(grade => grade.known);
        const missed = quick.grades.filter(grade => !grade.known);
        return `<div class="np-result"><span class="np-result-icon">${icon('check')}</span><h4>Practice recap</h4><p class="np-score">${known.length}<span> / ${quick.grades.length}</span></p><p>marked Know</p></div>${missed.length ? `<section class="np-recap-missed"><h4>Not yet</h4><div class="np-component-tokens">${missed.map(grade => button('inspect', `<span lang="zh-Hans">${escape(grade.han)}</span>`, 'np-component-token', `data-han="${escape(grade.han)}" aria-label="Inspect ${escape(grade.han)}"`)).join('')}</div></section>` : '<p class="np-muted np-center">Every character was marked Know.</p>'}<div class="np-stack">${missed.length ? button('quick-retry-missed', 'Retry Not yet', 'np-primary') : ''}${button('quick-repeat', 'Repeat this selection', missed.length ? 'np-outline' : 'np-primary')}</div><p class="np-source-note">Repeat uses this same preview selection. These responses do not change phone progress.</p>`;
      }
      const character = this.characters.get(quick.queue[quick.index]);
      return `<div class="np-practice-heading"><p class="np-kicker">Recall the reading and meaning</p><span>${quick.index + 1} / ${quick.queue.length}</span></div><div class="np-progress" role="progressbar" aria-label="Quick test progress" aria-valuemin="0" aria-valuemax="${quick.queue.length}" aria-valuenow="${quick.index}"><span style="width:${quick.index / quick.queue.length * 100}%"></span></div><div class="np-quick-card" data-swipe-card data-turn="${this.turn()}"><span class="np-glyph" lang="zh-Hans">${escape(character.han)}</span>${quick.revealed ? this.meaningHTML(character) : '<p class="np-muted">Take a moment to remember.</p>'}</div>${quick.revealed ? `<p class="np-swipe-hint">← Not yet <span>Swipe or choose</span> Know →</p><div class="np-grade-actions">${button('quick-grade', 'Not yet', 'np-outline', `data-known="false" data-turn="${this.turn()}"`)}${button('quick-grade', 'Know', 'np-primary', `data-known="true" data-turn="${this.turn()}"`)}</div>` : button('quick-reveal', 'Reveal answer', 'np-primary np-wide', `data-turn="${this.turn()}"`)}<p class="np-source-note">Practice is local to this browser panel.</p>`;
    }
    sentenceCharacters(text) {
      return Array.from(String(text ?? '')).map(char => /\p{Script=Han}/u.test(char) ? button('inspect', escape(char), 'np-inline-han', `data-han="${escape(char)}" aria-label="Inspect character ${escape(char)}" lang="zh-Hans"`) : `<span>${escape(char)}</span>`).join('');
    }
    sentenceHTML() {
      const card = this.card();
      if (!card) return '<p class="np-empty">No lesson sentence is included in this selection.</p>';
      const literal = array(card.lit);
      return `<p class="np-kicker">Read it from left to right</p>${this.contextHTML(card)}${literal.length ? `<section class="np-literal"><h4>Character notes</h4>${literal.map(item => `<div>${item.han ? button('inspect', escape(item.han), 'np-literal-han', `data-han="${escape(item.han)}" aria-label="Inspect character ${escape(item.han)}" lang="zh-Hans"`) : ''}<div>${item.py || item.pinyin ? `<p class="np-pinyin">${escape(item.py || item.pinyin)}</p>` : ''}<p>${escape(item.en || item.meaning || '')}</p></div></div>`).join('')}</section>` : ''}<p class="np-source-note">Tap a character in the sentence to inspect the supplied source record.</p>`;
    }
    charactersHTML() {
      return `<p class="np-kicker">Preview character selection</p><div class="np-character-grid">${Array.from(this.characters.values()).map(character => button('character', `<span lang="zh-Hans">${escape(character.han)}</span><span>${escape(character.py || '')}</span><span>${escape(character.en || '')}</span>`, '', `data-han="${escape(character.han)}"`)).join('')}</div><div class="np-stack">${button('open-quick', 'Start a quick test', 'np-primary')}${button('nav', 'Browse vocabulary', 'np-outline', 'data-view="vocabulary"')}</div>`;
    }
    profileHTML() {
      const known = this.practice.filter(grade => grade.known).length;
      return `<p class="np-kicker">Your browser practice</p><div class="np-profile-stats"><div><strong>${this.practice.length}</strong><span>responses</span></div><div><strong>${known}</strong><span>Know</span></div><div><strong>${this.practice.length - known}</strong><span>Not yet</span></div></div><p class="np-muted">Only this panel, for this visit. This preview does not save or change progress in the native app.</p><h4 class="np-section-heading">Preview settings</h4><div class="np-setting"><div><strong>Appearance</strong><span>${this.theme === 'light' ? 'Light' : 'Dark'} theme</span></div>${button('theme', `Use ${this.theme === 'light' ? 'dark' : 'light'}`, 'np-outline')}</div><div class="np-stack">${button('open-quick', 'Quick test', 'np-primary')}${button('reset-preview', 'Reset this browser practice', 'np-outline')}${button('all-sources', 'Content sources & licenses', 'np-outline')}</div>`;
    }

    controlIdentity(element) {
      if (!element?.dataset) return null;
      if (element.matches?.('[data-character-picker]')) return {characterPicker: ''};
      const identity = Object.fromEntries(Object.entries(element.dataset).filter(([key]) => ['action','han','tab','step','view','word','card','turn','known'].includes(key)));
      return Object.keys(identity).length ? identity : null;
    }
    findControl(identity) {
      if (identity.characterPicker !== undefined) return this.host.querySelector('[data-character-picker]');
      return Array.from(this.host.querySelectorAll('[data-action]')).find(element => !element.closest('[inert]') && Object.entries(identity).every(([key, value]) => element.dataset[key] === value));
    }
    openModal(kind, options = {}, trigger) {
      if (!this.modal) this.restoreControl = this.controlIdentity(trigger || document.activeElement);
      this.modal = {kind, ...options};
      this.render();
    }
    closeModal() {
      const restore = this.restoreControl;
      this.modal = null;
      this.render();
      if (restore) this.findControl(restore)?.focus({preventScroll: true});
    }
    modalHTML() {
      const modal = this.modal;
      let title = 'Sources & licenses';
      let content = '';
      if (modal.kind === 'expand') {
        title = 'Character';
        const character = this.characters.get(modal.han);
        content = `<div class="np-expanded-glyph" lang="zh-Hans">${escape(modal.han)}</div>${this.meaningHTML(character)}${this.characterSourceHTML(character)}`;
      } else if (modal.kind === 'inspect') {
        title = `Character ${modal.han}`;
        const character = this.characters.get(modal.han);
        content = `<div class="np-inspect-glyph" lang="zh-Hans">${escape(modal.han)}</div>${character ? this.meaningHTML(character) : '<p>No sourced character record is included for this glyph in the preview selection.</p>'}<div class="np-inspect-actions">${character ? button('inspect-remember', 'Open Picture & character', 'np-primary np-wide', `data-han="${escape(modal.han)}"`) : ''}${button('inspect-vocabulary', 'Find in preview vocabulary', 'np-outline np-wide', `data-han="${escape(modal.han)}"`)}</div>${character ? `${this.structureHTML(character)}${this.characterSourceHTML(character)}` : ''}`;
      } else if (modal.kind === 'picture-credits') {
        title = 'Picture & character credits';
        const character = this.character();
        const picture = character?.picture || {};
        const recipe = picture.originalPictureRecipe || picture;
        const objects = this.pictureLayers(character).map(layer => layer.object).filter((object, index, all) => all.indexOf(object) === index);
        content = `${objects.length ? `<h4>Picture objects</h4>${objects.map(object => `<article class="np-source"><strong>${escape(object.annotation || object.id)}</strong>${object.author ? `<p class="np-artist">Artwork by ${escape(object.author)}</p>` : '<p class="np-muted">No artist attribution supplied.</p>'}${object.sourceUrl ? `<p>${link(object.sourceUrl, 'Original artwork')}</p>` : ''}${object.license ? `<p class="np-license">${link(object.licenseUrl, object.license)}</p>` : ''}${technicalDetails([['Object', object.id], ['Source file', object.sourceFile], ['SHA-256', object.sha256]], object, object.annotation || object.id)}</article>`).join('')}${recipe.dictionarySourceId ? this.sourceHTML(this.source(recipe.dictionarySourceId), [['Recipe', recipe.id], ['Source record', recipe.sourceRecordId]], recipe) : technicalDetails([], recipe, 'picture recipe')}` : '<p>No picture objects are included for this character.</p>'}${this.characterSourceHTML(character)}`;
      } else if (modal.kind === 'card-source') {
        title = 'Lesson card source';
        const card = this.cards.get(String(modal.card));
        content = card ? `${this.sourceHTML(this.source(card.source_id || card.sourceId || 'native-lessons'), [['Lesson', card.sourceLessonId], ['Card', card.sourceCardId || card.id], ['Preview record', card.id], ['Catalog SHA-256', card.sourceCatalogSha256], ['Audio SHA-256', card.audioSha256]], card)}` : '<p>This card is not included in the preview selection.</p>';
      } else content = this.data.sources.length ? this.data.sources.map(source => this.sourceHTML(source)).join('') : '<p>No source records are included in this selection.</p>';
      return `<div class="np-modal-backdrop"><section class="np-dialog" role="dialog" aria-modal="true" aria-labelledby="${this.id}-dialog-title"><header><h4 id="${this.id}-dialog-title">${escape(title)}</h4>${button('close-modal', icon('close'), 'np-icon-button', 'aria-label="Close dialog"')}</header><div class="np-dialog-content">${content}</div></section></div>`;
    }

    click(event) {
      const control = event.target.closest?.('[data-action]');
      if (!control || !this.host.contains(control) || control.closest('[inert]')) return;
      const action = control.dataset.action;
      if (action === 'retry-load') { this.load(true); return; }
      if (!this.data || this.loading) return;
      switch (action) {
        case 'back': this.back(); break;
        case 'home': this.navigate('daily'); break;
        case 'nav': this.navigate(control.dataset.view); break;
        case 'theme': this.theme = this.theme === 'light' ? 'dark' : 'light'; this.render(); break;
        case 'daily-step': this.dailyStep = number(control.dataset.step, 0, 0, 2); this.render({top: true}); break;
        case 'next-character': this.nextCharacter(); break;
        case 'daily-reveal': this.dailyRevealed = true; this.render({motion: 'reveal'}); this.host.querySelector('[data-action="daily-grade"]')?.focus({preventScroll: true}); break;
        case 'daily-grade':
          if (!this.dailyRevealed || this.dailyResult) break;
          this.dailyResult = {han: this.han, known: control.dataset.known === 'true'};
          this.practice.push({han: this.han, known: this.dailyResult.known});
          this.render({top: true, focusHeading: true}); break;
        case 'daily-again': this.dailyRevealed = false; this.dailyResult = null; this.render({top: true}); break;
        case 'open-remember': this.navigate('remember'); break;
        case 'open-components': this.navigate('components'); break;
        case 'open-vocabulary': this.navigate('vocabulary', {query: this.han}); break;
        case 'open-quick': this.resetQuick(); this.navigate('quick'); break;
        case 'open-sentence': this.navigate('sentence', {cardId: control.dataset.card}); break;
        case 'memory-tab': this.memoryTab = control.dataset.tab; this.render(); break;
        case 'component-tab': this.componentTab = control.dataset.tab; this.render(); break;
        case 'word-tab': this.wordTab = control.dataset.tab; this.render({top: true}); break;
        case 'word': this.navigate('word', {wordId: control.dataset.word}); break;
        case 'clear-search': this.query = ''; this.render(); this.host.querySelector('[data-word-search]')?.focus({preventScroll: true}); break;
        case 'character': this.navigate('remember', {han: control.dataset.han}); break;
        case 'quick-reveal':
          if (control.dataset.turn !== this.turn() || this.quick.revealed) break;
          this.quick.revealed = true; this.render({motion: 'reveal'}); this.host.querySelector('[data-action="quick-grade"]')?.focus({preventScroll: true}); break;
        case 'quick-grade': this.gradeQuick(control.dataset.known === 'true', control.dataset.turn); break;
        case 'quick-retry-missed': this.resetQuick(this.quick.grades.filter(grade => !grade.known).map(grade => grade.han)); this.render({top: true, focusHeading: true}); break;
        case 'quick-repeat': this.resetQuick([...this.quick.queue]); this.render({top: true, focusHeading: true}); break;
        case 'expand': this.openModal('expand', {han: control.dataset.han}, control); break;
        case 'inspect': this.openModal('inspect', {han: control.dataset.han}, control); break;
        case 'picture-credits': this.openModal('picture-credits', {}, control); break;
        case 'all-sources': this.openModal('all-sources', {}, control); break;
        case 'card-source': this.openModal('card-source', {card: control.dataset.card}, control); break;
        case 'close-modal': this.closeModal(); break;
        case 'inspect-remember': this.navigate('remember', {han: control.dataset.han}); break;
        case 'inspect-vocabulary': this.navigate('vocabulary', {query: control.dataset.han}); break;
        case 'audio': this.playAudio(this.cards.get(String(control.dataset.card))); break;
        case 'reset-preview':
          this.practice = []; this.resetQuick(); this.dailyResult = null; this.dailyRevealed = false; this.dailyStep = 0;
          this.dailySession = {...this.dailySession, step: 0, revealed: false, result: null};
          for (const entry of this.history) if (entry.daily) entry.daily = {...entry.daily, step: 0, revealed: false, result: null};
          this.render(); this.announce('Browser practice reset.'); break;
      }
    }
    input(event) {
      if (event.target.matches?.('[data-character-picker]')) { this.setCharacter(event.target.value); return; }
      if (!event.target.matches?.('[data-word-search]')) return;
      this.query = event.target.value;
      const list = this.host.querySelector('[data-word-list]');
      const count = this.host.querySelector('[data-word-count]');
      if (list) list.innerHTML = this.wordListHTML();
      if (count) count.textContent = `${this.filteredWords().length} of ${this.words.size} supplied words`;
      this.contentMarkup = this.content();
    }
    keydown(event) {
      if (!this.modal) return;
      if (event.key === 'Escape') { event.preventDefault(); this.closeModal(); return; }
      if (event.key !== 'Tab') return;
      const controls = Array.from(this.host.querySelectorAll('.np-dialog button, .np-dialog a[href], .np-dialog summary, .np-dialog input, .np-dialog select')).filter(control => !control.disabled && !control.hidden && (!control.getClientRects || control.getClientRects().length > 0));
      if (!controls.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    pointerDown(event) {
      const card = event.target.closest?.('[data-swipe-card]');
      if (!card || this.view !== 'quick' || !this.quick.revealed || event.isPrimary === false || (event.button !== undefined && event.button !== 0) || event.target.closest('button, a, input, select, textarea')) return;
      this.pointer = {id: event.pointerId, x: event.clientX, y: event.clientY, card, turn: this.turn(), horizontal: false};
    }
    pointerMove(event) {
      const pointer = this.pointer;
      if (!pointer || pointer.id !== event.pointerId) return;
      const dx = event.clientX - pointer.x;
      const dy = event.clientY - pointer.y;
      if (Math.abs(dy) > 12 && Math.abs(dy) >= Math.abs(dx)) { this.cancelSwipe(); return; }
      if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        pointer.horizontal = true;
        pointer.card.style.transform = `translateX(${Math.max(-70, Math.min(70, dx))}px) rotate(${Math.max(-5, Math.min(5, dx / 20))}deg)`;
      }
    }
    pointerUp(event) {
      const pointer = this.pointer;
      if (!pointer || pointer.id !== event.pointerId) return;
      const dx = event.clientX - pointer.x;
      const dy = event.clientY - pointer.y;
      this.cancelSwipe();
      if (Math.abs(dx) >= 55 && Math.abs(dx) > Math.abs(dy) * 1.5) this.gradeQuick(dx > 0, pointer.turn);
    }
    cancelSwipe() {
      if (this.pointer?.card) this.pointer.card.style.transform = '';
      this.pointer = null;
    }
    announce(message) {
      const status = this.host.querySelector('[data-announcement]');
      if (status) status.textContent = message;
    }
    audioUI(state) {
      for (const control of this.host.querySelectorAll('[data-action="audio"]')) {
        const playing = state === 'playing' || state === 'loading';
        control.setAttribute('aria-label', playing ? 'Stop sentence audio' : 'Listen to sentence');
        control.setAttribute('aria-pressed', String(playing));
        const label = control.querySelector('[data-audio-label]');
        if (label) label.textContent = state === 'loading' ? 'Loading… · Stop' : playing ? 'Stop audio' : 'Listen';
      }
    }
    async playAudio(card) {
      if (!card?.audio || !/^\/assets\/native-preview\/audio\/[^?#]+$/.test(card.audio)) { this.announce('No local recording is available for this sentence.'); return; }
      if (activeAudio?.owner === this && activeAudio.cardId === card.id) { stopAudio(); return; }
      stopAudio();
      window.dispatchEvent(new CustomEvent('chinese101:audio-start', {detail: {owner: 'native-preview'}}));
      const element = new Audio(card.audio);
      const playback = {element, owner: this, cardId: card.id};
      activeAudio = playback;
      playback.timeout = setTimeout(() => {
        if (activeAudio !== playback) return;
        stopAudio(); this.announce('The recording took too long to start. Try Listen again.');
      }, 8000);
      element.preload = 'none';
      element.addEventListener('ended', () => { if (activeAudio === playback) stopAudio(); }, {once: true});
      element.addEventListener('error', () => {
        if (activeAudio !== playback) return;
        stopAudio(); this.announce('The recording could not be played. Try Listen again.');
      }, {once: true});
      this.audioUI('loading');
      try {
        await element.play();
        clearTimeout(playback.timeout);
        if (activeAudio === playback && !this.destroyed && this.host.isConnected && !document.hidden) this.audioUI('playing');
        else if (activeAudio === playback) stopAudio();
      } catch (_) {
        if (activeAudio !== playback) return;
        stopAudio(); this.announce('The recording could not be played. Try Listen again.');
      }
    }
    destroy() {
      this.destroyed = true;
      this.cancelMotion();
      this.motionPreference?.removeEventListener?.('change', this.onMotionPreference);
      if (activeAudio?.owner === this) stopAudio();
      this.cancelSwipe();
      this.host.removeEventListener('click', this.onClick);
      this.host.removeEventListener('input', this.onInput);
      this.host.removeEventListener('change', this.onInput);
      this.host.removeEventListener('keydown', this.onKeydown);
      this.host.removeEventListener('pointerdown', this.onPointerDown);
      this.host.removeEventListener('pointermove', this.onPointerMove);
      this.host.removeEventListener('pointerup', this.onPointerUp);
      this.host.removeEventListener('pointercancel', this.onPointerCancel);
      instances.delete(this);
    }
  }

  function start() {
    document.querySelectorAll('[data-native-preview]').forEach(host => new Preview(host));
    document.addEventListener('visibilitychange', () => { if (document.hidden) stopAudio(); });
    window.addEventListener('pagehide', stopAudio);
    window.addEventListener('chinese101:audio-start', event => {
      if (event.detail?.owner !== 'native-preview') stopAudio();
    });
    if (typeof MutationObserver !== 'undefined' && document.body) new MutationObserver(() => {
      for (const preview of instances) if (!preview.host.isConnected) preview.destroy();
    }).observe(document.body, {childList: true, subtree: true});
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {once: true});
  else start();
})();
