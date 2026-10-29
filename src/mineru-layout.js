'use strict';
const {numbering}=require('./detection');
const {normalizeCjkText}=require('./ocr-pdf-spacing');
const {uiError}=require('./i18n');
const clean=text=>normalizeCjkText(String(text||'').normalize('NFKC').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g,'').trim());
function validBox(box,width,height) {
  return Array.isArray(box)&&box.length===4&&box.every(Number.isFinite)&&box[2]>box[0]&&box[3]>box[1]&&box[0]>=-2&&box[1]>=-2&&box[2]<=width+2&&box[3]<=height+2;
}
// Map the local OCR's line breaks onto corrected text. Keep all remote characters.
function splitCorrected(text,localLines) {
  if(localLines.length<2)return [text];
  const a=localLines.map(l=>clean(l.text)).join('\n'),b=text;
  const breaks=[];let count=0;for(const line of localLines.slice(0,-1)){count+=clean(line.text).length;breaks.push(count);count++;}
  const mapped=[];
  if(a.length*b.length<=4_000_000){
    const width=b.length+1,steps=new Uint8Array((a.length+1)*width);let previous=Uint32Array.from({length:width},(_,i)=>i);
    for(let j=1;j<width;j++)steps[j]=2;
    for(let i=1;i<=a.length;i++){const row=new Uint32Array(width);row[0]=i;steps[i*width]=1;
      for(let j=1;j<width;j++){let cost=previous[j-1]+(a[i-1]!==b[j-1]),op=0;if(previous[j]+1<cost){cost=previous[j]+1;op=1;}if(row[j-1]+1<cost){cost=row[j-1]+1;op=2;}row[j]=cost;steps[i*width+j]=op;}previous=row;}
    let i=a.length,j=b.length;const boundary=new Map();while(i||j){if(!boundary.has(i))boundary.set(i,j);const op=steps[i*width+j];if(op===0){i--;j--;}else if(op===1)i--;else j--;}
    mapped.push(...breaks.map(n=>boundary.get(n)??0));
  }else mapped.push(...breaks.map(n=>Math.round(n/a.length*b.length)));
  const chunks=[];let start=0;
  for(let end of mapped){end=Math.max(start,Math.min(b.length,end));
    // Do not cut an English word in half when OCR missed a line boundary.
    if(/[A-Za-z0-9]/.test(b[end-1]||'')&&/[A-Za-z0-9]/.test(b[end]||'')){const space=b.indexOf(' ',end);if(space>=0&&space-end<18)end=space;}
    chunks.push(b.slice(start,end).trim());start=end;}
  chunks.push(b.slice(start).trim());return chunks;
}
function localBoxes(original,viewport) {
  const layout=original.ocrLayout;if(!layout||layout.source==='mineru')return [];
  const {toPdfPoint}=require('./ocr-layout');
  return layout.lines.map(line=>{
    const points=[[line.xMin,line.y],[line.xMax,line.y+line.height]].map(([x,y])=>{
      const [px,py]=toPdfPoint(x,y,layout),[a,b,c,d,e,f]=viewport.transform;return [a*px+c*py+e,b*px+d*py+f];});
    return {text:line.text,xMin:Math.min(...points.map(p=>p[0])),xMax:Math.max(...points.map(p=>p[0])),top:Math.min(...points.map(p=>p[1])),bottom:Math.max(...points.map(p=>p[1]))};
  });
}
function mineruLayouts(envelope,pages,viewports,fingerprint) {
  if(envelope?.format!=='papermark-mineru'||envelope.version!==1||envelope.sha256!==fingerprint||envelope.pages!==pages.length)throw uiError('mineru.mismatch');
  const infos=envelope.layout?.pdf_info;
  if(!Array.isArray(infos)||infos.length!==pages.length||infos.length>200)throw uiError('mineru.invalid');
  const seen=new Set();let total=0;
  return infos.map(info=>{
    const index=info.page_idx,original=pages[index],vp=viewports[index];
    if(!Number.isInteger(index)||!original||seen.has(index)||!Array.isArray(info.page_size))throw uiError('mineru.invalid');seen.add(index);
    const [w,h]=info.page_size;
    if(![w,h].every(n=>Number.isFinite(n)&&n>0)||Math.abs(w/h-vp.width/vp.height)>.03)throw uiError('mineru.mismatch');
    const sx=vp.width/w,sy=vp.height/h,lines=[],headings=[],covered=[],local=localBoxes(original,vp);let offset=0;
    const rawBlocks=info.para_blocks||info.preproc_blocks;
    const blocks=Array.isArray(rawBlocks)?rawBlocks.flatMap(block=>Array.isArray(block.blocks)?block.blocks:[block]):rawBlocks;
    if(!Array.isArray(blocks)||blocks.length>10000)throw uiError('mineru.invalid');
    const emit=(text,box,height)=>{
      text=clean(text);if(!text)return;
      lines.push({text,offset,xMin:Math.max(0,box[0]),xMax:Math.min(vp.width,box[2]),y:Math.max(0,vp.height-box[3]),height:Math.max(1,Math.min(height,box[3]-box[1]))});offset+=text.length+1;total+=text.length;
      if(total>5_000_000)throw uiError('error.textLimit');
    };
    for(const block of blocks){
      if(!validBox(block.bbox,w,h))throw uiError('mineru.invalid');
      const text=clean((block.lines||[]).map(l=>(l.spans||[]).map(s=>['text','inline_equation'].includes(s.type)?s.content||'':'').join('')).join('\n'));
      if(!text||!['title','text','list','index','code','caption','footnote','header','footer'].includes(block.type))continue;
      const box=block.bbox.map((n,i)=>n*(i%2?sy:sx));
      covered.push(box);
      if(block.type==='title')headings.push({title:text.replace(/\s*\n\s*/g,' '),level:numbering(text)?.level||Math.max(1,Math.min(6,(Number(block.level)||1)-1||1)),page:index+1,offset,x:box[0],y:vp.height-box[1]});
      const matches=local.filter(l=>{const cx=(l.xMin+l.xMax)/2,cy=(l.top+l.bottom)/2;return cx>=box[0]-3&&cx<=box[2]+3&&cy>=box[1]-3&&cy<=box[3]+3;}).sort((a,b)=>a.top-b.top||a.xMin-b.xMin);
      if(matches.length){const parts=splitCorrected(text.replace(/\s*\n\s*/g,/\p{Script=Han}/u.test(text)?'':' '),matches);
        parts.forEach((part,i)=>{const l=matches[i];emit(part,[l.xMin,l.top,l.xMax,l.bottom],l.bottom-l.top);});
      }else {
        const declared=(block.lines||[]).filter(l=>validBox(l.bbox,w,h));
        if(declared.length>1)for(const line of declared)emit((line.spans||[]).map(s=>s.content||'').join(''),line.bbox.map((n,i)=>n*(i%2?sy:sx)),(line.bbox[3]-line.bbox[1])*sy);
        else {
          // Paragraph-only APIs provide no glyph positions. Use bounded visual
          // line wrapping, and surface this approximation in the interface.
          const font=block.type==='title'?Math.min(24,box[3]-box[1]):Math.min(12,box[3]-box[1]);
          const units=s=>Array.from(s).reduce((sum,c)=>sum+(c.charCodeAt(0)<128?.5:1),0);
          const capacity=Math.max(2,(box[2]-box[0])/font),tokens=/\p{Script=Han}/u.test(text)?Array.from(text):text.split(/(?<=\s)/),parts=[];let part='';
          for(const token of tokens){if(part&&units(part+token)>capacity){parts.push(part);part='';}part+=token;}if(part)parts.push(part);
          const pitch=(box[3]-box[1])/Math.max(1,parts.length);
          parts.forEach((part,i)=>emit(part,[box[0],box[1]+i*pitch,Math.min(box[2],box[0]+units(part)*font),box[1]+(i+1)*pitch],Math.min(font,pitch*.85)));
        }
      }
    }
    // Keep locally recognized text in regions whose structured representation
    // cannot be safely converted (for example an HTML table or display math).
    for(const l of local){const cx=(l.xMin+l.xMax)/2,cy=(l.top+l.bottom)/2;
      if(!covered.some(b=>cx>=b[0]-3&&cx<=b[2]+3&&cy>=b[1]-3&&cy<=b[3]+3))emit(l.text,[l.xMin,l.top,l.xMax,l.bottom],l.bottom-l.top);}
    return {number:index+1,source:'mineru',text:lines.map(l=>l.text).join('\n'),lines,headings,width:vp.width,height:vp.height,scale:1,transform:[...vp.transform],items:[],styles:{},bodyHeight:10,ocr:true};
  });
}
module.exports={mineruLayouts,splitCorrected,validBox};
