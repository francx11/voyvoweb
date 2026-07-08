/* Voy Volando — admin panel. No frameworks: fetch + event delegation.
   Row/photo actions use data-action attributes + one delegated listener,
   so nothing needs to live in the global scope. */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);

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

  function showApp() {
    $('login-screen').style.display = 'none';
    $('app').style.display = 'block';
    navigate('menu');
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
    content: loadContent,
    reviews: loadReviews,
    settings: loadSettings,
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

  async function loadMenu() {
    MENU = await api('GET', '/api/menu').catch(() => []);
    $('menu-tbody').innerHTML = MENU.map((p, i) => `
      <tr>
        <td>
          <div style="display:flex;align-items:center;gap:0.6rem">
            <span style="font-size:1.4rem">${p.emoji || '🍕'}</span>
            <strong style="font-size:0.9rem">${esc(p.name)}</strong>
            <span class="pill" style="color:${p.tagColor || '#C41E3A'};border-color:${p.tagColor || '#C41E3A'}">${esc(p.tag || '')}</span>
          </div>
        </td>
        <td data-label="Descripción" style="color:var(--muted);max-width:280px;font-size:0.82rem">${esc(p.description || '')}</td>
        <td data-label="Precio">${p.price != null ? Number(p.price).toFixed(2).replace('.', ',') + ' €' : '<span style="color:var(--orange)">sin precio</span>'}</td>
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
    const mode = menu.mode === 'pdf' ? 'pdf' : 'products';
    $(`mode-${mode}`).checked = true;
    $('pdf-current').innerHTML = menu.pdf
      ? `PDF actual: <a href="${menu.pdf}" target="_blank" rel="noopener" style="color:var(--text)">${menu.pdf.split('/').pop()}</a>`
      : 'Ningún PDF subido todavía';
  }

  document.querySelectorAll('input[name=menu-mode]').forEach((r) => {
    r.addEventListener('change', async () => {
      const mode = document.querySelector('input[name=menu-mode]:checked').value;
      if (mode === 'pdf') {
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

  $('btn-add-item').addEventListener('click', () => {
    $('modal-item-title').textContent = 'Nueva pizza';
    $('form-item').reset();
    $('item-id').value = '';
    setAllergens([]);
    openModal();
  });

  function openEditItemById(id) {
    const p = MENU.find((x) => x.id === id);
    if (!p) return;
    $('modal-item-title').textContent = 'Editar pizza';
    $('item-id').value = p.id;
    $('item-emoji').value = p.emoji || '';
    $('item-name').value = p.name || '';
    $('item-desc').value = p.description || '';
    $('item-tag').value = p.tag || '';
    $('item-color').value = p.tagColor || '#C41E3A';
    $('item-price').value = p.price != null ? p.price : '';
    $('item-category').value = p.category || '';
    setAllergens(p.allergens);
    openModal();
  }

  $('form-item').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = $('item-id').value;
    const data = {
      emoji: $('item-emoji').value,
      name: $('item-name').value,
      description: $('item-desc').value,
      tag: $('item-tag').value,
      tagColor: $('item-color').value || '#C41E3A',
      price: $('item-price').value,
      category: $('item-category').value,
      allergens: getAllergens(),
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
    $('site-whatsapp').value = s.whatsapp || '';
    $('site-hours').value = s.hours || '';
  }

  $('form-content').addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = {
      address: $('site-address').value,
      city: $('site-city').value,
      phone: $('site-phone').value,
      email: $('site-email').value,
      whatsapp: $('site-whatsapp').value.replace(/[^\d]/g, ''),
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

  // ── Init ─────────────────────────────────────────────────────────────────
  checkSession();
})();
