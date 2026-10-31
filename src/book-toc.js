'use strict';
// Independent implementation informed by TOC Forge and pdf-toc-ocr.
// See docs/book-contents.md for references and supported boundaries.
const {uiError} = require('./i18n');
const {validateEntries} = require('./model');
const {toPdfPoint} = require('./ocr-layout');
const clean = value => String(value || '').normalize('NFKC').replace(/[‐–—−]/g,'-').replace(/\s+/g,' ').trim();
const romanPattern = /^(?=[MDCLXVI]+$)M{0,3}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$/i;
function pageLabel(value) {
  const label=clean(value).replace(/^[\[（(\s]+|[\]）)\s]+$/g,'').replace(/\s*-\s*/g,'-');
  if (/^[1-9]\d{0,4}$/.test(label)) return {label,number:Number(label),family:'arabic'};
  if (romanPattern.test(label)) {
    const values={I:1,V:5,X:10,L:50,C:100,D:500,M:1000}, chars=label.toUpperCase(); let number=0;
    for(let i=0;i<chars.length;i++)number+=values[chars[i]]<(values[chars[i+1]]||0)?-values[chars[i]]:values[chars[i]];
    return {label,number,family:'roman'};
  }
  const m=label.match(/^([A-Z]+|\d{1,3})-([1-9]\d{0,3})$/i);
  return m?{label,number:Number(m[2]),family:'chapter:'+m[1].toUpperCase()}:null;
}
function parsePageRange(value,total,limit=40) {
  const result=new Set();const parts=String(value).trim().split(/[,，]/);
  for(const part of parts){
    const m=part.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if(!m)throw uiError('book.badRange',{limit});
    const start=Number(m[1]),end=Number(m[2]||m[1]);
    if(start<1||end<start||end>total||end-start+1>limit)throw uiError('book.badRange',{limit});
    for(let n=start;n<=end;n++){result.add(n);if(result.size>limit)throw uiError('book.badRange',{limit});}
  }
  return [...result].sort((a,b)=>a-b);
}
function titleLevel(title) {
  if(/^(?:part\s+[\dIVX]+|第[一二三四五六七八九十百\d]+[部篇卷])/i.test(title))return 1;
  if(/^(?:chapter\s+\S+|第[一二三四五六七八九十百\d]+章)/i.test(title))return 1;
  if(/^第[一二三四五六七八九十百\d]+节/.test(title))return 2;
  const m=title.match(/^(\d+(?:\.\d+)*)(?:[.)、]?\s+|[\u3400-\u9fff])/);
  return m?Math.min(6,m[1].split('.').length):null;
}
function parsedLine(line) {
  const text=clean(line.text).replace(/(\d)\s*\.\s*(?=\d)/g,'$1.');
  const m=text.match(/(?:[.·•…。]{2,}\s*|\s+)([\[(（]?(?:\d{1,5}|[IVXLCDM]+|[A-Z\d]+\s*-\s*\d{1,4})[\])）]?)\s*$/i);
  if(!m)return null;
  const label=pageLabel(m[1]),title=text.slice(0,m.index).replace(/[.·•…。\s]+$/g,'').trim();
  if(!label||title.length<2||title.length>500||pageLabel(title)||/^(chapter|part)$/i.test(title))return null;
  return {...line,title,printedLabel:label.label,number:label.number,family:label.family,explicitLevel:titleLevel(title),leader:/[.·•…。]{2,}/.test(text)};
}
function sourceLines(page) {
  const layout=page.ocrLayout||page;
  // Native text items preserve the separate page-number box and column gap.
  const lines=!page.ocrLayout&&page.items?.length?page.items.map(i=>({text:i.str,xMin:i.transform[4],xMax:i.transform[4]+i.width,y:i.transform[5],height:Math.abs(i.height||i.transform[3])})):(layout.fragments?.length?layout.fragments:layout.lines)||[];
  return {layout,lines:lines.filter(l=>clean(l.text||l.str)).map(l=>({...l,text:clean(l.text||l.str),height:l.height||page.bodyHeight||12,confidence:l.confidence??100}))};
}
function groupedLines(page,mode='auto',includeMargins=false) {
  const {layout,lines}=sourceLines(page),width=layout.width||page.width, mid=width/2;
  const content=includeMargins?lines:lines.filter(l=>l.y>layout.height*.05&&l.y<layout.height*.96);
  const left=content.filter(l=>l.xMin<mid*.85&&l.xMax<mid+width*.025);
  const right=content.filter(l=>l.xMin>mid&&l.xMax>mid+width*.12);
  const crossing=content.filter(l=>l.xMin<mid-width*.05&&l.xMax>mid+width*.05);
  const titleFragments=parts=>parts.filter(l=>{const value=clean(l.text).replace(/[.·•…。]/g,'').trim();return l.confidence>=50&&value.length>=2&&!pageLabel(value)&&/[\p{L}]/u.test(value);}).length;
  // A right-aligned page-number column is part of a single-column TOC.
  const split=mode==='two'||(mode==='auto'&&left.length>=3&&right.length>=3&&titleFragments(left)>=2&&titleFragments(right)>=2&&crossing.length<=1);
  const columns=split?[content.filter(l=>(l.xMin+l.xMax)/2<mid),content.filter(l=>(l.xMin+l.xMax)/2>=mid)]:[content];
  const result=[];
  columns.forEach((column,col)=>{
    const rows=[];
    for(const fragment of column.sort((a,b)=>b.y-a.y||a.xMin-b.xMin)){
      const row=rows.find(r=>Math.abs(r.y-fragment.y)<=Math.max(3,Math.min(r.height,fragment.height)*.55));
      if(row){row.parts.push(fragment);row.height=Math.max(row.height,fragment.height);}else rows.push({y:fragment.y,height:fragment.height,parts:[fragment]});
    }
    for(const row of rows){
      const raw=row.parts.sort((a,b)=>a.xMin-b.xMin);
      // Tesseract may read dot leaders as low-confidence letters. Remove only
      // isolated noise between a title and a recognized right-hand page label.
      const parts=raw.filter((part,i)=>!(i>0&&i<raw.length-1&&part.confidence<25&&part.xMin-raw[i-1].xMax>row.height*2.5&&part.xMax-part.xMin>row.height*2&&pageLabel(raw.at(-1).text)));
      result.push({text:parts.map(p=>p.text).join(' '),y:row.y,height:row.height,xMin:parts[0].xMin,xMax:parts.at(-1).xMax,column:col,confidence:Math.min(...parts.map(p=>p.confidence))});
    }
  });
  return result;
}
function parseContents(pages,{columns='auto'}={}) {
  const result=[];let id=0;
  for(const page of pages){
    const lines=groupedLines(page,columns);let pending=null;
    for(const line of lines){
      if(/^(?:目\s*录|目次|contents|table of contents)(?:\s|$)/i.test(line.text)){pending=null;continue;}
      let item=parsedLine(line);
      const adjacent=pending&&pending.column===line.column&&pending.y-line.y>0&&pending.y-line.y<Math.max(line.height,pending.height)*2.6;
      if(adjacent&&(!item||!item.explicitLevel)&&!/[。;；]$/.test(pending.text)){
        const combined=parsedLine({...pending,text:pending.text+' '+line.text});
        if(combined){item=combined;pending=null;}
      }
      if(item){
        if(pending&&item.explicitLevel&&titleLevel(pending.text))result.push({...pending,title:pending.text,printedLabel:'',number:null,family:null,explicitLevel:titleLevel(pending.text),id:'toc-'+(++id),tocPage:page.number,pdfPage:null,method:'unresolved',verified:false,include:true});
        result.push({...item,id:'toc-'+(++id),tocPage:page.number,pdfPage:null,method:'unresolved',verified:false,include:true});pending=null;
      }
      else pending=!pageLabel(line.text)&&line.text.length<180?line:null;
      if(result.length>1000)throw uiError('validation.count');
    }
  }
  // Indentation is relative to each column, so facing columns share a level.
  const groups=new Map();
  for(const row of result){const key=row.tocPage+':'+row.column;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row);}
  let previous=0,hasPart=false;
  for(const group of groups.values()){
    const xs=[];for(const x of group.map(r=>r.xMin).sort((a,b)=>a-b))if(!xs.length||x-xs.at(-1)>12)xs.push(x);
    for(const row of group){
      if(/^(?:part\s|第.+[部篇卷])/i.test(row.title))hasPart=true;
      let level=row.explicitLevel||Math.min(6,xs.findIndex(x=>Math.abs(x-row.xMin)<=12)+1);
      if(hasPart&&/^(?:chapter\s|第.+章)/i.test(row.title))level=2;
      else if(hasPart&&row.explicitLevel&&/^\d/.test(row.title))level++;
      row.level=Math.max(1,Math.min(level,previous+1,6));previous=row.level;
      row.issues=[];if(level!==row.level)row.issues.push('hierarchy');if(row.confidence<75)row.issues.push('ocr');
    }
  }
  return result;
}
function isContentsPage(page,columns='auto') {
  const lines=groupedLines(page,columns),rows=lines.map(parsedLine).filter(Boolean);
  const heading=lines.some(l=>/^(?:目\s*录|目次|contents|table of contents)(?:\s|$)/i.test(l.text));
  const leaders=rows.filter(r=>r.leader).length;
  let monotonic=0;for(let i=1;i<rows.length;i++)if(rows[i].family===rows[i-1].family&&rows[i].number>=rows[i-1].number)monotonic++;
  const denseNumbered=rows.length>=lines.length*.6&&rows.filter(r=>r.explicitLevel).length>=2;
  return heading&&rows.length>=2||rows.length>=4&&(leaders>=2||denseNumbered)&&monotonic>=rows.length*.6;
}
const normalizedTitle=text=>clean(text).toLowerCase().replace(/^(?:chapter\s+\S+|第[^\s章]+章|\d+(?:\.\d+)*[.)]?)\s*/i,'').replace(/[^\p{L}\p{N}]/gu,'');
function calibrationEvidence(pages,tocPages,rows) {
  const excluded=new Set(tocPages),anchors=[],titles=new Map();
  for(const page of pages){
    if(excluded.has(page.number)||isContentsPage(page))continue;
    const {layout}=sourceLines(page),height=layout.height||page.height,lines=groupedLines(page,'single',true);
    // Use complete header/footer rows, not individual words: the "2" in a
    // chapter heading near the top must not compete with printed page 37.
    const labels=lines.filter(l=>l.y<height*.15||l.y>height*.88).map(l=>pageLabel(l.text)).filter(Boolean);
    // Conflicting page labels on the same sheet are not usable evidence.
    const distinct=new Map(labels.map(l=>[l.family+':'+l.number,l]));
    if(distinct.size===1){const label=[...distinct.values()][0];anchors.push({...label,pdfPage:page.number,method:'label'});}
    for(const line of lines.filter(l=>l.y>height*.25&&l.y<height*.91)){
      const key=normalizedTitle(line.text);if(key.length<4)continue;
      if(!titles.has(key))titles.set(key,[]);titles.get(key).push({pdfPage:page.number,line,layout});
    }
  }
  for(const row of rows){const hits=titles.get(normalizedTitle(row.title))||[];if(hits.length===1&&row.family)anchors.push({family:row.family,number:row.number,pdfPage:hits[0].pdfPage,method:'title',rowId:row.id});}
  return anchors;
}
function calibrate(rows,pages,tocPages,manual=[]) {
  const evidence=calibrationEvidence(pages,tocPages,rows),total=pages.length;
  return rows.map(original=>{
    if(original.verified||original.method==='manual')return {...original};
    const row={...original,pdfPage:null,method:'unresolved'},label=pageLabel(row.printedLabel);if(!label)return row;
    Object.assign(row,{family:label.family,number:label.number});
    const family=evidence.filter(a=>a.family===label.family);
    const exact=family.filter(a=>a.number===label.number&&(a.method!=='title'||a.rowId===row.id));
    const unique=[...new Set(exact.map(a=>a.pdfPage))];
    const overrides=manual.filter(a=>a.family===label.family&&a.number<=label.number).sort((a,b)=>b.number-a.number);
    if(overrides.length){row.pdfPage=label.number+overrides[0].pdfPage-overrides[0].number;row.method='anchor';}
    else if(unique.length===1){row.pdfPage=unique[0];row.method=exact.some(a=>a.method==='title')?'title':'label';}
    else if(unique.length>1){row.method='conflict';}
    else {
      // Require support from two different pages for an offset; do not bridge
      // a gap between different offsets (missing/inserted pages).
      const buckets=new Map();for(const a of family){const offset=a.pdfPage-a.number;if(!buckets.has(offset))buckets.set(offset,new Map());buckets.get(offset).set(a.pdfPage,a);}
      const runs=[...buckets].filter(([,values])=>values.size>=2).map(([offset,values])=>({offset,min:Math.min(...[...values.values()].map(a=>a.number)),max:Math.max(...[...values.values()].map(a=>a.number))}));
      const within=runs.filter(r=>label.number>=r.min&&label.number<=r.max);
      if(within.length===1){row.pdfPage=label.number+within[0].offset;row.method='offset';}
      else if(runs.length===1&&family.every(a=>a.pdfPage-a.number===runs[0].offset)){row.pdfPage=label.number+runs[0].offset;row.method='estimated';}
      else if(runs.length>1)row.method='conflict';
    }
    if(!Number.isInteger(row.pdfPage)||row.pdfPage<1||row.pdfPage>total||tocPages.includes(row.pdfPage)){row.pdfPage=null;if(row.method!=='conflict')row.method='unresolved';}
    return row;
  });
}
function calibrationSample(total,tocPages) {
  const last=Math.max(...tocPages,0),set=new Set();
  for(let n=1;n<=Math.min(total,last+12);n++)if(!tocPages.includes(n))set.add(n);
  for(let i=1;i<=6;i++){const n=Math.round(last+(total-last)*i/6);for(const p of [n-1,n])if(p>0&&p<=total&&!tocPages.includes(p))set.add(p);}
  return [...set].sort((a,b)=>a-b).slice(0,40);
}
function entriesFromDraft(rows,pages) {
  const included=rows.filter(r=>r.include);if(!included.length||included.some(r=>!r.verified))throw uiError('book.reviewRequired');
  return validateEntries(included.map(row=>{
    const page=pages[row.pdfPage-1],view=page?.view||[0,0,0,0];let x=view[0],y=view[3];
    const layout=page?.ocrLayout||page;
    const line=layout?.lines?.find(l=>normalizedTitle(l.text)===normalizedTitle(row.title));
    if(line){const point=page.ocrLayout?toPdfPoint(line.xMin,line.y+(line.height||12),layout):[line.xMin,line.y+12];x=Math.max(view[0],Math.min(view[2],point[0]));y=Math.max(view[1],Math.min(view[3],point[1]));}
    return {title:row.title,level:row.level,page:row.pdfPage,x,y,review:false,reason:'reason.contents'};
  }),pages);
}
function appendContents(existing,entries){
  const same=(a,b)=>a.title===b.title&&a.page===b.page&&a.level===b.level;
  // Deduplicate a complete ordered block, never just its parent headings:
  // dropping individual parents would attach their children to another tree.
  if(existing.some((_,start)=>entries.every((row,i)=>existing[start+i]&&same(existing[start+i],row))))return [...existing];
  return [...existing,...entries];
}
module.exports={pageLabel,parsePageRange,groupedLines,parseContents,isContentsPage,calibrationEvidence,calibrate,calibrationSample,entriesFromDraft,appendContents};
