'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {imagesToPdf,imageDimensions}=require('../src/image-pdf');
const {paddleResult}=require('../src/paddle-layout');
const {ocrLayout}=require('../src/ocr-layout');
const {createUnicodeTextLayer}=require('../src/unicode-text-layer');
const {exportPdf}=require('../src/pdf-export');
const {createCanvas}=require('@napi-rs/canvas');
function image(){const canvas=createCanvas(100,200),ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,100,200);ctx.fillStyle='red';ctx.fillRect(0,0,50,100);return {bytes:canvas.toBuffer('image/png'),width:100,height:200};}
async function read(bytes){const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');const task=pdfjs.getDocument({data:bytes.slice()}),doc=await task.promise;doc.destroy=()=>task.destroy();return doc;}
test('images become ordered pages with upright right-angle rotations and A4 fitting',async()=>{
  const source=image();assert.deepEqual(imageDimensions(source.bytes),{width:100,height:200});assert.throws(()=>imageDimensions(new Uint8Array(30)));
  const bytes=await imagesToPdf([0,270,180,90].map(rotation=>({file:{},rotation})),{decode:async()=>source});const doc=await read(bytes);
  assert.equal(doc.numPages,4);
  const expected=[[0,0],[1,0],[1,1],[0,1]];
  for(let i=1;i<=4;i++){
    const page=await doc.getPage(i),viewport=page.getViewport({scale:2});const canvas=createCanvas(viewport.width,viewport.height);
    await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;
    assert.equal(viewport.width,i%2===1?96:192);assert.equal(viewport.height,i%2===1?192:96);
    const [x,y]=expected[i-1],pixel=canvas.getContext('2d').getImageData((x?.75:.25)*canvas.width,(y?.75:.25)*canvas.height,1,1).data;
    assert.ok(pixel[0]>240&&pixel[1]<10&&pixel[2]<10,`red corner rotated on page ${i}`);
  }await doc.destroy();
  const a4=await read(await imagesToPdf([{file:{},rotation:0}],{mode:'a4',decode:async()=>source}));assert.deepEqual((await a4.getPage(1)).view,[0,0,595.28,841.89]);await a4.destroy();
});
test('image merge honors cancellation before decoding the next image',async()=>{
  const c=new AbortController();let calls=0;
  await assert.rejects(imagesToPdf([{rotation:0},{rotation:0}],{decode:async()=>{calls++;return image();},signal:c.signal,progress:()=>c.abort()}),/abort/i);assert.equal(calls,1);
});
test('Paddle lines retain both columns, Unicode search text and source pixels after export',async()=>{
  const lines=[];for(let i=0;i<8;i++)for(const column of [0,1])lines.push({text:`${column?'Right':'Left'} column line ${i} 中文内容`,confidence:.99,box:[20+column*300,80+i*30,270+column*300,100+i*30]});
  const result=paddleResult({width:600,height:800,lines}),original={number:1,text:'',view:[0,0,600,800]},layout=ocrLayout(result,original,{width:600,height:800,scale:1,transform:[1,0,0,-1,0,800]});
  assert.ok(layout.text.indexOf('Left column line 7')<layout.text.indexOf('Right column line 0'));assert.equal(layout.lines.length,16);
  const {PDFDocument,rgb}=require('pdf-lib'),source=await PDFDocument.create();source.addPage([600,800]).drawRectangle({x:0,y:0,width:600,height:800,color:rgb(.8,.9,.7)});
  const bytes=await source.save(),pages=[{...original,ocrLayout:layout,ocrPdf:await createUnicodeTextLayer(layout),ocrPixelWidth:600,ocrPixelHeight:800}];
  const output=await exportPdf(bytes,pages,[{title:'中文书签',page:1,level:1,x:20,y:720}]);const parsed=await read(output.bytes);
  const extracted=(await(await parsed.getPage(1)).getTextContent()).items.map(i=>i.str).join('');assert.match(extracted,/中文内容/);assert.match(extracted,/Right column line 7/);assert.equal((await parsed.getOutline())[0].title,'中文书签');await parsed.destroy();
  async function pixels(data){const doc=await read(data),page=await doc.getPage(1),canvas=createCanvas(600,800);await page.render({canvasContext:canvas.getContext('2d'),viewport:page.getViewport({scale:1})}).promise;await doc.destroy();return canvas.toBuffer('image/png');}
  assert.deepEqual(await pixels(bytes),await pixels(output.bytes));
});
