// Gallery: files live on disk (public/assets/gallery), display order in
// data/gallery.json. list() reconciles both so a manually copied or deleted
// file never breaks the order.
const fs = require('fs');
const { GALLERY_DIR } = require('../config');
const { readJSON, writeJSON } = require('../lib/json-store');

const GALLERY_FILE = 'gallery.json';

if (!fs.existsSync(GALLERY_DIR)) fs.mkdirSync(GALLERY_DIR, { recursive: true });

function filesOnDisk() {
  return fs.readdirSync(GALLERY_DIR).filter((f) => /\.(jpe?g|png|webp|gif|avif)$/i.test(f));
}

function list() {
  const onDisk = new Set(filesOnDisk());
  const order = readJSON(GALLERY_FILE, []).filter((e) => onDisk.has(e.filename));
  const known = new Set(order.map((e) => e.filename));
  for (const f of onDisk) if (!known.has(f)) order.push({ filename: f, alt: '' });
  return order;
}

function saveOrder(entries) {
  writeJSON(GALLERY_FILE, entries);
}

module.exports = { list, saveOrder };
