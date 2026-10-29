'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { pathToFileURL } = require('node:url');
const { detectHeadings, numbering } = require('../src/detection');
const { validateEntries, safeFilename, uniqueFilename } = require('../src/model');
const { scanPdfOutline } = require('../src/pdf-outline');
const { writePdfBookmarks } = require('../src/pdf-bookmarks');
function lines(texts) {
  return [{number:1,height:842,view:[0,0,595,842],bodyHeight:10,styles:{},
    items:[...texts.map((text,i)=>({str:text,width:220,height:i===0?10:12,fontName:'Bold',transform:[12,0,0,12,45,750-i*35]})),
      {str:'A normal body paragraph. '.repeat(40),width:500,height:10,fontName:'Regular',transform:[10,0,0,10,45,100]}],
    lines:texts.map((text,i)=>({text,offset:i*50,xMin:45,xMax:265,y:750-i*35}))}];
}
test('Chinese chapters without spaces and decimal/Roman hierarchy',()=>{
  assert.equal(numbering('第一章绪论').level,1);
  assert.equal(numbering('第二节 数据处理').level,2);
  assert.equal(numbering('2.1.3 Model selection').level,3);
  assert.equal(numbering('II. METHODOLOGY').level,1);
  assert.equal(numbering('A. Study design').level,2);
  assert.equal(numbering('2026 annual review'),null);
});
test('captions, tables of contents and reference entries are not bookmarks',()=>{
  const rows=detectHeadings(lines(['Abstract','1. Introduction','Table 1. Comparison','References','1. Smith, J. A study.']));
  assert.deepEqual(rows.map(r=>r.title),['Abstract','1. Introduction','References']);
  assert.deepEqual(detectHeadings(lines(['Contents','1. Introduction .... 2','2. Methods .... 4','3. Results .... 8'])),[]);
});
test('author initials are not section numbering',()=>{
  const rows=detectHeadings(lines(['A. Researcher and B. Researcher','Abstract','1. Introduction']));
  assert.deepEqual(rows.map(r=>r.title),['Abstract','1. Introduction']);
});
test('wrapped headings merge multiple lines without merging body sentences',()=>{
  const p=lines(['Introduction','A LONG MULTILINE','HEADING WITH THREE','LINES','Body sentence.'])[0];
  p.number=2;
  p.lines.forEach((line,i)=>line.y=750-i*15);
  p.items.slice(0,5).forEach((item,i)=>item.transform[5]=750-i*15);
  p.items[0].height=12;
  const rows=detectHeadings([p]);
  assert.ok(rows.some(r=>r.title==='A LONG MULTILINE HEADING WITH THREE LINES'));
});
test('scan cancellation is checked between pages',async()=>{
  let current=true, pagesRead=0;
  const page={getTextContent:async()=>({items:[],styles:{}}),getViewport:()=>({width:595,height:842}),cleanup(){}};
  await assert.rejects(scanPdfOutline({numPages:3,getPage:async()=>{pagesRead++;return page;}},
    {isCurrent:()=>current,progress:()=>current=false}),/Cancelled/);
  assert.equal(pagesRead,1);
});
test('validate real destinations and hierarchy; no silent correction',()=>{
  const pages=[{view:[20,30,580,770]}], row={title:'Introduction',level:1,page:1,x:40,y:730};
  assert.equal(validateEntries([row],pages).length,1);
  assert.throws(()=>validateEntries([{...row,level:2}],pages),{i18nKey:'validation.level'});
  assert.throws(()=>validateEntries([row,{...row,level:3}],pages),{i18nKey:'validation.level'});
  assert.throws(()=>validateEntries([{...row,page:2}],pages),{i18nKey:'validation.page'});
  assert.throws(()=>validateEntries([{...row,y:900}],pages),{i18nKey:'validation.position'});
  assert.throws(()=>validateEntries([{...row,title:'   '}],pages),{i18nKey:'validation.title'});
});
test('batch names cannot escape folders or overwrite duplicate names',()=>{
  const used=new Set(); assert.equal(safeFilename('../a.pdf'),'.._a.with-bookmarks.pdf');
  assert.equal(uniqueFilename('Paper.pdf',used),'Paper.pdf');
  assert.equal(uniqueFilename('paper.pdf',used),'paper (2).pdf');
});
test('real PDF text extraction, expected chapters and independently read-back destinations',async()=>{
  const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');
  const base=path.resolve(__dirname,'../qa/fixtures');
  if(!fs.existsSync(path.join(base,'demo-paper.pdf'))) throw new Error('Run npm run fixtures first.');
  const options={standardFontDataUrl:path.resolve(__dirname,'../node_modules/pdfjs-dist/standard_fonts').replaceAll('\\','/')+'/'};
  const bytes=new Uint8Array(fs.readFileSync(path.join(base,'demo-paper.pdf')));
  const pdf=await pdfjs.getDocument({data:bytes.slice(),...options}).promise;
  const model=await scanPdfOutline(pdf), expected=JSON.parse(fs.readFileSync(path.join(base,'expected.json'),'utf8'));
  assert.deepEqual(model.entries.map(({title,page,level})=>({title,page,level})),expected);
  const output=await writePdfBookmarks(bytes,validateEntries(model.entries,model.pages));
  const result=await pdfjs.getDocument({data:output.slice(),...options}).promise;
  const reread=await scanPdfOutline(result);
  assert.deepEqual(reread.entries.map(({title,page,level})=>({title,page,level})),expected);
  for(let i=0;i<model.pages.length;i++) assert.equal(reread.pages[i].text,model.pages[i].text);
  const annotations=await result.getPage(3).then(p=>p.getAnnotations());
  assert.equal(annotations[0].contentsObj.str,'Keep this annotation');
  fs.writeFileSync(path.join(base,'demo-paper.with-bookmarks.pdf'),output);
  await pdf.loadingTask.destroy();await result.loadingTask.destroy();
});
test('rotated cropped pages keep PDF coordinate destinations',async()=>{
  const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');
  const bytes=new Uint8Array(fs.readFileSync(path.join(__dirname,'../qa/fixtures/rotated-cropped.pdf')));
  const pdf=await pdfjs.getDocument({data:bytes.slice(),standardFontDataUrl:path.resolve(__dirname,'../node_modules/pdfjs-dist/standard_fonts').replaceAll('\\','/')+'/'}).promise;
  const model=await scanPdfOutline(pdf);
  assert.equal(model.entries[0].title,'1. Introduction');
  assert.deepEqual(model.pages[0].view,[20,30,580,770]);
  validateEntries(model.entries,model.pages);
  const viewport=(await pdf.getPage(1)).getViewport({scale:1});
  const position=viewport.convertToViewportPoint(model.entries[0].x,model.entries[0].y);
  assert.deepEqual(viewport.convertToPdfPoint(...position),[model.entries[0].x,model.entries[0].y]);
  await pdf.loadingTask.destroy();
});
