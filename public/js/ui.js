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

  /* Posición al recargar. Safari restaura el scroll antes de que main.js
     pinte la carta y las ofertas (llegan por fetch y meten ~10 000 px por
     encima), así que al recargar a media página te dejaba casi al final.
     Se restaura a mano, cuando la altura de la página deja de crecer. */
  if ('scrollRestoration' in history) {
    history.scrollRestoration = 'manual';
    var scrollKey = 'vv-scroll:' + location.pathname;
    var jumpTo = function (y) {
      var prev = root.style.scrollBehavior;
      root.style.scrollBehavior = 'auto';
      window.scrollTo(0, y);
      root.style.scrollBehavior = prev;
    };
    // Espera a que el alto se quede quieto (3 lecturas iguales, máx. 3 s).
    var whenSettled = function (fn) {
      var last = -1;
      var same = 0;
      var tries = 0;
      var timer = setInterval(function () {
        var h = root.scrollHeight;
        same = h === last ? same + 1 : 0;
        last = h;
        if (same >= 3 || ++tries > 30) {
          clearInterval(timer);
          fn();
        }
      }, 100);
    };
    window.addEventListener('pagehide', function () {
      try { sessionStorage.setItem(scrollKey, String(Math.round(window.scrollY))); } catch (e) { /* modo privado */ }
    });
    window.addEventListener('load', function () {
      var nav = performance.getEntriesByType && performance.getEntriesByType('navigation')[0];
      var saved = null;
      try { saved = sessionStorage.getItem(scrollKey); } catch (e) { /* modo privado */ }
      if (nav && (nav.type === 'reload' || nav.type === 'back_forward') && saved !== null) {
        whenSettled(function () { jumpTo(Number(saved) || 0); });
      } else if (location.hash.length > 1) {
        // Ancla (/#offers, /#story…): el navegador saltó antes de pintarse
        // la carta; se recoloca cuando el contenido ya está.
        whenSettled(function () {
          var target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
          if (target) target.scrollIntoView();
        });
      }
    });
  }

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
     tabindex). Los botones avanzan una "página" (1, 2 o 4 fotos según el
     ancho). Nada se mueve solo.
     Accesibilidad: los botones usan aria-disabled (no disabled) para no perder
     el foco al llegar al final; el contador visible dice dónde estás y, tras
     pulsar un botón, una región aria-live lo anuncia una vez; los botones de
     nombre de las fotos que no se ven salen del orden del tabulador. */
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var announceFor = null;
  var announceTimer = 0;
  function carouselOf(el) {
    var box = el.closest('.dish-carousel');
    return box && box.querySelector('[data-carousel]');
  }
  // Qué fotos se ven: primera (desde 0), cuántas caben y cuánto mide un paso.
  function viewOf(track) {
    var slides = track.children;
    var n = slides.length;
    if (!n) return { n: 0, first: 0, per: 1, step: track.clientWidth };
    var gap = parseFloat(getComputedStyle(track).columnGap) || 0;
    var step = slides[0].getBoundingClientRect().width + gap;
    var per = Math.max(1, Math.round((track.clientWidth + gap) / step));
    var first = Math.min(n - 1, Math.max(0, Math.round(track.scrollLeft / step)));
    return { n: n, first: first, per: per, last: Math.min(n, first + per), step: step };
  }
  function rangeText(v) {
    return v.last - v.first <= 1 ? (v.first + 1) + ' de ' + v.n : (v.first + 1) + '–' + v.last + ' de ' + v.n;
  }
  function setDisabled(btn, off) {
    if (btn) btn.setAttribute('aria-disabled', String(off));
  }
  function syncCarousel(track) {
    var box = track.closest('.dish-carousel');
    if (!box) return;
    var v = viewOf(track);
    var max = track.scrollWidth - track.clientWidth - 8;
    setDisabled(box.querySelector('[data-carousel-prev]'), track.scrollLeft <= 8);
    setDisabled(box.querySelector('[data-carousel-next]'), track.scrollLeft >= max);
    // Sin nada que pasar (pocas fotos en pantalla ancha), los botones sobran.
    box.classList.toggle('dish-carousel--static', max <= 0);
    var count = box.querySelector('[data-carousel-count]');
    if (count) count.textContent = rangeText(v);
    for (var i = 0; i < v.n; i++) {
      var b = track.children[i].querySelector('button');
      if (b) b.tabIndex = i >= v.first && i < v.last ? 0 : -1;
    }
    if (announceFor === track) {
      clearTimeout(announceTimer);
      announceTimer = setTimeout(function () { announce(track); }, 300);
    }
  }
  function announce(track, text) {
    announceFor = null;
    var status = track.closest('.dish-carousel').querySelector('[data-carousel-status]');
    if (!status) return;
    var v = viewOf(track);
    var name = track.children[v.first] && track.children[v.first].querySelector('.dish-carousel-name');
    status.textContent = text || (v.last - v.first <= 1 && name
      ? 'Foto ' + rangeText(v) + ': ' + name.textContent
      : 'Fotos ' + rangeText(v).replace('–', ' a '));
  }
  document.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('[data-carousel-prev], [data-carousel-next]');
    if (!btn) return;
    var track = carouselOf(btn);
    if (!track) return;
    var next = btn.hasAttribute('data-carousel-next');
    if (btn.getAttribute('aria-disabled') === 'true') {
      announce(track, next ? 'Ya estás en la última foto.' : 'Ya estás en la primera foto.');
      return;
    }
    var v = viewOf(track);
    announceFor = track;
    track.scrollBy({
      left: (next ? 1 : -1) * v.per * v.step,
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
  window.addEventListener('load', syncAll);
  syncAll();

  /* ── Índice de categorías de /carta/ (.carta-nav) ──────
     Los enlaces funcionan solos (anclas). Esto solo añade dos cosas: la altura
     real de la cabecera en --header-h, para que el índice se pegue justo
     debajo, y marcar con aria-current la categoría que se está leyendo,
     deslizando la fila para que su píldora quede a la vista. */
  var header = document.querySelector('.site-header');
  function syncHeaderHeight() {
    if (header) document.documentElement.style.setProperty('--header-h', header.offsetHeight + 'px');
  }
  syncHeaderHeight();
  window.addEventListener('resize', syncHeaderHeight);

  var cartaNav = document.querySelector('.carta-nav');
  if (cartaNav && 'IntersectionObserver' in window) {
    var pills = {};
    cartaNav.querySelectorAll('a[href^="#"]').forEach(function (a) {
      pills[a.getAttribute('href').slice(1)] = a;
    });
    var current = null;
    var mark = function (id) {
      if (id === current || !pills[id]) return;
      if (current && pills[current]) pills[current].removeAttribute('aria-current');
      current = id;
      var pill = pills[id];
      pill.setAttribute('aria-current', 'true');
      var list = pill.parentNode.parentNode;
      if (list.scrollWidth > list.clientWidth) {
        var offset = pill.getBoundingClientRect().left - list.getBoundingClientRect().left;
        list.scrollTo({ left: list.scrollLeft + offset - (list.clientWidth - pill.offsetWidth) / 2, behavior: 'smooth' });
      }
    };
    // Una sección «se está leyendo» cuando cruza la franja alta de la pantalla.
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) mark(entry.target.getAttribute('aria-labelledby'));
      });
    }, { rootMargin: '-25% 0px -70% 0px' });
    document.querySelectorAll('.carta-group[aria-labelledby]').forEach(function (s) { io.observe(s); });
  }

  /* Vídeos de ambiente (fondo del hero de la portada): sin autoplay en el
     HTML. Se reproducen solo mientras se ven, para no gastar datos del móvil
     en un vídeo que nadie mira, y nunca con «reducir movimiento»: ahí se
     queda el póster. Sin <source> (aún no hay vídeo) play() falla y también
     se queda el póster, que es lo que se quiere. */
  var ambient = document.querySelectorAll('.js-ambient-video');
  if (ambient.length && 'IntersectionObserver' in window) {
    var still = window.matchMedia('(prefers-reduced-motion: reduce)');
    var vio = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        var v = entry.target;
        if (entry.isIntersecting && !still.matches) {
          var p = v.play();
          if (p && p.catch) p.catch(function () {});
        } else {
          v.pause();
        }
      });
    }, { threshold: 0.25 });
    ambient.forEach(function (v) { vio.observe(v); });
  }

  /* Mapa del pie: el iframe de Google Maps se crea solo al pulsar «Ver mapa».
     Así, quien solo mira la web no le pasa su IP a Google sin pedirlo. */
  document.querySelectorAll('.footer-map').forEach(function (box) {
    var btn = box.querySelector('.footer-map-load');
    if (!btn) return;
    btn.addEventListener('click', function () {
      var frame = document.createElement('iframe');
      frame.src = box.getAttribute('data-map-src');
      frame.title = 'Mapa: Pizzería Voy Volando en Santa Fe (Granada)';
      frame.loading = 'lazy';
      frame.referrerPolicy = 'no-referrer-when-downgrade';
      frame.className = 'footer-map-frame';
      box.classList.add('is-loaded');
      box.querySelector('.footer-map-art').replaceWith(frame);
      btn.remove();
      var note = box.querySelector('.footer-map-note');
      if (note) note.remove();
    });
  });

  // El hero solo cambia a modo vídeo cuando el vídeo se está viendo de verdad.
  document.querySelectorAll('.js-hero-video').forEach(function (v) {
    v.addEventListener('playing', function () {
      var hero = v.closest('.hero');
      if (hero) hero.classList.add('hero--video');
    });
  });
})();
