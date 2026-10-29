'use strict';
// Only the recognition image is changed. The original PDF is never repainted.
function multiply(a,b) {
  return [a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];
}
function estimateSkew(data,width,height) {
  const hist=new Uint32Array(256);
  for(let i=0;i<data.length;i+=4) hist[Math.round(.299*data[i]+.587*data[i+1]+.114*data[i+2])]++;
  const total=width*height;let sum=0;for(let i=0;i<256;i++)sum+=hist[i]*i;
  let low=0,weight=0,best=0,threshold=140;
  for(let i=0;i<255;i++){weight+=hist[i];low+=hist[i]*i;if(!weight||weight===total)continue;
    const score=weight*(total-weight)*(low/weight-(sum-low)/(total-weight))**2;if(score>best){best=score;threshold=i;}}
  threshold=Math.min(210,Math.max(60,threshold));
  const points=[];
  for(let y=height*.04|0;y<height*.96;y++)for(let x=width*.04|0;x<width*.96;x+=2){
    const i=(y*width+x)*4;if(.299*data[i]+.587*data[i+1]+.114*data[i+2]<threshold)points.push([x-width/2,y-height/2]);}
  if(points.length<100) return 0;
  const score=angle=>{const r=angle*Math.PI/180,c=Math.cos(r),s=Math.sin(r),bins=new Float32Array(height+width+4),base=bins.length/2;
    for(const [x,y] of points){const position=x*s+y*c+base,index=Math.floor(position),fraction=position-index;bins[index]+=1-fraction;bins[index+1]+=fraction;}
    let value=0;for(let i=0;i<bins.length;i++)value+=bins[i]**2;return value;};
  const zero=score(0);let angle=0,maximum=zero;
  for(let a=-4;a<=4.001;a+=.2){const value=score(a);if(value>maximum){maximum=value;angle=a;}}
  const coarse=angle;for(let a=coarse-.18;a<=coarse+.181;a+=.04){const value=score(a);if(value>maximum){maximum=value;angle=a;}}
  return Math.abs(angle)<.18||maximum<zero*1.12 ? 0 : Math.max(-4,Math.min(4,angle));
}
async function prepareOcrCanvas(canvas,viewport) {
  const small=document.createElement('canvas'),ratio=Math.min(1,1000/canvas.width);
  small.width=Math.round(canvas.width*ratio);small.height=Math.round(canvas.height*ratio);
  const sc=small.getContext('2d',{willReadFrequently:true});sc.drawImage(canvas,0,0,small.width,small.height);
  const angle=estimateSkew(sc.getImageData(0,0,small.width,small.height).data,small.width,small.height);
  small.width=small.height=1;
  const processed=document.createElement('canvas');processed.width=canvas.width;processed.height=canvas.height;
  const ctx=processed.getContext('2d',{willReadFrequently:true}),r=angle*Math.PI/180,c=Math.cos(r),s=Math.sin(r),x=canvas.width/2,y=canvas.height/2;
  const matrix=[c,s,-s,c,x-c*x+s*y,y-s*x-c*y];
  ctx.fillStyle='white';ctx.fillRect(0,0,processed.width,processed.height);ctx.setTransform(...matrix);ctx.drawImage(canvas,0,0);ctx.resetTransform();
  const pixels=ctx.getImageData(0,0,processed.width,processed.height),hist=new Uint32Array(256);
  for(let i=0;i<pixels.data.length;i+=4){const gray=Math.round(.299*pixels.data[i]+.587*pixels.data[i+1]+.114*pixels.data[i+2]);hist[gray]++;}
  const count=processed.width*processed.height;let low=0,high=255,sum=0;
  for(;low<255;low++){sum+=hist[low];if(sum>=count*.005)break;}sum=0;
  for(;high>0;high--){sum+=hist[high];if(sum>=count*.005)break;}
  // Conservative contrast stretching retains grayscale edges; no hard binarization.
  if(high-low>40)for(let i=0;i<pixels.data.length;i+=4){const value=Math.round((.299*pixels.data[i]+.587*pixels.data[i+1]+.114*pixels.data[i+2]-low)*255/(high-low));pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=Math.max(0,Math.min(255,value));}
  ctx.putImageData(pixels,0,0);
  return {canvas:processed,viewport:{width:viewport.width,height:viewport.height,scale:viewport.scale,transform:multiply(matrix,viewport.transform)},angle};
}
module.exports={estimateSkew,prepareOcrCanvas,multiply};
