(() => {
  'use strict';
  document.querySelectorAll('[data-copy-report]').forEach(button => {
    const code = document.getElementById(button.dataset.copyReport);
    const status = button.closest('.report-template')?.querySelector('.copy-status');
    if (!code || !status) return;
    button.hidden = false;
    button.addEventListener('click', async () => {
      if (button.disabled) return;
      button.disabled = true;
      status.textContent = '';
      try {
        if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
        await navigator.clipboard.writeText(code.textContent);
        status.textContent = 'Report copied. Replace the bracketed fields before sending.';
      } catch (_) {
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(code);
        selection?.removeAllRanges();
        selection?.addRange(range);
        code.closest('pre').focus();
        status.textContent = 'Report selected. Copy the selected text with your browser or keyboard.';
      } finally {
        button.disabled = false;
      }
    });
  });
})();
