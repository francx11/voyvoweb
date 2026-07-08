/* Voy Volando — web pública. Sin frameworks: fetch + IntersectionObserver. */
(function () {
  'use strict';

  var $ = function (sel) { return document.querySelector(sel); };
  var $$ = function (sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); };

  /* ── Modo oscuro: sigue al sistema salvo elección manual (localStorage) ── */
  (function initTheme() {
    var KEY = 'vv_theme';
    var root = document.documentElement;
    var btn = $('#theme-toggle');
    var saved = null;
    try { saved = localStorage.getItem(KEY); } catch (e) { /* almacenamiento bloqueado */ }
    if (saved === 'dark' || saved === 'light') {
      root.setAttribute('data-theme', saved);
      syncToggle(saved === 'dark');
    } else {
      syncToggle(window.matchMedia('(prefers-color-scheme: dark)').matches);
    }
    function syncToggle(isDark) {
      btn.setAttribute('aria-pressed', String(isDark));
      btn.setAttribute('aria-label', isDark ? 'Activar modo claro' : 'Activar modo oscuro');
    }
    btn.addEventListener('click', function () {
      var current = root.getAttribute('data-theme') ||
        (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
      var next = current === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      syncToggle(next === 'dark');
      try { localStorage.setItem(KEY, next); } catch (e) { /* almacenamiento bloqueado */ }
    });
  })();

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function precioFmt(n) { return Number(n).toFixed(2).replace('.', ',') + ' €'; }

  var SITE = {}; // contenido editable cargado de /api/site

  /* ── Nav móvil accesible ────────────────────────────── */
  var navToggle = $('#nav-toggle');
  var nav = $('#site-nav');
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

  /* ── Reveals sutiles ────────────────────────────────── */
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var io = null;
  if (!reduced && 'IntersectionObserver' in window) {
    io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px' });
  }
  function observeReveals(scope) {
    $$((scope || '') + ' .reveal').forEach(function (el) {
      if (io) io.observe(el);
      else el.classList.add('in');
    });
  }
  observeReveals('');

  /* ── Contenido editable (/api/site) ─────────────────── */
  function setText(sel, val) {
    if (!val) return;
    $$(sel).forEach(function (el) { el.textContent = val; });
  }

  function applySite(s) {
    SITE = s || {};
    if (s.hero) {
      setText('#hero-eyebrow', s.hero.eyebrow);
      if (s.hero.titulo1 || s.hero.titulo2) {
        $('#hero-titulo').innerHTML =
          esc(s.hero.titulo1 || 'Pizza') + ' <em>' + esc(s.hero.titulo2 || 'auténtica.') + '</em>';
      }
      setText('#hero-sub', s.hero.sub);
    }
    if (s.historia) {
      setText('#hist-titulo', s.historia.titulo);
      setText('#hist-p1', s.historia.parrafo1);
      setText('#hist-p2', s.historia.parrafo2);
    }
    setText('.js-direccion', s.direccion);
    setText('.js-poblacion', s.poblacion);
    setText('.js-email', s.email);
    if (s.email) $$('.js-email-link').forEach(function (a) { a.href = 'mailto:' + s.email; });
    if (s.telefono) {
      var telHref = 'tel:' + s.telefono.replace(/[^\d+]/g, '');
      $$('.js-tel-link, .js-order').forEach(function (a) { a.href = telHref; });
      setText('.js-tel', s.telefono);
    }
    if (s.horarios && !/^PENDIENTE/i.test(s.horarios)) {
      $('#ct-horarios').textContent = s.horarios;
      $('#horarios-item').hidden = false;
    }
    // Diferenciador: pedido por WhatsApp si hay número
    if (s.whatsapp) {
      var wa = 'https://wa.me/' + s.whatsapp + '?text=' +
        encodeURIComponent('Hola, quiero hacer un pedido');
      $$('.js-order').forEach(function (a) {
        a.href = wa; a.target = '_blank'; a.rel = 'noopener';
        if (a.dataset.waLabel) a.textContent = a.dataset.waLabel;
      });
    }
  }

  /* ── Carta: productos o PDF ─────────────────────────── */
  var excluir = new Set();

  function renderCarta(pizzas) {
    var lista = $('#menu-list');
    var visibles = pizzas.filter(function (p) { return p.activa !== false; })
      .filter(function (p) {
        var al = p.alergenos || [];
        for (var a of excluir) if (al.indexOf(a) !== -1) return false;
        return true;
      });
    if (!visibles.length) {
      lista.innerHTML = '<li class="menu-empty">Ninguna pizza cumple ese filtro. ' +
        'Llámanos y te la preparamos a medida.</li>';
      return;
    }
    lista.innerHTML = visibles.map(function (p) {
      return '<li class="menu-item">' +
        '<div class="menu-line">' +
          '<span class="menu-name">' + esc(p.nombre) + '</span>' +
          (p.tag ? '<span class="menu-tag">' + esc(p.tag) + '</span>' : '') +
          '<span class="menu-dots" aria-hidden="true"></span>' +
          (p.precio != null ? '<span class="menu-price">' + precioFmt(p.precio) + '</span>' : '') +
        '</div>' +
        (p.descripcion ? '<p class="menu-desc">' + esc(p.descripcion) + '</p>' : '') +
        ((p.alergenos && p.alergenos.length)
          ? '<p class="menu-alerg"><strong>Alérgenos:</strong> ' + p.alergenos.map(esc).join(', ') + '</p>'
          : '') +
      '</li>';
    }).join('');
  }

  function initFiltros(pizzas) {
    var todos = [];
    pizzas.forEach(function (p) {
      (p.alergenos || []).forEach(function (a) { if (todos.indexOf(a) === -1) todos.push(a); });
    });
    if (!todos.length) return;
    var box = $('#filtros');
    todos.forEach(function (a) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip';
      b.setAttribute('aria-pressed', 'false');
      b.textContent = 'Sin ' + a;
      b.addEventListener('click', function () {
        var on = b.getAttribute('aria-pressed') !== 'true';
        b.setAttribute('aria-pressed', String(on));
        if (on) excluir.add(a); else excluir.delete(a);
        renderCarta(pizzas);
      });
      box.appendChild(b);
    });
    box.hidden = false;
  }

  function loadCarta() {
    // Modo PDF: el cliente sube su carta en PDF desde el panel
    if (SITE.carta && SITE.carta.modo === 'pdf' && SITE.carta.pdf) {
      $('#carta-productos').hidden = true;
      var pdfBox = $('#carta-pdf');
      pdfBox.hidden = false;
      $('#carta-pdf-link').href = SITE.carta.pdf;
      return;
    }
    fetch('/api/carta')
      .then(function (r) { return r.json(); })
      .then(function (pizzas) {
        if (!pizzas.length) return;
        initFiltros(pizzas);
        renderCarta(pizzas);
      })
      .catch(function () { /* API no disponible: sección queda con mensaje por defecto */ });
  }

  /* ── Pizza del mes ──────────────────────────────────── */
  function loadPizzaMes() {
    fetch('/api/pizzames')
      .then(function (r) { return r.json(); })
      .then(function (pm) {
        if (!pm.activa || !pm.nombre) return;
        $('#pm-nombre').textContent = pm.nombre;
        $('#pm-desc').textContent = pm.descripcion || '';
        if (pm.badge) { $('#pm-badge').textContent = pm.badge; $('#pm-badge').hidden = false; }
        if (pm.cta) $('#pm-cta').textContent = pm.cta;
        $('#pizzames').hidden = false;
        observeReveals('#pizzames');
      })
      .catch(function () {});
  }

  /* ── Galería ────────────────────────────────────────── */
  function loadGaleria() {
    fetch('/api/galeria')
      .then(function (r) { return r.json(); })
      .then(function (files) {
        var grid = $('#galeria-grid');
        if (!files.length) {
          $('#galeria-empty').hidden = false;
          return;
        }
        grid.innerHTML = files.map(function (f, i) {
          return '<div class="galeria-cell">' +
            '<img src="' + f.url + '" alt="' + esc(f.alt || 'Pizzería Voy Volando, Santa Fe') + '"' +
            (i > 1 ? ' loading="lazy"' : '') + '>' +
          '</div>';
        }).join('');
        grid.hidden = false;
      })
      .catch(function () {});
  }

  /* ── Reseñas Google ─────────────────────────────────── */
  function estrellas(n) {
    var r = Math.round(n || 0);
    return '★★★★★'.slice(0, r) + '☆☆☆☆☆'.slice(0, 5 - r);
  }
  function loadResenas() {
    fetch('/api/reviews')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data.configured || !data.reviews || !data.reviews.length) return;
        $('#res-nota').textContent = data.rating || '';
        $('#res-estrellas').textContent = estrellas(data.rating);
        $('#res-total').textContent = (data.total || 0) + ' reseñas en Google';
        $('#resenas-grid').innerHTML = data.reviews.map(function (r) {
          return '<article class="resena">' +
            '<div class="r-head">' +
              '<div><div class="r-nombre">' + esc(r.author_name) + '</div>' +
              '<div class="r-fecha">' + esc(r.relative_time_description || '') + '</div></div>' +
              '<div class="r-estrellas" aria-label="' + (r.rating || 0) + ' de 5">' + estrellas(r.rating) + '</div>' +
            '</div>' +
            '<p class="r-texto">' + esc(r.text || '') + '</p>' +
          '</article>';
        }).join('');
        $('#resenas').hidden = false;
        observeReveals('#resenas');
      })
      .catch(function () {});
  }

  /* ── Formulario: compone WhatsApp o email reales ────── */
  $('#contact-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var nombre = $('#f-nombre').value.trim();
    var tel = $('#f-tel').value.trim();
    var motivo = $('#f-motivo').value;
    var msg = $('#f-msg').value.trim();
    var texto = 'Hola, soy ' + nombre + (tel ? ' (' + tel + ')' : '') + '.\n' +
      (motivo ? 'Motivo: ' + motivo + '.\n' : '') + (msg || '');
    if (SITE.whatsapp) {
      window.open('https://wa.me/' + SITE.whatsapp + '?text=' + encodeURIComponent(texto),
        '_blank', 'noopener');
    } else {
      var email = SITE.email || 'info@voyvolandosantafe.com';
      window.location.href = 'mailto:' + email +
        '?subject=' + encodeURIComponent('Consulta desde la web — ' + (motivo || 'general')) +
        '&body=' + encodeURIComponent(texto);
    }
  });

  /* ── Init ───────────────────────────────────────────── */
  fetch('/api/site')
    .then(function (r) { return r.json(); })
    .then(applySite)
    .catch(function () {})
    .then(function () {
      loadCarta();
      loadPizzaMes();
      loadGaleria();
      loadResenas();
    });
})();
