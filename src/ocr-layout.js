'use strict';
const { detectHeadings, numbering } = require('./detection');
const {normalizeCjkText}=require('./ocr-pdf-spacing');

// Detection uses upright page coordinates. Destinations are converted back to
// the original PDF space, including its crop box and /Rotate value.
function ocrLayout(data, original, viewport) {
  const scale = viewport.scale, width = viewport.width / scale, height = viewport.height / scale;
  const lines = [], items = []; let text = '';
  for (const block of data.blocks || []) for (const paragraph of block.paragraphs || []) for (const line of paragraph.lines || []) {
    const value = normalizeCjkText((line.text || '').trim().normalize('NFKC'));
    const box = line.bbox;
    if (!value || !box || ![box.x0,box.y0,box.x1,box.y1].every(Number.isFinite) || box.x1 <= box.x0 || box.y1 <= box.y0) continue;
    const glyphs=(line.words||[]).flatMap(w=>w.symbols||[]).map(s=>(s.bbox?.y1-s.bbox?.y0)/scale).filter(h=>Number.isFinite(h)&&h>0).sort((a,b)=>a-b);
    const size = glyphs[Math.floor(glyphs.length*.7)] || (box.y1-box.y0) / scale, x = box.x0 / scale, y = height-box.y1/scale;
    const offset = text.length; text += value+'\n';
    lines.push({text:value,offset,xMin:x,xMax:box.x1/scale,y,height:size,confidence:line.confidence??data.confidence??0});
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
const COMMON=/^(?:abstract|introduction|background|related work|literature review|materials?(?: and methods?)?|methods?|methodology|results?(?: and discussion)?|discussion|conclusions?(?: and future work)?|references|bibliography|acknowledg(?:e)?ments?|appendi(?:x|ces)(?:\s+[A-Z])?|supplementary materials?|摘要|关键词|引言|绪论|研究方法|实验方法|结果与讨论|结果|讨论|结论|参考文献|致谢|附录)\s*[:：.]?$/i;
function ocrHeadings(layout,{sensitivity='balanced'}={}) {
  if(layout.headings) return layout.headings;
  const body=layout.lines.filter(l=>l.text.length>25).map(l=>l.height).sort((a,b)=>a-b);
  const size=body[Math.floor(body.length/2)]||layout.bodyHeight||10;
  return layout.lines.flatMap((line,index)=>{
    const text=line.text.trim(),num=numbering(text),semantic=COMMON.test(text),han=/\p{Script=Han}/u.test(text);
    if(text.length<2||text.length>(han?48:115)||text.split(/\s+/).length>15||line.y<layout.height*.035||line.y>layout.height*.975)return [];
    if(/^(?:fig(?:ure)?\.?|table|equation|eq\.?|图|表)\s*[\dIVX一二三四五六七八九十]/i.test(text)||/https?:\/\/|doi\s*:|@|[=∑∫{}]/i.test(text))return [];
    if(!semantic&&(/[。；;!?！？]/.test(text)||/[,，:：]/.test(text)||/\.[\s]+[A-Z]/.test(num?.body||text)))return [];
    if(num&&(num.token.startsWith('0')||!/\p{L}/u.test(num.body)||/[.]$/.test(num.body)||num.body.split(/\s+/).length>12))return [];
    if(!num&&!semantic){
      const words=text.split(/\s+/),titleCase=han||words.filter(w=>/^[A-Z]/.test(w)).length>=words.length*.7;
      const previous=layout.lines[index-1],gap=previous?previous.y-line.y:Infinity;
      if(layout.number===1||!titleCase||line.height<size*(sensitivity==='strict'?1.4:1.25)||text.length>(han?26:70)||words.length>9||gap<line.height*1.5)return [];
    }
    return [{title:text,level:num?.level||1,page:layout.number,offset:line.offset,x:line.xMin,y:Math.min(layout.height,line.y+line.height*1.15)}];
  });
}
function detectWithOcr(pages, options={}) {
  const rows=detectHeadings(pages.filter(p=>!p.ocrLayout),options);
  for(const page of pages)if(page.ocrLayout)rows.push(...ocrHeadings(page.ocrLayout,options));
  rows.sort((a,b)=>a.page-b.page||(a.offset||0)-(b.offset||0));let level=0;
  return rows.map(row=>{
    row.level=Math.max(1,Math.min(row.level,level+1));level=row.level;
    const original=pages[row.page-1], layout=original.ocrLayout;
    if (!layout) return row;
    const [x,y]=toPdfPoint(row.x,row.y,layout), view=original.view;
    return {...row,x:Math.max(view[0],Math.min(view[2],x)),y:Math.max(view[1],Math.min(view[3],y)),review:true,reason:'reason.ocr'};
  });
}
module.exports={ocrLayout,toPdfPoint,detectWithOcr,ocrHeadings};
