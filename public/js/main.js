/* Voy Volando — public website. No frameworks: fetch + IntersectionObserver. */
(function () {
  'use strict';

  var $ = function (sel) { return document.querySelector(sel); };
  var $$ = function (sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); };

  /* ── Dark mode: follows the system unless manually overridden (localStorage) ── */
  (function initTheme() {
    var KEY = 'vv_theme';
    var root = document.documentElement;
    var btn = $('#theme-toggle');
    var saved = null;
    try { saved = localStorage.getItem(KEY); } catch (e) { /* storage blocked */ }
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
      try { localStorage.setItem(KEY, next); } catch (e) { /* storage blocked */ }
    });
  })();

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

  var SITE = {}; // editable content loaded from /api/site
  var orderingConfig = null; // /api/ordering/config, needed to price/render orderable items

  /* ── Accessible mobile nav ──────────────────────────── */
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
    // Differentiator: WhatsApp ordering when a number is configured
    if (s.whatsapp) {
      var wa = 'https://wa.me/' + s.whatsapp + '?text=' +
        encodeURIComponent('Hola, quiero hacer un pedido');
      $$('.js-order').forEach(function (a) {
        a.href = wa; a.target = '_blank'; a.rel = 'noopener';
        if (a.dataset.waLabel) a.textContent = a.dataset.waLabel;
      });
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

  function renderMenuItem(p) {
    var priceStr = priceDisplay(p);
    var canOrder = orderingConfig && orderingConfig.enabled && isOrderable(p);
    return '<li class="menu-item">' +
      '<div class="menu-line">' +
        '<span class="menu-name">' + esc(p.name) + '</span>' +
        (p.tag ? '<span class="menu-tag">' + esc(p.tag) + '</span>' : '') +
        '<span class="menu-dots" aria-hidden="true"></span>' +
        (priceStr
          ? '<span class="menu-price' +
            (priceStr.indexOf('·') !== -1 ? ' menu-price--multi' : '') +
            '">' + priceStr + '</span>'
          : '') +
      '</div>' +
      (p.description ? '<p class="menu-desc">' + esc(p.description) + '</p>' : '') +
      ((p.allergens && p.allergens.length)
        ? '<p class="menu-alerg"><strong>Alérgenos:</strong> ' + p.allergens.map(esc).join(', ') + '</p>'
        : '') +
      (canOrder
        ? '<div class="menu-item-actions"><button type="button" class="btn btn-outline btn-add-item" ' +
          'data-item-id="' + esc(p.id) + '">Añadir</button></div>'
        : '') +
    '</li>';
  }

  function renderMenu(items) {
    var list = $('#menu-list');
    var visible = items.filter(function (p) { return p.active !== false; })
      .filter(function (p) {
        var al = p.allergens || [];
        for (var a of excludedAllergens) if (al.indexOf(a) !== -1) return false;
        return true;
      });
    if (!visible.length) {
      list.innerHTML = '<li class="menu-empty">Ninguna pizza cumple ese filtro. ' +
        'Llámanos y te la preparamos a medida.</li>';
      return;
    }
    list.innerHTML = groupByCategory(visible).map(function (group) {
      return (group.category
        ? '<li class="menu-category"><h3 class="menu-category-title">' + esc(group.category) + '</h3></li>'
        : '') +
        group.items.map(renderMenuItem).join('');
    }).join('');
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
    // PDF mode: the client uploads their own menu as a PDF from the panel
    if (SITE.menu && SITE.menu.mode === 'pdf' && SITE.menu.pdf) {
      $('#menu-products').hidden = true;
      var pdfBox = $('#menu-pdf');
      pdfBox.hidden = false;
      $('#menu-pdf-link').href = SITE.menu.pdf;
      return;
    }
    fetch('/api/menu')
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
    fetch('/api/monthly-special')
      .then(function (r) { return r.json(); })
      .then(function (ms) {
        if (!ms.active || !ms.name) return;
        $('#ms-name').textContent = ms.name;
        $('#ms-desc').textContent = ms.description || '';
        if (ms.badge) { $('#ms-badge').textContent = ms.badge; $('#ms-badge').hidden = false; }
        if (ms.cta) $('#ms-cta').textContent = ms.cta;
        $('#monthly-special').hidden = false;
        observeReveals('#monthly-special');
      })
      .catch(function () {});
  }

  /* ── Gallery ────────────────────────────────────────── */
  function loadGallery() {
    fetch('/api/gallery')
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
    fetch('/api/reviews')
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

  /* ── Contact form: composes a WhatsApp or email message ─ */
  $('#contact-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var name = $('#f-name').value.trim();
    var phone = $('#f-phone').value.trim();
    var reason = $('#f-reason').value;
    var msg = $('#f-message').value.trim();
    var text = 'Hola, soy ' + name + (phone ? ' (' + phone + ')' : '') + '.\n' +
      (reason ? 'Motivo: ' + reason + '.\n' : '') + (msg || '');
    if (SITE.whatsapp) {
      window.open('https://wa.me/' + SITE.whatsapp + '?text=' + encodeURIComponent(text),
        '_blank', 'noopener');
    } else {
      var email = SITE.email || 'info@voyvolandosantafe.com';
      window.location.href = 'mailto:' + email +
        '?subject=' + encodeURIComponent('Consulta desde la web — ' + (reason || 'general')) +
        '&body=' + encodeURIComponent(text);
    }
  });

  /* ── Init ─────────────────────────────────────────────
     /api/ordering/config is requested up front, alongside /api/site,
     rather than chained after it — the menu render needs both before
     it can decide what's orderable, but neither fetch depends on the
     other so there is no reason to serialize them. ── */
  var sitePromise = fetch('/api/site').then(function (r) { return r.json(); }).catch(function () { return {}; });
  var orderingConfigPromise = fetch('/api/ordering/config')
    .then(function (r) { return r.json(); })
    .catch(function () { return null; });

  sitePromise.then(applySite);

  Promise.all([sitePromise, orderingConfigPromise]).then(function (results) {
    orderingConfig = results[1];
    VV.orderingConfig = orderingConfig;
    loadMenu();
    loadMonthlySpecial();
    loadGallery();
    loadReviews();
  });
})();
