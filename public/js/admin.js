/* Voy Volando — admin panel. No frameworks: fetch + event delegation.
   Row/photo actions use data-action attributes + one delegated listener,
   so nothing needs to live in the global scope. */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);

  // Colour a new menu badge gets by default: the active theme's accent, so a
  // badge created after a palette change follows the new carta instead of a
  // hardcoded red. Falls back only if /api/theme is unreachable.
  let themeAccent = '#a83226';
  fetch('/api/theme')
    .then((r) => r.json())
    .then((t) => {
      if (t && t.light && t.light.tomato) themeAccent = t.light.tomato;
    })
    .catch(() => {});

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // ── API helper (cookie-based session; the browser sends it automatically) ──
  async function api(method, path, body) {
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (body !== undefined) opts.body = JSON.stringify(body);
    const r = await fetch(path, opts);
    const json = await r.json().catch(() => ({}));
    if (r.status === 401 && path !== '/api/login') showLogin();
    if (!r.ok) throw new Error(json.error || r.statusText);
    return json;
  }

  // multipart/form-data upload (no Content-Type header: the browser sets it)
  async function apiUploadForm(path, formData) {
    const r = await fetch(path, { method: 'POST', body: formData });
    const json = await r.json().catch(() => ({}));
    if (r.status === 401) showLogin();
    if (!r.ok) throw new Error(json.error || r.statusText);
    return json;
  }

  // ── Toast ───────────────────────────────────────────────────────────────
  let toastTimer;
  function toast(msg, type = 'ok') {
    const el = $('toast');
    el.textContent = msg;
    el.className = `show ${type}`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (el.className = ''), 3000);
  }

  // ── LOGIN ───────────────────────────────────────────────────────────────
  $('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api('POST', '/api/login', { password: $('pwd').value });
      $('pwd').value = '';
      showApp();
    } catch (err) {
      $('login-error').textContent = err.message;
    }
  });

  async function checkSession() {
    try {
      const { authenticated } = await api('GET', '/api/session');
      if (authenticated) showApp();
    } catch {
      /* server down: stays on login */
    }
  }

  function showLogin() {
    $('app').style.display = 'none';
    $('login-screen').style.display = 'flex';
  }

  // Deployment feature flags (/api/features). With ordering off the routes
  // behind the Pedidos page do not exist, so the page is removed instead of
  // left to fail: no nav item, no polling, no order alerts.
  let FEATURES = { ordering: true };

  async function showApp() {
    $('login-screen').style.display = 'none';
    $('app').style.display = 'block';
    FEATURES = await api('GET', '/api/features').catch(() => ({ ordering: false }));
    applyFeatureFlags();
    navigate('menu');
    if (FEATURES.ordering) startGlobalOrdersPoll();
  }

  function applyFeatureFlags() {
    const ordersNav = document.querySelector('.nav-item[data-page="orders"]');
    if (ordersNav) ordersNav.style.display = FEATURES.ordering ? '' : 'none';
  }

  // ── Mobile sidebar ───────────────────────────────────────────────────────
  function openSidebar() {
    $('sidebar').classList.add('open');
    $('sidebar-overlay').classList.add('open');
    document.body.style.overflow = 'hidden';
  }
  function closeSidebar() {
    $('sidebar').classList.remove('open');
    $('sidebar-overlay').classList.remove('open');
    document.body.style.overflow = '';
  }
  $('btn-menu-open').addEventListener('click', openSidebar);
  $('sidebar-overlay').addEventListener('click', closeSidebar);

  // ── Logout (both desktop and mobile buttons) ─────────────────────────────
  async function doLogout() {
    try {
      await api('POST', '/api/logout');
    } catch {
      /* session already expired */
    }
    closeSidebar();
    showLogin();
  }
  $('btn-logout').addEventListener('click', doLogout);
  $('btn-logout-mobile').addEventListener('click', doLogout);

  // ── NAVIGATION ───────────────────────────────────────────────────────────
  document.querySelectorAll('.nav-item').forEach((item) => {
    item.addEventListener('click', () => {
      navigate(item.dataset.page);
      closeSidebar(); // closes the mobile drawer on section select
    });
  });

  const PAGE_LOADERS = {
    menu: () => {
      loadMenu();
      loadMenuMode();
    },
    gallery: loadGallery,
    'monthly-special': loadMonthlySpecial,
    offers: loadOffers,
    content: loadContent,
    reviews: loadReviews,
    theme: loadTheme,
    settings: loadSettings,
    orders: loadOrdersPage,
    'ordering-config': loadOrderingConfigPage,
  };

  function navigate(page) {
    document
      .querySelectorAll('.nav-item')
      .forEach((i) => i.classList.toggle('active', i.dataset.page === page));
    document
      .querySelectorAll('.page')
      .forEach((p) => p.classList.toggle('active', p.id === `page-${page}`));
    (PAGE_LOADERS[page] || (() => {}))();
  }

  // ═════════════════════════════════════════════════════════════════════════
  // MENU
  // ═════════════════════════════════════════════════════════════════════════
  const ALLERGENS = [
    'gluten', 'lácteos', 'huevo', 'pescado', 'marisco', 'frutos secos', 'soja',
    'mostaza', 'sésamo', 'apio', 'sulfitos', 'altramuces', 'moluscos', 'cacahuetes',
  ];
  let MENU = [];

  // Pricing mode is optional: tier/sizes take priority over the fixed `price`.
  function priceCellHtml(p) {
    if (p.pricing?.mode === 'sizes') {
      const n = p.pricing.sizes.length;
      return `${n} tamaño${n !== 1 ? 's' : ''}`;
    }
    if (p.pricing?.mode === 'tier') {
      return `Tarifa (${esc(p.pricing.tierId)})`;
    }
    return p.price != null
      ? Number(p.price).toFixed(2).replace('.', ',') + ' €'
      : '<span style="color:var(--orange)">sin precio</span>';
  }

  async function loadMenu() {
    MENU = await api('GET', '/api/menu').catch(() => []);
    $('menu-tbody').innerHTML = MENU.map((p, i) => `
      <tr>
        <td>
          <div style="display:flex;align-items:center;gap:0.6rem">
            <span style="font-size:1.4rem">${p.emoji || '🍕'}</span>
            <strong style="font-size:0.9rem">${esc(p.name)}</strong>
            <span class="pill" style="color:${p.tagColor || themeAccent};border-color:${p.tagColor || themeAccent}">${esc(p.tag || '')}</span>
          </div>
        </td>
        <td data-label="Descripción" style="color:var(--muted);max-width:280px;font-size:0.82rem">${esc(p.description || '')}</td>
        <td data-label="Precio">${priceCellHtml(p)}</td>
        <td data-label="Alérgenos" style="color:var(--muted);font-size:0.78rem;max-width:160px">${(p.allergens || []).map(esc).join(', ') || '—'}</td>
        <td data-label="Visible">
          <div class="toggle ${p.active ? 'on' : ''}" data-action="toggle" data-id="${p.id}"></div>
        </td>
        <td>
          <button class="btn btn-ghost btn-sm" ${i === 0 ? 'disabled style="opacity:0.3"' : ''} data-action="move" data-index="${i}" data-dir="-1" title="Subir">↑</button>
          <button class="btn btn-ghost btn-sm" ${i === MENU.length - 1 ? 'disabled style="opacity:0.3"' : ''} data-action="move" data-index="${i}" data-dir="1" title="Bajar">↓</button>
          <button class="btn btn-ghost btn-sm" data-action="edit" data-id="${p.id}">Editar</button>
          <button class="btn btn-danger btn-sm" data-action="delete" data-id="${p.id}">Borrar</button>
        </td>
      </tr>
    `).join('');
  }

  $('menu-tbody').addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const { action, id, index, dir } = el.dataset;
    if (action === 'toggle') return toggleItem(id, el);
    if (action === 'move') return moveItem(Number(index), Number(dir));
    if (action === 'edit') return openEditItemById(id);
    if (action === 'delete') return deleteItem(id);
  });

  async function moveItem(i, dir) {
    const j = i + dir;
    if (j < 0 || j >= MENU.length) return;
    [MENU[i], MENU[j]] = [MENU[j], MENU[i]];
    try {
      await api('PUT', '/api/menu/order', { ids: MENU.map((p) => p.id) });
      loadMenu();
    } catch (err) {
      toast(err.message, 'err');
    }
  }

  async function toggleItem(id, el) {
    el.classList.toggle('on');
    const active = el.classList.contains('on');
    await api('PUT', `/api/menu/${id}`, { active }).catch(() => {});
  }

  async function deleteItem(id) {
    if (!confirm('¿Borrar esta pizza?')) return;
    await api('DELETE', `/api/menu/${id}`);
    loadMenu();
    toast('Pizza eliminada');
  }

  // ── Menu display mode (products vs PDF) ──────────────────────────────────
  async function loadMenuMode() {
    const s = await api('GET', '/api/site').catch(() => ({}));
    const menu = s.menu || {};
    const mode = ['pdf', 'both'].includes(menu.mode) ? menu.mode : 'products';
    $(`mode-${mode}`).checked = true;
    const photos = ['always', 'never'].includes(menu.photos) ? menu.photos : 'auto';
    $(`photos-${photos}`).checked = true;
    $('pdf-current').innerHTML = menu.pdf
      ? `PDF actual: <a href="${menu.pdf}" target="_blank" rel="noopener" style="color:var(--text)">${menu.pdf.split('/').pop()}</a>`
      : 'Ningún PDF subido todavía';
  }

  document.querySelectorAll('input[name=menu-photos]').forEach((r) => {
    r.addEventListener('change', async () => {
      const photos = document.querySelector('input[name=menu-photos]:checked').value;
      try {
        await api('PUT', '/api/site', { menu: { photos } });
        toast('Fotos de la carta guardadas ✓ La web ya lo muestra');
      } catch (err) {
        toast(err.message || 'No se pudo guardar', 'err');
      }
    });
  });

  document.querySelectorAll('input[name=menu-mode]').forEach((r) => {
    r.addEventListener('change', async () => {
      const mode = document.querySelector('input[name=menu-mode]:checked').value;
      if (mode === 'pdf' || mode === 'both') {
        const s = await api('GET', '/api/site').catch(() => ({}));
        if (!s.menu?.pdf) {
          toast('Sube primero un PDF para poder activar este modo', 'err');
          $('mode-products').checked = true;
          return;
        }
      }
      try {
        await api('PUT', '/api/site', { menu: { mode } });
        toast('Modo de carta guardado ✓ La web ya lo muestra');
      } catch (err) {
        toast(err.message, 'err');
      }
    });
  });

  const pdfInput = $('pdf-input');
  $('btn-upload-pdf').addEventListener('click', () => pdfInput.click());
  pdfInput.addEventListener('change', async () => {
    if (!pdfInput.files.length) return;
    const fd = new FormData();
    fd.append('menu', pdfInput.files[0]);
    toast('Subiendo PDF...');
    try {
      await apiUploadForm('/api/menu/pdf', fd);
      toast('Carta PDF subida ✓');
      loadMenuMode();
    } catch (err) {
      toast(err.message, 'err');
    }
    pdfInput.value = '';
  });

  // ── Item photo upload (only for an already-saved item) ───────────────────
  const itemImgInput = $('item-img-input');
  function setItemImageUI(image) {
    const disabled = !$('item-id').value; // new items have no id yet
    $('item-img-preview').src = image || '/assets/menu-placeholder.svg';
    $('btn-item-img-remove').style.display = image ? '' : 'none';
    $('btn-item-img').disabled = disabled;
    $('btn-item-img-remove').disabled = disabled;
    $('item-img-hint').textContent = disabled
      ? 'Guarda la pizza primero para poder añadir una foto.'
      : 'Si no subes foto, la tarjeta sale solo con el texto del plato.';
  }
  $('btn-item-img').addEventListener('click', () => {
    if ($('item-id').value) itemImgInput.click();
  });
  itemImgInput.addEventListener('change', async () => {
    const id = $('item-id').value;
    if (!id || !itemImgInput.files.length) return;
    const fd = new FormData();
    fd.append('image', itemImgInput.files[0]);
    toast('Subiendo foto...');
    try {
      const res = await apiUploadForm(`/api/menu/${id}/image`, fd);
      setItemImageUI(res.image);
      loadMenu();
      toast('Foto subida ✓');
    } catch (err) {
      toast(err.message, 'err');
    }
    itemImgInput.value = '';
  });
  $('btn-item-img-remove').addEventListener('click', async () => {
    const id = $('item-id').value;
    if (!id) return;
    try {
      await api('DELETE', `/api/menu/${id}/image`);
      setItemImageUI('');
      loadMenu();
      toast('Foto quitada ✓');
    } catch (err) {
      toast(err.message, 'err');
    }
  });

  // ── Item modal ───────────────────────────────────────────────────────────
  // Allergen checkboxes (generated once)
  $('item-allergens').innerHTML = ALLERGENS.map((a) => `
    <label style="display:inline-flex;align-items:center;gap:0.35rem;font-size:0.8rem;color:var(--text);cursor:pointer;text-transform:capitalize">
      <input type="checkbox" value="${a}" name="allergen"> ${a}
    </label>
  `).join('');

  function setAllergens(list) {
    document.querySelectorAll('input[name=allergen]').forEach((cb) => {
      cb.checked = (list || []).includes(cb.value);
    });
  }
  function getAllergens() {
    return [...document.querySelectorAll('input[name=allergen]:checked')].map((cb) => cb.value);
  }

  // ── Pricing editor (fixed / per-size / pizza tier) + modifier groups ──────
  // Cached ordering.json (tiers + modifierGroups); shared with the ordering
  // config page so a save there refreshes what this modal offers.
  let ORDERING_CFG_CACHE = null;
  async function loadOrderingConfigCache(force) {
    if (ORDERING_CFG_CACHE && !force) return ORDERING_CFG_CACHE;
    ORDERING_CFG_CACHE = await api('GET', '/api/ordering/settings').catch(() => ({}));
    return ORDERING_CFG_CACHE;
  }

  function pricingModeChanged() {
    const mode = $('item-pricing-mode').value;
    $('item-price-fixed-wrap').style.display = mode === 'fixed' ? '' : 'none';
    $('item-price-tier-wrap').style.display = mode === 'tier' ? '' : 'none';
    $('item-price-sizes-wrap').style.display = mode === 'sizes' ? '' : 'none';
  }
  $('item-pricing-mode').addEventListener('change', pricingModeChanged);

  function sizeRowHtml(s) {
    s = s || {};
    return `
      <div class="size-row" style="display:flex;gap:0.5rem;margin-bottom:0.5rem;align-items:center">
        <input type="text" class="size-label mini-input" placeholder="Etiqueta (ej. Familiar 40cm)" value="${esc(s.label || '')}" style="flex:2">
        <input type="number" class="size-price mini-input" placeholder="Precio" min="0" step="0.10" value="${s.price != null ? s.price : ''}" style="flex:1">
        <select class="size-fulfillment mini-input" style="flex:1">
          <option value="">Recogida y domicilio</option>
          <option value="pickup" ${s.fulfillment === 'pickup' ? 'selected' : ''}>Solo recogida</option>
          <option value="delivery" ${s.fulfillment === 'delivery' ? 'selected' : ''}>Solo domicilio</option>
        </select>
        <button type="button" class="btn btn-danger btn-sm" data-action="remove-size-row">×</button>
      </div>
    `;
  }
  function addSizeRow(s) {
    $('item-sizes-rows').insertAdjacentHTML('beforeend', sizeRowHtml(s));
  }
  $('btn-add-size-row').addEventListener('click', () => addSizeRow());
  $('item-sizes-rows').addEventListener('click', (e) => {
    const el = e.target.closest('[data-action="remove-size-row"]');
    if (el) el.closest('.size-row').remove();
  });
  function getSizesFromForm() {
    return [...$('item-sizes-rows').querySelectorAll('.size-row')]
      .map((row) => ({
        label: row.querySelector('.size-label').value.trim(),
        price: row.querySelector('.size-price').value,
        fulfillment: row.querySelector('.size-fulfillment').value || undefined,
      }))
      .filter((s) => s.label);
  }

  function renderTierSelectOptions(tiers) {
    $('item-tier-select').innerHTML = Object.entries(tiers || {})
      .map(([id, t]) => `<option value="${esc(id)}">${esc(t.label || id)}</option>`)
      .join('');
  }

  function renderModifierGroupCheckboxes(groups) {
    const entries = Object.entries(groups || {});
    $('item-modifier-groups').innerHTML =
      entries
        .map(
          ([id, g]) => `
      <label style="display:inline-flex;align-items:center;gap:0.45rem;font-size:0.82rem;cursor:pointer">
        <input type="checkbox" value="${esc(id)}" name="modifier-group"> ${esc(g.label || id)}
      </label>
    `
        )
        .join('') ||
      '<span style="font-size:0.8rem;color:var(--muted)">No hay grupos de extras configurados</span>';
  }
  function setModifierGroups(ids) {
    document.querySelectorAll('input[name=modifier-group]').forEach((cb) => {
      cb.checked = (ids || []).includes(cb.value);
    });
  }
  function getModifierGroups() {
    return [...document.querySelectorAll('input[name=modifier-group]:checked')].map((cb) => cb.value);
  }

  function openModal() {
    $('modal-item').classList.add('open');
  }
  function closeModal() {
    $('modal-item').classList.remove('open');
  }
  document.querySelectorAll('[data-close-modal]').forEach((b) => {
    b.addEventListener('click', closeModal);
  });
  $('modal-item').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeModal();
  });

  $('btn-add-item').addEventListener('click', async () => {
    $('modal-item-title').textContent = 'Nueva pizza';
    $('form-item').reset();
    $('item-id').value = '';
    setItemImageUI(''); // no id yet → upload disabled with a hint
    setAllergens([]);
    $('item-sizes-rows').innerHTML = '';
    $('item-pricing-mode').value = 'fixed';
    pricingModeChanged();
    const cfg = await loadOrderingConfigCache();
    renderTierSelectOptions(cfg.tiers);
    renderModifierGroupCheckboxes(cfg.modifierGroups);
    openModal();
  });

  async function openEditItemById(id) {
    const p = MENU.find((x) => x.id === id);
    if (!p) return;
    $('modal-item-title').textContent = 'Editar pizza';
    $('item-id').value = p.id;
    setItemImageUI(p.image || '');
    $('item-emoji').value = p.emoji || '';
    $('item-name').value = p.name || '';
    $('item-desc').value = p.description || '';
    $('item-tag').value = p.tag || '';
    $('item-color').value = p.tagColor || themeAccent;
    checkTagContrast();
    $('item-price').value = p.price != null ? p.price : '';
    $('item-category').value = p.category || '';
    $('item-pickup-only').checked = p.fulfillment === 'pickup_only';
    setAllergens(p.allergens);

    const cfg = await loadOrderingConfigCache();
    renderTierSelectOptions(cfg.tiers);
    renderModifierGroupCheckboxes(cfg.modifierGroups);
    setModifierGroups(p.modifierGroupIds);

    $('item-sizes-rows').innerHTML = '';
    const mode = p.pricing?.mode === 'tier' ? 'tier' : p.pricing?.mode === 'sizes' ? 'sizes' : 'fixed';
    $('item-pricing-mode').value = mode;
    if (mode === 'tier') $('item-tier-select').value = p.pricing.tierId;
    if (mode === 'sizes') (p.pricing.sizes || []).forEach(addSizeRow);
    pricingModeChanged();

    openModal();
  }

  $('form-item').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = $('item-id').value;
    const mode = $('item-pricing-mode').value;
    let pricing;
    if (mode === 'tier') pricing = { mode: 'tier', tierId: $('item-tier-select').value };
    else if (mode === 'sizes') pricing = { mode: 'sizes', sizes: getSizesFromForm() };
    else pricing = null; // clears any previous sizes/tier pricing, falls back to fixed `price`
    const data = {
      emoji: $('item-emoji').value,
      name: $('item-name').value,
      description: $('item-desc').value,
      tag: $('item-tag').value,
      tagColor: $('item-color').value || themeAccent,
      price: $('item-price').value,
      category: $('item-category').value,
      allergens: getAllergens(),
      pricing,
      modifierGroupIds: getModifierGroups(),
      fulfillment: $('item-pickup-only').checked ? 'pickup_only' : null,
    };
    try {
      if (id) await api('PUT', `/api/menu/${id}`, data);
      else await api('POST', '/api/menu', data);
      closeModal();
      loadMenu();
      toast(id ? 'Pizza actualizada ✓' : 'Pizza añadida ✓');
    } catch (err) {
      toast(err.message, 'err');
    }
  });

  // ═════════════════════════════════════════════════════════════════════════
  // GALLERY
  // ═════════════════════════════════════════════════════════════════════════
  let GALLERY = [];

  async function loadGallery() {
    GALLERY = await api('GET', '/api/gallery').catch(() => []);
    $('gallery-count').textContent =
      `${GALLERY.length} foto${GALLERY.length !== 1 ? 's' : ''} · la primera es la grande de la portada`;
    $('gallery-grid').innerHTML = GALLERY.map((f, i) => `
      <div class="gallery-item">
        <img src="${f.url}" alt="${esc(f.alt || f.filename)}" loading="lazy">
        <div class="gallery-item-overlay" style="gap:0.4rem">
          <button class="btn btn-ghost btn-sm" ${i === 0 ? 'disabled style="opacity:0.3"' : ''} data-action="move" data-index="${i}" data-dir="-1" title="Antes">←</button>
          <button class="btn btn-danger btn-sm" data-action="delete" data-filename="${esc(f.filename)}">Borrar</button>
          <button class="btn btn-ghost btn-sm" ${i === GALLERY.length - 1 ? 'disabled style="opacity:0.3"' : ''} data-action="move" data-index="${i}" data-dir="1" title="Después">→</button>
        </div>
      </div>
    `).join('');
  }

  $('gallery-grid').addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    if (el.dataset.action === 'move') movePhoto(Number(el.dataset.index), Number(el.dataset.dir));
    if (el.dataset.action === 'delete') deletePhoto(el.dataset.filename);
  });

  async function movePhoto(i, dir) {
    const j = i + dir;
    if (j < 0 || j >= GALLERY.length) return;
    [GALLERY[i], GALLERY[j]] = [GALLERY[j], GALLERY[i]];
    try {
      await api('PUT', '/api/gallery/order', { filenames: GALLERY.map((f) => f.filename) });
      loadGallery();
    } catch (err) {
      toast(err.message, 'err');
    }
  }

  async function deletePhoto(filename) {
    if (!confirm('¿Borrar esta foto?')) return;
    await api('DELETE', `/api/gallery/${filename}`);
    loadGallery();
    toast('Foto eliminada');
  }

  // Upload zone
  const uploadZone = $('upload-zone');
  const fileInput = $('file-input');

  uploadZone.addEventListener('click', () => fileInput.click());
  uploadZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadZone.classList.add('drag-over');
  });
  uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('drag-over'));
  uploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadZone.classList.remove('drag-over');
    uploadFiles(e.dataTransfer.files);
  });
  fileInput.addEventListener('change', () => uploadFiles(fileInput.files));

  async function uploadFiles(files) {
    if (!files.length) return;
    const fd = new FormData();
    for (const f of files) fd.append('photos', f);
    toast('Subiendo fotos...');
    try {
      await apiUploadForm('/api/gallery/upload', fd);
      loadGallery();
      toast(`${files.length} foto${files.length > 1 ? 's' : ''} subida${files.length > 1 ? 's' : ''} ✓`);
    } catch (err) {
      toast(err.message, 'err');
    }
    fileInput.value = '';
  }

  // ═════════════════════════════════════════════════════════════════════════
  // MONTHLY SPECIAL
  // ═════════════════════════════════════════════════════════════════════════
  async function loadMonthlySpecial() {
    const ms = await api('GET', '/api/monthly-special').catch(() => ({}));
    $('ms-emoji').value = ms.emoji || '';
    $('ms-name-input').value = ms.name || '';
    $('ms-description').value = ms.description || '';
    $('ms-badge-input').value = ms.badge || '';
    $('ms-cta-input').value = ms.cta || '';
    $('toggle-monthly-special').classList.toggle('on', !!ms.active);
    setMsImageUI(ms.image || '');
  }

  $('toggle-monthly-special').addEventListener('click', function () {
    this.classList.toggle('on');
  });
  $('toggle-monthly-special-label').addEventListener('click', () => {
    $('toggle-monthly-special').click();
  });

  $('form-monthly-special').addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = {
      active: $('toggle-monthly-special').classList.contains('on'),
      emoji: $('ms-emoji').value,
      name: $('ms-name-input').value,
      description: $('ms-description').value,
      badge: $('ms-badge-input').value,
      cta: $('ms-cta-input').value,
    };
    try {
      await api('PUT', '/api/monthly-special', data);
      toast('Pizza del mes guardada ✓');
    } catch (err) {
      toast(err.message, 'err');
    }
  });

  // ── Monthly special photo (its own endpoints: uploads without saving) ────
  const msImgInput = $('ms-img-input');
  function setMsImageUI(image) {
    $('ms-img-preview').src = image || '/assets/menu-placeholder.svg';
    $('btn-ms-img-remove').style.display = image ? '' : 'none';
  }
  $('btn-ms-img').addEventListener('click', () => msImgInput.click());
  msImgInput.addEventListener('change', async () => {
    if (!msImgInput.files.length) return;
    const fd = new FormData();
    fd.append('image', msImgInput.files[0]);
    toast('Subiendo foto...');
    try {
      const res = await apiUploadForm('/api/monthly-special/image', fd);
      setMsImageUI(res.image);
      toast('Foto subida ✓');
    } catch (err) {
      toast(err.message, 'err');
    }
    msImgInput.value = '';
  });
  $('btn-ms-img-remove').addEventListener('click', async () => {
    try {
      await api('DELETE', '/api/monthly-special/image');
      setMsImageUI('');
      toast('Foto quitada ✓');
    } catch (err) {
      toast(err.message, 'err');
    }
  });

  // ═════════════════════════════════════════════════════════════════════════
  // OFFERS
  // ═════════════════════════════════════════════════════════════════════════
  // The cards are edited inline and saved in one PUT. Photos are the exception:
  // they go to their own endpoint and need the card to exist on the server, so
  // a brand-new card asks to be saved first instead of silently losing the file.
  let offers = { active: false, intro: '', items: [] };

  function offerRow(o, i) {
    const img = esc(o.image || '/assets/menu-placeholder.svg');
    return [
      '<div class="card" data-offer="' + i + '" style="margin-bottom:1rem">',
      '  <div style="display:flex;gap:1rem;flex-wrap:wrap">',
      '    <img alt="" src="' + img + '"',
      '         style="width:120px;height:90px;object-fit:cover;border-radius:0.4rem;border:1px solid var(--line)">',
      '    <div style="flex:1;min-width:240px;display:flex;flex-direction:column;gap:0.6rem">',
      '      <div class="form-field">',
      '        <label>Título</label>',
      '        <input type="text" class="offer-title" value="' + esc(o.title) + '" placeholder="Familiares a 10 €">',
      '      </div>',
      '      <div class="form-field">',
      '        <label>Descripción</label>',
      '        <textarea class="offer-desc" rows="2" placeholder="Todos los días, solo a recoger.">' + esc(o.description) + '</textarea>',
      '      </div>',
      '      <div style="display:flex;gap:0.6rem;flex-wrap:wrap;align-items:center">',
      '        <button type="button" class="btn btn-ghost offer-img-btn">' + (o.image ? 'Cambiar foto' : 'Subir foto') + '</button>',
      o.image ? '        <button type="button" class="btn btn-ghost offer-img-remove">Quitar foto</button>' : '',
      '        <button type="button" class="btn btn-ghost offer-delete" style="margin-left:auto">Eliminar</button>',
      '        <input type="file" class="offer-img-input" accept="image/*" style="display:none">',
      '      </div>',
      o.saved === false
        ? '      <span style="font-size:0.78rem;color:var(--muted)">Guarda las ofertas para poder subirle la foto.</span>'
        : '',
      '    </div>',
      '  </div>',
      '</div>',
    ]
      .filter(Boolean)
      .join('\n');
  }

  function renderOffers() {
    $('offers-list').innerHTML = offers.items.length
      ? offers.items.map(offerRow).join('')
      : '<p style="color:var(--muted);font-size:0.85rem">Todavía no hay ofertas. Añade la primera.</p>';
  }

  // Reads the inputs back into `offers` so nothing typed is lost on a re-render.
  function collectOffers() {
    document.querySelectorAll('#offers-list [data-offer]').forEach((row) => {
      const o = offers.items[Number(row.dataset.offer)];
      if (!o) return;
      o.title = row.querySelector('.offer-title').value;
      o.description = row.querySelector('.offer-desc').value;
    });
    offers.active = $('toggle-offers').classList.contains('on');
    offers.intro = $('offers-intro-input').value;
  }

  async function loadOffers() {
    const data = await api('GET', '/api/offers').catch(() => ({}));
    offers = { active: !!data.active, intro: data.intro || '', items: data.items || [] };
    $('toggle-offers').classList.toggle('on', offers.active);
    $('offers-intro-input').value = offers.intro;
    renderOffers();
  }

  async function saveOffers() {
    collectOffers();
    try {
      offers = await api('PUT', '/api/offers', offers);
      renderOffers();
      toast('Ofertas guardadas ✓');
    } catch (err) {
      toast(err.message, 'err');
    }
  }

  $('toggle-offers').addEventListener('click', function () {
    this.classList.toggle('on');
  });
  $('toggle-offers-label').addEventListener('click', () => $('toggle-offers').click());
  $('btn-offers-save').addEventListener('click', saveOffers);

  $('btn-offer-add').addEventListener('click', () => {
    collectOffers();
    offers.items.push({ id: String(Date.now()), title: '', description: '', saved: false });
    renderOffers();
  });

  $('offers-list').addEventListener('click', async (e) => {
    const row = e.target.closest('[data-offer]');
    if (!row) return;
    const idx = Number(row.dataset.offer);
    const offer = offers.items[idx];

    if (e.target.closest('.offer-delete')) {
      collectOffers();
      offers.items.splice(idx, 1);
      renderOffers();
      toast('Eliminada — pulsa "Guardar ofertas" para confirmar');
      return;
    }
    if (e.target.closest('.offer-img-btn')) {
      if (offer.saved === false) return toast('Guarda las ofertas primero', 'err');
      row.querySelector('.offer-img-input').click();
      return;
    }
    if (e.target.closest('.offer-img-remove')) {
      try {
        await api('DELETE', '/api/offers/' + offer.id + '/image');
        delete offer.image;
        renderOffers();
        toast('Foto quitada ✓');
      } catch (err) {
        toast(err.message, 'err');
      }
    }
  });

  $('offers-list').addEventListener('change', async (e) => {
    const input = e.target.closest('.offer-img-input');
    if (!input || !input.files.length) return;
    const offer = offers.items[Number(e.target.closest('[data-offer]').dataset.offer)];
    const fd = new FormData();
    fd.append('image', input.files[0]);
    toast('Subiendo foto...');
    try {
      const res = await apiUploadForm('/api/offers/' + offer.id + '/image', fd);
      collectOffers();
      offer.image = res.image;
      renderOffers();
      toast('Foto subida ✓');
    } catch (err) {
      toast(err.message, 'err');
    }
  });

  // ═════════════════════════════════════════════════════════════════════════
  // REVIEWS
  // ═════════════════════════════════════════════════════════════════════════
  async function loadReviews() {
    const container = $('reviews-content');
    container.innerHTML = '<p style="color:var(--muted);font-size:0.85rem">Cargando reseñas...</p>';
    try {
      const data = await api('GET', '/api/reviews');
      if (!data.configured) {
        container.innerHTML = `
          <div class="notice notice-warn">
            <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            <div>API de Google no configurada. Ve a <strong>Configuración</strong> para añadir tu API Key y Place ID.</div>
          </div>`;
        return;
      }
      const stars = (n) => '★'.repeat(Math.round(n)) + '☆'.repeat(5 - Math.round(n));
      container.innerHTML = `
        <div class="reviews-header">
          <div class="rating-big">${data.rating || '-'}</div>
          <div>
            <div class="stars">${stars(data.rating || 0)}</div>
            <div style="font-size:0.82rem;color:var(--muted);margin-top:0.3rem">${data.total || 0} reseñas en Google</div>
          </div>
        </div>
        ${(data.reviews || []).map((r) => `
          <div class="review-card">
            <div class="review-meta">
              <div class="review-avatar">${(r.author_name || '?')[0].toUpperCase()}</div>
              <div>
                <div class="review-name">${esc(r.author_name || '')}</div>
                <div class="review-date">${r.relative_time_description || ''}</div>
              </div>
              <div class="review-stars">${stars(r.rating || 0)}</div>
            </div>
            <p class="review-text">${esc(r.text || '')}</p>
          </div>
        `).join('')}
        ${!data.reviews?.length ? '<p style="color:var(--muted);font-size:0.85rem">No hay reseñas disponibles.</p>' : ''}
      `;
    } catch (err) {
      container.innerHTML = `<div class="notice notice-warn"><svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg><div>${esc(err.message)}</div></div>`;
    }
  }

  $('btn-refresh-reviews').addEventListener('click', loadReviews);

  // The menu badge always prints white text over tagColor (see the annotated
  // #fff in main.css), so an arbitrary colour picked here can quietly make the
  // label unreadable. Warn where the mistake is made.
  function relLum(hex) {
    const v = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
  }

  function checkTagContrast() {
    const el = $('item-color-contrast');
    if (!el) return;
    const value = $('item-color').value;
    if (!/^#[0-9a-fA-F]{6}$/.test(value)) return void (el.textContent = '');
    const ratio = 1.05 / (relLum(value) + 0.05);
    el.textContent =
      ratio >= 4.5
        ? `Texto blanco sobre este color: ${ratio.toFixed(1)}:1 ✓`
        : `Texto blanco sobre este color: ${ratio.toFixed(1)}:1 — se lee mal, usa un tono más oscuro`;
    el.style.color = ratio >= 4.5 ? '#4ade80' : '#fcd34d';
  }

  $('item-color').addEventListener('input', checkTagContrast);

  // ═════════════════════════════════════════════════════════════════════════
  // THEME
  // ═════════════════════════════════════════════════════════════════════════
  // The draft lives here until Guardar. Every picker move asks the server to
  // resolve it, so the preview shows the same CSS that would be published —
  // deriving tokens a second time in the browser would be a second source of
  // truth, and the two would drift.
  let themeDraft = { preset: '', overrides: { light: {}, dark: {} } };
  let themePreviewMode = 'light';
  let themePreviewTimer = null;

  const CONTRAST_LABELS = {
    'ink/paper': 'Tinta sobre papel',
    'ink/paper-2': 'Tinta sobre papel alterno',
    'on-tomato/tomato-btn': 'Texto sobre botón',
    'ink-soft/paper': 'Tinta suave sobre papel',
    'tomato/paper': 'Acento sobre papel',
    'on-navy/navy': 'Texto sobre estructura',
  };

  function renderContrast(mode, report) {
    const rows = [];
    for (const [group, pairs] of [
      ['hard', report.hard],
      ['soft', report.soft],
    ]) {
      for (const [pair, value] of Object.entries(pairs)) {
        // Below 4.5:1 a hard pair blocks the save; a soft one only warns.
        const cls = value >= 4.5 ? 'ok' : group === 'hard' ? 'bad' : 'warn';
        rows.push(
          `<tr><td>${esc(CONTRAST_LABELS[pair] || pair)}</td>` +
            `<td class="${cls}">${value.toFixed(2)}:1</td></tr>`
        );
      }
    }
    $(`theme-contrast-${mode}`).innerHTML = rows.join('');
  }

  function paintSwatches(resolved) {
    document.querySelectorAll('#page-theme .theme-swatches').forEach((group) => {
      const mode = group.dataset.mode;
      group.querySelectorAll('input[type="color"]').forEach((input) => {
        input.value = resolved[mode][input.dataset.token];
      });
    });
  }

  // Applies the draft's CSS inside the preview iframe without saving. The page
  // is the real storefront, so what you see is what gets published.
  function paintPreview(css) {
    const frame = $('theme-preview');
    const doc = frame.contentDocument;
    if (!doc) return;
    let tag = doc.getElementById('vv-theme-preview');
    if (!tag) {
      tag = doc.createElement('style');
      tag.id = 'vv-theme-preview';
      doc.head.appendChild(tag);
    }
    // The generated CSS targets :root; inside the iframe it has to beat the
    // page's own theme.css, hence the extra :root specificity bump.
    tag.textContent = css.replace(/:root/g, ':root:root');
    doc.documentElement.setAttribute('data-theme', themePreviewMode);
  }

  async function refreshThemePreview() {
    try {
      const r = await api('POST', '/api/theme/preview', themeDraft);
      renderContrast('light', r.contrast.light);
      renderContrast('dark', r.contrast.dark);
      const msgs = [...r.failures.map((f) => ['bad', f]), ...r.warnings.map((w) => ['warn', w])];
      $('theme-warnings').innerHTML = msgs.length
        ? msgs
            .map(
              ([cls, m]) =>
                `<div class="notice notice-${cls === 'bad' ? 'warn' : 'info'}" style="margin-top:1rem"><div>${esc(m)}</div></div>`
            )
            .join('')
        : '';
      paintPreview(r.css);
    } catch (err) {
      toast(err.message, 'err');
    }
  }

  const queueThemePreview = () => {
    clearTimeout(themePreviewTimer);
    themePreviewTimer = setTimeout(refreshThemePreview, 150);
  };

  async function loadTheme() {
    const [presets, active] = await Promise.all([
      api('GET', '/api/theme/presets').catch(() => []),
      api('GET', '/api/theme'),
    ]);

    const select = $('theme-preset');
    select.innerHTML = presets
      .map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`)
      .join('');
    select.value = active.preset;
    const notes = (presets.find((p) => p.id === active.preset) || {}).notes || '';
    $('theme-preset-notes').textContent = notes;

    themeDraft = { preset: active.preset, overrides: active.overrides };
    paintSwatches(active);
    refreshThemePreview();
  }

  $('theme-preset').addEventListener('change', async (e) => {
    // A new preset is a clean slate: keeping the old overrides would silently
    // paint the previous palette's colours over the new one.
    themeDraft = { preset: e.target.value, overrides: { light: {}, dark: {} } };
    const presets = await api('GET', '/api/theme/presets').catch(() => []);
    $('theme-preset-notes').textContent =
      (presets.find((p) => p.id === e.target.value) || {}).notes || '';
    const r = await api('POST', '/api/theme/preview', themeDraft).catch(() => null);
    if (r) paintSwatches(r);
    refreshThemePreview();
  });

  document.querySelectorAll('#page-theme .theme-swatches input[type="color"]').forEach((input) => {
    input.addEventListener('input', () => {
      const mode = input.closest('.theme-swatches').dataset.mode;
      themeDraft.overrides[mode][input.dataset.token] = input.value;
      queueThemePreview();
    });
  });

  $('theme-preview-mode').addEventListener('click', () => {
    themePreviewMode = themePreviewMode === 'light' ? 'dark' : 'light';
    $('theme-preview-mode').textContent =
      themePreviewMode === 'light' ? 'Ver en oscuro' : 'Ver en claro';
    refreshThemePreview();
  });

  $('theme-reset').addEventListener('click', async () => {
    themeDraft.overrides = { light: {}, dark: {} };
    const r = await api('POST', '/api/theme/preview', themeDraft).catch(() => null);
    if (r) paintSwatches(r);
    refreshThemePreview();
    toast('Ajustes descartados — vuelve el preset tal cual');
  });

  $('theme-save').addEventListener('click', async () => {
    try {
      await api('PUT', '/api/theme', themeDraft);
      toast('Tema guardado ✓ Reconstruye con pnpm build:static para publicarlo');
      $('theme-preview').contentWindow.location.reload();
    } catch (err) {
      toast(err.message, 'err');
    }
  });

  // ═════════════════════════════════════════════════════════════════════════
  // SETTINGS
  // ═════════════════════════════════════════════════════════════════════════
  async function loadSettings() {
    const cfg = await api('GET', '/api/config').catch(() => ({}));
    $('cfg-place-id').value = cfg.googlePlaceId || '';
    $('cfg-apikey-status').style.display = cfg.googleApiKeyConfigured ? 'none' : 'flex';
  }

  $('form-config-google').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api('PUT', '/api/config', { googlePlaceId: $('cfg-place-id').value.trim() });
      toast('Configuración de Google guardada ✓');
    } catch (err) {
      toast(err.message, 'err');
    }
  });

  $('form-password').addEventListener('submit', async (e) => {
    e.preventDefault();
    const p0 = $('cfg-pwd0').value;
    const p1 = $('cfg-pwd1').value;
    const p2 = $('cfg-pwd2').value;
    if (p1 !== p2) return toast('Las contraseñas no coinciden', 'err');
    if (p1.length < 8) return toast('Mínimo 8 caracteres', 'err');
    try {
      await api('POST', '/api/password', { currentPassword: p0, newPassword: p1 });
      $('form-password').reset();
      toast('Contraseña cambiada ✓');
    } catch (err) {
      toast(err.message, 'err');
    }
  });

  // ═════════════════════════════════════════════════════════════════════════
  // SITE CONTENT
  // ═════════════════════════════════════════════════════════════════════════
  async function loadContent() {
    const s = await api('GET', '/api/site').catch(() => ({}));
    const h = s.hero || {};
    const st = s.story || {};
    $('site-hero-eyebrow').value = h.eyebrow || '';
    $('site-hero-title1').value = h.title1 || '';
    $('site-hero-title2').value = h.title2 || '';
    $('site-hero-sub').value = h.sub || '';
    $('site-story-title').value = st.title || '';
    $('site-story-p1').value = st.paragraph1 || '';
    $('site-story-p2').value = st.paragraph2 || '';
    $('site-address').value = s.address || '';
    $('site-city').value = s.city || '';
    $('site-phone').value = s.phone || '';
    $('site-email').value = s.email || '';
    $('site-hours').value = s.hours || '';
  }

  $('form-content').addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = {
      address: $('site-address').value,
      city: $('site-city').value,
      phone: $('site-phone').value,
      email: $('site-email').value,
      hours: $('site-hours').value,
      hero: {
        eyebrow: $('site-hero-eyebrow').value,
        title1: $('site-hero-title1').value,
        title2: $('site-hero-title2').value,
        sub: $('site-hero-sub').value,
      },
      story: {
        title: $('site-story-title').value,
        paragraph1: $('site-story-p1').value,
        paragraph2: $('site-story-p2').value,
      },
    };
    try {
      await api('PUT', '/api/site', data);
      toast('Contenido publicado ✓ La web ya muestra los cambios');
    } catch (err) {
      toast(err.message, 'err');
    }
  });

  // ═════════════════════════════════════════════════════════════════════════
  // ORDERS
  // ═════════════════════════════════════════════════════════════════════════
  const ORDER_STATUS_LABELS = {
    pending_payment: 'Pago pendiente',
    confirmed: 'Confirmado',
    preparing: 'En preparación',
    ready: 'Listo',
    out_for_delivery: 'En reparto',
    delivered: 'Entregado',
    expired: 'Expirado',
    cancelled: 'Cancelado',
  };
  // Non-final statuses that mean "kitchen has work to do" — used for the
  // nav badge count. pending_payment is excluded: it isn't a placed order yet.
  const ORDER_ACTIVE_STATUSES = ['confirmed', 'preparing', 'ready', 'out_for_delivery'];
  const ORDER_TRANSITIONS = {
    confirmed: [
      ['preparing', 'En preparación'],
      ['ready', 'Listo'],
      ['out_for_delivery', 'En reparto'],
      ['delivered', 'Entregado'],
      ['cancelled', 'Cancelar'],
    ],
    preparing: [
      ['ready', 'Listo'],
      ['out_for_delivery', 'En reparto'],
      ['delivered', 'Entregado'],
      ['cancelled', 'Cancelar'],
    ],
    ready: [
      ['delivered', 'Entregado'],
      ['cancelled', 'Cancelar'],
    ],
    out_for_delivery: [
      ['delivered', 'Entregado'],
      ['cancelled', 'Cancelar'],
    ],
  };

  let ordersPageTimer = null;

  function todayISO() {
    const d = new Date();
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
  }

  function isOrdersPageActive() {
    const nav = document.querySelector('.nav-item[data-page="orders"]');
    return !!nav && nav.classList.contains('active');
  }

  async function loadOrdersPage() {
    if (!$('orders-filter-date').value) $('orders-filter-date').value = todayISO();
    await refreshOrdersList();
    await markOrdersSeenAndStopAlert();
    clearInterval(ordersPageTimer);
    ordersPageTimer = setInterval(() => {
      if (document.visibilityState === 'visible' && isOrdersPageActive()) refreshOrdersList();
    }, 15000);
  }

  async function refreshOrdersList() {
    const date = $('orders-filter-date').value || todayISO();
    let orders;
    try {
      ({ orders } = await api('GET', `/api/orders?date=${date}`));
    } catch (err) {
      $('orders-list').innerHTML = `<div class="notice notice-warn">${esc(err.message)}</div>`;
      return;
    }
    const filter = $('orders-filter-status').value;
    let filtered = orders;
    if (filter === 'active') filtered = orders.filter((o) => ORDER_ACTIVE_STATUSES.includes(o.status));
    else if (filter !== 'all') filtered = orders.filter((o) => o.status === filter);
    filtered = [...filtered].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    $('orders-subtitle').textContent = `${filtered.length} pedido${filtered.length !== 1 ? 's' : ''} · ${date}`;
    $('orders-list').innerHTML = filtered.length
      ? filtered.map(renderOrderCard).join('')
      : '<p style="color:var(--muted);font-size:0.85rem">No hay pedidos para este filtro.</p>';
  }

  function renderOrderCard(o) {
    const time = new Date(o.createdAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    const payLabel = o.payment.method === 'stripe' ? 'Tarjeta' : 'Pago al recibir';
    const payOk = o.payment.status === 'paid';
    const fulfIcon = o.fulfillment.type === 'delivery' ? '🏠' : '🛍️';
    const fulfText =
      o.fulfillment.type === 'delivery'
        ? `Domicilio · ${esc(o.fulfillment.zone || '')} · ${esc(o.fulfillment.address || '')}` +
          (o.fulfillment.needsCardTerminal ? ' · 💳 Necesita datáfono' : '')
        : 'Recogida en local';

    const itemsHtml = (o.items || [])
      .map((it) => {
        const parts = [`${it.qty}× ${esc(it.name)}`];
        if (it.sizeLabel) parts.push(esc(it.sizeLabel));
        if (it.modifiers && it.modifiers.length) parts.push(it.modifiers.map((m) => esc(m.label)).join(', '));
        if (it.half) parts.push(`🍕 mitad: ${esc(it.half.name)}`);
        let line = parts.join(' — ');
        if (it.notes) line += ` — <em>${esc(it.notes)}</em>`;
        return `<li>${line}</li>`;
      })
      .join('');

    const actions =
      (ORDER_TRANSITIONS[o.status] || [])
        .map(
          ([status, label]) => `
      <button class="btn ${status === 'cancelled' ? 'btn-danger' : 'btn-ghost'} btn-sm" data-action="set-status" data-id="${o.id}" data-status="${status}">${label}</button>
    `
        )
        .join('') || '<span style="color:var(--muted);font-size:0.8rem">Sin acciones disponibles</span>';

    return `
      <div class="order-card">
        <div class="order-card-head">
          <div>
            <span class="order-code">${esc(o.code)}</span>
            <span class="order-time">${time}</span>
          </div>
          <span class="status-badge status-${o.status}">${ORDER_STATUS_LABELS[o.status] || o.status}</span>
        </div>
        <div class="order-meta-row">
          <span><strong>${esc(o.customer.name)}</strong> · <a href="tel:${esc(o.customer.phone)}">${esc(o.customer.phone)}</a></span>
          <span>${fulfIcon} ${fulfText}</span>
          <span>${esc(payLabel)} — ${payOk ? '<span class="order-payment-ok">Pagado ✓</span>' : '<span class="order-payment-warn">⚠️ Pago al recibir</span>'}</span>
        </div>
        ${o.fulfillment.notes ? `<p style="font-size:0.8rem;color:var(--muted);margin-bottom:0.4rem"><em>${esc(o.fulfillment.notes)}</em></p>` : ''}
        <ul class="order-items">${itemsHtml}</ul>
        <div class="order-card-foot">
          <span class="order-total">Total: ${Number(o.total).toFixed(2).replace('.', ',')} €</span>
          <div class="order-actions">${actions}</div>
        </div>
      </div>
    `;
  }

  $('orders-list').addEventListener('click', (e) => {
    const el = e.target.closest('[data-action="set-status"]');
    if (!el) return;
    setOrderStatus(el.dataset.id, el.dataset.status);
  });

  async function setOrderStatus(id, status) {
    const labels = {
      preparing: 'en preparación',
      ready: 'listo',
      out_for_delivery: 'en reparto',
      delivered: 'entregado',
      cancelled: 'cancelado',
    };
    let reason;
    if (status === 'cancelled') {
      reason = prompt('¿Cancelar este pedido? Motivo (opcional, se lo enviamos al cliente):');
      if (reason === null) return;
    }
    try {
      await api('PUT', `/api/orders/${id}/status`, { status, reason });
      toast(`Pedido marcado como ${labels[status] || status} ✓`);
      refreshOrdersList();
    } catch (err) {
      toast(err.message, 'err');
    }
  }

  $('orders-filter-status').addEventListener('change', refreshOrdersList);
  $('orders-filter-date').addEventListener('change', refreshOrdersList);
  $('btn-orders-refresh').addEventListener('click', refreshOrdersList);

  // ── Notifications + sound alert for new confirmed orders (global) ────────
  const SEEN_ORDERS_KEY = 'vv_seen_orders';

  function getSeenOrderIds() {
    try {
      const list = JSON.parse(localStorage.getItem(SEEN_ORDERS_KEY) || '[]');
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  }
  function addSeenOrderIds(ids) {
    if (!ids.length) return;
    const merged = [...new Set([...getSeenOrderIds(), ...ids])].slice(-200);
    localStorage.setItem(SEEN_ORDERS_KEY, JSON.stringify(merged));
  }

  async function markOrdersSeenAndStopAlert() {
    stopOrderAlert();
    try {
      const { orders } = await api('GET', '/api/orders');
      addSeenOrderIds(orders.map((o) => o.id));
    } catch {
      /* offline/logged out: nothing to mark */
    }
  }

  // WebAudio needs a user gesture before it can play (autoplay policy): the
  // context is created/resumed lazily on the first click anywhere in the app.
  let audioCtx = null;
  function ensureAudioContext() {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    if (!audioCtx) audioCtx = new Ctx();
    else if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }
  document.addEventListener('click', () => ensureAudioContext(), { once: true });

  function playOrderBeeps() {
    const ctx = ensureAudioContext();
    if (!ctx) return;
    for (let i = 0; i < 3; i++) {
      const t0 = ctx.currentTime + i * 0.35;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.3, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.28);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + 0.3);
    }
  }

  let orderAlertTimer = null;
  function startOrderAlert() {
    setNavBadgePulsing(true);
    if (orderAlertTimer) return;
    playOrderBeeps();
    orderAlertTimer = setInterval(playOrderBeeps, 10000);
  }
  function stopOrderAlert() {
    clearInterval(orderAlertTimer);
    orderAlertTimer = null;
    setNavBadgePulsing(false);
  }
  function setNavBadgePulsing(on) {
    $('nav-orders-badge').classList.toggle('pulsing', on);
  }

  const notifiedOrderIds = new Set();
  function notifyNewOrder(o) {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    try {
      new Notification('Nuevo pedido ' + o.code, {
        body: `${o.customer.name} · ${Number(o.total).toFixed(2).replace('.', ',')} €`,
        tag: 'vv-order-' + o.id,
      });
    } catch {
      /* Notification unsupported/blocked: the beep + badge still alert */
    }
  }

  $('btn-enable-notifications').addEventListener('click', async () => {
    if (typeof Notification === 'undefined') return toast('Este navegador no soporta avisos', 'err');
    const perm = await Notification.requestPermission();
    toast(perm === 'granted' ? 'Avisos activados ✓' : 'Avisos no activados', perm === 'granted' ? 'ok' : 'err');
  });

  let globalOrdersTimer = null;

  // Runs continuously from login, on every admin page: badges the nav item
  // with the active-order count and sounds/notifies for unseen confirmed
  // orders until the Pedidos page is visited.
  async function pollOrdersGlobal() {
    let orders;
    try {
      ({ orders } = await api('GET', '/api/orders'));
    } catch {
      return;
    }

    const activeCount = orders.filter((o) => ORDER_ACTIVE_STATUSES.includes(o.status)).length;
    const badge = $('nav-orders-badge');
    badge.textContent = activeCount;
    badge.style.display = activeCount > 0 ? 'inline-block' : 'none';

    const seen = getSeenOrderIds();
    const unseenConfirmed = orders.filter((o) => o.status === 'confirmed' && !seen.includes(o.id));
    if (!unseenConfirmed.length) {
      stopOrderAlert();
      return;
    }
    if (isOrdersPageActive()) {
      // Already looking at the list: no need to alert, just mark as seen.
      addSeenOrderIds(unseenConfirmed.map((o) => o.id));
      return;
    }
    startOrderAlert();
    for (const o of unseenConfirmed) {
      if (!notifiedOrderIds.has(o.id)) {
        notifyNewOrder(o);
        notifiedOrderIds.add(o.id);
      }
    }
  }

  function startGlobalOrdersPoll() {
    if (globalOrdersTimer) return;
    pollOrdersGlobal();
    globalOrdersTimer = setInterval(pollOrdersGlobal, 15000);
  }

  // ═════════════════════════════════════════════════════════════════════════
  // ORDERING CONFIG (online ordering settings)
  // ═════════════════════════════════════════════════════════════════════════
  const DAY_LABELS = { mon: 'Lunes', tue: 'Martes', wed: 'Miércoles', thu: 'Jueves', fri: 'Viernes', sat: 'Sábado', sun: 'Domingo' };
  const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

  let ORDERING_DRAFT = {};

  async function loadOrderingConfigPage() {
    const cfg = await api('GET', '/api/ordering/settings').catch(() => ({}));
    // The env kill switch wins over this page's toggle: say so plainly rather
    // than let someone flip "activados" and wonder why nothing happens.
    $('ordering-feature-notice').innerHTML = cfg.featureEnabled === false
      ? `<div class="notice notice-warn" style="margin-bottom:1.5rem"><svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg><div>Los pedidos online están <strong>desactivados en el servidor</strong> (falta <code>ORDERING_ENABLED=true</code>). Aquí puedes preparar tarifas y horarios: no se aceptará ningún pedido hasta activar la variable.</div></div>`
      : '';
    ORDERING_DRAFT = {
      enabled: cfg.enabled !== false,
      forceOpen: cfg.forceOpen === true,
      tiers: cfg.tiers || {},
      modifierGroups: cfg.modifierGroups || {},
      delivery: cfg.delivery || { fee: 0, minimum: 0, zones: [] },
      schedule: cfg.schedule || {},
      holidayDates: cfg.holidayDates || [],
      closedDates: cfg.closedDates || [],
    };
    $('toggle-ordering-enabled').classList.toggle('on', ORDERING_DRAFT.enabled);
    $('toggle-force-open').classList.toggle('on', ORDERING_DRAFT.forceOpen);
    $('delivery-fee').value = ORDERING_DRAFT.delivery.fee;
    $('delivery-minimum').value = ORDERING_DRAFT.delivery.minimum;
    $('delivery-zones').value = (ORDERING_DRAFT.delivery.zones || []).join('\n');
    renderTiers();
    renderModifierGroups();
    renderSchedule();
    renderHolidayDates();
    renderClosedDates();

    const stripe = cfg.stripe || { configured: false, mode: 'test' };
    $('stripe-status-notice').innerHTML = stripe.configured
      ? `<div class="notice notice-success"><svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg><div>Stripe configurado (modo ${esc(stripe.mode)})</div></div>`
      : `<div class="notice notice-warn"><svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg><div>No configurado — añade STRIPE_SECRET_KEY al .env</div></div>`;
  }

  $('toggle-ordering-enabled').addEventListener('click', function () {
    this.classList.toggle('on');
  });
  $('toggle-ordering-enabled-label').addEventListener('click', () => $('toggle-ordering-enabled').click());

  $('toggle-force-open').addEventListener('click', function () {
    this.classList.toggle('on');
  });
  $('toggle-force-open-label').addEventListener('click', () => $('toggle-force-open').click());

  // ── Tiers (pizza size/price tables) ───────────────────────────────────────
  function renderTiers() {
    const tiers = ORDERING_DRAFT.tiers || {};
    $('tiers-container').innerHTML =
      Object.entries(tiers)
        .map(
          ([key, t]) => `
      <div class="tier-block" style="margin-bottom:1.2rem">
        <div class="form-field" style="margin-bottom:0.6rem;max-width:320px">
          <label>Nombre (${esc(key)})</label>
          <input type="text" class="mini-input" data-tier="${esc(key)}" data-field="label" value="${esc(t.label || '')}">
        </div>
        <table class="mini-table">
          <thead><tr><th>Tamaño</th><th style="width:120px">Precio (€)</th></tr></thead>
          <tbody>
            ${(t.sizes || [])
              .map(
                (s, i) => `
              <tr>
                <td><input type="text" class="mini-input" data-tier="${esc(key)}" data-size-index="${i}" data-field="label" value="${esc(s.label || '')}"></td>
                <td><input type="number" class="mini-input" min="0" step="0.10" data-tier="${esc(key)}" data-size-index="${i}" data-field="price" value="${s.price != null ? s.price : 0}"></td>
              </tr>
            `
              )
              .join('')}
          </tbody>
        </table>
      </div>
    `
        )
        .join('') || '<p style="color:var(--muted);font-size:0.85rem">No hay tarifas configuradas</p>';
  }

  $('tiers-container').addEventListener('input', (e) => {
    const el = e.target;
    const tierKey = el.dataset.tier;
    if (!tierKey) return;
    const tier = ORDERING_DRAFT.tiers[tierKey];
    if (el.dataset.sizeIndex === undefined) {
      if (el.dataset.field === 'label') tier.label = el.value;
    } else {
      const size = tier.sizes[Number(el.dataset.sizeIndex)];
      if (el.dataset.field === 'label') size.label = el.value;
      if (el.dataset.field === 'price') size.price = Number(el.value) || 0;
    }
  });

  // ── Modifier groups (extras) ──────────────────────────────────────────────
  function renderModifierGroups() {
    const groups = ORDERING_DRAFT.modifierGroups || {};
    $('modifier-groups-container').innerHTML =
      Object.entries(groups)
        .map(
          ([key, g]) => `
      <div class="mod-group-block">
        <div class="form-grid" style="margin-bottom:0.6rem">
          <div class="form-field">
            <label>Nombre del grupo (${esc(key)})</label>
            <input type="text" class="mini-input" data-group="${esc(key)}" data-field="label" value="${esc(g.label || '')}">
          </div>
          <div class="form-field">
            <label>Máximo seleccionable</label>
            <input type="number" class="mini-input" data-group="${esc(key)}" data-field="maxSelect" min="1" max="8" value="${g.maxSelect || 1}">
          </div>
          <div class="form-field" style="justify-content:flex-end">
            <label style="display:flex;align-items:center;gap:0.4rem;cursor:pointer;text-transform:none">
              <input type="checkbox" data-group="${esc(key)}" data-field="required" ${g.required ? 'checked' : ''} style="width:auto">
              Obligatorio
            </label>
          </div>
        </div>
        <table class="mini-table">
          <thead><tr><th>Opción</th><th style="width:110px">Precio (€)</th><th style="width:40px"></th></tr></thead>
          <tbody>
            ${(g.options || [])
              .map(
                (o, i) => `
              <tr>
                <td><input type="text" class="mini-input" data-group="${esc(key)}" data-opt-index="${i}" data-field="label" value="${esc(o.label || '')}"></td>
                <td><input type="number" class="mini-input" min="0" step="0.10" data-group="${esc(key)}" data-opt-index="${i}" data-field="price" value="${o.price != null ? o.price : 0}"></td>
                <td><button type="button" class="btn btn-danger btn-sm" data-action="remove-option" data-group="${esc(key)}" data-opt-index="${i}">×</button></td>
              </tr>
            `
              )
              .join('')}
          </tbody>
        </table>
        <div style="display:flex;gap:0.6rem;margin-top:0.4rem">
          <button type="button" class="btn btn-ghost btn-sm" data-action="add-option" data-group="${esc(key)}">+ Opción</button>
          <button type="button" class="btn btn-danger btn-sm" data-action="remove-group" data-group="${esc(key)}">Eliminar grupo</button>
        </div>
      </div>
    `
        )
        .join('') || '<p style="color:var(--muted);font-size:0.85rem">No hay grupos de extras</p>';
  }

  $('modifier-groups-container').addEventListener('input', (e) => {
    const el = e.target;
    const key = el.dataset.group;
    if (!key) return;
    const g = ORDERING_DRAFT.modifierGroups[key];
    if (el.dataset.optIndex !== undefined) {
      const opt = g.options[Number(el.dataset.optIndex)];
      if (el.dataset.field === 'label') opt.label = el.value;
      if (el.dataset.field === 'price') opt.price = Number(el.value) || 0;
    } else if (el.dataset.field === 'label') {
      g.label = el.value;
    } else if (el.dataset.field === 'maxSelect') {
      g.maxSelect = Number(el.value) || 1;
    } else if (el.dataset.field === 'required') {
      g.required = el.checked;
    }
  });

  $('modifier-groups-container').addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const key = el.dataset.group;
    const g = ORDERING_DRAFT.modifierGroups[key];
    if (el.dataset.action === 'add-option') {
      g.options.push({ id: '', label: '', price: 0 });
      renderModifierGroups();
    } else if (el.dataset.action === 'remove-option') {
      g.options.splice(Number(el.dataset.optIndex), 1);
      renderModifierGroups();
    } else if (el.dataset.action === 'remove-group') {
      if (!confirm('¿Eliminar este grupo de extras?')) return;
      delete ORDERING_DRAFT.modifierGroups[key];
      renderModifierGroups();
    }
  });

  $('btn-add-modifier-group').addEventListener('click', () => {
    const raw = prompt('Identificador del grupo (ej. "salsas"):');
    if (!raw) return;
    const slug = raw.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 24);
    if (!slug) return toast('Identificador no válido', 'err');
    ORDERING_DRAFT.modifierGroups = ORDERING_DRAFT.modifierGroups || {};
    if (ORDERING_DRAFT.modifierGroups[slug]) return toast('Ya existe un grupo con ese identificador', 'err');
    ORDERING_DRAFT.modifierGroups[slug] = {
      label: raw.trim(),
      required: false,
      maxSelect: 1,
      options: [{ id: '', label: '', price: 0 }],
    };
    renderModifierGroups();
  });

  // ── Weekly schedule ────────────────────────────────────────────────────
  function renderSchedule() {
    const schedule = ORDERING_DRAFT.schedule || {};
    $('schedule-container').innerHTML = DAY_KEYS.map((day) => {
      const windows = schedule[day] || [];
      return `
        <div class="schedule-day-row">
          <div class="schedule-day-label">${DAY_LABELS[day]}</div>
          <div style="flex:1;min-width:220px">
            ${
              windows.length
                ? windows
                    .map(
                      (w, i) => `
              <div class="schedule-window-row">
                <input type="time" class="mini-input sched-start" data-day="${day}" data-w-index="${i}" value="${esc(w[0])}" style="width:auto">
                <span style="color:var(--muted)">–</span>
                <input type="time" class="mini-input sched-end" data-day="${day}" data-w-index="${i}" value="${esc(w[1])}" style="width:auto">
                <button type="button" class="btn btn-danger btn-sm" data-action="remove-window" data-day="${day}" data-w-index="${i}">×</button>
              </div>
            `
                    )
                    .join('')
                : '<span style="font-size:0.8rem;color:var(--muted)">Cerrado todo el día</span>'
            }
            <label style="display:flex;align-items:center;gap:0.4rem;font-size:0.78rem;color:var(--muted);cursor:pointer;margin-top:0.3rem">
              <input type="checkbox" class="sched-closed" data-day="${day}" ${windows.length === 0 ? 'checked' : ''} style="width:auto">
              Cerrado
            </label>
          </div>
          <button type="button" class="btn btn-ghost btn-sm" data-action="add-window" data-day="${day}">+ Tramo</button>
        </div>
      `;
    }).join('');
  }

  $('schedule-container').addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const day = el.dataset.day;
    ORDERING_DRAFT.schedule = ORDERING_DRAFT.schedule || {};
    ORDERING_DRAFT.schedule[day] = ORDERING_DRAFT.schedule[day] || [];
    if (el.dataset.action === 'add-window') {
      ORDERING_DRAFT.schedule[day].push(['13:00', '16:00']);
    } else if (el.dataset.action === 'remove-window') {
      ORDERING_DRAFT.schedule[day].splice(Number(el.dataset.wIndex), 1);
    }
    renderSchedule();
  });

  $('schedule-container').addEventListener('input', (e) => {
    const el = e.target;
    const day = el.dataset.day;
    if (!day || el.dataset.wIndex === undefined) return;
    const w = ORDERING_DRAFT.schedule[day][Number(el.dataset.wIndex)];
    if (el.classList.contains('sched-start')) w[0] = el.value;
    if (el.classList.contains('sched-end')) w[1] = el.value;
  });

  $('schedule-container').addEventListener('change', (e) => {
    const el = e.target;
    if (!el.classList.contains('sched-closed')) return;
    const day = el.dataset.day;
    ORDERING_DRAFT.schedule[day] = el.checked ? [] : [['13:00', '16:00']];
    renderSchedule();
  });

  // ── Holidays / one-off closed dates ───────────────────────────────────
  function renderDateChips(containerId, dates, removeAction) {
    $(containerId).innerHTML =
      (dates || [])
        .map(
          (d) => `
      <span class="date-chip">${esc(d)}<button type="button" data-action="${removeAction}" data-date="${esc(d)}">×</button></span>
    `
        )
        .join('') || '<span style="font-size:0.8rem;color:var(--muted)">Ninguno</span>';
  }
  function renderHolidayDates() {
    renderDateChips('holiday-dates-list', ORDERING_DRAFT.holidayDates, 'remove-holiday');
  }
  function renderClosedDates() {
    renderDateChips('closed-dates-list', ORDERING_DRAFT.closedDates, 'remove-closed');
  }

  $('btn-add-holiday').addEventListener('click', () => {
    const v = $('holiday-date-input').value;
    if (!v) return;
    ORDERING_DRAFT.holidayDates = ORDERING_DRAFT.holidayDates || [];
    if (!ORDERING_DRAFT.holidayDates.includes(v)) ORDERING_DRAFT.holidayDates.push(v);
    ORDERING_DRAFT.holidayDates.sort();
    $('holiday-date-input').value = '';
    renderHolidayDates();
  });
  $('btn-add-closed').addEventListener('click', () => {
    const v = $('closed-date-input').value;
    if (!v) return;
    ORDERING_DRAFT.closedDates = ORDERING_DRAFT.closedDates || [];
    if (!ORDERING_DRAFT.closedDates.includes(v)) ORDERING_DRAFT.closedDates.push(v);
    ORDERING_DRAFT.closedDates.sort();
    $('closed-date-input').value = '';
    renderClosedDates();
  });
  $('holiday-dates-list').addEventListener('click', (e) => {
    const el = e.target.closest('[data-action="remove-holiday"]');
    if (!el) return;
    ORDERING_DRAFT.holidayDates = ORDERING_DRAFT.holidayDates.filter((d) => d !== el.dataset.date);
    renderHolidayDates();
  });
  $('closed-dates-list').addEventListener('click', (e) => {
    const el = e.target.closest('[data-action="remove-closed"]');
    if (!el) return;
    ORDERING_DRAFT.closedDates = ORDERING_DRAFT.closedDates.filter((d) => d !== el.dataset.date);
    renderClosedDates();
  });

  // ── Save ───────────────────────────────────────────────────────────────
  $('btn-save-ordering-config').addEventListener('click', async () => {
    ORDERING_DRAFT.enabled = $('toggle-ordering-enabled').classList.contains('on');
    ORDERING_DRAFT.forceOpen = $('toggle-force-open').classList.contains('on');
    ORDERING_DRAFT.delivery = {
      fee: Number($('delivery-fee').value) || 0,
      minimum: Number($('delivery-minimum').value) || 0,
      zones: $('delivery-zones')
        .value.split('\n')
        .map((z) => z.trim())
        .filter(Boolean),
    };
    try {
      await api('PUT', '/api/ordering/settings', ORDERING_DRAFT);
      ORDERING_CFG_CACHE = null; // stale tiers/modifierGroups: the item modal must refetch
      toast('Configuración de pedidos guardada ✓');
    } catch (err) {
      toast(err.message, 'err');
    }
  });

  // ── Init ─────────────────────────────────────────────────────────────────
  checkSession();
})();
