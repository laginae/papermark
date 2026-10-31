'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {JSDOM}=require('jsdom');
const {pageLabel,parsePageRange,parseContents,isContentsPage,calibrate,entriesFromDraft,appendContents}=require('../src/book-toc');
const {createBookFlow}=require('../src/book-flow');
const {setLanguage,translateDom}=require('../src/i18n');
const line=(text,xMin=40,y=700,xMax=270)=>({text,xMin,xMax,y,height:12,confidence:95});
const page=(number,lines=[])=>({number,lines,text:lines.map(l=>l.text).join('\n'),width:600,height:800,view:[0,0,600,800]});
const row=(printedLabel,title='Chapter 1 Start')=>({id:title,title,printedLabel,level:1,include:true,verified:false,pdfPage:null,method:'unresolved',...pageLabel(printedLabel)});
test('page families and bounded ranges distinguish roman front matter and chapter-local pages',()=>{
  assert.equal(pageLabel('iv').number,4);assert.equal(pageLabel('II-12').family,'chapter:II');assert.equal(pageLabel('A-3').number,3);
  for(const label of ['IIX','0','-2','a book'])assert.equal(pageLabel(label),null);
  assert.deepEqual(parsePageRange('2-4, 6, 2',10),[2,3,4,6]);
  for(const value of ['','0','5-2','1-9999','11','1, x'])assert.throws(()=>parsePageRange(value,10));
});
test('two-column multi-page contents preserve hierarchy, detached numbers and wrapped titles',()=>{
  const p=page(2,[line('Contents',240,750,360),line('Chapter 1 Foundations ....',40,700),line('1',270,700,280),line('1.1 Data .... 3',55,670),line('1.1.1 Collection .... 4',70,640),line('Chapter 2 Models .... 9',330,700,560),line('2.1 Statistical',345,670,500),line('estimation .... 11',345,652,560),line('2.2 Validation .... 13',345,620,560)]);
  assert.equal(isContentsPage(p),true);
  const rows=parseContents([p,page(3,[line('Chapter 3 Results .... 20'),line('3.1 Main results .... 21',55,670)])]);
  assert.deepEqual(rows.map(r=>r.printedLabel),['1','3','4','9','11','13','20','21']);
  assert.deepEqual(rows.map(r=>r.level),[1,2,3,1,2,2,1,2]);assert.match(rows[4].title,/Statistical estimation/);
  assert.equal(rows[6].tocPage,3);assert.ok(rows.every(r=>!r.verified));
});
test('prose and isolated numeric lines do not become automatic contents candidates',()=>{
  assert.equal(isContentsPage(page(1,[line('The experiment collected 200 samples in 2025'),line('1',290,20,300),line('Results were measured with method 2',40,500)])),false);
});
test('dense continuation pages can be found even when OCR drops dot leaders',()=>{
  const p=page(3,Array.from({length:5},(_,i)=>line('2.'+(i+1)+' Methods '+(10+i),40,700-i*40,550)));assert.equal(isContentsPage(p),true);
});
test('appending preserves parent-child branches and only deduplicates a complete outline block',()=>{
  const existing=[{title:'Chapter 1',page:1,level:1},{title:'Other branch',page:7,level:1}],entries=[existing[0],{title:'New child',page:2,level:2}];
  const merged=appendContents(existing,entries);assert.equal(merged.length,4);assert.deepEqual(merged.slice(-2),entries);assert.deepEqual(appendContents(merged,entries),merged);
});
test('detached right-aligned page numbers are not mistaken for a second contents column',()=>{
  const lines=[line('目录',40,750,90)];for(let i=0;i<5;i++){lines.push(line('第'+(i+1)+'章 章节标题',40,700-i*50,180));lines.push(line(String(i+1),510,700-i*50,530));}
  const rows=parseContents([page(2,lines)]);assert.equal(rows.length,5);assert.deepEqual(rows.map(r=>r.printedLabel),['1','2','3','4','5']);
});
test('low-confidence dot-leader hallucinations do not split columns or pollute titles',()=>{
  const lines=[line('Contents',40,750,180)];for(let i=0;i<5;i++){lines.push(line('Chapter '+(i+1)+' Methods',40,700-i*50,230));lines.push({...line('eeenmmeeneees',350,700-i*50,430),confidence:0});lines.push(line(String(i+1),510,700-i*50,530));}
  const rows=parseContents([page(2,lines)]);assert.equal(rows.length,5);assert.ok(rows.every(r=>/^Chapter \d Methods$/.test(r.title)));
});
test('calibration handles roman pages, inserted sheets, conflicts and uncertainty without overwriting checks',()=>{
  const pages=Array.from({length:15},(_,i)=>page(i+1));
  for(const [n,label] of [[2,'iv'],[5,'1'],[6,'2'],[9,'4'],[10,'5']])pages[n-1]=page(n,[line(label,290,22,305)]);
  const rows=[row('iv','Preface'),row('1'),row('3','Chapter 2 Methods'),row('4','Chapter 3 Results'),row('8','Appendix')];
  const result=calibrate(rows,pages,[3,4]);
  assert.equal(result[0].pdfPage,2);assert.equal(result[1].pdfPage,5);assert.equal(result[2].pdfPage,null);assert.equal(result[3].pdfPage,9);assert.equal(result[4].pdfPage,null);
  const anchored=calibrate(rows,pages,[3,4],[{family:'arabic',number:1,pdfPage:5},{family:'arabic',number:4,pdfPage:9}]);
  assert.equal(anchored[2].pdfPage,7);assert.equal(anchored[4].pdfPage,13);
  anchored[2].verified=true;anchored[2].pdfPage=8;assert.equal(calibrate(anchored,pages,[3,4])[2].pdfPage,8);
  pages[10]=page(11,[line('4',290,22,305)]);assert.equal(calibrate([row('4')],pages,[3,4])[0].method,'conflict');
});
test('offsets need two pages; repeated running headers and contents do not supply unique title evidence',()=>{
  const pages=Array.from({length:12},(_,i)=>page(i+1));pages[3]=page(4,[line('1',290,22,305)]);
  assert.equal(calibrate([row('5')],pages,[2])[0].pdfPage,null);
  pages[4]=page(5,[line('2',290,22,305)]);assert.equal(calibrate([row('5')],pages,[2])[0].pdfPage,8);
  pages[5]=page(6,[line('Chapter 8 Unique matching title')]);assert.equal(calibrate([row('8','Chapter 8 Unique matching title')],pages,[2])[0].pdfPage,6);
  pages[6]=page(7,[line('Chapter 8 Unique matching title')]);assert.notEqual(calibrate([row('8','Chapter 8 Unique matching title')],pages,[2])[0].method,'title');
});
test('chapter-number words near the top do not conflict with the footer page number',()=>{
  const pages=Array.from({length:10},(_,i)=>page(i+1));pages[6]=page(7,[line('Chapter',40,720,100),line('2',110,720,120),line('Methods',130,720,200),line('3',290,22,300)]);
  const result=calibrate([row('3','Research methods')],pages,[2]);assert.equal(result[0].pdfPage,7);assert.equal(result[0].method,'label');
});
test('review gates export, validates hierarchy, and maps rotated OCR coordinates into the original page',()=>{
  const pages=[page(1)];const rows=[{...row('1'),pdfPage:1}];assert.throws(()=>entriesFromDraft(rows,pages));rows[0].verified=true;
  assert.equal(entriesFromDraft(rows,pages)[0].reason,'reason.contents');rows[0].level=3;assert.throws(()=>entriesFromDraft(rows,pages));rows[0].level=1;
  pages[0].ocrLayout={width:800,height:600,scale:1,transform:[0,1,1,0,0,0],lines:[line(rows[0].title,30,500,250)]};
  const entry=entriesFromDraft(rows,pages)[0];assert.equal(entry.x,88);assert.equal(entry.y,30);
});
test('draft UI keeps edits, per-document state, language, preview and explicit application separate',async()=>{
  const dom=new JSDOM(fs.readFileSync('src/index.html','utf8')),d=dom.window.document;let applied=0,preview=0;
  const doc={model:{pages:[page(1),page(2)]},book:{mode:true,range:'1',columns:'auto',scanLimit:20,bodyRange:'',rows:[{...row('1'),pdfPage:2,tocPage:1}],tocPages:[1],anchors:[],replace:false}};
  const flow=createBookFlow(d,{onWork:async()=>{},onApply:()=>applied++,onError:e=>{throw e;},onPreview:n=>preview=n});flow.update({doc,busy:false});
  const input=d.querySelector('#book-rows td:nth-child(2) input');input.value='Edited <b>safe</b>';input.dispatchEvent(new dom.window.Event('input'));assert.equal(d.querySelector('#book-rows td:nth-child(2) input'),input);
  d.querySelector('#book-rows td:last-child button:last-child').click();assert.equal(preview,2);
  setLanguage('zh-CN');translateDom(d);flow.refresh();assert.equal(d.querySelector('#book-rows td:nth-child(2) input').value,'Edited <b>safe</b>');assert.equal(applied,0);
  d.getElementById('book-confirm-all').click();await Promise.resolve();assert.equal(d.getElementById('book-apply').disabled,false);d.getElementById('book-apply').click();await Promise.resolve();assert.equal(applied,1);
  flow.update({doc:{model:{pages:[page(1)]}},busy:false});assert.equal(d.getElementById('book-panel').hidden,true);flow.update({doc,busy:true});assert.equal(d.getElementById('book-apply').disabled,true);
  setLanguage('en');dom.window.close();
});
