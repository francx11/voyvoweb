/* Voy Volando — cromo compartido de la cabecera: modo oscuro y menú móvil.
 *
 * Vive aparte de main.js porque lo cargan dos tipos de página muy distintos:
 * la portada, que además pinta la carta desde /api, y las páginas estáticas
 * (/carta/, /contacto/), que no tienen contenido dinámico pero sí la misma
 * barra de navegación. Con un solo fichero las dos se comportan igual —
 * mismo botón de tema, mismo hamburguesa — sin duplicar la lógica.
 *
 * No toca contenido: si esto no carga, la página sigue siendo legible y los
 * enlaces siguen funcionando.
 */
(function () {
  'use strict';

  var root = document.documentElement;

  /* ── Modo oscuro: sigue al sistema salvo que se fuerce a mano (localStorage) ── */
  var themeBtn = document.getElementById('theme-toggle');
  if (themeBtn) {
    var KEY = 'vv_theme';
    var saved = null;
    try { saved = localStorage.getItem(KEY); } catch (e) { /* storage blocked */ }
    if (saved === 'dark' || saved === 'light') {
      root.setAttribute('data-theme', saved);
      syncToggle(saved === 'dark');
    } else {
      syncToggle(window.matchMedia('(prefers-color-scheme: dark)').matches);
    }
    themeBtn.addEventListener('click', function () {
      var current = root.getAttribute('data-theme') ||
        (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
      var next = current === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      syncToggle(next === 'dark');
      try { localStorage.setItem(KEY, next); } catch (e) { /* storage blocked */ }
    });
  }
  function syncToggle(isDark) {
    themeBtn.setAttribute('aria-pressed', String(isDark));
    themeBtn.setAttribute('aria-label', isDark ? 'Activar modo claro' : 'Activar modo oscuro');
  }

  /* ── Menú móvil accesible ───────────────────────────── */
  var navToggle = document.getElementById('nav-toggle');
  var nav = document.getElementById('site-nav');
  if (navToggle && nav) {
    navToggle.addEventListener('click', function () {
      var open = nav.classList.toggle('open');
      navToggle.setAttribute('aria-expanded', String(open));
    });
    nav.addEventListener('click', function (e) {
      if (e.target.tagName === 'A') {
        nav.classList.remove('open');
        navToggle.setAttribute('aria-expanded', 'false');
      }
    });
  }

  /* ── Carrusel de fotos de platos ([data-carousel]) ──────
     Portada (lo pinta main.js después de cargar la carta) y /carta/ (viene en
     el HTML). Por delegación, así vale para los dos. La pista es una lista con
     scroll y snap: se pasa deslizando o con las flechas del teclado (tiene
     tabindex). Los botones avanzan una "página" y se desactivan en los extremos.
     Nada se mueve solo. */
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  function carouselOf(el) {
    var box = el.closest('.dish-carousel');
    return box && box.querySelector('[data-carousel]');
  }
  function syncCarousel(track) {
    var box = track.closest('.dish-carousel');
    if (!box) return;
    var prev = box.querySelector('[data-carousel-prev]');
    var next = box.querySelector('[data-carousel-next]');
    var max = track.scrollWidth - track.clientWidth - 8;
    if (prev) prev.disabled = track.scrollLeft <= 8;
    if (next) next.disabled = track.scrollLeft >= max;
    // Sin nada que pasar (pocas fotos en pantalla ancha), los botones sobran.
    box.classList.toggle('dish-carousel--static', max <= 0);
  }
  document.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('[data-carousel-prev], [data-carousel-next]');
    if (!btn) return;
    var track = carouselOf(btn);
    if (!track) return;
    var dir = btn.hasAttribute('data-carousel-next') ? 1 : -1;
    track.scrollBy({
      left: dir * track.clientWidth * 0.85,
      behavior: reduceMotion.matches ? 'auto' : 'smooth',
    });
  });
  // scroll no burbujea: se escucha en captura para las pistas que aún no existen.
  document.addEventListener('scroll', function (e) {
    if (e.target.matches && e.target.matches('[data-carousel]')) syncCarousel(e.target);
  }, true);
  function syncAll() {
    document.querySelectorAll('[data-carousel]').forEach(syncCarousel);
  }
  window.addEventListener('resize', syncAll);
  if ('MutationObserver' in window) {
    new MutationObserver(function (records) {
      for (var i = 0; i < records.length; i++) {
        if (records[i].target.id === 'dish-carousel') { syncAll(); return; }
      }
    }).observe(document.body, { childList: true, subtree: true });
  }
  syncAll();
})();
