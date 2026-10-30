'use strict';
const {PDFDocument, degrees} = require('pdf-lib');
const {uiError} = require('./i18n');
const IMAGE_LIMITS = {count:100, bytes:20*1024**2, total:200*1024**2, pixels:25_000_000};
function imageDimensions(input) {
  const b=new Uint8Array(input), v=new DataView(b.buffer,b.byteOffset,b.byteLength);
  const ascii=(start,length)=>String.fromCharCode(...b.subarray(start,start+length));
  let width=0,height=0;
  if(b.length>=24 && b[0]===137 && ascii(1,3)==='PNG' && ascii(12,4)==='IHDR') {width=v.getUint32(16);height=v.getUint32(20);}
  else if(b[0]===255 && b[1]===216) {
    let p=2;
    while(p+4<=b.length) {
      if(b[p++]!==255) break; while(b[p]===255)p++;
      const marker=b[p++]; if(marker===218||marker===217)break;
      if(marker===1||marker>=208&&marker<=215)continue;
      if(p+2>b.length)break;const length=v.getUint16(p);if(length<2||p+length>b.length)break;
      if([192,193,194].includes(marker)&&length>=8){height=v.getUint16(p+3);width=v.getUint16(p+5);break;}p+=length;
    }
  } else if(b.length>=30 && ascii(0,4)==='RIFF' && ascii(8,4)==='WEBP') {
    const kind=ascii(12,4),uint24=p=>b[p]+256*b[p+1]+65536*b[p+2];
    if(kind==='VP8X'){width=1+uint24(24);height=1+uint24(27);}
    else if(kind==='VP8 '&&b[23]===157&&b[24]===1&&b[25]===42){width=v.getUint16(26,true)&16383;height=v.getUint16(28,true)&16383;}
    else if(kind==='VP8L'&&b[20]===47){const bits=v.getUint32(21,true);width=1+(bits&16383);height=1+((bits>>>14)&16383);}
  }
  if(!width||!height||width*height>IMAGE_LIMITS.pixels)throw uiError('images.invalid');
  return {width,height};
}
function imagePageSize(width,height,mode='fit') {
  if(![width,height].every(n=>Number.isFinite(n)&&n>0))throw uiError('images.invalid');
  if(mode==='a4')return {width:595.28,height:841.89};
  return {width:width*72/150,height:height*72/150};
}
async function imagesToPdf(items,{mode='fit',decode,signal,progress=()=>{}}={}) {
  if(!items.length||items.length>IMAGE_LIMITS.count)throw uiError('images.limit');
  const pdf=await PDFDocument.create();pdf.setCreator('PaperMark');pdf.setProducer('PaperMark');
  for(let i=0;i<items.length;i++) {
    signal?.throwIfAborted();const item=items[i];
    const decoded=await decode(item.file);signal?.throwIfAborted();
    const image=await pdf.embedPng(decoded.bytes), rotated=item.rotation%180!==0;
    const w=rotated?decoded.height:decoded.width,h=rotated?decoded.width:decoded.height;
    const size=imagePageSize(w,h,mode),page=pdf.addPage([size.width,size.height]);
    const scale=Math.min(size.width/w,size.height/h),rw=w*scale,rh=h*scale;
    let x=(size.width-rw)/2,y=(size.height-rh)/2;
    const angle=((item.rotation%360)+360)%360;
    // Draw the image upright in a new page; subsequent OCR uses the same geometry.
    if(angle===90)x+=rw; else if(angle===180){x+=rw;y+=rh;} else if(angle===270)y+=rh;
    page.drawImage(image,{x,y,width:decoded.width*scale,height:decoded.height*scale,rotate:degrees(angle)});
    progress(i+1,items.length);await new Promise(resolve=>setTimeout(resolve,0));
  }
  signal?.throwIfAborted();return pdf.save({useObjectStreams:false});
}
async function decodeImage(file,thumbnail=false) {
  if(file.size>IMAGE_LIMITS.bytes)throw uiError('images.limit');
  imageDimensions(await file.arrayBuffer());
  // The browser applies JPEG EXIF orientation. PNG output keeps decoded pixels lossless.
  const bitmap=await createImageBitmap(file,{imageOrientation:'from-image'});
  try {
    const scale=thumbnail?Math.min(1,160/Math.max(bitmap.width,bitmap.height)):1;
    const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
    const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
    const result={bytes:new Uint8Array(await blob.arrayBuffer()),width:canvas.width,height:canvas.height,blob};
    canvas.width=canvas.height=1;return result;
  }finally{bitmap.close();}
}
module.exports={IMAGE_LIMITS,imageDimensions,imagePageSize,imagesToPdf,decodeImage};
