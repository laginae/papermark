'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { JSDOM } = require('jsdom');
const { messages, t, setLanguage, getLanguage, restoreLanguage, saveLanguage, translateDom, uiError, reasonLabel } = require('../src/i18n');
const { validateEntries } = require('../src/model');
test('English is the default, independent of browser locale', () => {
  restoreLanguage({ getItem: () => null }); assert.equal(getLanguage(),'en'); assert.equal(t('export'),'Export PDF ↗');
  restoreLanguage({ getItem: () => 'fr' }); assert.equal(getLanguage(),'en');
});
test('preference survives reload while blocked browser storage remains usable', () => {
  const values = new Map(); const storage = {getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)};
  saveLanguage('zh-CN',storage); setLanguage('en'); restoreLanguage(storage); assert.equal(t('export'),'导出 PDF ↗');
  assert.deepEqual([...values.keys()],['papermark.language']);
  saveLanguage('en',{setItem(){throw new Error('Storage blocked');}}); assert.equal(getLanguage(),'en');
  restoreLanguage({getItem(){throw new Error('Storage blocked');}}); assert.equal(getLanguage(),'en');
});
test('all translations exist in both languages and preserve interpolation fields', () => {
  const fields = str => [...str.matchAll(/\{(\w+)\}/g)].map(match=>match[1]).sort();
  for(const [key,pair] of Object.entries(messages)) {
    assert.equal(pair.length,2,key); assert.ok(pair.every(value=>typeof value==='string'&&value.trim()),key);
    assert.deepEqual(fields(pair[0]),fields(pair[1]),key);
  }
  assert.throws(()=>t('missing.key'),/Unknown translation key/);
});
test('switching static UI preserves edited inputs, selected levels and file inputs', () => {
  const dom=new JSDOM(fs.readFileSync(path.join(__dirname,'../src/index.html'),'utf8'));
  const doc=dom.window.document;
  doc.getElementById('entry-title').value='原文标题 <script>not code</script>';
  doc.getElementById('entry-level').value='3';
  const input=doc.getElementById('files');
  for(const lang of ['zh-CN','en']) {
    setLanguage(lang); translateDom(doc);
    assert.equal(doc.documentElement.lang,lang);
    assert.equal(doc.getElementById('entry-title').value,'原文标题 <script>not code</script>');
    assert.equal(doc.getElementById('entry-level').value,'3'); assert.equal(doc.getElementById('files'),input);
    assert.equal(doc.querySelector('#sensitivity option').textContent,t('balanced'));
    for(const element of doc.querySelectorAll('[data-i18n]')) assert.equal(element.textContent,t(element.dataset.i18n));
  }
});
test('validation errors can be retranslated after the language changes', () => {
  setLanguage('en'); let error;
  try { validateEntries([{title:'Original',level:2,page:1,x:0,y:10}],[{view:[0,0,100,100]}]); } catch(value) {error=value;}
  assert.equal(error.i18nKey,'validation.level'); assert.match(error.message,/Bookmark 1/);
  setLanguage('zh-CN'); assert.match(t(error.i18nKey,error.i18nValues),/第 1 个书签层级/);
  setLanguage('en'); assert.equal(reasonLabel('章节编号与字体特征'),'Section numbering and typography');
  assert.equal(reasonLabel('reason.edited'),'Manually edited');
});
