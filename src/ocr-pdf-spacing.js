'use strict';
const {PDFName,PDFDict,PDFNumber,PDFHexString}=require('pdf-lib');
const key=PDFName.of;
const cjk='[\\p{Script=Han}\\u3000-\\u303f\\uff00-\\uffef,.;:!?()]';
function normalizeCjkText(text) {
  return text.replace(new RegExp(`(${cjk})\\s+(?=${cjk})`,'gu'),'$1');
}
// Native Tesseract word spacing can split Chinese phrases in PDF readers.
// For CJK pages, keep its embedded Unicode font and place normalized lines
// over their OCR boxes. Declared advances use half-width ASCII/full-width CJK,
// making selection track the line while retaining invisible rendering.
function normalizeOcrPage(source,model) {
  if(!/\p{Script=Han}/u.test(model.ocrLayout.text)) return;
  const fonts=source.node.Resources()?.lookupMaybe(key('Font'),PDFDict);
  const entry=fonts?.entries().find(([,ref])=>source.doc.context.lookup(ref,PDFDict).get(key('BaseFont'))?.toString()==='/GlyphLessFont');
  if(!entry) throw new Error('OCR Unicode font is missing.');
  const [fontName,ref]=entry,font=source.doc.context.lookup(ref,PDFDict);
  const descendant=font.lookup(key('DescendantFonts')).lookup(0,PDFDict);
  descendant.set(key('DW'),PDFNumber.of(1000));
  descendant.set(key('W'),source.doc.context.obj([0,Array(128).fill(500)]));
  const box=source.getMediaBox(),layout=model.ocrLayout;
  const sx=layout.scale*box.width/model.ocrPixelWidth,sy=layout.scale*box.height/model.ocrPixelHeight;
  const bottom=(model.ocrPixelHeight-layout.height*layout.scale)*box.height/model.ocrPixelHeight;
  const operators=[];
  const number=value=>Number(value.toFixed(6));
  for(const line of layout.lines) {
    const text=normalizeCjkText(line.text),height=line.height*sy,width=(line.xMax-line.xMin)*sx;
    const units=Array.from({length:text.length},(_,i)=>text.charCodeAt(i)<128 ? .5 : 1).reduce((a,b)=>a+b,0);
    if(!text || height<=0 || width<=0 || !units) continue;
    const hex=PDFHexString.fromText(text).toString().slice(5,-1);
    const x=box.x+line.xMin*sx,y=box.y+line.y*sy+bottom,stretch=width/(height*units)*100;
    if(![x,y,height,stretch].every(Number.isFinite)) throw new Error('Invalid OCR text line.');
    operators.push(`BT\n3 Tr\n${fontName} ${number(height)} Tf\n${number(stretch)} Tz\n1 0 0 1 ${number(x)} ${number(y)} Tm\n<${hex}> Tj\nET`);
  }
  source.node.set(key('Contents'),source.doc.context.register(source.doc.context.flateStream(operators.join('\n'))));
}
module.exports={normalizeCjkText,normalizeOcrPage};
