/* Páginas con contenido real para el export estático: /carta/ y /contacto/.
 *
 * Por qué existen. La portada es una sola página con secciones ancladas y la
 * carta se pinta en el navegador desde /api/menu.json. Para Google eso es una
 * URL, no tres: un fragmento (#menu) no se indexa por separado. Search Console
 * dice que /carta/ traía 534 clics al año — el 30 % del sitio — y /contacto/
 * otros 21, así que esas dos rutas necesitan seguir siendo URLs de verdad con
 * el contenido dentro del HTML, no una redirección al ancla.
 *
 * Su contenido no lo pinta JavaScript a propósito: se genera en el build a
 * partir de los mismos JSON congelados que consume la portada, así que no hay
 * un segundo renderizador que pueda desincronizarse. Lo único que cargan es
 * js/ui.js —el mismo de la portada— para que la cabecera se comporte igual:
 * botón de modo oscuro y menú hamburguesa. Sin él siguen siendo legibles y
 * navegables, porque main.css ya resuelve el tema por prefers-color-scheme.
 */

import { createRequire } from 'node:module';
import { metaTags } from '../sync-theme.mjs';
import { siteHeader, siteFooter, hoursOf } from './layout.mjs';

const require = createRequire(import.meta.url);
const { themeColor } = require('../../src/services/theme-store');

const escapeMap = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };

// La sección «Pide en Just Eat» de la portada se puede apagar desde el panel
// (site.justEat.enabled = false en config.json): a veces no interesa mandar
// pedidos por ahí, con su comisión. Se quita del HTML en el build, no se
// esconde con JS, para que no llegue ni a Google ni a quien no ejecuta JS.
// Sin el campo, se muestra: es lo que había antes de existir el interruptor.
export const justEatVisible = (site) => !(site && site.justEat && site.justEat.enabled === false);

const JUST_EAT = /[ \t]*<!-- JUST EAT -->\s*<section[^>]*id="just-eat"[\s\S]*?<\/section>\r?\n?/;

export function applyJustEat(html, site) {
  if (justEatVisible(site)) return html;
  if (!JUST_EAT.test(html)) throw new Error('index.html: sección #just-eat no encontrada');
  return html.replace(JUST_EAT, '');
}

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

// Misma regla que shortSizeLabel() en public/js/main.js: "Pequeña 30 cm · 1
// persona" queda en "Pequeña" junto al precio; el diámetro y las personas van
// una sola vez bajo el título de la categoría (tierLine).
const shortSizeLabel = (label) =>
  String(label || '')
    .replace(/\s*\d+(?:[.,]\d+)?\s*cm\b.*$/i, '')
    .trim() || label;

export function priceText(item, tiers) {
  const sizes = sizesOf(item, tiers);
  if (sizes) return sizes.map((s) => `${shortSizeLabel(s.label)} ${euro(s.price)}`).join(' · ');
  return item.price != null ? euro(item.price) : '';
}

// Los tamaños de la tarifa compartida por todo el grupo (las pizzas), o ''.
function tierLine(items, tiers) {
  const first = items[0] && items[0].pricing;
  if (!first || first.mode !== 'tier') return '';
  const same = items.every(
    (item) => item.pricing && item.pricing.mode === 'tier' && item.pricing.tierId === first.tierId
  );
  const tier = same && tiers[first.tierId];
  if (!tier || !tier.sizes || !tier.sizes.length) return '';
  return tier.sizes
    .map((s) => {
      const [size, ...rest] = String(s.label || '').split(' · ');
      return `<strong>${esc(size)}</strong>${rest.length ? ` ${esc(rest.join(' · '))}` : ''} ${esc(euro(s.price))}`;
    })
    .join(' · ');
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

// Esqueleto común de las páginas generadas en el build. La cabecera y el pie
// salen de layout.mjs, los mismos que llevan la portada y las legales.
// indexable: false es para la 404: sin canonical ni og:url (no tiene URL
// propia que declarar) y con noindex.
export function shell({
  domain,
  path,
  title,
  description,
  jsonLd = [],
  body,
  site,
  ordering,
  indexable = true,
}) {
  const url = `https://${domain}${path}`;
  const robots = indexable ? 'index, follow, max-image-preview:large' : 'noindex';
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">

  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">
  <meta name="robots" content="${robots}">${indexable ? `\n  <link rel="canonical" href="${url}">` : ''}
  ${metaTags(themeColor())}

  <link rel="icon" href="/favicon.ico" sizes="any">
  <link rel="icon" type="image/png" sizes="32x32" href="/assets/favicon-32.png">
  <link rel="icon" type="image/png" sizes="16x16" href="/assets/favicon-16.png">
  <link rel="apple-touch-icon" href="/assets/apple-touch-icon.png">

  <meta property="og:type" content="website">
  <meta property="og:locale" content="es_ES">
  <meta property="og:site_name" content="Pizzería Voy Volando">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
${indexable ? `  <meta property="og:url" content="${url}">\n` : ''}  <meta property="og:image" content="https://${domain}/assets/og-image.jpg">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:card" content="summary_large_image">

${jsonLd.map(jsonLdBlock).join('\n')}

  <link rel="preload" href="/assets/fonts/barlow-400-latin.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="preload" href="/assets/fonts/alfa-slab-one-400-latin.woff2" as="font" type="font/woff2" crossorigin>

  <!-- theme.css primero: define los tokens de color que main.css consume. -->
  <link rel="stylesheet" href="/css/theme.css">
  <link rel="stylesheet" href="/css/main.css">
</head>
<body>

  <a class="skip-link" href="#content">Saltar al contenido</a>

${siteHeader(path)}

  <main id="content">
${body}
  </main>

${siteFooter({ site, ordering })}

  <script src="/js/ui.js" defer></script>

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
  /* El CTA de vuelta a la portada prometía "con fotos" cuando ningún plato
     tiene foto subida. La condición no es la bandera sola: con "auto" el hueco
     aparece plato a plato, así que lo que decide es si hay alguna foto de
     verdad. Sin ellas, la portada sigue ofreciendo algo que esta página no
     tiene —el filtro por alérgenos—, y eso es lo que se anuncia. */
  const photos = (site && site.menu && site.menu.photos) || 'auto';
  const hasPhotos = photos !== 'never' && (photos === 'always' || items.some((item) => item.image));

  const sections = groups
    .map(
      (group) => `        <section class="carta-group" aria-labelledby="cat-${esc(
        slug(group.category)
      )}">
          <h2 class="section-title" id="cat-${esc(slug(group.category))}">${esc(
            group.category
          )}</h2>${
            tierLine(group.items, tiers)
              ? `\n          <p class="carta-tiers">${tierLine(group.items, tiers)}</p>`
              : ''
          }
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
          <div class="airmail-rule" aria-hidden="true"></div>
          <p class="section-intro" style="margin:0 auto">Clásicas y gourmet, con ingredientes frescos. Pídelas a domicilio en Santa Fe y alrededores o pasa a recogerlas por el local.</p>
        </header>

${sections}

        <div class="airmail-rule" aria-hidden="true"></div>
        <p class="actions-row">
          <a href="tel:958442847" class="btn btn-primary">Pedir por teléfono · 958 44 28 47</a>
          <a href="/#menu" class="btn btn-outline">${
            hasPhotos ? 'Ver la carta con fotos' : 'Ver la carta y filtrar por alérgenos'
          }</a>${
            pdf
              ? `\n          <a href="${esc(
                  pdf
                )}" class="btn btn-outline" target="_blank" rel="noopener">Carta en PDF</a>`
              : ''
          }
        </p>
      </div>
    </section>`;

  return shell({
    domain,
    path: '/carta/',
    site,
    ordering,
    title: 'Carta y precios — Pizzería Voy Volando, Santa Fe (Granada)',
    description:
      'Carta completa de Pizzería Voy Volando en Santa Fe (Granada): pizzas clásicas, especiales y gourmet, gratinados, tacos franceses, camperos, pastas, ensaladas y postres con sus precios. A domicilio o para recoger.',
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
              }${
                item.traces && item.traces.length
                  ? `\n              <p class="carta-item-alerg"><strong>Puede contener trazas de:</strong> ${item.traces
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

function deliveryTermsOf(delivery) {
  return [
    delivery.fee != null ? `Envío ${euro(delivery.fee)}` : '',
    delivery.minimum
      ? `pedido mínimo ${euro(delivery.minimum)}${delivery.minimumNote ? ` ${delivery.minimumNote}` : ''}`
      : '',
  ].filter(Boolean);
}

// La ficha del negocio que repiten /contacto/ y /a-domicilio/. Mismo @id que la
// portada: para Google son la misma entidad vista desde tres URL.
function restaurantLd({ domain, address, zones, business }) {
  return {
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
  };
}

export function renderContacto({ domain, site, ordering, business }) {
  const delivery = (ordering && ordering.delivery) || {};
  const zones = delivery.zones || [];
  const deliveryTerms = deliveryTermsOf(delivery);
  const hours = String((site && site.hours) || '')
    .split('\n')
    .filter(Boolean);
  const address = (site && site.address) || 'C. Cristóbal Colón, 7';
  const city = (site && site.city) || '18320 Santa Fe, Granada';
  // Enlace por Place ID: apunta a esta ficha concreta, no a una búsqueda que
  // podría resolver en otro de los Voy Volando de la provincia.
  const maps = business.mapsUrl;

  const jsonLd = [
    restaurantLd({ domain, address, zones, business }),
    breadcrumb(domain, 'Contacto', '/contacto/'),
  ];

  const body = `    <section class="section">
      <div class="container-narrow">
        <span class="eyebrow">Encuéntranos</span>
        <h1 class="section-title">Pizzería Voy Volando en Santa Fe: dónde estamos y cómo pedir</h1>
        <p class="section-intro">Estamos en el centro de Santa Fe (Granada). Trabajamos solo a domicilio y para recoger: los pedidos se hacen por teléfono, sin intermediarios ni comisiones.</p>

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
            <dd>${zones.map(esc).join(' · ')}<br><a href="/a-domicilio/">Zonas y condiciones de reparto</a></dd>
          </div>`
              : ''
          }${
            deliveryTerms.length
              ? `
          <div class="info-item">
            <dt>Gastos de envío</dt>
            <dd>${esc(deliveryTerms.join(' · '))}</dd>
          </div>`
              : ''
          }
        </dl>

        <div class="airmail-rule" aria-hidden="true"></div>
        <p class="actions-row">
          <a href="tel:958442847" class="btn btn-primary">Llamar · 958 44 28 47</a>
          <a href="/carta/" class="btn btn-outline">Ver la carta</a>
        </p>
      </div>
    </section>`;

  return shell({
    domain,
    path: '/contacto/',
    site,
    ordering,
    title: 'Contacto, horario y reparto — Pizzería Voy Volando (Santa Fe, Granada)',
    description:
      'Teléfono, dirección, horario y zona de reparto de Pizzería Voy Volando en Santa Fe (Granada). Pide a domicilio o para recoger llamando al 958 44 28 47.',
    jsonLd,
    body,
  });
}

const joinList = (items) =>
  items.length > 1
    ? `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`
    : items[0] || '';

// /a-domicilio/: la página de zonas de reparto (plan SEO local, nov-2026).
//
// Una sola página para todas las zonas y no una por pueblo: cinco páginas
// iguales con el nombre cambiado son «páginas puerta» para Google. Cuando haya
// datos propios de cada pueblo (tiempo de entrega medido, lo más pedido allí)
// y Search Console enseñe búsquedas con su nombre, se parte en
// /a-domicilio/<pueblo>/. Todo lo que dice sale de ordering.json y
// config.json: zonas, envío, mínimo y horario.
export function renderADomicilio({ domain, site, ordering, business }) {
  const delivery = (ordering && ordering.delivery) || {};
  const zones = delivery.zones || [];
  const terms = deliveryTermsOf(delivery);
  const hours = hoursOf(site);
  const address = (site && site.address) || 'C. Cristóbal Colón, 7';
  const city = (site && site.city) || '18320 Santa Fe, Granada';
  const zoneText = joinList(zones);
  const termsText = terms.length ? `${terms.join(' · ')}.` : '';

  const faq = [
    {
      q: '¿Hasta dónde lleváis las pizzas?',
      a: zones.length
        ? `Repartimos en ${zoneText}. Si vives cerca y no sabes si llegamos, llámanos al 958 44 28 47 y te lo decimos.`
        : 'Llámanos al 958 44 28 47 y te decimos si llegamos a tu casa.',
    },
    ...(termsText ? [{ q: '¿Cuánto cuesta el envío?', a: termsText }] : []),
    {
      q: '¿Puedo pasar a recogerla?',
      a: `Sí. Pide por teléfono y recógela en ${address}, ${city}. No tenemos sala: solo reparto y recogida.`,
    },
    {
      q: '¿Cómo hago el pedido?',
      a: 'Llamando al 958 44 28 47 en horario de apertura. El pedido nos llega directo, sin plataformas de por medio.',
    },
  ];

  const jsonLd = [
    restaurantLd({ domain, address, zones, business }),
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: faq.map((item) => ({
        '@type': 'Question',
        name: item.q,
        acceptedAnswer: { '@type': 'Answer', text: item.a },
      })),
    },
    breadcrumb(domain, 'Pizza a domicilio', '/a-domicilio/'),
  ];

  const zonesSection = zones.length
    ? `
    <section class="section" id="zonas" aria-labelledby="zonas-title">
      <div class="container">
        <span class="eyebrow">Dónde repartimos</span>
        <h2 class="section-title" id="zonas-title">${zones.length} zonas, un mismo horno</h2>
        <ul class="zone-grid">
${zones
  .map(
    (z) =>
      `          <li class="zone-card"><span class="zone-pin" aria-hidden="true"></span>${esc(z)}</li>`
  )
  .join('\n')}
        </ul>${
          termsText
            ? `\n        <p class="zone-terms"><strong>Condiciones:</strong> ${esc(termsText)}</p>`
            : ''
        }
      </div>
    </section>
`
    : '';

  const hoursSection = hours.length
    ? `
    <section class="section" id="horario" aria-labelledby="horario-title">
      <div class="container-narrow">
        <span class="eyebrow">Horario</span>
        <h2 class="section-title" id="horario-title">Cuándo repartimos</h2>
        <ul class="hours-list">
${hours.map((h) => `          <li>${esc(h)}</li>`).join('\n')}
        </ul>
      </div>
    </section>
`
    : '';

  const faqItems = faq
    .map(
      (item) => `          <details>
            <summary>${esc(item.q)}</summary>
            <p>${esc(item.a)}</p>
          </details>`
    )
    .join('\n');

  const body = `    <section class="page-hero section-navy" aria-labelledby="page-title">
      <div class="container page-hero-inner">
        <span class="eyebrow">Reparto a domicilio</span>
        <h1 class="page-title" id="page-title">Pizza a domicilio en Santa Fe y pueblos cercanos</h1>
        <p class="page-lead">Pizza artesanal recién hecha, llevada a tu puerta${
          zones.length ? ` en ${esc(zoneText)}` : ''
        }. Pide por teléfono: sin plataformas ni comisiones.</p>
        <div class="hero-actions">
          <a href="tel:958442847" class="btn btn-primary">Llamar · 958 44 28 47</a>
          <a href="/carta/" class="btn btn-outline">Ver la carta</a>
        </div>
      </div>
    </section>
    <div class="airmail-rule" aria-hidden="true"></div>
${zonesSection}
    <section class="section section-alt" id="como-pedir" aria-labelledby="como-pedir-title">
      <div class="container">
        <span class="eyebrow">Cómo pedir</span>
        <h2 class="section-title" id="como-pedir-title">Tres pasos y a cenar</h2>
        <ol class="steps">
          <li class="step">
            <span class="step-num" aria-hidden="true">1</span>
            <h3 class="step-title">Elige en la carta</h3>
            <p>Pizzas pequeñas, medianas y familiares, tacos franceses, camperos y más. <a href="/carta/">Ver la carta con precios</a>.</p>
          </li>
          <li class="step">
            <span class="step-num" aria-hidden="true">2</span>
            <h3 class="step-title">Llama al 958 44 28 47</h3>
            <p>Dinos qué quieres y tu dirección. Te confirmamos el total al momento.</p>
          </li>
          <li class="step">
            <span class="step-num" aria-hidden="true">3</span>
            <h3 class="step-title">Te la llevamos</h3>
            <p>O pasa a recogerla por ${esc(address)}, en Santa Fe, si te pilla de camino.</p>
          </li>
        </ol>
      </div>
    </section>
${hoursSection}
    <section class="section section-alt" id="faq" aria-labelledby="faq-title">
      <div class="container-narrow">
        <span class="eyebrow">Preguntas frecuentes</span>
        <h2 class="section-title" id="faq-title">Dudas sobre el reparto</h2>
        <div class="faq-list">
${faqItems}
        </div>
        <p class="actions-row">
          <a href="tel:958442847" class="btn btn-primary">Pedir ahora · 958 44 28 47</a>
        </p>
      </div>
    </section>`;

  return shell({
    domain,
    path: '/a-domicilio/',
    site,
    ordering,
    title: 'Pizza a domicilio en Santa Fe y la Vega — Voy Volando',
    description: `Pizza artesanal a domicilio${
      zones.length ? ` en ${zoneText}` : ' en Santa Fe (Granada)'
    }. Pide por teléfono al 958 44 28 47.`,
    jsonLd,
    body,
  });
}

// 404 con la misma cabecera y pie que el resto: quien llega a una URL rota
// tiene a mano la carta, el teléfono y la navegación de siempre.
export function render404({ domain, site, ordering }) {
  const body = `    <section class="page-hero page-hero--center section-navy" aria-labelledby="page-title">
      <div class="container-narrow page-hero-inner">
        <span class="eyebrow">Error 404</span>
        <h1 class="page-title" id="page-title">Esta página no existe</h1>
        <p class="page-lead">Puede que el enlace sea antiguo. La carta y el teléfono siguen donde siempre.</p>
        <div class="hero-actions">
          <a href="/carta/" class="btn btn-primary">Ver la carta</a>
          <a href="/" class="btn btn-outline">Ir a la portada</a>
        </div>
      </div>
    </section>`;
  return shell({
    domain,
    path: '/404.html',
    site,
    ordering,
    title: 'Página no encontrada — Pizzería Voy Volando',
    description: 'La página que buscas no existe. Vuelve a la carta o llámanos al 958 44 28 47.',
    body,
    indexable: false,
  });
}
