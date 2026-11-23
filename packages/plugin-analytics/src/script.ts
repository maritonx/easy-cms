import { type BannerTexts, type ConsentRegion, STRICT_REGIONS } from './shared.js'

/** What `/analytics.js` is built from: the settings, as the page needs them. */
export interface ScriptSettings {
  /** The container, or none: consent and `dataLayer` still work. */
  readonly gtm: string | null
  readonly banner: boolean
  readonly record: boolean
  readonly region: ConsentRegion
  /** Changes with the texts: a choice made for an older banner is asked again. */
  readonly version: string
  /** Per language (`en`, `th`, …), picked by `<html lang>`. */
  readonly texts: Readonly<Record<string, BannerTexts>>
  /** Where the API is, e.g. `/api/cms`, for recording choices. */
  readonly api: string
}

/** JSON inside a <script>: `<` can't end the element. */
const embed = (value: unknown) => JSON.stringify(value).replace(/</g, '\\u003c')

/**
 * The page's script: Consent Mode defaults first, the stored choice or the banner, then Google
 * Tag Manager. In the admin's preview frame or a `?preview=` page it only defines no-op helpers,
 * so editors' visits never reach the site's analytics.
 */
export function analyticsScript(settings: ScriptSettings): string {
  return `/* Easy CMS analytics and consent (@easy-cms/plugin-analytics) */
(function () {
  var C = ${embed(settings)};
  var REGIONS = ${embed(STRICT_REGIONS)};
  var w = window, d = document;
  var noop = function () {};
  if (w.easyConsent) return;
  if (w.parent !== w || /[?&]preview=/.test(location.search)) {
    w.easyConsent = { get: function () { return null }, set: noop, open: noop };
    w.easyAnalytics = { track: noop };
    return;
  }
  w.dataLayer = w.dataLayer || [];
  function gtag() { w.dataLayer.push(arguments) }
  if (!w.gtag) w.gtag = gtag;

  var KEY = 'easy_consent';
  var DENY = { ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied', analytics_storage: 'denied' };
  var GRANT = { ad_storage: 'granted', ad_user_data: 'granted', ad_personalization: 'granted', analytics_storage: 'granted' };
  function extend(a, b) { var o = {}, k; for (k in a) o[k] = a[k]; for (k in b) o[k] = b[k]; return o }
  if (C.region === 'eea-th') {
    gtag('consent', 'default', extend(DENY, { region: REGIONS, wait_for_update: 500 }));
    gtag('consent', 'default', GRANT);
  } else {
    gtag('consent', 'default', extend(DENY, { wait_for_update: 500 }));
  }
  gtag('set', 'ads_data_redaction', true);

  function read() {
    var m = d.cookie.match(/(?:^|; )easy_consent=([^;]*)/);
    if (!m) return null;
    try { var v = JSON.parse(decodeURIComponent(m[1])); return v && v.v === C.version ? v : null } catch (e) { return null }
  }
  function apply(c) {
    var g = function (on) { return on ? 'granted' : 'denied' };
    gtag('consent', 'update', {
      analytics_storage: g(c.a), ad_storage: g(c.m), ad_user_data: g(c.m), ad_personalization: g(c.m)
    });
    w.dataLayer.push({ event: 'easy_consent', consent: { analytics: !!c.a, marketing: !!c.m } });
  }
  function uid() {
    if (w.crypto && w.crypto.randomUUID) return w.crypto.randomUUID();
    return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
  }
  var stored = read();
  function set(choice) {
    var c = { v: C.version, id: (stored && stored.id) || uid(), a: choice.analytics ? 1 : 0, m: choice.marketing ? 1 : 0, t: Date.now() };
    stored = c;
    d.cookie = KEY + '=' + encodeURIComponent(JSON.stringify(c)) + '; Max-Age=' + 365 * 86400 +
      '; Path=/; SameSite=Lax' + (location.protocol === 'https:' ? '; Secure' : '');
    apply(c);
    if (C.record && w.fetch) {
      try {
        w.fetch(C.api + '/analytics/consent', {
          // No cookies: a record names no one, and a signed-in visitor's session would need a CSRF token.
          method: 'POST', keepalive: true, credentials: 'omit', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ id: c.id, analytics: !!c.a, marketing: !!c.m, version: c.v })
        }).catch(noop);
      } catch (e) {}
    }
    close();
  }
  if (stored) apply(stored);

  w.easyConsent = {
    get: function () { return stored ? { analytics: !!stored.a, marketing: !!stored.m } : null },
    set: set,
    open: function () { show(true) }
  };
  w.easyAnalytics = { track: function (event, params) { w.dataLayer.push(extend({ event: event }, params || {})) } };

  if (C.gtm) {
    w.dataLayer.push({ 'gtm.start': Date.now(), event: 'gtm.js' });
    var s = d.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtm.js?id=' + encodeURIComponent(C.gtm);
    (d.head || d.documentElement).appendChild(s);
  }

  var host = null;
  function close() { if (host) { host.remove(); host = null } }
  function texts() {
    var lang = (d.documentElement.lang || 'en').toLowerCase().split('-')[0];
    return C.texts[lang] || C.texts.en;
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] }) }
  function show(detailed) {
    if (!C.banner) return;
    close();
    var t = texts();
    host = d.createElement('div');
    host.setAttribute('data-easy-consent-banner', '');
    var root = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host;
    var on = stored || { a: 0, m: 0 };
    var row = function (name, title, text, checked, disabled) {
      return '<label class="row"><input type="checkbox" name="' + name + '"' + (checked ? ' checked' : '') + (disabled ? ' disabled' : '') +
        '><span><b>' + esc(title) + '</b><small>' + esc(text) + '</small></span></label>';
    };
    root.innerHTML = '<style>' + CSS + '</style>' +
      '<section role="dialog" aria-modal="false" aria-labelledby="t" lang="' + esc(d.documentElement.lang || 'en') + '">' +
      '<h2 id="t">' + esc(t.title) + '</h2><p>' + esc(t.text) +
      (t.privacy ? ' <a href="' + esc(t.privacy) + '">' + esc(t.privacyLabel) + '</a>' : '') + '</p>' +
      '<form' + (detailed ? '' : ' hidden') + '>' +
      row('necessary', t.necessary, t.necessaryText, true, true) +
      row('analytics', t.analytics, t.analyticsText, on.a, false) +
      row('marketing', t.marketing, t.marketingText, on.m, false) + '</form>' +
      '<div class="actions"><button type="button" data-a="reject">' + esc(t.reject) + '</button>' +
      '<button type="button" data-a="accept">' + esc(t.accept) + '</button>' +
      '<button type="button" data-a="' + (detailed ? 'save' : 'settings') + '" class="link">' + esc(detailed ? t.save : t.settings) + '</button></div></section>';
    root.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('button') : null;
      if (!b) return;
      var a = b.getAttribute('data-a');
      if (a === 'accept') set({ analytics: true, marketing: true });
      else if (a === 'reject') set({ analytics: false, marketing: false });
      else if (a === 'settings') show(true);
      else if (a === 'save') {
        var f = root.querySelector('form');
        set({ analytics: f.analytics.checked, marketing: f.marketing.checked });
      }
    });
    d.body.appendChild(host);
    var first = root.querySelector('button');
    if (detailed && first) first.focus();
  }
  var CSS = ':host{all:initial}section{position:fixed;z-index:2147483000;left:16px;right:16px;bottom:16px;max-width:560px;margin:0 auto;' +
    'box-sizing:border-box;padding:20px;border-radius:12px;background:var(--easy-consent-bg,#fff);color:var(--easy-consent-fg,#1a1a1a);' +
    'box-shadow:0 8px 32px rgba(0,0,0,.18);font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}' +
    'h2{margin:0 0 6px;font-size:17px}p{margin:0 0 14px}a{color:inherit}form{display:grid;gap:10px;margin:0 0 14px}form[hidden]{display:none}' +
    '.row{display:flex;gap:10px;align-items:flex-start;cursor:pointer}.row input{margin-top:4px}.row span{display:grid}.row small{opacity:.75;font-size:13px}' +
    '.actions{display:flex;flex-wrap:wrap;gap:8px}button{font:inherit;min-height:44px;padding:0 16px;border-radius:8px;cursor:pointer;' +
    'border:1px solid var(--easy-consent-accent,#2f6f5e);background:var(--easy-consent-accent,#2f6f5e);color:#fff;flex:1 1 140px}' +
    'button.link{flex:0 0 auto;border-color:transparent;background:transparent;color:inherit;text-decoration:underline}' +
    'button:focus-visible{outline:3px solid var(--easy-consent-accent,#2f6f5e);outline-offset:2px}' +
    '@media (prefers-color-scheme:dark){section{background:var(--easy-consent-bg,#1f2421);color:var(--easy-consent-fg,#f1f1f1)}}';

  // A form of @easy-cms/plugin-form-builder sent: a lead, named by the form's slug.
  d.addEventListener('easy-form:submitted', function (e) {
    var form = e.target && e.target.getAttribute ? e.target.getAttribute('form') : null;
    w.dataLayer.push({ event: 'generate_lead', form_id: form || undefined });
  });
  d.addEventListener('click', function (e) {
    var el = e.target && e.target.closest ? e.target.closest('[data-easy-consent]') : null;
    if (!el) return;
    e.preventDefault();
    show(true);
  });
  if (!stored && C.banner) {
    if (d.body) show(false);
    else d.addEventListener('DOMContentLoaded', function () { show(false) });
  }
})();
`
}
