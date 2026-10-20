// Skrip jembatan theme editor (PRD §4.3), disisipkan ke {{ content_for_header }} hanya di mode desain.
// Berjalan di origin situs (iframe); bicara dengan editor di origin admin lewat postMessage (origin dicek dua arah).
// Pesan masuk:  { type: 'render', key, file, sectionId, overrides } · { type: 'select', key, block }
// Pesan keluar: { type: 'ready' } · { type: 'select', key, block } · { type: 'rendered', key }
function bridge(C) {
  const post = (m) => parent.postMessage({ __fauqa: true, ...m }, C.appOrigin);
  const css = document.createElement('style');
  css.textContent = '[data-fauqa-section]{cursor:pointer}[data-fauqa-section]:hover{outline:1px dashed #2448c9;outline-offset:-1px}'
    + '.fauqa-selected{outline:2px solid #2448c9!important;outline-offset:-2px;position:relative}';
  document.head.appendChild(css);

  const byKey = (key) => document.getElementById(`fauqa-section-${key}`);
  const fire = (el, name, detail) => el?.dispatchEvent(new CustomEvent(`fauqa:${name}`, { bubbles: true, detail }));
  let current = null;
  function select(key, block, scroll) {
    const section = byKey(key);
    const el = block ? section?.querySelector(`[data-fauqa-block="${CSS.escape(block)}"]`) : section;
    if (current && current !== el) {
      current.classList.remove('fauqa-selected');
      fire(current, current.dataset.fauqaBlock ? 'block:deselect' : 'section:deselect', {});
    }
    current = el ?? null;
    if (!el) return;
    el.classList.add('fauqa-selected');
    fire(el, block ? 'block:select' : 'section:select', { sectionId: key, blockId: block });
    if (scroll) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  // Klik di preview memilih section/block; link & form tidak dijalankan agar tetap di halaman ini.
  document.addEventListener('click', (e) => {
    if (e.target.closest('a, button, label, summary')) e.preventDefault();
    const b = e.target.closest('[data-fauqa-block]');
    const s = e.target.closest('[data-fauqa-section]');
    if (!s) return;
    e.preventDefault();
    const key = (b ?? s).dataset.fauqaSection;
    select(key, b?.dataset.fauqaBlock ?? null, false);
    post({ type: 'select', key, block: b?.dataset.fauqaBlock ?? null });
  }, true);
  document.addEventListener('submit', (e) => e.preventDefault(), true);

  window.addEventListener('message', async (e) => {
    if (e.origin !== C.appOrigin || !e.data?.__fauqa) return;
    const m = e.data;
    if (m.type === 'select') select(m.key, m.block, true);
    if (m.type === 'render') {
      const res = await fetch(C.renderUrl, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: C.token, path: C.path, view: C.view, overrides: m.overrides, file: m.file, sectionId: m.sectionId }),
      });
      const old = byKey(m.key);
      if (!res.ok || !old) return;
      const tpl = document.createElement('template');
      tpl.innerHTML = await res.text();
      const el = tpl.content.firstElementChild;
      if (!el) return;
      fire(old, 'section:unload', { sectionId: m.key });
      old.replaceWith(el);
      fire(el, 'section:load', { sectionId: m.key });
      if (current && !document.contains(current)) select(m.key, current.dataset?.fauqaBlock ?? null, false);
      post({ type: 'rendered', key: m.key });
    }
  });
  post({ type: 'ready' });
}

export const bridgeScript = (config) =>
  `<script>(${bridge.toString()})(${JSON.stringify(config).replace(/</g, '\\u003c')});</script>`;
