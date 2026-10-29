'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {PDFDocument}=require('pdf-lib'),{zipSync,strToU8}=require('fflate');
const {createHelper,runJob,allowedUrl,extractLayout}=require('../scripts/mineru-helper.cjs');
const {createUnicodeTextLayer}=require('../src/unicode-text-layer');
const {mineruLayouts,splitCorrected}=require('../src/mineru-layout');
const {exportPdf}=require('../src/pdf-export');
const {detectWithOcr}=require('../src/ocr-layout');
const {estimateSkew,multiply}=require('../src/ocr-preprocess');
test('paired helper requires allowed origin, exact host, connection code and explicit upload consent',async t=>{
  let calls=0;const {server,pairing}=createHelper({run:async job=>{calls++;job.state='done';job.result={ok:true};}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>{server.closeAllConnections();server.close();});
  const base='http://127.0.0.1:'+server.address().port;
  const headers={Origin:'https://laginae.github.io','X-PaperMark-Connection':pairing};
  assert.equal((await fetch(base+'/health')).status,403);
  assert.equal((await fetch(base+'/health',{headers:{...headers,Origin:'https://untrusted.example'}})).status,403);
  const spoofed=await new Promise((resolve,reject)=>require('node:http').get(base+'/health',{headers:{...headers,Host:'untrusted.example'}},response=>{response.resume();resolve(response.statusCode);}).on('error',reject));assert.equal(spoofed,403);
  assert.equal((await fetch(base+'/health',{headers:{...headers,'X-PaperMark-Connection':'x'.repeat(48)}})).status,403);
  const response=await fetch(base+'/health',{headers});assert.equal(response.status,200);assert.equal((await response.json()).tokenStorage,'none');
  const preflight=await fetch(base+'/jobs',{method:'OPTIONS',headers:{Origin:headers.Origin}});assert.equal(preflight.status,204);assert.equal(preflight.headers.get('access-control-allow-origin'),headers.Origin);
  const doc=await PDFDocument.create();doc.addPage();const bytes=await doc.save();
  const token='synthetic-test-token-value';
  const noConsent=await fetch(base+'/jobs',{method:'POST',headers:{...headers,'Content-Type':'application/pdf','X-MinerU-Token':token},body:bytes});assert.equal(noConsent.status,400);assert.equal(calls,0);
  const posted=await fetch(base+'/jobs',{method:'POST',headers:{...headers,'Content-Type':'application/pdf','X-MinerU-Token':token,'X-PaperMark-Consent':'upload-to-mineru'},body:bytes});assert.equal(posted.status,202);const {id}=await posted.json();
  const result=await(await fetch(base+'/jobs/'+id,{headers})).text();assert.equal(calls,1);assert.ok(!result.includes(token));
  assert.equal((await fetch(base+'/jobs/'+id,{headers,method:'DELETE'})).status,200);
  assert.equal((await fetch(base+'/jobs/'+id,{headers})).status,404);
});
test('helper rejects arbitrary remote destinations and only extracts one bounded layout JSON',()=>{
  const hosts=new Set(['mineru.oss-cn-shanghai.aliyuncs.com']);
  assert.throws(()=>allowedUrl('https://untrusted.example/file',hosts));assert.throws(()=>allowedUrl('http://mineru.oss-cn-shanghai.aliyuncs.com/file',hosts));
  const credentialUrl=new URL('https://mineru.oss-cn-shanghai.aliyuncs.com/file');credentialUrl.username='synthetic-user';credentialUrl.password='synthetic-password';
  assert.throws(()=>allowedUrl(credentialUrl,hosts));
  const zip=zipSync({'layout.json':strToU8(JSON.stringify({pdf_info:[]})),'ignored.html':strToU8('<script>evil()</script>')});assert.deepEqual(extractLayout(zip),{pdf_info:[]});
  assert.throws(()=>extractLayout(zipSync({'../layout.json':strToU8('{}')})));
});
function envelope(){return {format:'papermark-mineru',version:1,sha256:'fixture',pages:1,layout:{pdf_info:[{page_idx:0,page_size:[300,400],para_blocks:[
  {type:'title',level:2,bbox:[20,20,180,40],lines:[{spans:[{type:'text',content:'2.1 研究方法'}]}]},
  {type:'text',bbox:[20,65,280,90],lines:[{spans:[{type:'text',content:'中文搜索与复制。 English words stay spaced.'}]}]}
]}]}};}
test('remote transport sends the user Token only to the official API and clears failures',async()=>{
  const calls=[],token='synthetic-transport-test-token',job={controller:new AbortController(),sha256:'fixture',pages:1};
  const remote=async(url,options)=>{
    calls.push({url:String(url),authorization:options.headers?.Authorization,method:options.method});
    if(String(url).endsWith('/file-urls/batch'))return JSON.stringify({code:0,data:{batch_id:'synthetic-batch-01',file_urls:['https://mineru.oss-cn-shanghai.aliyuncs.com/input.pdf']}});
    if(options.method==='PUT')return Buffer.alloc(0);
    if(String(url).includes('/extract-results/'))return JSON.stringify({code:0,data:{extract_result:[{state:'done',full_zip_url:'https://cdn-mineru.openxlab.org.cn/result.zip'}]}});
    return zipSync({'layout.json':strToU8(JSON.stringify(envelope().layout))});
  };
  await runJob(job,new Uint8Array([1,2]),token,remote);assert.equal(job.state,'done');
  for(const call of calls)assert.equal(call.authorization,call.url.startsWith('https://mineru.net/api/v4/')?'Bearer '+token:undefined);
  assert.ok(!JSON.stringify(job.result).includes(token));
  const failed={controller:new AbortController()};await runJob(failed,new Uint8Array(),token,async()=>{throw Error('private response '+token);});
  assert.equal(failed.error,'remote');assert.ok(!JSON.stringify(failed).includes(token));
});
test('MinerU result is fingerprint-bound, keeps text, validates geometry and infers numeric hierarchy',()=>{
  const pages=[{number:1,text:'',view:[0,0,300,400],height:400,width:300,items:[],lines:[]}],views=[{width:300,height:400,transform:[1,0,0,-1,0,400]}];
  const layouts=mineruLayouts(envelope(),pages,views,'fixture');assert.equal(layouts[0].headings[0].level,2);assert.match(layouts[0].text,/中文搜索与复制/);assert.match(layouts[0].text,/English words stay spaced/);
  const model=pages.map((p,i)=>({...p,ocrLayout:layouts[i]}));assert.equal(detectWithOcr(model).length,1);
  assert.throws(()=>mineruLayouts(envelope(),pages,views,'different'));
  const bad=envelope();bad.layout.pdf_info[0].para_blocks[0].bbox=[0,0,Infinity,10];assert.throws(()=>mineruLayouts(bad,pages,views,'fixture'));
  const wrong=envelope();wrong.layout.pdf_info[0].page_idx=1;assert.throws(()=>mineruLayouts(wrong,pages,views,'fixture'));
  assert.equal(splitCorrected('中文正确文本',[{text:'中文正硝'},{text:'文本'}]).join(''),'中文正确文本');
  assert.equal(splitCorrected('Each corrected word is retained.',[{text:'Each corected word'},{text:'is retained.'}]).join(' '),'Each corrected word is retained.');
});
test('invisible Unicode layers retain source pixels, searchable Chinese and original bookmarks',async()=>{
  const original=await PDFDocument.create();original.addPage([300,400]).drawText('Original drawing',{x:10,y:200,size:10});
  const source=await original.save(),pages=[{number:1,text:'',view:[0,0,300,400]}],vp=[{width:300,height:400,transform:[1,0,0,-1,0,400]}];
  const layout=mineruLayouts(envelope(),pages,vp,'fixture')[0];pages[0].ocrLayout=layout;pages[0].ocrPdf=await createUnicodeTextLayer(layout);pages[0].ocrPixelWidth=300;pages[0].ocrPixelHeight=400;
  const result=await exportPdf(source,pages,[{title:'保留书签',level:1,page:1,x:0,y:400}],{});
  const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs'),{createCanvas}=require('@napi-rs/canvas');
  async function inspect(bytes){const loading=pdfjs.getDocument({data:bytes.slice(),useSystemFonts:true}),doc=await loading.promise,page=await doc.getPage(1),view=page.getViewport({scale:1}),canvas=createCanvas(view.width,view.height);
    await page.render({canvasContext:canvas.getContext('2d'),viewport:view}).promise;const value={pixels:canvas.toBuffer('image/png'),text:(await page.getTextContent()).items.map(i=>i.str).join(''),outline:await doc.getOutline()};await loading.destroy();return value;}
  const before=await inspect(source),after=await inspect(result.bytes);assert.deepEqual(after.pixels,before.pixels);assert.match(after.text,/中文搜索与复制/);assert.match(after.text,/English words stay spaced/);assert.equal(after.outline[0].title,'保留书签');
});
test('deskew estimator detects small tilted lines and leaves upright lines unchanged',()=>{
  function pixels(angle){const w=500,h=600,data=new Uint8ClampedArray(w*h*4).fill(255),slope=Math.tan(angle*Math.PI/180);
    for(let line=0;line<18;line++)for(let x=40;x<460;x++)if(x%30<22)for(let k=0;k<3;k++){const y=Math.round(70+line*24+slope*(x-250)+k);const i=(y*w+x)*4;data[i]=data[i+1]=data[i+2]=0;}return estimateSkew(data,w,h);}
  assert.ok(Math.abs(pixels(1.2)+1.2)<.3);assert.ok(Math.abs(pixels(-1.4)-1.4)<.3);assert.ok(Math.abs(pixels(0))<.2);
  assert.deepEqual(multiply([1,0,0,1,3,5],[2,0,0,-2,0,10]),[2,0,0,-2,3,15]);
});
