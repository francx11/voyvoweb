/* Cabecera y pie de todas las páginas públicas, en un solo sitio.
 *
 * Antes cada página tenía los suyos copiados a mano (portada, /carta/ y
 * /contacto/ una barra; las legales otra distinta, sin menú; la 404 ninguna),
 * y cualquier cambio de navegación había que repetirlo en cuatro ficheros.
 * Ahora el marcado sale de aquí y llega a cada página por dos caminos:
 *
 *   - Las páginas que se generan en el build (/carta/, /contacto/,
 *     /a-domicilio/, 404) llaman a siteHeader()/siteFooter() directamente.
 *   - Las que viven como HTML en public/ (portada, legales, pedido.html)
 *     llevan el bloque entre marcadores <!-- layout:header --> … y
 *     `pnpm layout:sync` lo reescribe. El build estático vuelve a aplicarlo
 *     sobre dist/ con los datos congelados, así que lo publicado nunca queda
 *     desfasado aunque nadie haya ejecutado el sync.
 *
 * El pie lleva horario y zonas de reparto: se leen de site.hours
 * (data/config.json) y de ordering.delivery.zones (data/ordering.json), la
 * única fuente de esos datos. No se escriben aquí.
 */

const escapeMap = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
export const esc = (value) => String(value ?? '').replace(/[&<>"]/g, (c) => escapeMap[c]);

const PHONE = '958 44 28 47';
const TEL = 'tel:958442847';
const EMAIL = 'info@voyvolandosantafe.com';
const INSTAGRAM = 'https://www.instagram.com/voy_volando_santafe/';

// Navegación corta a propósito: cuatro destinos y el teléfono siempre visible.
// «Ofertas» no va aquí porque la sección se oculta sola cuando no hay ofertas
// y el enlace quedaría muerto; galería y servicios siguen en la portada.
export const NAV_ITEMS = [
  { href: '/carta/', label: 'Carta' },
  { href: '/a-domicilio/', label: 'A domicilio' },
  { href: '/#story', label: 'Nosotros' },
  { href: '/contacto/', label: 'Contacto' },
];

const ICON_PHONE =
  '<svg class="icon-phone" viewBox="0 0 24 24" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.18 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.1 9.9a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>';

export function siteHeader(path = '/') {
  const links = NAV_ITEMS.map((item) => {
    const current = item.href === path ? ' aria-current="page"' : '';
    return `          <li><a href="${item.href}"${current}>${esc(item.label)}</a></li>`;
  }).join('\n');

  return `  <header class="site-header">
    <div class="header-inner">
      <a href="/" class="brand">
        <img src="/assets/logo-voyvolando.png" alt="" width="52" height="52" class="brand-logo">
        <span class="brand-name">Voy Volando</span>
      </a>
      <nav id="site-nav" class="site-nav" aria-label="Principal">
        <ul>
${links}
        </ul>
      </nav>
      <div class="header-actions">
        <a href="${TEL}" class="nav-cta js-order js-tel-link" aria-label="Pedir por teléfono: ${PHONE}">${ICON_PHONE}<span class="nav-cta-label">Pedir</span><span class="nav-cta-phone js-phone">${PHONE}</span></a>
        <button id="theme-toggle" class="icon-btn theme-toggle" type="button" aria-pressed="false" aria-label="Activar modo oscuro">
          <svg class="icon-sun" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>
          <svg class="icon-moon" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>
        </button>
        <button id="nav-toggle" class="icon-btn nav-toggle" type="button" aria-expanded="false" aria-controls="site-nav" aria-label="Abrir menú de navegación">
          <svg class="icon-open" viewBox="0 0 24 24" aria-hidden="true"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
          <svg class="icon-close" viewBox="0 0 24 24" aria-hidden="true"><line x1="5" y1="5" x2="19" y2="19"/><line x1="19" y1="5" x2="5" y2="19"/></svg>
        </button>
      </div>
    </div>
  </header>`;
}

export const hoursOf = (site) =>
  String((site && site.hours) || '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !/^PENDIENTE/i.test(l));

export const zonesOf = (ordering) =>
  (ordering && ordering.delivery && ordering.delivery.zones) || [];

export function siteFooter({ site, ordering } = {}) {
  const hours = hoursOf(site);
  const zones = zonesOf(ordering);
  const address = (site && site.address) || 'C. Cristóbal Colón, 7';
  const city = (site && site.city) || '18320 Santa Fe, Granada';

  const hoursBlock = hours.length
    ? `
        <div class="footer-col">
          <h2 class="footer-title">Horario</h2>
          <ul class="footer-list">
${hours.map((h) => `            <li>${esc(h)}</li>`).join('\n')}
          </ul>
        </div>`
    : '';

  const zonesBlock = zones.length
    ? `
        <div class="footer-col">
          <h2 class="footer-title">Repartimos en</h2>
          <ul class="footer-list footer-zones">
${zones.map((z) => `            <li>${esc(z)}</li>`).join('\n')}
          </ul>
          <a href="/a-domicilio/" class="footer-more">Zonas y condiciones →</a>
        </div>`
    : '';

  return `  <div class="airmail-rule" aria-hidden="true"></div>
  <footer class="site-footer section-navy">
    <div class="footer-inner">
      <div class="footer-grid">
        <div class="footer-col footer-about">
          <a href="/" class="footer-brand">
            <img src="/assets/logo-voyvolando.png" alt="" width="44" height="44" loading="lazy">
            <span>Voy Volando</span>
          </a>
          <p>Pizza artesanal a domicilio y para recoger en Santa Fe (Granada). Sin sala: pide por teléfono, sin intermediarios.</p>
          <a href="${TEL}" class="btn btn-primary footer-call js-tel-link">${ICON_PHONE}<span class="js-phone">${PHONE}</span></a>
        </div>${hoursBlock}${zonesBlock}
        <div class="footer-col">
          <h2 class="footer-title">Dónde estamos</h2>
          <address class="footer-address">
            <span class="js-address">${esc(address)}</span><br>
            <span class="js-city">${esc(city)}</span>
          </address>
          <ul class="footer-list">
            <li><a href="mailto:${EMAIL}" class="js-email-link"><span class="js-email">${EMAIL}</span></a></li>
            <li><a href="${INSTAGRAM}" target="_blank" rel="noopener">Instagram</a></li>
          </ul>
        </div>
      </div>
      <div class="footer-bottom">
        <p>© 2026 Pizzería Voy Volando</p>
        <ul class="footer-legal">
          <li><a href="/aviso-legal/">Aviso legal</a></li>
          <li><a href="/privacidad/">Privacidad</a></li>
          <li data-cookie-settings hidden><button type="button" class="footer-link">Configurar cookies</button></li>
        </ul>
      </div>
    </div>
  </footer>`;
}

// Bloques marcados en los HTML de public/. Todo lo que hay entre los dos
// marcadores se sustituye; fuera de ellos no se toca nada.
const BLOCK = (name) => new RegExp(`<!-- layout:${name} -->[\\s\\S]*?<!-- /layout:${name} -->`);

export function applyLayout(html, { path = '/', site, ordering } = {}) {
  let out = html;
  for (const [name, render] of [
    ['header', () => siteHeader(path)],
    ['footer', () => siteFooter({ site, ordering })],
  ]) {
    const re = BLOCK(name);
    if (!re.test(out)) throw new Error(`falta el bloque <!-- layout:${name} -->`);
    out = out.replace(re, () => `<!-- layout:${name} -->\n${render()}\n  <!-- /layout:${name} -->`);
  }
  return out;
}

export const hasLayout = (html) => BLOCK('header').test(html) && BLOCK('footer').test(html);

// Página de public/ → ruta pública, para marcar el enlace activo.
export const LAYOUT_PAGES = {
  'index.html': '/',
  'aviso-legal/index.html': '/aviso-legal/',
  'privacidad/index.html': '/privacidad/',
  'pedido.html': '/pedido',
};
