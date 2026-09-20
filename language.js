(() => {
  'use strict';
  const key = 'chinese101.language';
  const spanish = location.pathname === '/es' || location.pathname.startsWith('/es/');
  const language = spanish ? 'es' : 'en';
  // Explicit language URLs always win. The saved choice applies to later visits.
  if (!spanish) {
    try {
      if (localStorage.getItem(key) === 'es' && !new URL(location.href).searchParams.has('language')) {
        location.replace('/es' + location.pathname + location.search + location.hash);
        return;
      }
    } catch (_) { /* The links still work when browser storage is unavailable. */ }
  }
  document.addEventListener('click', event => {
    const link = event.target.closest('a[data-language]');
    if (!link) return;
    try { localStorage.setItem(key, link.dataset.language); } catch (_) { /* URL persists this visit. */ }
  });
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-language]').forEach(link => {
      if (link.dataset.language === language) link.setAttribute('aria-current', 'true');
    });
  });
})();
