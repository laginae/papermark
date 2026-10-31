'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const vm=require('node:vm'),esbuild=require('esbuild');
test('disabling preserves workspace leaves while stopping OCR and pending operations',async()=>{
  let factory,closeCount=0,modalCloses=0,frameRemovals=0,deliveryCancelled=false;
  const leaves=[],sent=[];
  const workspace={getLeavesOfType:()=>leaves,on:()=>()=>{},detachLeavesOfType:()=>{throw Error('Workspace layout must be preserved');}};
  class Plugin {
    constructor(){this.app={workspace};}
    async loadData(){return {};}
    registerView(type,create){factory=create;}
    addRibbonIcon(){} addCommand(){} addSettingTab(){} registerEvent(){}
  }
  class ItemView {constructor(){this.contentEl={empty(){}};}}
  const obsidian={Plugin,ItemView,PluginSettingTab:class{},Modal:class{},Platform:{isDesktopApp:true}};
  const result=await esbuild.build({entryPoints:['src/obsidian/main.js'],bundle:true,format:'cjs',write:false,
    external:['obsidian','node:child_process','node:path','process'],plugins:[{name:'test-html',setup(build){
      build.onResolve({filter:/^papermark-offline-html$/},()=>({path:'html',namespace:'fixture'}));
      build.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export default ""'}));
    }}]});
  const module={exports:{}};
  vm.runInNewContext(result.outputFiles[0].text,{module,exports:module.exports,require:name=>{assert.equal(name,'obsidian');return obsidian;},crypto:require('node:crypto').webcrypto});
  const plugin=new module.exports.default();await plugin.onload();
  const view=factory({}),controller=new AbortController();leaves.push({view});
  view.ocr={close(){closeCount++;}};
  view.jobs.set('task',{controller,modal:{close(){modalCloses++;}}});
  view.deliveries.set('file',failed=>{deliveryCancelled=failed;view.deliveries.delete('file');});
  view.frame={contentWindow:{postMessage:value=>sent.push(value)},remove(){frameRemovals++;}};
  plugin.onunload();await view.onClose();
  assert.equal(leaves.length,1);assert.equal(controller.signal.aborted,true);
  assert.equal(closeCount,1);assert.equal(modalCloses,1);assert.equal(frameRemovals,1);
  assert.equal(deliveryCancelled,true);assert.equal(view.jobs.size,0);assert.equal(view.deliveries.size,0);
  assert.equal(await view.ready,false);assert.equal(sent.filter(message=>message.type==='dispose').length,1);
  assert.equal(factory({}).closed,undefined);
});
