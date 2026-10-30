'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {folderPath,outputName,availablePath,supports}=require('../src/obsidian/files');
const {strings}=require('../src/obsidian/strings');
const {validateResult}=require('../src/obsidian/native/ocr-contract');
const {OcrProcess}=require('../src/obsidian/native/ocr-process');
const {EventEmitter}=require('node:events');const {PassThrough}=require('node:stream');
const {createHostBridge,CHANNEL}=require('../src/host-bridge');
test('workspace bridge ignores other frames and stale sessions; cancellation settles pending calls',async()=>{
  const before=global.window,sent=[];let listener,initialized=0;const parent={postMessage:data=>sent.push(data)};
  global.window={parent,addEventListener:(type,fn)=>{if(type==='message')listener=fn;},dispatchEvent:()=>{}};
  try{
    const bridge=createHostBridge({onInit:()=>initialized++});
    await listener({source:{},data:{channel:CHANNEL,type:'init',session:'wrong'}});assert.equal(bridge.connected,false);
    await listener({source:parent,data:{channel:CHANNEL,type:'init',session:'session',desktop:true}});assert.equal(initialized,1);assert.equal(bridge.desktop,true);
    const pending=bridge.request('pick',{kind:'pdf'});const id=sent.at(-1).id;let resolved=false;pending.then(()=>resolved=true);
    await listener({source:parent,data:{channel:CHANNEL,type:'result',session:'wrong',id,value:[]}});await Promise.resolve();assert.equal(resolved,false);
    await listener({source:parent,data:{channel:CHANNEL,type:'result',session:'session',id,value:[]}});assert.deepEqual(await pending,[]);
    const controller=new AbortController(),aborted=bridge.request('ocr-recognize',{},controller.signal);controller.abort();await assert.rejects(aborted);assert.equal(sent.at(-1).type,'cancel');
  }finally{global.window=before;}
});
test('vault output stays relative and preserves existing names',()=>{
  for(const bad of ['../outside','/outside','docs/../outside','docs/./test','docs:name','docs./test'])assert.throws(()=>folderPath(bad));
  assert.equal(folderPath('论文/输出'),'论文/输出');assert.equal(outputName('file.pdf'),'file.pdf');
  assert.throws(()=>outputName('NUL.pdf'));assert.throws(()=>outputName('script.js'));
  const existing=new Set(['PaperMark/file.pdf','PaperMark/file (2).pdf']);
  assert.equal(availablePath({getAbstractFileByPath:name=>existing.has(name)},'PaperMark','file.pdf'),'PaperMark/file (3).pdf');
  assert.ok(supports({extension:'PDF'},'pdf'));assert.equal(supports({extension:'exe'},'images'),false);
  for(const pair of Object.values(strings))assert.ok(pair.length===2&&pair.every(s=>s.trim()));
});
function mockChild(){const child=new EventEmitter();child.stdin=new PassThrough();child.stdout=new PassThrough();child.stderr=new PassThrough();child.killed=false;child.kill=()=>{child.killed=true;};return child;}
test('Paddle IPC is lazy, bounded, validates geometry, and abort kills the process',async()=>{
  let child,calls=0;
  const spawn=(exe,args,opts)=>{calls++;assert.equal(exe,process.execPath);assert.deepEqual(args,['--model','small']);assert.equal(opts.shell,false);assert.equal(opts.windowsHide,true);return child=mockChild();};
  const engine=new OcrProcess(process.execPath,'small',{spawn});assert.equal(calls,0);
  const job=engine.recognize(new Uint8Array(12),2,2);assert.equal(calls,1);
  child.stdout.write(JSON.stringify({version:1,width:2,height:2,lines:[{text:'中文',confidence:.99,box:[0,0,2,2]}]})+'\n');assert.equal((await job).lines[0].text,'中文');
  const controller=new AbortController(),pending=engine.recognize(new Uint8Array(12),2,2,controller.signal);controller.abort();await assert.rejects(pending,/CANCELLED/);assert.ok(child.killed);
  assert.throws(()=>validateResult({version:1,width:2,height:2,lines:[{text:'bad',confidence:1,box:[0,0,3,2]}]},2,2),/PROTOCOL/);
  const oversized=new OcrProcess(process.execPath,'tiny',{spawn});await assert.rejects(oversized.recognize(new Uint8Array(1),3000,3000),/IMAGE/);assert.equal(calls,1);
});
test('Paddle malformed output and timeout close the child without leaking native stderr',async()=>{
  const child=mockChild(),engine=new OcrProcess(process.execPath,'tiny',{spawn:()=>child,timeout:15});
  const pending=engine.recognize(new Uint8Array(12),2,2);child.stdout.write('not-json\n');await assert.rejects(pending,/PROTOCOL/);assert.ok(child.killed);
  const stalled=mockChild(),timeout=new OcrProcess(process.execPath,'small',{spawn:()=>stalled,timeout:15});
  await assert.rejects(timeout.recognize(new Uint8Array(12),2,2),/TIMEOUT/);assert.ok(stalled.killed);
});
