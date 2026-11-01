const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const {JSDOM} = require('jsdom');
const {createRecognitionFlow} = require('../src/recognition-flow');
const {setLanguage, translateDom} = require('../src/i18n');
const makeDoc = (name = 'example.pdf') => ({name, status:'ready', writable:true, pdf:{numPages:2}, model:{imagePages:[1], pages:[{}, {}]}});
function setup(connect = async () => ({check:async()=>{}, recognize:true})) {
  setLanguage('en');
  const dom = new JSDOM(fs.readFileSync(path.join(__dirname, '../src/index.html'), 'utf8'), {pretendToBeVisual:true});
  const timers = new Map(); let timerId = 0;
  dom.window.setInterval = fn => {timers.set(++timerId, fn); return timerId;};
  dom.window.clearInterval = id => timers.delete(id);
  const root = dom.window.document, $ = id => root.getElementById(id);
  $('workspace').hidden = false;
  const calls = {run:0, local:0, review:0};
  const flow = createRecognitionFlow(root, {connect, onRun:()=>calls.run++, onLocal:()=>calls.local++, onReview:()=>calls.review++, onMode:()=>{}});
  let doc = makeDoc();
  const update = next => {doc = next || doc; flow.update({doc, busy:false});}; update();
  const input = (id, value) => {$(id).value = value; $(id).dispatchEvent(new dom.window.Event('input'));};
  const connectHelper = async () => { $('mode-mineru').click(); input('mineru-code', 'a'.repeat(48)); await $('mineru-connect').onclick(); };
  const tokenStep = () => {input('mineru-token', 'synthetic-test-token-value'); $('mineru-next').click();};
  const consent = () => {$('mineru-consent').checked = true; $('mineru-consent').dispatchEvent(new dom.window.Event('change'));};
  const heartbeat = () => Promise.all([...timers.values()].map(fn=>fn()));
  return {dom, root, $, flow, calls, doc, update, input, connectHelper, tokenStep, consent, heartbeat, timers};
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
  x.$('mode-local').click(); assert.equal(x.$('mineru-code').value,'a'.repeat(48)); assert.equal(x.flow.isOnline(),false);
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

test('connected status stays outside setup steps, translates and remains visible after recognition', async () => {
  const x=setup(); await x.connectHelper();
  const badge=x.$('mineru-connection-status');
  assert.equal(badge.closest('#mineru-step-1'),null); assert.equal(badge.dataset.state,'connected');
  assert.equal(x.$('mineru-check').hidden,false); assert.equal(x.$('step-marker-1').classList.contains('complete'),true);
  x.tokenStep(); assert.equal(x.$('mineru-step-3').hidden,false); assert.equal(badge.textContent,'Local helper connected');
  setLanguage('zh-CN'); translateDom(x.root); x.update(); assert.equal(badge.textContent,'本机助手已连接');
  x.doc.mineruResult={}; x.flow.finish(true); x.update(); assert.equal(x.$('mineru-complete').hidden,false);
  assert.equal(badge.closest('[hidden]'),null); assert.equal(x.calls.run,0);
});

test('mode switches retain only the session connection, recheck it and require a new Token and consent', async () => {
  let connections=0, checks=0;
  const x=setup(async()=>{connections++;return {check:async()=>{checks++;}};});await x.connectHelper();x.tokenStep();x.consent();
  x.$('mode-local').click(); assert.equal(x.$('mineru-token').value,''); assert.equal(x.$('mineru-consent').checked,false);
  await x.heartbeat(); assert.equal(checks,0);
  x.$('mode-mineru').click(); assert.equal(x.$('mineru-connection-status').dataset.state,'checking'); assert.equal(x.flow.takeUpload(),null);
  await Promise.resolve(); assert.equal(checks,1); assert.equal(connections,1);
  assert.equal(x.$('mineru-connection-status').dataset.state,'connected'); assert.equal(x.$('mineru-step-2').hidden,false);
  assert.equal(x.calls.run,0); assert.equal(x.flow.takeUpload(),null);
});

test('a failed health check revokes credentials and consent, blocks upload and exposes reconnect', async () => {
  const x=setup(async()=>({check:async()=>{throw Error('helper stopped');}}));await x.connectHelper();x.tokenStep();x.consent();
  await x.$('mineru-check').onclick();
  assert.equal(x.$('mineru-connection-status').dataset.state,'lost'); assert.equal(x.$('mineru-step-1').hidden,false);
  assert.equal(x.$('mineru-token').value,''); assert.equal(x.$('mineru-consent').checked,false);
  assert.equal(x.$('mineru-run').disabled,true); assert.equal(x.flow.takeUpload(),null); assert.equal(x.calls.run,0);
  assert.equal(x.$('mineru-connect').disabled,false);
});

test('monitoring only checks an existing visible idle online session and never runs recognition', async () => {
  let checks=0; const x=setup(async()=>({check:async()=>{checks++;}}));
  await x.heartbeat(); assert.equal(checks,0); await x.connectHelper(); await x.heartbeat(); assert.equal(checks,1);
  x.flow.update({doc:x.doc,busy:true});await x.heartbeat();assert.equal(checks,1);
  x.update();Object.defineProperty(x.root,'hidden',{value:true,configurable:true});await x.heartbeat();assert.equal(checks,1);
  Object.defineProperty(x.root,'hidden',{value:false,configurable:true});x.root.dispatchEvent(new x.dom.window.Event('visibilitychange'));
  await Promise.resolve();assert.equal(checks,2);assert.equal(x.calls.run,0);
});

test('disconnect invalidates a late health failure without restoring a lost state or credentials', async () => {
  let rejectCheck;const x=setup(async()=>({check:()=>new Promise((_,reject)=>{rejectCheck=reject;})}));await x.connectHelper();x.tokenStep();x.consent();
  const pending=x.$('mineru-check').onclick();assert.equal(x.flow.takeUpload(),null);
  x.$('mineru-disconnect').click();rejectCheck(Error('old failure'));await pending;
  assert.equal(x.$('mineru-connection-status').dataset.state,'idle');assert.equal(x.$('mineru-code').value,'');
  assert.equal(x.$('mineru-token').value,'');assert.equal(x.$('mineru-consent').checked,false);assert.equal(x.flow.takeUpload(),null);
});

test('disconnect during initial pairing prevents a late success from connecting the page', async () => {
  let resolve;const x=setup(()=>new Promise(r=>{resolve=r;}));x.$('mode-mineru').click();x.input('mineru-code','a'.repeat(48));
  const pending=x.$('mineru-connect').onclick();assert.equal(x.$('mineru-disconnect').hidden,false);
  x.$('mineru-disconnect').click();resolve({check:async()=>{}});await pending;
  assert.equal(x.$('mineru-connection-status').dataset.state,'idle');assert.equal(x.$('mineru-step-1').hidden,false);
});

test('disposing the workspace stops monitoring and ignores an in-flight response', async () => {
  let resolve,checks=0;const x=setup(async()=>({check:()=>{checks++;return new Promise(r=>{resolve=r;});}}));await x.connectHelper();x.tokenStep();x.consent();
  const pending=x.$('mineru-check').onclick();x.flow.dispose();resolve();await pending;
  assert.equal(x.timers.size,0);x.dom.window.dispatchEvent(new x.dom.window.Event('focus'));
  x.root.dispatchEvent(new x.dom.window.Event('visibilitychange'));await x.heartbeat();assert.equal(checks,1);
  assert.equal(x.$('mineru-token').value,'');assert.equal(x.$('mineru-code').value,'');assert.equal(x.flow.takeUpload(),null);
});
