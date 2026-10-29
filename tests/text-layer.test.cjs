'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {PDFDocument,PDFName,PDFArray,PDFDict,PDFHexString,setTextRenderingMode,TextRenderingMode,degrees,rgb}=require('pdf-lib');
const {addOcrTextLayer,layerMatrix}=require('../src/pdf-text-layer');
const {exportPdf}=require('../src/pdf-export');
const {writePdfBookmarks}=require('../src/pdf-bookmarks');
const {normalizeCjkText}=require('../src/ocr-pdf-spacing');
test('CJK OCR separators are removed while English words and mixed labels keep spaces',()=>{
  assert.equal(normalizeCjkText('第 一 章 绪论， 文 本。 Test sentence 2.1 数据 处 理'),'第一章绪论，文本。 Test sentence 2.1 数据处理');
  assert.equal(normalizeCjkText('比较 , 说明。 Latin words, spaced.'),'比较,说明。 Latin words, spaced.');
});
async function fixture(rotation=0) {
  const doc=await PDFDocument.create(),p=doc.addPage([300,400]);
  p.drawRectangle({x:20,y:30,width:240,height:330,color:rgb(.8,.9,.7)});
  p.setCropBox(20,30,260,340);p.setRotation(degrees(rotation));
  const annot=doc.context.register(doc.context.obj({Type:'Annot',Subtype:'Text',Rect:[30,40,45,55],Contents:PDFHexString.fromText('Keep annotation')}));
  p.node.set(PDFName.of('Annots'),doc.context.obj([annot]));
  const source=await writePdfBookmarks(await doc.save(),[{title:'Original 书签',page:1,level:1,x:20,y:340}]);
  const parsed=await read(source);
  const viewport=(await parsed.getPage(1)).getViewport({scale:2});await parsed.destroy();
  const layer=await PDFDocument.create(),lp=layer.addPage([viewport.width/2,viewport.height/2]);
  lp.pushOperators(setTextRenderingMode(TextRenderingMode.Invisible));
  lp.drawText('Searchable text only',{x:30,y:lp.getHeight()-40,size:12});
  return {source,pages:[{number:1,text:'',view:[20,30,280,370],ocrLayout:{text:'Searchable text only',transform:viewport.transform},
    ocrPixelWidth:viewport.width,ocrPixelHeight:viewport.height,ocrPdf:await layer.save()}]};
}
async function read(bytes) {
  const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');
  const loading=pdfjs.getDocument({data:bytes.slice(),useSystemFonts:true}),doc=await loading.promise;
  doc.destroy=()=>loading.destroy();
  return doc;
}
test('searchable export preserves outlines, annotations, original drawing and Unicode title',async()=>{
  const {source,pages}=await fixture(),result=await exportPdf(source,pages,[],{preserveOutline:true});
  assert.equal(result.textPages,1);
  const before=await PDFDocument.load(source),after=await PDFDocument.load(result.bytes);
  const root=d=>d.catalog.lookup(PDFName.of('Outlines'),PDFDict).toString();assert.equal(root(before),root(after));
  const annots=d=>d.getPage(0).node.lookup(PDFName.of('Annots'),PDFArray).toString();assert.equal(annots(before),annots(after));
  const parsed=await read(result.bytes);
  const text=(await(await parsed.getPage(1)).getTextContent()).items.map(i=>i.str).join('');
  assert.equal(text,'Searchable text only');assert.equal((await parsed.getOutline())[0].title,'Original 书签');await parsed.destroy();
  const {createCanvas}=require('@napi-rs/canvas');
  async function pixels(bytes) {const doc=await read(bytes),page=await doc.getPage(1),view=page.getViewport({scale:1});
    const canvas=createCanvas(view.width,view.height);await page.render({canvasContext:canvas.getContext('2d'),viewport:view}).promise;
    const image=canvas.toBuffer('image/png');await doc.destroy();return image;}
  assert.deepEqual(await pixels(source),await pixels(result.bytes));
  const again=await addOcrTextLayer(result.bytes,pages);assert.equal(again.textPages,0);assert.deepEqual(again.bytes,result.bytes);
});
test('OCR form transforms match crop and rotation; text is extractable at every right angle',async()=>{
  for(const rotation of [0,90,180,270]) {
    const {source,pages}=await fixture(rotation),m=pages[0];
    const result=await addOcrTextLayer(source,pages),parsed=await read(result.bytes);
    const page=await parsed.getPage(1),text=await page.getTextContent();
    assert.equal(text.items.map(i=>i.str).join(''),'Searchable text only');
    const vp=page.getViewport({scale:2});
    const [x,y]=vp.convertToViewportPoint(text.items[0].transform[4],text.items[0].transform[5]);
    assert.ok(Math.abs(x-60)<.01,`rotation ${rotation} x`);assert.ok(Math.abs(y-80)<.01,`rotation ${rotation} y`);
    assert.equal(m.ocrPixelWidth,vp.width);await parsed.destroy();
  }
  assert.throws(()=>layerMatrix({transform:[0,0,0,0,0,0]},{x:0,y:0,width:1,height:1},1,1));
});
test('text-only export works without headings; existing text and disabled layers stay untouched',async()=>{
  const {source,pages}=await fixture();
  const plain=await PDFDocument.create();plain.addPage([300,400]).drawRectangle({x:10,y:10,width:20,height:20});
  const bytes=await plain.save();
  assert.equal((await exportPdf(bytes,pages,[])).textPages,1);
  const disabled=await exportPdf(source,pages,[],{preserveOutline:true,searchable:false});assert.deepEqual(disabled.bytes,source);
  const cleared=await exportPdf(source,pages,[],{preserveOutline:false});
  const clearedDoc=await PDFDocument.load(cleared.bytes);assert.equal(clearedDoc.catalog.has(PDFName.of('Outlines')),false);
  pages[0].text='Existing text layer with enough recognized characters to preserve.';
  const skipped=await addOcrTextLayer(source,pages);assert.equal(skipped.textPages,0);assert.deepEqual(skipped.bytes,source);
});
