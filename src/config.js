// Central configuration: environment, paths and tunable constants.
// DATA_DIR/PUBLIC_DIR can be overridden via env (used by the test suite).
require('dotenv').config();

const path = require('path');

const ROOT = path.join(__dirname, '..');
const PUBLIC_DIR = process.env.PUBLIC_DIR || path.join(ROOT, 'public');
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');

module.exports = {
  PORT: Number(process.env.PORT) || 3000,
  PROD: process.env.NODE_ENV === 'production',

  // Feature flags. Online ordering ships OFF: the transitional site (static
  // export on GitHub Pages) has no backend that could take an order, and the
  // flag is the single switch that turns the whole feature on later —
  // it overrides `enabled` in ordering.json, never the other way round.
  FEATURES: {
    ordering: process.env.ORDERING_ENABLED === 'true',
  },

  // Quién es este negocio en las fuentes de fuera. Vive aquí y no en
  // data/config.json porque no se edita desde el panel, y porque el JSON-LD de
  // public/index.html tiene que llevar exactamente lo mismo: el build falla si
  // los dos se separan (assertBusinessData en scripts/build-static.mjs).
  //
  // Las coordenadas son las que Google tiene para la ficha, no las de un clic
  // en el mapa: así el `geo` del schema refuerza la ficha en vez de discutirle
  // dónde está el local. La URL de Maps va por Place ID, que es la forma
  // estable — el enlace de "Compartir" es un acortador y la URL larga arrastra
  // parámetros de sesión.
  BUSINESS: {
    placeId: 'ChIJk6fHXwz_cQ0R2Wk0sAhpZ9s',
    geo: { latitude: 37.19014, longitude: -3.71875 },
    mapsUrl: 'https://www.google.com/maps/place/?q=place_id:ChIJk6fHXwz_cQ0R2Wk0sAhpZ9s',
    sameAs: [
      'https://www.google.com/maps/place/?q=place_id:ChIJk6fHXwz_cQ0R2Wk0sAhpZ9s',
      'https://www.instagram.com/voy_volando_santafe/',
    ],
  },

  // El despliegue de Node ya solo sirve el panel: el escaparate vive en GitHub
  // Pages. Search Console encontró gestion.voyvolandosantafe.com indexado (el
  // PDF de la carta y las fotos en crudo de la galería), compitiendo con el
  // sitio bueno. Con NOINDEX=true ese despliegue pide a los rastreadores que no
  // entren; public/robots.txt no sirve para esto, porque solo vale para el host
  // desde el que se sirve y allí dice Allow: /.
  NOINDEX: process.env.NOINDEX === 'true',

  ROOT,
  PUBLIC_DIR,
  DATA_DIR,
  DIST_DIR: process.env.DIST_DIR || path.join(ROOT, 'dist'),
  ASSETS_DIR: path.join(PUBLIC_DIR, 'assets'),
  GALLERY_DIR: path.join(PUBLIC_DIR, 'assets', 'gallery'),
  MENU_IMG_DIR: path.join(PUBLIC_DIR, 'assets', 'menu'),
  OFFERS_IMG_DIR: path.join(PUBLIC_DIR, 'assets', 'ofertas'),
  SPECIAL_IMG_DIR: path.join(PUBLIC_DIR, 'assets', 'especial'),

  SESSION_TTL: 8 * 60 * 60 * 1000, // 8h, sliding
  SESSION_COOKIE: 'vv_sess',

  LOGIN_MAX_FAILS: 5,
  LOGIN_WINDOW: 15 * 60 * 1000,

  REVIEWS_CACHE_TTL: 10 * 60 * 1000,

  // Online ordering
  ORDERS_FILE: 'orders.json',
  ORDERING_FILE: 'ordering.json',
  ORDER_PENDING_TTL: 60 * 60 * 1000, // unpaid Stripe orders expire after 1h
  ORDER_MAX_QTY: 20,
  ORDER_MAX_ITEMS: 30,
  ORDER_RETENTION_DAYS: 90,
  ORDER_MAX_FAILS: 10, // orders per IP per window
  ORDER_WINDOW: 15 * 60 * 1000,
  ORDER_CANCEL_WINDOW: 5 * 60 * 1000, // customer self-cancel, no questions asked
  PUBLIC_BASE_URL: process.env.PUBLIC_BASE_URL || 'http://localhost:3000',

  UPLOAD_IMAGE_MAX_BYTES: 15 * 1024 * 1024,
  UPLOAD_IMAGE_MAX_FILES: 30,
  UPLOAD_PDF_MAX_BYTES: 20 * 1024 * 1024,

  IMAGE_MAX_DIMENSION: 1600,
  IMAGE_WEBP_QUALITY: 80,

  // Static export (scripts/build-static.mjs): custom domain written to
  // dist/CNAME, and the files the admin-only half of the site lives in.
  SITE_DOMAIN: process.env.SITE_DOMAIN || 'voyvolandosantafe.com',
  // Google Tag Manager (y, si hiciera falta, GA4 directo). Solo entran en el
  // build estático (scripts/build-static.mjs), que es lo que se publica en el
  // dominio: ni `pnpm dev` ni el despliegue del panel mandan visitas a
  // Analytics. Los IDs son públicos (van en el HTML de cualquier web que los
  // use), por eso viven aquí y no en .env. public/js/consent.js no carga
  // ninguno hasta que el visitante acepta el banner de cookies.
  //
  // GA4 (G-3RFQEGM4YJ) va configurado DENTRO del contenedor de GTM, como
  // "Etiqueta de Google" con el activador Initialization - All Pages. Por eso
  // ga4 está vacío: cargarlo también desde aquí contaría cada visita dos veces.
  ANALYTICS: {
    ga4: process.env.GA_MEASUREMENT_ID ?? '',
    gtm: process.env.GTM_CONTAINER_ID ?? 'GTM-T3G79KW8',
  },
  STATIC_EXCLUDE: [
    'admin.html',
    'pedido.html',
    'css/admin.css',
    'js/admin.js',
    'js/order-status.js',
  ],
};
