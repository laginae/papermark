'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const {JSDOM} = require('jsdom');
const html = fs.readFileSync(path.join(__dirname, '../src/index.html'), 'utf8');
const script = fs.readFileSync(path.join(__dirname, '../src/startup.js'), 'utf8');
function setup(language, blockedStorage = false) {
  const dom = new JSDOM(html, {url:'https://example.org/', runScripts:'outside-only'});
  const win = dom.window, doc = win.document;
  if (language) win.localStorage.setItem('papermark.language', language);
  if (blockedStorage) Object.defineProperty(win, 'localStorage', {get() { throw new Error('Storage unavailable'); }});
  let slow;
  win.setTimeout = callback => {slow = callback; return 1;};
  win.clearTimeout = () => {};
  win.eval(script);
  return {dom, win, doc, slow:()=>slow(), banner:doc.getElementById('startup-status')};
}
test('startup gates the visible UI until handlers are ready and keeps functional disabled states', () => {
  const x = setup();
  assert.equal(x.doc.querySelectorAll('[data-startup-region][inert]').length, 3);
  assert.match(x.banner.textContent, /Loading PaperMark/);
  x.win.paperMarkStartup.ready();
  assert.equal(x.banner.hidden, true);
  assert.equal(x.doc.querySelectorAll('[inert]').length, 0);
  assert.equal(x.doc.documentElement.dataset.appReady, 'true');
  for (const id of ['export', 'mineru-run', 'undo']) assert.equal(x.doc.getElementById(id).disabled, true);
  x.win.dispatchEvent(new x.win.Event('load'));
  x.slow();
  assert.equal(x.banner.hidden, true);
  x.dom.window.close();
});
test('slow loading offers recovery without declaring failure; a late successful start recovers', () => {
  const x = setup('zh-CN'); x.slow();
  assert.match(x.banner.textContent, /仍在加载/);
  assert.equal(x.doc.getElementById('startup-retry').hidden, false);
  assert.notEqual(x.banner.dataset.state, 'failed');
  x.win.paperMarkStartup.ready();
  assert.equal(x.banner.hidden, true);
  x.dom.window.close();
});
test('runtime startup errors show a recovery message while incidental image errors do not', () => {
  const x = setup();
  const img = x.doc.createElement('img'); x.doc.body.append(img);
  img.dispatchEvent(new x.win.Event('error'));
  assert.notEqual(x.banner.dataset.state, 'failed');
  x.win.dispatchEvent(new x.win.ErrorEvent('error', {message:'Synthetic startup failure'}));
  assert.equal(x.banner.dataset.state, 'failed');
  assert.match(x.banner.textContent, /could not start/);
  assert.equal(x.banner.getAttribute('role'), 'alert');
  assert.equal(x.doc.querySelectorAll('[inert]').length, 3);
  x.dom.window.close();
});
test('missing main script and blocked storage still produce an English recovery message', () => {
  const x = setup(null, true);
  x.win.dispatchEvent(new x.win.Event('load'));
  assert.equal(x.banner.dataset.state, 'failed');
  assert.match(x.banner.textContent, /open the full file or online app/);
  x.dom.window.close();
});
test('translation exclusion and a visible bilingual no-script route exist before any app code', () => {
  const x = setup();
  assert.equal(x.doc.documentElement.getAttribute('translate'), 'no');
  assert.ok(x.doc.querySelector('meta[name="google"][content="notranslate"]'));
  const notice = x.doc.querySelector('noscript');
  assert.match(notice.textContent, /当前预览无法运行/);
  assert.ok(notice.querySelector('a[href="https://laginae.github.io/papermark/"]'));
  assert.ok(html.indexOf('STARTUP_SCRIPT') < html.indexOf('APP_SCRIPT'));
  x.dom.window.close();
});
