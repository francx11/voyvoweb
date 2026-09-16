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
})();
