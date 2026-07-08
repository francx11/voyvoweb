const fs = require('fs');
const path = require('path');
const { Router } = require('express');
const sharp = require('sharp');
const { GALLERY_DIR, IMAGE_MAX_DIMENSION, IMAGE_WEBP_QUALITY } = require('../config');
const gallery = require('../services/gallery-store');
const requireAuth = require('../middleware/require-auth');
const { imageUpload } = require('../middleware/uploads');

const router = Router();

router.get('/', (_req, res) => {
  res.json(gallery.list().map((e) => ({ ...e, url: `/assets/gallery/${e.filename}` })));
});

router.post('/upload', requireAuth, imageUpload.array('photos', 30), async (req, res) => {
  try {
    const saved = [];
    for (const file of req.files || []) {
      const name = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}.webp`;
      await sharp(file.buffer)
        .rotate() // respects EXIF orientation
        .resize({
          width: IMAGE_MAX_DIMENSION,
          height: IMAGE_MAX_DIMENSION,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .webp({ quality: IMAGE_WEBP_QUALITY })
        .toFile(path.join(GALLERY_DIR, name));
      saved.push({ filename: name, url: `/assets/gallery/${name}` });
    }
    gallery.saveOrder(gallery.list()); // folds new files in at the end
    res.json(saved);
  } catch (e) {
    res.status(400).json({ error: `Error procesando imagen: ${e.message}` });
  }
});

router.put('/order', requireAuth, (req, res) => {
  const { filenames } = req.body || {};
  if (!Array.isArray(filenames)) return res.status(400).json({ error: 'filenames[] esperado' });
  const current = gallery.list();
  const byName = new Map(current.map((e) => [e.filename, e]));
  const sorted = filenames.map((f) => byName.get(path.basename(f))).filter(Boolean);
  for (const e of current) if (!sorted.includes(e)) sorted.push(e);
  gallery.saveOrder(sorted);
  res.json({ ok: true });
});

router.delete('/:filename', requireAuth, (req, res) => {
  const name = path.basename(req.params.filename); // prevents path traversal
  const fp = path.join(GALLERY_DIR, name);
  if (fs.existsSync(fp)) fs.unlinkSync(fp);
  gallery.saveOrder(gallery.list());
  res.json({ ok: true });
});

module.exports = router;
