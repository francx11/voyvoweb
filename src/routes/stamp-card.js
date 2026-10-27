// Tarjeta de sellos: la explica en la portada. Las reglas de verdad viven en el
// TPV del local (Ajustes > Negocio > Tarjeta de sellos); esto es solo el texto,
// que se edita desde el panel de socios (commit a data/stamp-card.json). Por eso
// aquí no hay PUT: solo lectura, normalizada para que un JSON a medias no rompa
// la portada.
const { Router } = require('express');
const { readJSON } = require('../lib/json-store');

const FILE = 'stamp-card.json';
const EMPTY = {
  active: false,
  title: '',
  intro: '',
  goal: 10,
  reward: '',
  steps: [],
  notes: [],
  privacy: '',
};

const str = (v) => (typeof v === 'string' ? v : '');

const read = () => {
  const o = readJSON(FILE, EMPTY);
  const goal = Number.isInteger(o.goal) && o.goal >= 1 && o.goal <= 99 ? o.goal : EMPTY.goal;
  return {
    active: o.active === true,
    title: str(o.title),
    intro: str(o.intro),
    goal,
    reward: str(o.reward),
    steps: (Array.isArray(o.steps) ? o.steps : [])
      .map((s) => ({ title: str(s && s.title), text: str(s && s.text) }))
      .filter((s) => s.title),
    notes: (Array.isArray(o.notes) ? o.notes : []).map(str).filter(Boolean),
    privacy: str(o.privacy),
  };
};

const router = Router();

router.get('/', (_req, res) => {
  res.json(read());
});

module.exports = router;
