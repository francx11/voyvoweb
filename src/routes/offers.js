// Ofertas: la sección de promociones que el WordPress ya tenía ("Familiares a
// 10€"...). Cambian a menudo y las edita el dueño, así que
// todo el bloque —el interruptor, el texto de entrada y las tarjetas— vive en
// offers.json y se guarda de una vez.
const { Router } = require('express');
const { OFFERS_IMG_DIR } = require('../config');
const { readJSON, writeJSON } = require('../lib/json-store');
const { saveWebp, removeImage } = require('../services/image-store');
const requireAuth = require('../middleware/require-auth');
const { imageUpload } = require('../middleware/uploads');

const FILE = 'offers.json';
const MAX_ITEMS = 12;
const EMPTY = { active: false, intro: '', items: [] };

const router = Router();

// Quita la foto de una tarjeta con su versión pequeña y su descripción (las dos
// describen la foto anterior).
function dropPhoto(item) {
  removeImage(OFFERS_IMG_DIR, item.image);
  removeImage(OFFERS_IMG_DIR, item.imageThumb);
  delete item.image;
  delete item.imageThumb;
  delete item.imageAlt;
}

const read = () => {
  const o = readJSON(FILE, EMPTY);
  return { ...EMPTY, ...o, items: Array.isArray(o.items) ? o.items : [] };
};

router.get('/', (_req, res) => {
  res.json(read());
});

// Whole-document save. The photo of each card is owned by the image endpoints
// (and by the panel, which also writes imageThumb and imageAlt), so it is
// carried over by id instead of coming from the payload; a card that
// disappears takes its files with it, otherwise assets/ofertas/ would fill up
// with images nothing links to.
router.put('/', requireAuth, (req, res) => {
  const b = req.body || {};
  const previous = read();
  const PHOTO_FIELDS = ['image', 'imageThumb', 'imageAlt'];
  const photoById = new Map(
    previous.items.map((i) => [
      i.id,
      Object.fromEntries(PHOTO_FIELDS.filter((k) => i[k]).map((k) => [k, i[k]])),
    ])
  );

  const items = (Array.isArray(b.items) ? b.items : [])
    .slice(0, MAX_ITEMS)
    .map((i, n) => {
      const id = String(i.id || `${Date.now()}${n}`).slice(0, 24);
      const photo = photoById.get(id) || {};
      photoById.delete(id); // lo que quede en el mapa ya no está en la lista
      return {
        id,
        title: String(i.title || '').slice(0, 80),
        description: String(i.description || '').slice(0, 300),
        ...(photo.image ? photo : {}),
      };
    })
    .filter((i) => i.title);

  for (const orphan of photoById.values()) {
    removeImage(OFFERS_IMG_DIR, orphan.image);
    removeImage(OFFERS_IMG_DIR, orphan.imageThumb);
  }

  const doc = {
    active: b.active === true,
    intro: String(b.intro || '').slice(0, 400),
    items,
  };
  writeJSON(FILE, doc);
  res.json(doc);
});

router.post('/:id/image', requireAuth, imageUpload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Imagen requerida' });
  const doc = read();
  const item = doc.items.find((i) => i.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'Oferta no encontrada' });
  try {
    const name = await saveWebp(req.file.buffer, OFFERS_IMG_DIR);
    dropPhoto(item);
    item.image = `/assets/ofertas/${name}`;
    writeJSON(FILE, doc);
    res.json({ ok: true, image: item.image });
  } catch (e) {
    res.status(400).json({ error: `Error procesando imagen: ${e.message}` });
  }
});

router.delete('/:id/image', requireAuth, (req, res) => {
  const doc = read();
  const item = doc.items.find((i) => i.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'Oferta no encontrada' });
  dropPhoto(item);
  writeJSON(FILE, doc);
  res.json({ ok: true });
});

module.exports = router;
