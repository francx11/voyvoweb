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
    createElement: () => ({ setAttribute() {}, addEventListener() {}, querySelectorAll: () => [] }),
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

test('aceptar → rechazar → aceptar sin recargar devuelve el permiso a GA', () => {
  let banner = null;
  const window = {};
  const store = { vv_consent: 'granted' };
  const settings = { addEventListener: (t, fn) => (settings.open = fn) };
  const makeBanner = () => {
    const buttons = ['denied', 'granted'].map((v) => ({
      getAttribute: (k) => (k === 'data-consent' ? v : null),
      setAttribute() {},
      focus() {},
    }));
    banner = {
      setAttribute() {},
      addEventListener: (t, fn) => (banner.onClick = fn),
      querySelectorAll: () => buttons,
      querySelector: () => buttons[0],
      pick: (v) =>
        banner.onClick({
          target: { closest: () => buttons.find((b) => b.getAttribute('data-consent') === v) },
        }),
    };
    return banner;
  };
  vm.runInNewContext(SRC, {
    window,
    document: {
      currentScript: { getAttribute: (k) => (k === 'data-gtm' ? 'GTM-TEST' : null) },
      head: { appendChild() {} },
      body: { appendChild() {} },
      cookie: '',
      createElement: makeBanner,
      querySelectorAll: () => [settings],
      addEventListener() {},
    },
    location: { hostname: 'voyvolandosantafe.com' },
    localStorage: { getItem: (k) => store[k] ?? null, setItem: (k, v) => (store[k] = v) },
    Date,
  });

  settings.open();
  banner.pick('denied');
  assert.strictEqual(store.vv_consent, 'denied');
  settings.open();
  banner.pick('granted');
  assert.strictEqual(store.vv_consent, 'granted');

  const updates = Array.from(
    window.dataLayer.filter((x) => x && x[0] === 'consent' && x[1] === 'update'),
    (x) => x[2].analytics_storage
  );
  assert.deepStrictEqual(updates, ['granted', 'denied', 'granted']);
});
