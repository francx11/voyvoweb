const { Router } = require('express');
const { SPECIAL_IMG_DIR } = require('../config');
const { readJSON, writeJSON } = require('../lib/json-store');
const { saveWebp, removeImage } = require('../services/image-store');
const requireAuth = require('../middleware/require-auth');
const { imageUpload } = require('../middleware/uploads');

const FILE = 'monthly-special.json';

const router = Router();

router.get('/', (_req, res) => {
  res.json(readJSON(FILE, { active: false }));
});

router.put('/', requireAuth, (req, res) => {
  const b = req.body || {};
  const current = readJSON(FILE, {});
  writeJSON(FILE, {
    active: b.active === true,
    emoji: String(b.emoji || '🔥').slice(0, 8),
    name: String(b.name || '').slice(0, 80),
    description: String(b.description || '').slice(0, 500),
    badge: String(b.badge || '').slice(0, 40),
    cta: String(b.cta || '').slice(0, 60),
    // The photo has its own endpoints; a text save must not wipe it.
    ...(current.image ? { image: current.image } : {}),
  });
  res.json({ ok: true });
});

// The old photo is removed so replacements never orphan a file on disk.
router.post('/image', requireAuth, imageUpload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Imagen requerida' });
  try {
    const name = await saveWebp(req.file.buffer, SPECIAL_IMG_DIR);
    const ms = readJSON(FILE, {});
    removeImage(SPECIAL_IMG_DIR, ms.image);
    ms.image = `/assets/especial/${name}`;
    writeJSON(FILE, ms);
    res.json({ ok: true, image: ms.image });
  } catch (e) {
    res.status(400).json({ error: `Error procesando imagen: ${e.message}` });
  }
});

router.delete('/image', requireAuth, (req, res) => {
  const ms = readJSON(FILE, {});
  removeImage(SPECIAL_IMG_DIR, ms.image);
  delete ms.image;
  writeJSON(FILE, ms);
  res.json({ ok: true });
});

module.exports = router;
