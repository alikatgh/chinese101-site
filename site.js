(() => {
  'use strict';
  const measurementId = 'G-E9VX9X1WFM';
  const consentKey = 'chinese101.analytics.v1';
  let consent = null;
  let loaded = false;
  let previousFocus = null;
  try {
    const saved = JSON.parse(localStorage.getItem(consentKey));
    if (saved && Date.now() - saved.at < 180 * 86400000 && ['granted', 'denied'].includes(saved.value)) consent = saved.value;
  } catch (_) { /* Browsing and consent controls work without local storage. */ }

  function startAnalytics() {
    if (loaded || consent !== 'granted' || !/^G-[A-Z0-9]+$/.test(measurementId) || location.hostname !== 'chinese.aulenor.com') return;
    loaded = true;
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window['ga-disable-' + measurementId] = false;
    window.gtag('consent', 'default', {analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied'});
    window.gtag('consent', 'update', {analytics_storage: 'granted'});
    window.gtag('js', new Date());
    let referrer = '';
    try { referrer = new URL(document.referrer).origin; } catch (_) { /* No referrer. */ }
    window.gtag('config', measurementId, {
      page_location: location.origin + location.pathname,
      page_referrer: referrer,
      cookie_domain: location.hostname,
      cookie_expires: 60 * 60 * 24 * 180,
      allow_google_signals: false,
      allow_ad_personalization_signals: false
    });
    const tag = document.createElement('script');
    tag.async = true;
    tag.src = 'https://www.googletagmanager.com/gtag/js?id=' + measurementId;
    document.head.appendChild(tag);
  }
  function track(name, parameters) {
    if (consent === 'granted' && loaded) window.gtag('event', name, parameters);
  }
  const panel = document.createElement('section');
  panel.className = 'cookie-panel';
  panel.hidden = !!consent || !measurementId;
  panel.setAttribute('aria-label', 'Website analytics choices');
  panel.innerHTML = '<strong>A little insight, with your permission.</strong><p>Allow Google Analytics to help us understand visits and feature interest? Optional cookies stay off until you choose. <a href="/privacy/#website-analytics">Privacy details</a></p><div class="cookie-actions"><button type="button" data-consent="denied">No thanks</button><button type="button" data-consent="granted">Allow analytics</button></div>';
  document.body.appendChild(panel);
  panel.addEventListener('click', (event) => {
    const button = event.target.closest('[data-consent]');
    if (!button) return;
    const wasGranted = consent === 'granted';
    consent = button.dataset.consent;
    try { localStorage.setItem(consentKey, JSON.stringify({value: consent, at: Date.now()})); } catch (_) { /* Session-only choice. */ }
    if (consent === 'denied') {
      window['ga-disable-' + measurementId] = true;
      for (const part of document.cookie.split(';')) {
        const name = part.trim().split('=')[0];
        if (name === '_ga' || name.startsWith('_ga_')) {
          for (const domain of ['', '; domain=' + location.hostname, '; domain=.' + location.hostname]) document.cookie = name + '=; Max-Age=0; path=/' + domain;
        }
      }
    } else startAnalytics();
    panel.hidden = true;
    if (previousFocus) previousFocus.focus();
    // Reload on withdrawal so an already loaded Google tag cannot keep firing.
    if (wasGranted && consent === 'denied') location.reload();
  });
  document.querySelectorAll('[data-privacy-settings]').forEach(button => button.addEventListener('click', () => {
    previousFocus = button;
    panel.hidden = false;
    panel.querySelector('button').focus();
  }));
  const meanings = {rain: ['yǔ', 'rain'], mountain: ['shān', 'mountain'], person: ['rén', 'person']};
  document.querySelectorAll('[data-character]').forEach(button => button.addEventListener('click', () => {
    document.querySelectorAll('[data-character]').forEach(other => other.setAttribute('aria-pressed', String(other === button)));
    const [pinyin, meaning] = meanings[button.dataset.character];
    const output = document.getElementById('character-meaning');
    output.replaceChildren();
    const bold = document.createElement('b'); bold.textContent = pinyin;
    output.append(bold, ' · ' + meaning);
    track('character_preview', {character: button.dataset.character});
  }));
  document.querySelectorAll('[data-track]').forEach(link => link.addEventListener('click', () => track('cta_click', {cta: link.dataset.track})));
  startAnalytics();
})();
