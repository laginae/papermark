'use strict';
const { PDFDocument, PDFName, PDFArray, PDFBool, pushGraphicsState, popGraphicsState,
  concatTransformationMatrix, drawObject } = require('pdf-lib');
const { loadWritablePdf } = require('./pdf-bookmarks');
const {normalizeOcrPage}=require('./ocr-pdf-spacing');
const key=PDFName.of;
const marker=key('PaperMarkOCRText');

// Keep existing text on mixed documents. The marker also prevents a short OCR
// page from acquiring a second layer when it is reopened in PaperMark.
function textLayerPages(pages) {
  return pages.filter(p=>p.ocrPdf?.length && p.ocrLayout?.text.trim() &&
    (p.text || '').replace(/\s/g,'').length<30);
}
function layerMatrix(layout, box, pixelWidth, pixelHeight) {
  const [a,b,c,d,e,f]=layout.transform,det=a*d-b*c;
  if(!Number.isFinite(det)||!det||box.width<=0||box.height<=0||pixelWidth<=0||pixelHeight<=0) throw new Error('Invalid OCR page geometry.');
  const point=(x,y)=>[(d*(x-e)-c*(y-f))/det,(-b*(x-e)+a*(y-f))/det];
  const origin=point(0,pixelHeight),right=point(pixelWidth,pixelHeight),top=point(0,0);
  const ma=(right[0]-origin[0])/box.width,mb=(right[1]-origin[1])/box.width;
  const mc=(top[0]-origin[0])/box.height,md=(top[1]-origin[1])/box.height;
  const matrix=[ma,mb,mc,md,origin[0]-ma*box.x-mc*box.y,origin[1]-mb*box.x-md*box.y];
  if(!matrix.every(Number.isFinite)) throw new Error('Invalid OCR page transform.');
  return matrix;
}
function pageState(page) {
  return {media:page.getMediaBox(),crop:page.getCropBox(),rotation:page.getRotation(),
    annotations:page.node.lookupMaybe(key('Annots'),PDFArray)?.asArray().map(ref=>ref.toString()) || []};
}
async function addOcrTextLayer(bytes,pages) {
  const candidates=textLayerPages(pages);
  if(!candidates.length) return {bytes:new Uint8Array(bytes),textPages:0};
  const doc=await loadWritablePdf(bytes),before=doc.getPages().map(pageState);
  const outlines=doc.catalog.get(key('Outlines'))?.toString();
  let textPages=0;
  for(const model of candidates) {
    const target=doc.getPage(model.number-1);
    if(target.node.get(marker)?.toString()==='true') continue;
    const overlay=await PDFDocument.load(model.ocrPdf,{updateMetadata:false});
    if(overlay.getPageCount()!==1) throw new Error('Invalid OCR text page.');
    const source=overlay.getPage(0),box=source.getMediaBox();
    normalizeOcrPage(source,model);
    // This is the engine's text-only PDF: embed its invisible glyphs and
    // Unicode mapping as a form. Never replace, rasterize or re-encode a page.
    const embedded=await doc.embedPage(source,undefined,[1,0,0,1,0,0]);
    const name=target.node.newXObject('PaperMarkText',embedded.ref);
    const matrix=layerMatrix(model.ocrLayout,box,model.ocrPixelWidth,model.ocrPixelHeight);
    target.pushOperators(pushGraphicsState(),concatTransformationMatrix(...matrix),drawObject(name),popGraphicsState());
    target.node.set(marker,PDFBool.True);textPages++;
  }
  if(!textPages) return {bytes:new Uint8Array(bytes),textPages:0};
  const output=await doc.save({useObjectStreams:false,updateFieldAppearances:false});
  const check=await PDFDocument.load(output,{updateMetadata:false});
  if(JSON.stringify(check.getPages().map(pageState))!==JSON.stringify(before) || check.catalog.get(key('Outlines'))?.toString()!==outlines)
    throw new Error('PDF page or bookmark verification failed.');
  return {bytes:output,textPages};
}
module.exports={addOcrTextLayer,textLayerPages,layerMatrix};
