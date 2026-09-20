(() => {
  'use strict';
  const key = 'chinese101.language';
  const match = location.pathname.match(/^\/(es|vi)(?:\/|$)/);
  const language = match ? match[1] : 'en';
  const vietnamesePaths = new Set(['/', '/learn/', '/support/', '/privacy/', '/terms/']);
  // Explicit translated URLs take precedence over a previously saved choice.
  if (!match) {
    try {
      const saved = localStorage.getItem(key);
      if (['es', 'vi'].includes(saved) && !new URL(location.href).searchParams.has('language')) {
        const path = saved === 'vi' && !vietnamesePaths.has(location.pathname) ? '/' : location.pathname;
        location.replace('/' + saved + path + location.search + location.hash);
        return;
      }
    } catch (_) { /* Language links also work without storage. */ }
  }
  document.addEventListener('click', event => {
    const link = event.target.closest('a[data-language]');
    if (!link) return;
    try { localStorage.setItem(key, link.dataset.language); } catch (_) { /* URL remains explicit. */ }
  });
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-language]').forEach(link => {
      if (link.dataset.language === language) link.setAttribute('aria-current', 'true');
    });
  });
})();
