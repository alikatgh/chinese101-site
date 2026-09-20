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
    if (!title || !details) { status.textContent = "Por favor, añade un resumen y algunos detalles."; return; }
    const subject = `[Chinese 101 · ${form.elements.kind.value}] ${title}`;
    const body = details + "\n\n—\nEnviado desde el formulario de comentarios de la página web Chinese 101.";
    const link = document.createElement('a');
    link.className = 'button';
    link.textContent = "Abrir borrador de correo electrónico ↗";
    link.href = 'mailto:chinese@aulenor.com?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
    const note = document.createElement('p');
    note.textContent = "Tu mensaje está listo, pero aún no se ha enviado. Abre el borrador que aparece arriba y envíalo desde tu aplicación de correo electrónico. Si no se abre ninguna aplicación, envía un correo electrónico a chinese@aulenor.com con el texto anterior.";
    status.replaceChildren(link, note);
    link.focus();
  });
})();
