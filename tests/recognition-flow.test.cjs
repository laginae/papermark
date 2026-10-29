const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const {JSDOM} = require('jsdom');
const {createRecognitionFlow} = require('../src/recognition-flow');
const {setLanguage, translateDom} = require('../src/i18n');
const makeDoc = (name = 'example.pdf') => ({name, status:'ready', writable:true, pdf:{numPages:2}, model:{imagePages:[1], pages:[{}, {}]}});
function setup(connect = async () => ({recognize: true})) {
  setLanguage('en');
  const dom = new JSDOM(fs.readFileSync(path.join(__dirname, '../src/index.html'), 'utf8'));
  const root = dom.window.document, $ = id => root.getElementById(id);
  const calls = {run:0, local:0, review:0};
  const flow = createRecognitionFlow(root, {connect, onRun:()=>calls.run++, onLocal:()=>calls.local++, onReview:()=>calls.review++, onMode:()=>{}});
  let doc = makeDoc();
  const update = next => {doc = next || doc; flow.update({doc, busy:false});}; update();
  const input = (id, value) => {$(id).value = value; $(id).dispatchEvent(new dom.window.Event('input'));};
  const connectHelper = async () => { $('mode-mineru').click(); input('mineru-code', 'a'.repeat(48)); await $('mineru-connect').onclick(); };
  const tokenStep = () => {input('mineru-token', 'synthetic-test-token-value'); $('mineru-next').click();};
  const consent = () => {$('mineru-consent').checked = true; $('mineru-consent').dispatchEvent(new dom.window.Event('change'));};
  return {dom, root, $, flow, calls, doc, update, input, connectHelper, tokenStep, consent};
}
test('default mode defers scan OCR, exposes one local action and keeps advanced features', () => {
  const x=setup(); assert.equal(x.flow.isOnline(),false); assert.equal(x.$('auto-ocr').checked,false); assert.equal(x.$('searchable').checked,true);
  assert.equal(x.$('mineru-panel').hidden,true); x.$('local-start').click(); assert.equal(x.calls.local,1);
  x.doc.model.pages[0].ocrLayout={text:'recognized'}; x.update(); x.$('local-start').click(); assert.equal(x.calls.review,1);
  for(const id of ['ocr-run','ocr-language','ocr-range','auto-ocr','mineru-import','mineru-save','save-json','load-json','export-all']) assert.ok(x.$(id));
});
test('connecting and entering a Token never upload; only explicit per-document consent permits one submission', async () => {
  const x=setup(); assert.equal(x.flow.takeUpload(),null); await x.connectHelper();
  assert.equal(x.$('mineru-step-1').hidden,true); assert.equal(x.$('mineru-step-2').hidden,false);
  x.tokenStep(); assert.equal(x.$('mineru-step-2').hidden,true); assert.equal(x.$('mineru-step-3').hidden,false);
  x.$('mineru-run').click(); assert.equal(x.calls.run,0); assert.equal(x.flow.takeUpload(),null);
  x.consent(); x.$('mineru-run').click(); assert.equal(x.calls.run,1);
  const upload=x.flow.takeUpload(); assert.equal(upload.doc,x.doc); assert.equal(upload.token,'synthetic-test-token-value');
  assert.equal(x.$('mineru-token').value,''); assert.equal(x.$('mineru-consent').checked,false); assert.equal(x.flow.takeUpload(),null);
});
test('language switches keep fields and state; backing up or switching PDFs revokes consent and hides secrets', async () => {
  const x=setup(); await x.connectHelper(); x.tokenStep(); x.consent();
  setLanguage('zh-CN'); translateDom(x.root); x.update(); assert.equal(x.$('mineru-run').textContent,'上传并开始识别'); assert.equal(x.$('mineru-run').disabled,false);
  x.$('mineru-back-token').click(); x.$('mineru-next').click(); assert.equal(x.$('mineru-run').disabled,true);
  x.consent(); x.update(makeDoc('<img src=x onerror=alert(1)>.pdf'));
  assert.equal(x.$('mineru-token').value,''); assert.equal(x.$('mineru-consent').checked,false); assert.equal(x.flow.takeUpload(),null);
  assert.equal(x.$('mineru-upload-file').querySelector('img'),null); assert.match(x.$('mineru-upload-file').textContent, /<img/);
  x.$('mode-local').click(); assert.equal(x.$('mineru-code').value,''); assert.equal(x.flow.isOnline(),false);
});
test('late connection responses cannot advance another document or re-enable online mode', async () => {
  let resolve; const x=setup(()=>new Promise(r=>resolve=r));
  x.$('mode-mineru').click(); x.input('mineru-code','a'.repeat(48)); const pending=x.$('mineru-connect').onclick();
  x.update(makeDoc('second.pdf')); resolve({}); await pending;
  assert.equal(x.$('mineru-step-1').hidden,false); assert.equal(x.flow.takeUpload(),null);
  x.input('mineru-code','b'.repeat(48)); const next=x.$('mineru-connect').onclick(); x.$('mode-local').click(); resolve({}); await next;
  assert.equal(x.flow.isOnline(),false); assert.equal(x.$('mineru-panel').hidden,true);
});
test('invalid Tokens, protected PDFs, page limits and busy state block uploads but local imports need no helper', async () => {
  const x=setup(); x.$('mode-mineru').click(); assert.equal(x.$('mineru-import').disabled,false);
  await x.connectHelper(); x.input('mineru-token','short'); x.$('mineru-next').click(); assert.equal(x.$('mineru-step-2').hidden,false); assert.equal(x.$('mineru-flow-error').hidden,false);
  x.tokenStep(); x.consent(); x.doc.writable=false; x.update(); assert.equal(x.flow.takeUpload(),null);
  x.doc.writable=true; x.doc.pdf.numPages=201; x.update(); assert.equal(x.flow.takeUpload(),null);
  x.doc.pdf.numPages=2; x.flow.update({doc:x.doc,busy:true}); assert.equal(x.flow.takeUpload(),null); assert.equal(x.$('mode-local').disabled,true);
});
test('failure and cancellation require a fresh Token and consent; successful results expose review and save', async () => {
  const x=setup(); await x.connectHelper(); x.tokenStep(); x.consent(); assert.ok(x.flow.takeUpload());
  x.flow.finish(false,{i18nKey:'mineru.cancelled'}); x.update(); assert.equal(x.$('mineru-flow-error').hidden,false); assert.equal(x.$('mineru-step-2').hidden,false);
  x.tokenStep(); assert.equal(x.flow.takeUpload(),null); x.consent(); assert.ok(x.flow.takeUpload());
  x.doc.mineruResult={}; x.flow.finish(true); x.update(); assert.equal(x.$('mineru-complete').hidden,false); assert.equal(x.$('mineru-save').disabled,false);
  x.$('mineru-retry').click(); assert.equal(x.$('mineru-complete').hidden,true); assert.equal(x.flow.takeUpload(),null);
  x.flow.finish(false,{i18nKey:'mineru.connectionError'}); x.update(); assert.equal(x.$('mineru-step-1').hidden,false);
});
