'use strict';
// Rasterize synthetic fixture pages: the resulting PDF contains no text layer.
const fs=require('node:fs'),path=require('node:path');
const {PDFDocument}=require('pdf-lib'),{createCanvas}=require('@napi-rs/canvas');
(async()=>{
  const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');
  const dir=path.resolve(__dirname,'../qa/fixtures'), output=await PDFDocument.create();
  output.setTitle('PaperMark synthetic scanned paper');output.setAuthor('PaperMark test fixture');
  for(const name of ['demo-paper.pdf']){
    if(!fs.existsSync(path.join(dir,name))) continue;
    const loading=pdfjs.getDocument({data:new Uint8Array(fs.readFileSync(path.join(dir,name))),
      cMapUrl:path.resolve(__dirname,'../node_modules/pdfjs-dist/cmaps').replaceAll('\\','/')+'/',cMapPacked:true,
      standardFontDataUrl:path.resolve(__dirname,'../node_modules/pdfjs-dist/standard_fonts').replaceAll('\\','/')+'/'});
    const doc=await loading.promise;
    for(let n=1;n<=Math.min(2,doc.numPages);n++){
      const p=await doc.getPage(n),view=p.getViewport({scale:2});
      const canvas=createCanvas(Math.ceil(view.width),Math.ceil(view.height));
      await p.render({canvasContext:canvas.getContext('2d'),viewport:view}).promise;
      const image=await output.embedPng(canvas.toBuffer('image/png'));
      output.addPage([view.width/2,view.height/2]).drawImage(image,{x:0,y:0,width:view.width/2,height:view.height/2});
    }
    await loading.destroy();
  }
  if(fs.existsSync(path.join(dir,'scanned-chinese.pdf'))){
    const chinese=await PDFDocument.load(fs.readFileSync(path.join(dir,'scanned-chinese.pdf')));
    const pages=await output.copyPages(chinese,chinese.getPageIndices());pages.forEach(p=>output.addPage(p));
  }
  fs.writeFileSync(path.join(dir,'scanned-paper.pdf'),await output.save());
  console.log('Created image-only scan fixture with '+output.getPageCount()+' pages.');
})().catch(error=>{console.error(error);process.exitCode=1;});
