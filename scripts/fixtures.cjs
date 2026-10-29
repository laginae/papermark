'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { PDFDocument, StandardFonts, PDFName, PDFHexString, degrees, rgb } = require('pdf-lib');
const { writePdfBookmarks } = require('../src/pdf-bookmarks');
const out = path.resolve(__dirname, '../qa/fixtures');
fs.mkdirSync(out, { recursive: true });
(async () => {
  const doc = await PDFDocument.create();
  doc.setTitle('A reproducible study of energy systems - demo'); doc.setAuthor('PaperMark test fixture');
  const font = await doc.embedFont(StandardFonts.TimesRoman), bold = await doc.embedFont(StandardFonts.TimesRomanBold);
  const expected = [];
  function page(number) {
    const p = doc.addPage([595,842]);
    p.drawText('PaperMark Research Notes 2026', { x:46,y:810,size:8,font });
    p.drawText(String(number), { x:290,y:22,size:9,font }); return p;
  }
  function heading(p,title,y,level=1) {
    p.drawText(title, { x:46,y,size:level === 1 ? 14 : 12,font:bold });
    expected.push({title, page:doc.getPageCount(),level});
  }
  function body(p,y,lines=12) {
    for(let i=0;i<lines;i++) p.drawText('The study compares measured responses under a fixed experimental protocol.', {x:46,y:y-i*16,size:10,font});
  }
  let p=page(1);
  p.drawText('A reproducible study of energy systems', {x:46,y:758,size:22,font:bold});
  p.drawText('A. Researcher and B. Researcher', {x:46,y:727,size:11,font});
  heading(p,'Abstract',680); body(p,655,5); heading(p,'1. Introduction',542); body(p,516,13);
  p=page(2); heading(p,'2. Methodology',760); body(p,730,8); heading(p,'2.1. Data preparation',565,2); body(p,537,7);
  heading(p,'2.2. Statistical evaluation',395,2); body(p,366,8);
  p.drawText('Table 1. Model comparison', {x:46,y:210,size:12,font:bold});
  p.drawText('1. this is a numbered list item.', {x:46,y:180,size:10,font});
  p=page(3); heading(p,'3. Results and discussion',760); body(p,732,11); heading(p,'3.1. Sensitivity analysis',524,2); body(p,497,12);
  const annotation = doc.context.register(doc.context.obj({Type:'Annot',Subtype:'Highlight',Rect:[46,720,300,737],
    QuadPoints:[46,737,300,737,46,720,300,720],Contents:PDFHexString.fromText('Keep this annotation')}));
  p.node.set(PDFName.of('Annots'),doc.context.obj([annotation]));
  p=page(4); heading(p,'4. Conclusions',760); body(p,734,9); heading(p,'References',550);
  p.drawText('1. Smith, J. Journal of Research, 2025.', {x:46,y:520,size:10,font});
  p.drawText('2. Jones, A. Energy methods, 2024.', {x:46,y:504,size:10,font});
  const bytes=await doc.save(); fs.writeFileSync(path.join(out,'demo-paper.pdf'),bytes);
  fs.writeFileSync(path.join(out,'expected.json'),JSON.stringify(expected,null,2));
  const rows=[{title:'Original introduction',level:1,page:1,x:46,y:560},{title:'中文子书签',level:2,page:2,x:46,y:580}];
  fs.writeFileSync(path.join(out,'existing-bookmarks.pdf'),await writePdfBookmarks(bytes,rows));
  const sig=await PDFDocument.load(bytes); sig.context.register(sig.context.obj({FT:'Sig'}));
  fs.writeFileSync(path.join(out,'signature-field.pdf'),await sig.save());
  const rotated=await PDFDocument.create(); const rp=rotated.addPage([600,800]); rp.setRotation(degrees(90));
  rp.setCropBox(20,30,560,740); rp.drawText('1. Introduction',{x:70,y:690,size:16});
  for(let i=0;i<15;i++) rp.drawText('A body sentence to establish the normal font size.',{x:70,y:650-i*20,size:10});
  fs.writeFileSync(path.join(out,'rotated-cropped.pdf'),await rotated.save());
  const scan=await PDFDocument.create(), sp=scan.addPage([595,842]);
  sp.drawRectangle({x:40,y:50,width:510,height:730,color:rgb(.93,.94,.92)});
  fs.writeFileSync(path.join(out,'no-text.pdf'),await scan.save());
  console.log('Created five public QA PDFs and expected chapter titles.');
})().catch(e=>{console.error(e);process.exitCode=1;});
