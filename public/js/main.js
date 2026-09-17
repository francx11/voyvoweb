/* Voy Volando — public website. No frameworks: fetch + IntersectionObserver. */
(function () {
  'use strict';

  var $ = function (sel) { return document.querySelector(sel); };
  var $$ = function (sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); };

  /* El modo oscuro y el menú hamburguesa viven en js/ui.js: los comparten la
     portada y las páginas estáticas (/carta/, /contacto/), que llevan la misma
     cabecera pero ninguno del contenido que se pinta aquí. */

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function formatPrice(n) { return Number(n).toFixed(2).replace('.', ',') + ' €'; }

  // Shared with cart.js: helpers + the menu/ordering data it fetches once
  // here rather than re-fetching. Kept to the minimum surface cart.js needs.
  var VV = window.VV = window.VV || {};
  VV.esc = esc;
  VV.formatPrice = formatPrice;

  /* ── API endpoints ────────────────────────────────────
     Two deployments share this file: the Express server, where /api/menu is
     a live route, and the static export on GitHub Pages, where the same
     payloads are frozen next to the HTML as /api/menu.json. window.VV_STATIC
     is injected by scripts/build-static.mjs; everything below asks for URLs
     through apiUrl() so neither build needs its own copy of the file. ── */
  var STATIC = window.VV_STATIC === true;
  function apiUrl(name) { return '/api/' + name + (STATIC ? '.json' : ''); }

  var SITE = {}; // editable content loaded from /api/site
  var orderingConfig = null; // /api/ordering/config, needed to price/render orderable items

  /* ── Subtle reveals ─────────────────────────────────── */
  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var io = null;
  if (!reducedMotion && 'IntersectionObserver' in window) {
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

  /* ── Editable content (/api/site) ───────────────────── */
  function setText(sel, val) {
    if (!val) return;
    $$(sel).forEach(function (el) { el.textContent = val; });
  }

  function applySite(s) {
    SITE = s || {};
    if (s.hero) {
      setText('#hero-eyebrow', s.hero.eyebrow);
      if (s.hero.title1 || s.hero.title2) {
        $('#hero-title').innerHTML =
          esc(s.hero.title1 || 'Pizza') + ' <em>' + esc(s.hero.title2 || 'auténtica.') + '</em>';
      }
      setText('#hero-sub', s.hero.sub);
    }
    if (s.story) {
      setText('#story-title', s.story.title);
      setText('#story-p1', s.story.paragraph1);
      setText('#story-p2', s.story.paragraph2);
    }
    setText('.js-address', s.address);
    setText('.js-city', s.city);
    setText('.js-email', s.email);
    if (s.email) $$('.js-email-link').forEach(function (a) { a.href = 'mailto:' + s.email; });
    if (s.phone) {
      var telHref = 'tel:' + s.phone.replace(/[^\d+]/g, '');
      $$('.js-tel-link, .js-order').forEach(function (a) { a.href = telHref; });
      setText('.js-phone', s.phone);
    }
    if (s.hours && !/^PENDIENTE/i.test(s.hours)) {
      $('#hours-value').textContent = s.hours;
      $('#hours-item').hidden = false;
    }
  }

  /* ── Menu: products or PDF ──────────────────────────── */
  var excludedAllergens = new Set();

  // A size label like "Pequeña 30cm" reads better in a price line abbreviated
  // to just "Pequeña" — the cm is redundant next to the price.
  function shortSizeLabel(label) {
    var stripped = String(label || '').replace(/\s*\d+(?:[.,]\d+)?\s*cm\.?\s*$/i, '').trim();
    return stripped || label;
  }
  function priceNum(n) { return Number(n).toFixed(2).replace('.', ','); }

  // Non-breaking spaces glue each size to its price so, when the line wraps
  // on narrow screens, breaks only happen between sizes (at the " · ").
  function sizesPriceLine(sizes) {
    return sizes.map(function (s) {
      var suffix = s.fulfillment === 'pickup' ? ' (solo recoger)' :
        s.fulfillment === 'delivery' ? ' (solo domicilio)' : '';
      return esc(shortSizeLabel(s.label)) + esc(suffix) + ' ' + priceNum(s.price);
    }).join(' · ') + ' €';
  }

  // Resolves what price text to show, using ordering.json for tier/sizes
  // pricing (the item itself only stores a tierId or a sizes array).
  function priceDisplay(p) {
    var pricing = p.pricing || {};
    if (pricing.mode === 'tier') {
      var tier = orderingConfig && orderingConfig.tiers && orderingConfig.tiers[pricing.tierId];
      if (tier && tier.sizes && tier.sizes.length) return sizesPriceLine(tier.sizes);
      return '';
    }
    if (pricing.mode === 'sizes' && Array.isArray(pricing.sizes) && pricing.sizes.length) {
      return sizesPriceLine(pricing.sizes);
    }
    return p.price != null ? formatPrice(p.price) : '';
  }

  function isOrderable(p) {
    var pricing = p.pricing || {};
    if (pricing.mode === 'tier') {
      var tier = orderingConfig && orderingConfig.tiers && orderingConfig.tiers[pricing.tierId];
      return !!(tier && tier.sizes && tier.sizes.length);
    }
    if (pricing.mode === 'sizes') return Array.isArray(pricing.sizes) && pricing.sizes.length > 0;
    return p.price != null;
  }

  // Groups items by category, keeping the order categories first appear in.
  function groupByCategory(items) {
    var order = [];
    var byCategory = {};
    items.forEach(function (p) {
      var cat = p.category || '';
      if (!Object.prototype.hasOwnProperty.call(byCategory, cat)) {
        byCategory[cat] = [];
        order.push(cat);
      }
      byCategory[cat].push(p);
    });
    return order.map(function (cat) { return { category: cat, items: byCategory[cat] }; });
  }

  var MENU_PLACEHOLDER = '/assets/menu-placeholder.svg';

  /* Cuándo una tarjeta reserva su hueco de foto. Lo fija site.menu.photos desde
     el panel (ver MENU_PHOTOS en src/routes/site.js); loadMenu() lo rellena.
       auto   — hueco solo si el plato tiene foto. Es el defecto, y el motivo de
                serlo: sin fotos subidas la carta sale compacta, y en cuanto el
                panel sube la primera, esa tarjeta la enseña sin tocar ajustes.
       always — hueco siempre, con el placeholder donde falte (lo de antes).
       never  — nunca, aunque haya foto subida. */
  var photosMode = 'auto';
  function mediaSrc(p) {
    if (photosMode === 'never') return '';
    if (p.image) return p.image;
    return photosMode === 'always' ? MENU_PLACEHOLDER : '';
  }

  /* Mismo algoritmo que el slug() de scripts/lib/pages.mjs — duplicado a
     propósito: main.js es un IIFE vanilla sin imports y /carta/ se genera en
     Node. Los ids de ancla de las dos vistas tienen que coincidir, así que si
     tocas uno, toca el otro. */
  function slug(value) {
    return String(value)
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }

  /* El tag repite el título de su categoría en 27 de los 30 platos que lo
     llevan ("Clásica" bajo "Pizzas Clásicas"). Sobre la foto ese badge era
     decoración; sin foto es una etiqueta de más encima del nombre. Solo
     sobrevive el que informa de algo que la categoría no dice ("Solo
     recogida"). */
  function tagAddsInfo(p) {
    if (!p.tag) return false;
    return slug(p.category || '').indexOf(slug(p.tag)) === -1;
  }

  /* Categorías largas: se pintan enteras, pero plegadas a COLLAPSE_TO platos
     hasta que alguien pulse el botón. Con la carta actual solo alcanza a
     Clásicas (14) y Especiales (13), que entre las dos son casi la mitad del
     scroll de la sección. El recorte es visual (CSS), no del DOM: lo que se
     pliega sigue ahí para Ctrl+F y para el filtro de alérgenos.
     Cuántos platos quedan a la vista se decide aquí y solo aquí: el render
     marca los sobrantes con .menu-card--overflow y el CSS se limita a
     ocultarlos mientras el grupo esté plegado. */
  var COLLAPSE_OVER = 8;
  var COLLAPSE_TO = 6;

  /* The carta carries an "Ofertas" category whose cards repeat, word for word,
     the promos already published in the #offers section. #offers is the
     canonical one: it has its own heading, an intro and a photo per promo,
     while these cards exist only to be added to the cart. So they earn their
     place in the carta only while ordering is on; with it off they are dead
     copy competing with #offers for the same words on the same page. The items
     stay in menu.json either way, so turning ordering back on brings them back. */
  var PROMO_CATEGORY = 'Ofertas';
  function isDuplicatePromo(p) {
    return (p.category || '') === PROMO_CATEGORY &&
      !(orderingConfig && orderingConfig.enabled);
  }

  // Compact price for the card face: fixed → exact; tier/sizes (many prices)
  // → "Desde X" so the multi-size line never blows up the card. The full
  // breakdown lives in the "Ver más" modal via priceDisplay().
  function priceShort(p) {
    var pricing = p.pricing || {};
    var sizes = null;
    if (pricing.mode === 'tier') {
      var tier = orderingConfig && orderingConfig.tiers && orderingConfig.tiers[pricing.tierId];
      sizes = tier && tier.sizes;
    } else if (pricing.mode === 'sizes') {
      sizes = pricing.sizes;
    }
    if (sizes && sizes.length) {
      var min = Math.min.apply(null, sizes.map(function (s) { return Number(s.price); }));
      return 'Desde ' + formatPrice(min);
    }
    return p.price != null ? formatPrice(p.price) : '';
  }

  function badge(p, extraClass) {
    return '<span class="menu-card-badge' + (extraClass ? ' ' + extraClass : '') + '"' +
      (p.tagColor ? ' style="background:' + esc(p.tagColor) + '"' : '') +
      '>' + esc(p.tag) + '</span>';
  }

  function renderMenuItem(p, overflow) {
    var canOrder = orderingConfig && orderingConfig.enabled && isOrderable(p);
    var priceStr = priceShort(p);
    var src = mediaSrc(p);
    /* Sin foto la descripción cabe entera (la más larga son 94 caracteres), así
       que el modal ya no aporta el texto recortado: solo vale la pena abrirlo
       por los alérgenos o por el desglose de tallas que "Desde X" resume. */
    var hasDetail = src
      ? !!(p.description || (p.allergens && p.allergens.length))
      : !!((p.allergens && p.allergens.length) || priceDisplay(p) !== priceStr);
    return '<article class="menu-card' + (src ? '' : ' menu-card--flat') +
      (overflow ? ' menu-card--overflow' : '') + '">' +
      (src
        ? '<div class="menu-card-media">' +
            '<img src="' + esc(src) + '" alt="' + esc(p.name) + '" loading="lazy">' +
            (p.tag ? badge(p) : '') +
          '</div>'
        : '') +
      '<div class="menu-card-body">' +
        '<h4 class="menu-card-name">' + esc(p.name) +
          (!src && tagAddsInfo(p) ? ' ' + badge(p, 'menu-card-badge--inline') : '') +
        '</h4>' +
        (p.description ? '<p class="menu-card-desc">' + esc(p.description) + '</p>' : '') +
        (hasDetail
          ? '<button type="button" class="menu-card-more" data-detail-id="' + esc(p.id) + '">Detalles</button>'
          : '') +
      '</div>' +
      '<div class="menu-card-foot">' +
        (priceStr ? '<span class="menu-card-price">' + esc(priceStr) + '</span>' : '<span></span>') +
        (canOrder
          ? '<button type="button" class="btn btn-primary btn-add-item" data-item-id="' +
            esc(p.id) + '">Pedir</button>'
          : '') +
      '</div>' +
    '</article>';
  }

  function renderMenu(items) {
    var wrap = $('#menu-cards');
    var visible = items.filter(function (p) { return p.active !== false; })
      .filter(function (p) { return !isDuplicatePromo(p); })
      .filter(function (p) {
        var al = p.allergens || [];
        for (var a of excludedAllergens) if (al.indexOf(a) !== -1) return false;
        return true;
      });
    if (!visible.length) {
      wrap.innerHTML = '<p class="menu-empty">Ninguna pizza cumple ese filtro. ' +
        'Llámanos y te la preparamos a medida.</p>';
      return;
    }
    /* La forma de la tarjeta es una decisión de la rejilla entera, no de cada
       plato: durante la transición (unos con foto y otros sin ella) una rejilla
       que mezclase filas de 410px con filas de 115px se vería peor que
       cualquiera de las dos puras. Basta una foto para conservar la clásica. */
    var groups = groupByCategory(visible);
    wrap.classList.toggle('menu-cards--flat', !visible.some(function (p) { return !!mediaSrc(p); }));
    wrap.innerHTML = groups.map(function (group) {
      var id = group.category ? slug(group.category) : '';
      // El conteo del botón sale de los platos que quedan tras el filtro de
      // alérgenos, no de los que hay en menu.json.
      var collapsible = !!id && group.items.length > COLLAPSE_OVER;
      var gridId = 'menu-grid-' + id;
      return '<div class="menu-cat-group' + (collapsible ? ' is-collapsed' : '') + '"' +
        (id ? ' id="cat-' + esc(id) + '"' : '') + '>' +
        (group.category
          ? '<h3 class="menu-category-title">' + esc(group.category) + '</h3>'
          : '') +
        '<div class="menu-grid"' + (collapsible ? ' id="' + esc(gridId) + '"' : '') + '>' +
          group.items.map(function (p, i) {
            return renderMenuItem(p, collapsible && i >= COLLAPSE_TO);
          }).join('') +
        '</div>' +
        (collapsible
          ? '<button type="button" class="menu-cat-toggle" aria-expanded="false"' +
            ' aria-controls="' + esc(gridId) + '" data-cat-toggle="' + esc(id) + '">' +
            'Ver ' + group.items.length + ' de ' + esc(group.category) + '</button>'
          : '') +
      '</div>';
    }).join('');
    renderJumpNav(groups);
  }

  /* Atajos a cada categoría. Anclan, no filtran: la fila de arriba
     (#allergen-filters) ya filtra, y dos filas de píldoras que filtran a la vez
     —una excluyendo, otra incluyendo— dan estados combinados que nadie razona.
     Son <a href="#cat-…">, no <button aria-pressed>, así que la diferencia la
     lleva la semántica y no hay que explicarla con copy. Los ids de ancla son
     los mismos que emite /carta/, así que /#cat-pizzas-clasicas vale en las dos
     vistas. */
  function renderJumpNav(groups) {
    var nav = $('#menu-jump');
    if (!nav) return;
    var named = groups.filter(function (g) { return !!g.category; });
    // Con una o dos categorías el atajo no ahorra nada: es una fila de ruido.
    if (named.length < 3) { nav.hidden = true; nav.innerHTML = ''; return; }
    nav.innerHTML = '<span class="menu-jump-label">Ir a</span>' +
      '<div class="menu-jump-track">' +
      named.map(function (g) {
        return '<a class="jump-link" href="#cat-' + esc(slug(g.category)) + '">' +
          esc(g.category) + '</a>';
      }).join('') +
      '</div>';
    nav.hidden = false;
  }

  /* ── "Ver más" detail modal (reuses the shared .modal-overlay skeleton) ── */
  var detailOverlay = null;
  function ensureDetailModal() {
    if (detailOverlay) return;
    document.body.insertAdjacentHTML('beforeend',
      '<div class="modal-overlay menu-detail-overlay" id="vv-detail-overlay">' +
        '<div class="modal menu-detail" role="dialog" aria-modal="true" aria-labelledby="vv-detail-title">' +
          '<button type="button" class="modal-close menu-detail-close" id="vv-detail-close" aria-label="Cerrar">&times;</button>' +
          '<div class="modal-body" id="vv-detail-body"></div>' +
        '</div>' +
      '</div>');
    detailOverlay = $('#vv-detail-overlay');
    $('#vv-detail-close').addEventListener('click', closeDetail);
    detailOverlay.addEventListener('click', function (e) { if (e.target === detailOverlay) closeDetail(); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && detailOverlay.classList.contains('open')) closeDetail();
    });
    // The "Pedir" button inside the detail modal is a .btn-add-item, so cart.js
    // opens the add-to-cart modal for it; we just close the detail modal first.
    detailOverlay.addEventListener('click', function (e) {
      if (e.target.closest && e.target.closest('.btn-add-item')) closeDetail();
    });
  }
  function closeDetail() {
    if (!detailOverlay) return;
    detailOverlay.classList.remove('open');
    document.body.classList.remove('cart-scroll-lock');
  }
  function openDetail(id) {
    var p = (VV.menuItems || []).filter(function (x) { return x.id === id; })[0];
    if (!p) return;
    ensureDetailModal();
    var canOrder = orderingConfig && orderingConfig.enabled && isOrderable(p);
    var priceStr = priceDisplay(p);
    var src = mediaSrc(p);
    /* Aquí el tag se pinta siempre que exista: el modal no lleva el título de
       la categoría encima, así que nunca es una repetición de él. */
    var tag = p.tag ? badge(p, src ? '' : 'menu-card-badge--inline') : '';
    $('#vv-detail-body').innerHTML =
      (src
        ? '<div class="menu-detail-media">' +
            '<img src="' + esc(src) + '" alt="' + esc(p.name) + '">' + tag +
          '</div>'
        : '') +
      '<h2 class="modal-title" id="vv-detail-title">' + esc(p.name) + '</h2>' +
      (src ? '' : (tag ? '<p class="menu-detail-tags">' + tag + '</p>' : '')) +
      (p.description ? '<p class="menu-detail-desc">' + esc(p.description) + '</p>' : '') +
      (priceStr
        ? '<p class="menu-detail-price' + (priceStr.indexOf('·') !== -1 ? ' menu-price--multi' : '') +
          '">' + esc(priceStr) + '</p>'
        : '') +
      ((p.allergens && p.allergens.length)
        ? '<p class="menu-alerg"><strong>Alérgenos:</strong> ' + p.allergens.map(esc).join(', ') + '</p>'
        : '') +
      (canOrder
        ? '<div class="menu-detail-actions"><button type="button" class="btn btn-primary btn-add-item" ' +
          'data-item-id="' + esc(p.id) + '">Pedir</button></div>'
        : '');
    /* .menu-detail-close va en absolute sobre la foto, con velo oscuro. Sin
       foto no hay nada debajo que lo justifique: quedaría flotando encima del
       título, así que el CSS lo devuelve al flujo con esta clase. */
    $('#vv-detail-overlay').querySelector('.menu-detail')
      .classList.toggle('menu-detail--flat', !src);
    detailOverlay.classList.add('open');
    document.body.classList.add('cart-scroll-lock');
  }
  document.addEventListener('click', function (e) {
    if (!e.target.closest) return;
    var more = e.target.closest('[data-detail-id]');
    if (more) { openDetail(more.getAttribute('data-detail-id')); return; }
    var toggle = e.target.closest('[data-cat-toggle]');
    if (toggle) toggleCategory(toggle);
  });

  /* Plegar y desplegar es un cambio de clase, sin volver a pintar: si se
     re-renderizara, el botón que acaba de pulsarse desaparecería del DOM y el
     foco se iría al <body>. */
  function toggleCategory(btn) {
    var group = btn.closest('.menu-cat-group');
    if (!group) return;
    var collapsed = group.classList.toggle('is-collapsed');
    btn.setAttribute('aria-expanded', String(!collapsed));
    var total = group.querySelectorAll('.menu-card').length;
    var name = group.querySelector('.menu-category-title');
    btn.textContent = collapsed
      ? 'Ver ' + total + ' de ' + (name ? name.textContent : 'esta categoría')
      : 'Mostrar menos';
  }

  function initAllergenFilters(items) {
    var all = [];
    items.forEach(function (p) {
      (p.allergens || []).forEach(function (a) { if (all.indexOf(a) === -1) all.push(a); });
    });
    if (!all.length) return;
    var box = $('#allergen-filters');
    all.forEach(function (a) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip';
      b.setAttribute('aria-pressed', 'false');
      b.textContent = 'Sin ' + a;
      b.addEventListener('click', function () {
        var on = b.getAttribute('aria-pressed') !== 'true';
        b.setAttribute('aria-pressed', String(on));
        if (on) excludedAllergens.add(a); else excludedAllergens.delete(a);
        renderMenu(items);
      });
      box.appendChild(b);
    });
    box.hidden = false;
  }

  function loadMenu() {
    var mode = (SITE.menu && SITE.menu.mode) || 'products';
    var photos = SITE.menu && SITE.menu.photos;
    // GET /api/site devuelve config.json sin normalizar, así que el defecto se
    // aplica aquí (igual que con mode, justo arriba).
    photosMode = ['auto', 'always', 'never'].indexOf(photos) !== -1 ? photos : 'auto';
    var pdf = SITE.menu && SITE.menu.pdf;
    var pdfBox = $('#menu-pdf');
    // PDF-only: the client uploaded their menu as a PDF; skip the products fetch
    if (mode === 'pdf' && pdf) {
      $('#menu-products').hidden = true;
      pdfBox.hidden = false;
      $('#menu-pdf-link').href = pdf;
      return;
    }
    // "both": cards AND a link to the PDF (shown together, with the PDF note)
    if (mode === 'both' && pdf) {
      pdfBox.hidden = false;
      pdfBox.classList.add('menu-pdf--inline');
      $('#menu-pdf-link').href = pdf;
    } else {
      pdfBox.hidden = true;
    }
    fetch(apiUrl('menu'))
      .then(function (r) { return r.json(); })
      .then(function (items) {
        if (!items.length) return;
        VV.menuItems = items;
        initAllergenFilters(items);
        renderMenu(items);
        document.dispatchEvent(new CustomEvent('vv:menu-ready'));
      })
      .catch(function () { /* API unavailable: section keeps its default message */ });
  }

  /* ── Monthly special ("pizza del mes") ──────────────── */
  function loadMonthlySpecial() {
    fetch(apiUrl('monthly-special'))
      .then(function (r) { return r.json(); })
      .then(function (ms) {
        if (!ms.active || !ms.name) return;
        $('#ms-name').textContent = ms.name;
        $('#ms-desc').textContent = ms.description || '';
        if (ms.badge) { $('#ms-badge').textContent = ms.badge; $('#ms-badge').hidden = false; }
        if (ms.cta) $('#ms-cta').textContent = ms.cta;
        if (ms.image) {
          var img = $('#ms-image');
          img.src = ms.image;
          img.alt = 'Pizza del mes: ' + ms.name;
          img.hidden = false;
          $('#monthly-special .monthly-special-box').classList.add('has-image');
        }
        $('#monthly-special').hidden = false;
        observeReveals('#monthly-special');
      })
      .catch(function () {});
  }

  /* ── Offers ("ofertas") ─────────────────────────────── */
  function loadOffers() {
    fetch(apiUrl('offers'))
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var items = (data && data.items) || [];
        if (!data.active || !items.length) return;
        if (data.intro) $('#offers-intro').textContent = data.intro;
        $('#offers-grid').innerHTML = items.map(function (o) {
          return '<article class="offer reveal">' +
            (o.image
              ? '<div class="offer-media"><img src="' + esc(o.image) + '" alt="' + esc(o.title) + '" loading="lazy"></div>'
              : '') +
            '<div class="offer-body">' +
              '<h3>' + esc(o.title) + '</h3>' +
              (o.description ? '<p>' + esc(o.description) + '</p>' : '') +
            '</div>' +
          '</article>';
        }).join('');
        $('#offers').hidden = false;
        observeReveals('#offers');
      })
      .catch(function () {});
  }

  /* ── Gallery ────────────────────────────────────────── */
  function loadGallery() {
    fetch(apiUrl('gallery'))
      .then(function (r) { return r.json(); })
      .then(function (files) {
        var grid = $('#gallery-grid');
        if (!files.length) {
          $('#gallery-empty').hidden = false;
          return;
        }
        grid.innerHTML = files.map(function (f, i) {
          return '<div class="gallery-cell">' +
            '<img src="' + f.url + '" alt="' + esc(f.alt || 'Pizzería Voy Volando, Santa Fe') + '"' +
            (i > 1 ? ' loading="lazy"' : '') + '>' +
          '</div>';
        }).join('');
        grid.hidden = false;
      })
      .catch(function () {});
  }

  /* ── Google reviews ─────────────────────────────────── */
  function stars(n) {
    var r = Math.round(n || 0);
    return '★★★★★'.slice(0, r) + '☆☆☆☆☆'.slice(0, 5 - r);
  }
  function loadReviews() {
    fetch(apiUrl('reviews'))
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data.configured || !data.reviews || !data.reviews.length) return;
        $('#reviews-score').textContent = data.rating || '';
        $('#reviews-stars').textContent = stars(data.rating);
        $('#reviews-total').textContent = (data.total || 0) + ' reseñas en Google';
        $('#reviews-grid').innerHTML = data.reviews.map(function (r) {
          return '<article class="review">' +
            '<div class="review-head">' +
              '<div><div class="review-name">' + esc(r.author_name) + '</div>' +
              '<div class="review-date">' + esc(r.relative_time_description || '') + '</div></div>' +
              '<div class="review-stars" aria-label="' + (r.rating || 0) + ' de 5">' + stars(r.rating) + '</div>' +
            '</div>' +
            '<p class="review-text">' + esc(r.text || '') + '</p>' +
          '</article>';
        }).join('');
        $('#reviews').hidden = false;
        observeReveals('#reviews');
      })
      .catch(function () {});
  }

  /* ── Contact form: composes an email message ────────── */
  $('#contact-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var name = $('#f-name').value.trim();
    var phone = $('#f-phone').value.trim();
    var reason = $('#f-reason').value;
    var msg = $('#f-message').value.trim();
    var text = 'Hola, soy ' + name + (phone ? ' (' + phone + ')' : '') + '.\n' +
      (reason ? 'Motivo: ' + reason + '.\n' : '') + (msg || '');
    var email = SITE.email || 'info@voyvolandosantafe.com';
    window.location.href = 'mailto:' + email +
      '?subject=' + encodeURIComponent('Consulta desde la web — ' + (reason || 'general')) +
      '&body=' + encodeURIComponent(text);
  });

  /* ── Init ─────────────────────────────────────────────
     /api/ordering/config is requested up front, alongside /api/site,
     rather than chained after it — the menu render needs both before
     it can decide what's orderable, but neither fetch depends on the
     other so there is no reason to serialize them. ── */
  var sitePromise = fetch(apiUrl('site')).then(function (r) { return r.json(); }).catch(function () { return {}; });
  var orderingConfigPromise = fetch(apiUrl('ordering/config'))
    .then(function (r) { return r.json(); })
    .catch(function () { return null; });

  sitePromise.then(applySite);

  Promise.all([sitePromise, orderingConfigPromise]).then(function (results) {
    orderingConfig = results[1];
    VV.orderingConfig = orderingConfig;
    loadMenu();
    loadMonthlySpecial();
    loadOffers();
    loadGallery();
    loadReviews();
  });
})();
