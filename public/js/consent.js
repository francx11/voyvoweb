/* Voy Volando — banner de cookies y carga de Google Analytics / Tag Manager.
 *
 * El build estático (scripts/build-static.mjs) mete esta etiqueta en cada
 * página publicada con los IDs en data-ga4 / data-gtm. En `pnpm dev` y en el
 * despliegue del panel no se inyecta, así que allí no se mide nada.
 *
 * Nada de Google se descarga antes de que el visitante diga que sí: la LSSI
 * (art. 22.2) y la guía de cookies de la AEPD piden consentimiento previo para
 * la analítica, y rechazar tiene que costar lo mismo que aceptar. Además se
 * declara Consent Mode v2 con todo denegado por defecto, para que cualquier
 * etiqueta que se añada en GTM herede la decisión.
 *
 * La decisión se guarda en localStorage (vv_consent). Cualquier elemento con
 * [data-cookie-settings] —el botón de /privacidad/— vuelve a abrir el banner.
 */
(function () {
  'use strict';

  var script = document.currentScript;
  var GA4 = script && script.getAttribute('data-ga4');
  var GTM = script && script.getAttribute('data-gtm');
  if (!GA4 && !GTM) return;

  var KEY = 'vv_consent';
  var TAG_HOST = 'https://www.googletagmanager.com';

  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  window.gtag = gtag;

  gtag('consent', 'default', {
    analytics_storage: 'denied',
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
  });

  var loaded = false;
  function loadTags() {
    if (loaded) return;
    loaded = true;
    gtag('consent', 'update', { analytics_storage: 'granted' });
    if (GA4) {
      gtag('js', new Date());
      gtag('config', GA4);
      inject(TAG_HOST + '/gtag/js?id=' + encodeURIComponent(GA4));
    }
    if (GTM) {
      window.dataLayer.push({ 'gtm.start': new Date().getTime(), event: 'gtm.js' });
      inject(TAG_HOST + '/gtm.js?id=' + encodeURIComponent(GTM));
    }
  }
  function inject(src) {
    var s = document.createElement('script');
    s.async = true;
    s.src = src;
    document.head.appendChild(s);
  }

  // Si retira el consentimiento después de aceptar, las etiquetas ya cargadas
  // dejan de escribir cookies (Consent Mode) y se borran las que dejó GA.
  function revoke() {
    gtag('consent', 'update', { analytics_storage: 'denied' });
    var host = location.hostname;
    var domains = ['', host, '.' + host, '.' + host.replace(/^www\./, '')];
    document.cookie.split(';').forEach(function (c) {
      var name = c.split('=')[0].trim();
      if (!/^_ga(_|$)|^_gid$|^_gat/.test(name)) return;
      domains.forEach(function (d) {
        document.cookie = name + '=; Max-Age=0; path=/' + (d ? '; domain=' + d : '');
      });
    });
  }

  function read() {
    try { return localStorage.getItem(KEY); } catch (e) { return null; }
  }
  function save(value) {
    try { localStorage.setItem(KEY, value); } catch (e) { /* storage blocked */ }
  }

  var banner = null;
  function choose(value) {
    var before = read();
    save(value);
    if (value === 'granted') loadTags();
    else if (before === 'granted' || loaded) revoke();
    hideBanner();
  }

  function showBanner() {
    if (!banner) {
      banner = document.createElement('section');
      banner.className = 'cookie-banner';
      banner.setAttribute('aria-labelledby', 'cookie-banner-title');
      banner.innerHTML =
        '<p class="cookie-banner-title" id="cookie-banner-title">¿Nos dejas medir las visitas?</p>' +
        '<p class="cookie-banner-text">Usamos cookies de Google Analytics para saber cuánta gente ' +
        'visita la web y qué páginas mira. Solo se activan si aceptas, y puedes cambiar de ' +
        'opinión cuando quieras. <a href="/privacidad/#cookies">Más información</a></p>' +
        '<div class="cookie-banner-actions">' +
        '<button type="button" class="btn btn-outline" data-consent="denied">Rechazar</button>' +
        '<button type="button" class="btn btn-outline" data-consent="granted">Aceptar</button>' +
        '</div>';
      banner.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-consent]');
        if (btn) choose(btn.getAttribute('data-consent'));
      });
      document.body.appendChild(banner);
    }
    banner.hidden = false;
  }
  function hideBanner() {
    if (banner) banner.hidden = true;
  }

  var saved = read();
  if (saved === 'granted') loadTags();
  else if (saved !== 'denied') showBanner();

  var settings = document.querySelectorAll('[data-cookie-settings]');
  for (var i = 0; i < settings.length; i++) {
    settings[i].hidden = false;
    settings[i].addEventListener('click', showBanner);
  }
})();
