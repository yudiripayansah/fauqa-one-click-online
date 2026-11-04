/* =========================================================
   PSI — animasi ringan untuk section PSI.
   1) Elemen .psi-reveal muncul halus saat di-scroll.
   2) Slider hero video (psi-hero-video).
   3) Pilihan kota di peta cabang (psi-branch-map).
   Bekerja juga di editor tema Shopify (shopify:section:load).
   ========================================================= */
(function () {
  if (window.PSI && window.PSI.ready) return;
  document.documentElement.classList.add('psi-js');
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function reveal(root) {
    var items = (root || document).querySelectorAll('.psi-reveal:not(.is-in)');
    if (reduce || !('IntersectionObserver' in window)) {
      items.forEach(function (el) { el.classList.add('is-in'); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
      });
    }, { rootMargin: '0px 0px -10% 0px' });
    if (root) root.psiObserver = io;
    items.forEach(function (el, i) {
      el.style.transitionDelay = (el.dataset.psiDelay || 0) + 'ms';
      io.observe(el);
    });
  }

  function hero(root) {
    (root || document).querySelectorAll('[data-psi-hero]').forEach(function (el) {
      if (el.psiInit) return;
      el.psiInit = true;
      var slides = el.querySelectorAll('.psi-hero__slide');
      var bars = el.querySelectorAll('.psi-hero__bar');
      var toggle = el.querySelector('.psi-hero__toggle');
      var delay = (parseInt(el.dataset.interval, 10) || 7) * 1000;
      var i = 0, timer = null, playing = !reduce;

      function show(n) {
        slides.forEach(function (s, k) {
          var on = k === n;
          s.classList.toggle('is-active', on);
          s.setAttribute('aria-hidden', on ? 'false' : 'true');
          s.inert = !on;
          var v = s.querySelector('video');
          if (v) { if (on && playing) { v.play().catch(function () {}); } else { v.pause(); } }
        });
        bars.forEach(function (b, k) {
          b.classList.remove('is-done', 'is-run', 'is-hold');
          void b.offsetWidth; /* mulai ulang animasi garis */
          if (k < n) b.classList.add('is-done');
          if (k === n) b.classList.add(playing ? 'is-run' : 'is-hold');
          b.setAttribute('aria-current', k === n ? 'true' : 'false');
        });
        el.style.setProperty('--psi-interval', delay + 'ms');
        i = n;
      }
      function start() { stop(); if (playing && slides.length > 1) timer = setInterval(function () { show((i + 1) % slides.length); }, delay); }
      function stop() { if (timer) clearInterval(timer); timer = null; }

      bars.forEach(function (b, k) { b.addEventListener('click', function () { show(k); start(); }); });
      if (toggle) {
        toggle.addEventListener('click', function () {
          playing = !playing;
          toggle.setAttribute('aria-pressed', playing ? 'false' : 'true');
          toggle.setAttribute('aria-label', playing ? toggle.dataset.labelPause : toggle.dataset.labelPlay);
          el.classList.toggle('is-paused', !playing);
          show(i); start();
        });
      }
      el.psiCleanup = function () { stop(); el.querySelectorAll('video').forEach(function (v) { v.pause(); }); };
      el.psiSelect = function (blockId) {
        var n = Array.from(slides).findIndex(function (slide) { return slide.dataset.fauqaBlock === blockId; });
        if (n >= 0) { playing = false; stop(); show(n); }
      };
      show(0); start();
    });
  }

  function branches(root) {
    (root || document).querySelectorAll('[data-psi-branch]').forEach(function (el) {
      if (el.psiInit) return;
      el.psiInit = true;
      var btns = el.querySelectorAll('[data-city]');
      var pins = el.querySelectorAll('[data-pin]');
      function pick(id) {
        btns.forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.city === id ? 'true' : 'false'); });
        pins.forEach(function (p) { p.classList.toggle('is-active', p.dataset.pin === id); });
      }
      btns.forEach(function (b) { b.addEventListener('click', function () { pick(b.dataset.city); }); });
      if (btns[0]) pick(btns[0].dataset.city);
    });
  }

  function init(root) { reveal(root); hero(root); branches(root); }

  window.PSI = { ready: true, init: init };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { init(); });
  else init();
  document.addEventListener('fauqa:section:load', function (e) { init(e.target); });
  document.addEventListener('fauqa:section:unload', function (e) {
    if (e.target.psiObserver) e.target.psiObserver.disconnect();
    e.target.querySelectorAll('[data-psi-hero]').forEach(function (el) { if (el.psiCleanup) el.psiCleanup(); });
  });
  document.addEventListener('fauqa:block:select', function (e) {
    var hero = e.target.closest('[data-psi-hero]');
    if (hero && hero.psiSelect) hero.psiSelect(e.detail.blockId);
  });
  document.addEventListener('click', function (e) {
    document.querySelectorAll('details.psi-wa[open]').forEach(function (d) { if (!d.contains(e.target)) d.open = false; });
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') document.querySelectorAll('details.psi-wa[open], details.psi-hd__mobile[open]').forEach(function (d) { d.open = false; d.querySelector('summary').focus(); });
  });
})();
