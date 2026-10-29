'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createHelper}=require('../scripts/mineru-helper.cjs');
test('desktop control page is local, framed pages are blocked and credentials stay outside URLs',async t=>{
  const {server,pairing}=createHelper({desktop:true});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>{server.closeAllConnections();server.close();});const base='http://127.0.0.1:'+server.address().port;
  const response=await fetch(base),html=await response.text();assert.equal(response.status,200);assert.equal(response.headers.get('access-control-allow-origin'),null);
  assert.equal(response.headers.get('x-frame-options'),'DENY');assert.equal(response.headers.get('referrer-policy'),'no-referrer');
  assert.match(response.headers.get('content-security-policy'),/frame-ancestors 'none'/);
  assert.match(html,new RegExp('value="'+pairing+'"'));assert.ok(!/localStorage|sessionStorage|indexedDB/.test(html));
  assert.ok(!html.includes('?helper=')&&!html.includes('#helper='));
  assert.equal((await fetch(base,{headers:{Origin:'https://untrusted.example'}})).status,403);
  assert.equal((await fetch(base,{headers:{Origin:'https://laginae.github.io'}})).status,403);
  assert.equal((await fetch(base+'/health',{headers:{Origin:'https://laginae.github.io'}})).status,403);
});
test('stopping the desktop helper requires its current pairing and local control origin',async t=>{
  let stopped=false;const {server,pairing}=createHelper({desktop:true,onStop:()=>{stopped=true;}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>{server.closeAllConnections();server.close();});
  const base='http://127.0.0.1:'+server.address().port;
  assert.equal((await fetch(base+'/shutdown',{method:'POST',headers:{Origin:base}})).status,403);
  assert.equal((await fetch(base+'/shutdown',{method:'POST',headers:{Origin:'https://laginae.github.io','X-PaperMark-Connection':pairing}})).status,404);
  assert.equal(server.listening,true);
  const response=await fetch(base+'/shutdown',{method:'POST',headers:{Origin:base,'X-PaperMark-Connection':pairing}});assert.equal(response.status,200);
  await new Promise(resolve=>server.once('close',resolve));assert.equal(server.listening,false);assert.equal(stopped,true);
});
