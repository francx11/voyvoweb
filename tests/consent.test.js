'use strict';

// consent.js: el evento 'contacto' solo llega a dataLayer con consentimiento aceptado.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'consent.js'), 'utf8');

function run(saved) {
  let onClick = null;
  const store = { vv_consent: saved };
  const window = {};
  const document = {
    currentScript: { getAttribute: (k) => (k === 'data-gtm' ? 'GTM-TEST' : null) },
    head: { appendChild() {} },
    body: { appendChild() {} },
    cookie: '',
    createElement: () => ({ setAttribute() {}, addEventListener() {} }),
    querySelectorAll: () => [],
    addEventListener: (type, fn) => {
      if (type === 'click') onClick = fn;
    },
  };
  const ctx = {
    window,
    document,
    location: { hostname: 'voyvolandosantafe.com' },
    localStorage: { getItem: (k) => store[k] ?? null, setItem: (k, v) => (store[k] = v) },
    Date,
  };
  vm.runInNewContext(SRC, ctx);
  const click = (href, { id = '', zona = null } = {}) => {
    const a = {
      id,
      getAttribute: () => href,
      closest: () => zona,
    };
    onClick({ target: { closest: () => a } });
  };
  const eventos = () => window.dataLayer.filter((x) => x && x.event === 'contacto');
  return { click, eventos };
}

test('con consentimiento: clasifica los enlaces de contacto', () => {
  const { click, eventos } = run('granted');
  click('tel:958442847', { zona: { id: 'contacto', tagName: 'SECTION' } });
  click(
    'https://www.just-eat.es/restaurants-pizzeria-voy-volando-santa-fe-santa-fe/menu#pre-order'
  );
  click('mailto:info@voyvolandosantafe.com', { zona: { id: '', tagName: 'FOOTER' } });
  click('/assets/menu-1784653141091.pdf', { id: 'menu-pdf-link' });
  click('https://maps.app.goo.gl/abc');
  click('https://wa.me/34600000000');
  click('#carta');
  const ev = eventos();
  assert.deepStrictEqual(
    Array.from(ev, (e) => e.metodo),
    ['telefono', 'just_eat', 'email', 'carta_pdf', 'como_llegar', 'whatsapp']
  );
  assert.strictEqual(ev[0].ubicacion, 'contacto');
  assert.strictEqual(ev[2].ubicacion, 'footer');
  assert.strictEqual(ev[1].ubicacion, 'pagina');
});

test('sin consentimiento (rechazado o sin decidir): no empuja nada', () => {
  for (const saved of ['denied', null]) {
    const { click, eventos } = run(saved);
    click('tel:958442847');
    assert.strictEqual(eventos().length, 0);
  }
});
