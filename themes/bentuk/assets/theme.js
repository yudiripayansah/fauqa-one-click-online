// Menu mobile. Dipanggil ulang saat section dimuat ulang di theme editor.
function initHeader(root = document) {
  const btn = root.querySelector('.site-header__toggle');
  const nav = root.querySelector('#site-nav');
  if (!btn || !nav) return;
  btn.addEventListener('click', () => {
    const open = btn.getAttribute('aria-expanded') !== 'true';
    btn.setAttribute('aria-expanded', String(open));
    nav.classList.toggle('is-open', open);
  });
}
initHeader();
document.addEventListener('fauqa:section:load', (e) => initHeader(e.target));
