(() => {
  'use strict';
  const form = document.getElementById('feedback-form');
  if (form.hidden) return; // Enable once the receiving mailbox is verified.
  const status = document.getElementById('feedback-status');
  form.addEventListener('input', () => status.replaceChildren());
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const title = form.elements.title.value.trim().replace(/[\r\n]+/g, ' ');
    const details = form.elements.details.value.trim();
    if (!title || !details) { status.textContent = 'Please add a summary and a little detail.'; return; }
    const subject = `[Chinese 101 · ${form.elements.kind.value}] ${title}`;
    const body = details + '\n\n—\nSent from the Chinese 101 website feedback form.';
    const link = document.createElement('a');
    link.className = 'button';
    link.textContent = 'Open email draft ↗';
    link.href = 'mailto:chinese@aulenor.com?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
    const note = document.createElement('p');
    note.textContent = 'Your message is ready, but has not been sent. Open the draft above, then send it from your email app. If no app opens, email chinese@aulenor.com using the text above.';
    status.replaceChildren(link, note);
    link.focus();
  });
})();
