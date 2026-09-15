// Ofertas: la sección de promociones que el WordPress ya tenía ("Familiares a
// 10€", "Día de la Pizza"...). Cambian a menudo y las edita el dueño, así que
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

const read = () => {
  const o = readJSON(FILE, EMPTY);
  return { ...EMPTY, ...o, items: Array.isArray(o.items) ? o.items : [] };
};

router.get('/', (_req, res) => {
  res.json(read());
});

// Whole-document save. The photo of each card is owned by the image endpoints,
// so it is carried over by id instead of coming from the payload; a card that
// disappears takes its file with it, otherwise assets/ofertas/ would fill up
// with images nothing links to.
router.put('/', requireAuth, (req, res) => {
  const b = req.body || {};
  const previous = read();
  const imageById = new Map(previous.items.map((i) => [i.id, i.image]));

  const items = (Array.isArray(b.items) ? b.items : [])
    .slice(0, MAX_ITEMS)
    .map((i, n) => {
      const id = String(i.id || `${Date.now()}${n}`).slice(0, 24);
      const image = imageById.get(id);
      imageById.delete(id); // lo que quede en el mapa ya no está en la lista
      return {
        id,
        title: String(i.title || '').slice(0, 80),
        description: String(i.description || '').slice(0, 300),
        ...(image ? { image } : {}),
      };
    })
    .filter((i) => i.title);

  for (const orphan of imageById.values()) removeImage(OFFERS_IMG_DIR, orphan);

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
    removeImage(OFFERS_IMG_DIR, item.image);
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
  removeImage(OFFERS_IMG_DIR, item.image);
  delete item.image;
  writeJSON(FILE, doc);
  res.json({ ok: true });
});

module.exports = router;
