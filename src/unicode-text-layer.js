'use strict';
const {PDFDocument,PDFName,PDFHexString}=require('pdf-lib');
const fontData=require('./glyphless-font');
// A tiny upstream glyphless font: glyphs are invisible, Unicode remains extractable.
async function createUnicodeTextLayer(layout) {
  const doc=await PDFDocument.create(),page=doc.addPage([layout.width,layout.height]),context=doc.context;
  const bytes=Uint8Array.from(atob(fontData),c=>c.charCodeAt(0));
  const file=context.register(context.flateStream(bytes,{Length1:bytes.length}));
  const descriptor=context.register(context.obj({Type:'FontDescriptor',FontName:'GlyphLessFont',Flags:5,FontBBox:[0,0,1000,1000],ItalicAngle:0,Ascent:1000,Descent:0,CapHeight:1000,StemV:80,FontFile2:file}));
  const font=context.register(context.obj({Type:'Font',Subtype:'CIDFontType2',BaseFont:'GlyphLessFont',CIDSystemInfo:{Registry:PDFHexString.fromText('Adobe'),Ordering:PDFHexString.fromText('Identity'),Supplement:0},FontDescriptor:descriptor,DW:1000,W:[0,Array(128).fill(500)],CIDToGIDMap:context.register(context.flateStream(new Uint8Array(131072)))}));
  const cmap=`/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n/CMapName /Adobe-Identity-UCS def\n/CMapType 2 def\n1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n1 beginbfrange\n<0000> <FFFF> <0000>\nendbfrange\nendcmap\nCMapName currentdict /CMap defineresource pop\nend\nend`;
  const root=context.register(context.obj({Type:'Font',Subtype:'Type0',BaseFont:'GlyphLessFont',Encoding:'Identity-H',DescendantFonts:[font],ToUnicode:context.register(context.flateStream(cmap))}));
  page.node.set(PDFName.of('Resources'),context.obj({Font:{OCR:root}}));
  const operators=[],num=n=>Number(n.toFixed(6));
  for(const line of layout.lines){
    const {text,xMin,xMax,y,height}=line;if(!text||height<=0||xMax<=xMin)continue;
    const units=Array.from({length:text.length},(_,i)=>text.charCodeAt(i)<128?.5:1).reduce((a,b)=>a+b,0);
    const hex=PDFHexString.fromText(text).toString().slice(5,-1),stretch=(xMax-xMin)/(height*units)*100;
    operators.push(`BT\n3 Tr\n/OCR ${num(height)} Tf\n${num(stretch)} Tz\n1 0 0 1 ${num(xMin)} ${num(y)} Tm\n<${hex}> Tj\nET`);
  }
  page.node.set(PDFName.of('Contents'),context.register(context.flateStream(operators.join('\n'))));
  return doc.save({useObjectStreams:false});
}
module.exports={createUnicodeTextLayer};
