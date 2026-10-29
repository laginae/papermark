'use strict';
const { detectHeadings } = require('./detection');

// Detection uses upright page coordinates. Destinations are converted back to
// the original PDF space, including its crop box and /Rotate value.
function ocrLayout(data, original, viewport) {
  const scale = viewport.scale, width = viewport.width / scale, height = viewport.height / scale;
  const lines = [], items = []; let text = '';
  for (const block of data.blocks || []) for (const paragraph of block.paragraphs || []) for (const line of paragraph.lines || []) {
    const value = (line.text || '').trim().normalize('NFKC').replace(/([\u3400-\u9fff])\s+(?=[\u3400-\u9fff])/g, '$1');
    const box = line.bbox;
    if (!value || !box || ![box.x0,box.y0,box.x1,box.y1].every(Number.isFinite) || box.x1 <= box.x0 || box.y1 <= box.y0) continue;
    const size = (box.y1-box.y0) / scale, x = box.x0 / scale, y = height-box.y1/scale;
    const offset = text.length; text += value+'\n';
    lines.push({text:value,offset,xMin:x,xMax:box.x1/scale,y,height:size});
    items.push({str:value,width:(box.x1-box.x0)/scale,height:size,fontName:'OCR',transform:[size,0,0,size,x,y]});
  }
  const heights = items.map(i=>i.height).sort((a,b)=>a-b);
  return { number:original.number, text, lines, items, styles:{}, width, height, view:[0,0,width,height],
    bodyHeight:heights[Math.floor(heights.length/2)] || 10, ocr:true,
    transform:[...viewport.transform], scale, confidence:data.confidence || 0 };
}
function toPdfPoint(x, y, layout) {
  const [a,b,c,d,e,f]=layout.transform, determinant=a*d-b*c;
  if (!Number.isFinite(determinant) || !determinant) throw new Error('Invalid OCR page transform');
  const px=x*layout.scale-e, py=(layout.height-y)*layout.scale-f;
  return [(d*px-c*py)/determinant,(-b*px+a*py)/determinant];
}
function detectWithOcr(pages, options) {
  return detectHeadings(pages.map(page=>page.ocrLayout || page),options).map(row=>{
    const original=pages[row.page-1], layout=original.ocrLayout;
    if (!layout) return row;
    const [x,y]=toPdfPoint(row.x,row.y,layout), view=original.view;
    return {...row,x:Math.max(view[0],Math.min(view[2],x)),y:Math.max(view[1],Math.min(view[3],y)),review:true,reason:'reason.ocr'};
  });
}
module.exports={ocrLayout,toPdfPoint,detectWithOcr};
