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

  ROOT,
  PUBLIC_DIR,
  DATA_DIR,
  ASSETS_DIR: path.join(PUBLIC_DIR, 'assets'),
  GALLERY_DIR: path.join(PUBLIC_DIR, 'assets', 'gallery'),

  SESSION_TTL: 8 * 60 * 60 * 1000, // 8h, sliding
  SESSION_COOKIE: 'vv_sess',

  LOGIN_MAX_FAILS: 5,
  LOGIN_WINDOW: 15 * 60 * 1000,

  REVIEWS_CACHE_TTL: 10 * 60 * 1000,

  UPLOAD_IMAGE_MAX_BYTES: 15 * 1024 * 1024,
  UPLOAD_IMAGE_MAX_FILES: 30,
  UPLOAD_PDF_MAX_BYTES: 20 * 1024 * 1024,

  IMAGE_MAX_DIMENSION: 1600,
  IMAGE_WEBP_QUALITY: 80,
};
