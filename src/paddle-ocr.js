import {paddleResult} from './paddle-layout';
export async function createPaddleOcr({host,model,signal,progress}) {
  signal.throwIfAborted();progress({stage:'initialize',fraction:0});
  await host.request('ocr-start',{model},signal);
  return {
    recognize:async canvas=>{
      signal.throwIfAborted();const {width,height}=canvas;
      const rgba=canvas.getContext('2d',{willReadFrequently:true}).getImageData(0,0,width,height).data,rgb=new Uint8Array(width*height*3);
      for(let i=0,j=0;i<rgba.length;i+=4){rgb[j++]=rgba[i];rgb[j++]=rgba[i+1];rgb[j++]=rgba[i+2];}
      try{return paddleResult(await host.request('ocr-recognize',{width,height,bytes:rgb.buffer},signal));}finally{rgb.fill(0);}
    },
    close:()=>host.request('ocr-close').catch(()=>{})
  };
}
