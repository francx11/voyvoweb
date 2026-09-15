/* Páginas con contenido real para el export estático: /carta/ y /contacto/.
 *
 * Por qué existen. La portada es una sola página con secciones ancladas y la
 * carta se pinta en el navegador desde /api/menu.json. Para Google eso es una
 * URL, no tres: un fragmento (#menu) no se indexa por separado. Search Console
 * dice que /carta/ traía 534 clics al año — el 30 % del sitio — y /contacto/
 * otros 21, así que esas dos rutas necesitan seguir siendo URLs de verdad con
 * el contenido dentro del HTML, no una redirección al ancla.
 *
 * Estas páginas no llevan JavaScript a propósito: se generan en el build a
 * partir de los mismos JSON congelados que consume la portada, así que no hay
 * un segundo renderizador que pueda desincronizarse. Reutilizan main.css, que
 * ya resuelve el modo oscuro por prefers-color-scheme sin ayuda del toggle.
 */

const escapeMap = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };

export function esc(value) {
  return String(value ?? '').replace(/[&<>"]/g, (c) => escapeMap[c]);
}

const euro = (n) => `${Number(n).toFixed(2).replace('.', ',')} €`;

// Un plato con varios tamaños guarda solo el tierId (tabla compartida en
// ordering.json) o su propio array de tamaños; el precio suelto es el resto.
function sizesOf(item, tiers) {
  const pricing = item.pricing || {};
  if (pricing.mode === 'tier') {
    const tier = tiers[pricing.tierId];
    return tier && tier.sizes && tier.sizes.length ? tier.sizes : null;
  }
  if (pricing.mode === 'sizes' && Array.isArray(pricing.sizes) && pricing.sizes.length) {
    return pricing.sizes;
  }
  return null;
}

export function priceText(item, tiers) {
  const sizes = sizesOf(item, tiers);
  if (sizes) return sizes.map((s) => `${s.label} ${euro(s.price)}`).join(' · ');
  return item.price != null ? euro(item.price) : '';
}

function offersOf(item, tiers) {
  const sizes = sizesOf(item, tiers);
  if (sizes) {
    return sizes.map((s) => ({
      '@type': 'Offer',
      name: s.label,
      price: Number(s.price).toFixed(2),
      priceCurrency: 'EUR',
    }));
  }
  if (item.price != null) {
    return [{ '@type': 'Offer', price: Number(item.price).toFixed(2), priceCurrency: 'EUR' }];
  }
  return [];
}

// Agrupa respetando el orden de menu.json: el panel ordena los platos a mano
// y ese orden es el que ve el cliente en la portada.
function groupByCategory(items) {
  const groups = [];
  const byName = new Map();
  for (const item of items) {
    const category = item.category || '';
    let group = byName.get(category);
    if (!group) {
      group = { category, items: [] };
      byName.set(category, group);
      groups.push(group);
    }
    group.items.push(item);
  }
  return groups;
}

// El JSON-LD se incrusta en un <script>: un "<" dentro de una cadena cerraría
// la etiqueta antes de tiempo, así que se escapa siempre.
const jsonLdBlock = (data) =>
  `  <script type="application/ld+json">\n${JSON.stringify(data, null, 2).replace(
    /</g,
    '\\u003c'
  )}\n  </script>`;

function shell({ domain, path, title, description, jsonLd, body }) {
  const url = `https://${domain}${path}`;
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">

  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">
  <meta name="robots" content="index, follow, max-image-preview:large">
  <link rel="canonical" href="${url}">
  <meta name="theme-color" content="#faf6ee">

  <link rel="icon" href="/favicon.ico" sizes="any">
  <link rel="icon" type="image/png" sizes="32x32" href="/assets/favicon-32.png">
  <link rel="icon" type="image/png" sizes="16x16" href="/assets/favicon-16.png">
  <link rel="apple-touch-icon" href="/assets/apple-touch-icon.png">

  <meta property="og:type" content="website">
  <meta property="og:locale" content="es_ES">
  <meta property="og:site_name" content="Pizzería Voy Volando">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:url" content="${url}">
  <meta property="og:image" content="https://${domain}/assets/og-image.jpg">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:card" content="summary_large_image">

${jsonLd.map(jsonLdBlock).join('\n')}

  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@0,400;0,600;1,400;1,600&family=Karla:wght@400;700&display=swap" rel="stylesheet">

  <link rel="stylesheet" href="/css/main.css">
</head>
<body>

  <a class="skip-link" href="#content">Saltar al contenido</a>

  <header class="site-header">
    <div class="header-inner">
      <a href="/" class="brand">Voy <em>Volando</em></a>
      <nav class="page-nav" aria-label="Principal">
        <ul>
          <li><a href="/">Portada</a></li>
          <li><a href="/carta/">Carta</a></li>
          <li><a href="/contacto/">Contacto</a></li>
          <li><a href="tel:958442847" class="nav-cta">Pedir ahora</a></li>
        </ul>
      </nav>
    </div>
  </header>

  <main id="content">
${body}
  </main>

  <footer class="site-footer">
    <div class="footer-inner">
      <div>
        <div class="footer-brand">Voy <em>Volando</em></div>
        <p>Pizzería artesanal en Santa Fe, Granada. Reparto a domicilio y para recoger.</p>
      </div>
      <p>
        <a href="tel:958442847">958 44 28 47</a> ·
        <a href="mailto:info@voyvolandosantafe.com">info@voyvolandosantafe.com</a>
      </p>
      <p>
        <a href="/">Portada</a> ·
        <a href="/carta/">Carta</a> ·
        <a href="/contacto/">Contacto</a> ·
        <a href="/aviso-legal/">Aviso legal</a> ·
        <a href="/privacidad/">Privacidad</a>
      </p>
      <p>© 2026 Pizzería Voy Volando</p>
    </div>
  </footer>

</body>
</html>
`;
}

const breadcrumb = (domain, name, path) => ({
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Inicio', item: `https://${domain}/` },
    { '@type': 'ListItem', position: 2, name, item: `https://${domain}${path}` },
  ],
});

// Misma regla que renderMenu() en public/js/main.js: la categoría "Ofertas"
// repite palabra por palabra las promos de la sección #offers de la portada, y
// solo existe para poder añadirlas al carrito. Con los pedidos apagados es
// copia muerta — y aquí además sería contenido duplicado en otra URL, que es
// justo lo que esta página viene a evitar.
const PROMO_CATEGORY = 'Ofertas';

export function renderCarta({ domain, menu, ordering, site }) {
  const tiers = (ordering && ordering.tiers) || {};
  const orderingOn = !!(ordering && ordering.enabled);
  const items = menu.filter(
    (item) => item.active !== false && (orderingOn || item.category !== PROMO_CATEGORY)
  );
  const groups = groupByCategory(items);
  const pdf = site && site.menu && site.menu.pdf;

  const sections = groups
    .map(
      (group) => `        <section class="carta-group" aria-labelledby="cat-${esc(
        slug(group.category)
      )}">
          <h2 class="section-title" id="cat-${esc(slug(group.category))}">${esc(
            group.category
          )}</h2>
          <ul class="carta-list">
${group.items.map((item) => renderItem(item, tiers)).join('\n')}
          </ul>
        </section>`
    )
    .join('\n\n');

  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'Menu',
      '@id': `https://${domain}/carta/#carta`,
      name: 'Carta de Pizzería Voy Volando',
      inLanguage: 'es-ES',
      url: `https://${domain}/carta/`,
      hasMenuSection: groups.map((group) => ({
        '@type': 'MenuSection',
        name: group.category,
        hasMenuItem: group.items.map((item) => ({
          '@type': 'MenuItem',
          name: item.name,
          ...(item.description ? { description: item.description } : {}),
          ...(offersOf(item, tiers).length ? { offers: offersOf(item, tiers) } : {}),
        })),
      })),
    },
    breadcrumb(domain, 'La carta', '/carta/'),
  ];

  const body = `    <section class="section">
      <div class="container">
        <header class="menu-header">
          <span class="eyebrow">Nuestras pizzas</span>
          <h1 class="section-title">La carta de Voy Volando en Santa Fe</h1>
          <div class="ornament" aria-hidden="true"><span>◆</span></div>
          <p class="section-intro" style="margin:0 auto">Clásicas y gourmet, con masa artesanal hecha cada mañana. Pídelas a domicilio en Santa Fe y alrededores, para recoger o para comer en el local: <a href="tel:958442847">958 44 28 47</a>.</p>
        </header>

${sections}

        <div class="ornament" aria-hidden="true"><span>◆</span></div>
        <p style="text-align:center">
          <a href="tel:958442847" class="btn btn-primary">Pedir por teléfono · 958 44 28 47</a>
        </p>
        <p style="text-align:center">
          <a href="/#menu">Ver la carta con fotos y filtro de alérgenos</a>${
            pdf
              ? `\n          · <a href="${esc(pdf)}" target="_blank" rel="noopener">Carta en PDF</a>`
              : ''
          }
        </p>
      </div>
    </section>`;

  return shell({
    domain,
    path: '/carta/',
    title: 'Carta y precios — Pizzería Voy Volando, Santa Fe (Granada)',
    description:
      'Carta completa de Pizzería Voy Volando en Santa Fe (Granada): pizzas clásicas y especiales, pastas, ensaladas y postres con sus precios. A domicilio, para recoger o en el local.',
    jsonLd,
    body,
  });
}

function renderItem(item, tiers) {
  const price = priceText(item, tiers);
  return `            <li class="carta-item">
              <h3 class="carta-item-name">${esc(item.name)}</h3>${
                item.description
                  ? `\n              <p class="carta-item-desc">${esc(item.description)}</p>`
                  : ''
              }${price ? `\n              <p class="carta-item-price">${esc(price)}</p>` : ''}${
                item.allergens && item.allergens.length
                  ? `\n              <p class="carta-item-alerg"><strong>Alérgenos:</strong> ${item.allergens
                      .map(esc)
                      .join(', ')}</p>`
                  : ''
              }
            </li>`;
}

// Identificador estable para el aria-labelledby de cada categoría.
function slug(value) {
  return String(value)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function renderContacto({ domain, site, ordering, business }) {
  const zones = (ordering && ordering.delivery && ordering.delivery.zones) || [];
  const hours = String((site && site.hours) || '')
    .split('\n')
    .filter(Boolean);
  const address = (site && site.address) || 'C. Cristóbal Colón, 7';
  const city = (site && site.city) || '18320 Santa Fe, Granada';
  // Enlace por Place ID: apunta a esta ficha concreta, no a una búsqueda que
  // podría resolver en otro de los Voy Volando de la provincia.
  const maps = business.mapsUrl;

  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'Restaurant',
      '@id': `https://${domain}/#restaurant`,
      name: 'Pizzería Voy Volando',
      url: `https://${domain}/`,
      telephone: '+34958442847',
      email: 'info@voyvolandosantafe.com',
      address: {
        '@type': 'PostalAddress',
        streetAddress: address,
        addressLocality: 'Santa Fe',
        addressRegion: 'Granada',
        postalCode: '18320',
        addressCountry: 'ES',
      },
      ...(zones.length ? { areaServed: zones.map((z) => ({ '@type': 'Place', name: z })) } : {}),
      geo: { '@type': 'GeoCoordinates', ...business.geo },
      hasMap: business.mapsUrl,
      sameAs: business.sameAs,
    },
    breadcrumb(domain, 'Contacto', '/contacto/'),
  ];

  const body = `    <section class="section">
      <div class="container-narrow">
        <span class="eyebrow">Encuéntranos</span>
        <h1 class="section-title">Pizzería Voy Volando en Santa Fe: dónde estamos y cómo pedir</h1>
        <p class="section-intro">Estamos en el centro de Santa Fe (Granada). Puedes pedir a domicilio, pasar a recoger o comer en el local. Los pedidos se hacen por teléfono, sin intermediarios ni comisiones.</p>

        <dl>
          <div class="info-item">
            <dt>Teléfono</dt>
            <dd><a href="tel:958442847">958 44 28 47</a></dd>
          </div>
          <div class="info-item">
            <dt>Dirección</dt>
            <dd>${esc(address)}<br>${esc(city)} · <a href="${esc(maps)}" target="_blank" rel="noopener">Ver en Google Maps</a></dd>
          </div>
          <div class="info-item">
            <dt>Email</dt>
            <dd><a href="mailto:info@voyvolandosantafe.com">info@voyvolandosantafe.com</a></dd>
          </div>${
            hours.length
              ? `\n          <div class="info-item">
            <dt>Horario</dt>
            <dd>${hours.map(esc).join('<br>')}</dd>
          </div>`
              : ''
          }${
            zones.length
              ? `\n          <div class="info-item">
            <dt>Reparto a domicilio</dt>
            <dd>${zones.map(esc).join(' · ')}</dd>
          </div>`
              : ''
          }
        </dl>

        <div class="ornament" aria-hidden="true"><span>◆</span></div>
        <p style="text-align:center">
          <a href="tel:958442847" class="btn btn-primary">Llamar · 958 44 28 47</a>
          <a href="/carta/" class="btn btn-outline">Ver la carta</a>
        </p>
      </div>
    </section>`;

  return shell({
    domain,
    path: '/contacto/',
    title: 'Contacto, horario y reparto — Pizzería Voy Volando (Santa Fe, Granada)',
    description:
      'Teléfono, dirección, horario y zona de reparto de Pizzería Voy Volando en Santa Fe (Granada). Pide a domicilio o para recoger llamando al 958 44 28 47.',
    jsonLd,
    body,
  });
}
