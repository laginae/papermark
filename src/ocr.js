import embedded from 'embedded-ocr';
import { uiError } from './i18n';

let resources;
export async function createLocalOcr({language='eng+chi_sim',signal,progress=()=>{}}) {
  signal.throwIfAborted(); progress({stage:'resources',fraction:0});
  if (!resources) {
    if (embedded.data) resources=embedded.data;
    else {
      const url=new URL(embedded.file, location.href);
      if (url.origin!==location.origin || !/^https?:$/.test(url.protocol)) throw uiError('ocr.resourceError');
      let response;
      try { response=await fetch(url,{signal,credentials:'omit',referrerPolicy:'no-referrer',redirect:'error'}); }
      catch(error) { if(signal.aborted) throw error; throw uiError('ocr.resourceError'); }
      if(!response.ok) throw uiError('ocr.resourceError');
      const bytes=new Uint8Array(await response.arrayBuffer()); signal.throwIfAborted();
      const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
      if(hash!==embedded.sha256) throw uiError('ocr.resourceError');
      resources=JSON.parse(new TextDecoder().decode(bytes));
    }
  }
  signal.throwIfAborted();
  const workerUrl=URL.createObjectURL(new Blob([resources.worker],{type:'text/javascript'}));
  const worker=new Worker(workerUrl); URL.revokeObjectURL(workerUrl);
  let next=0, pending=null, closed=false;
  const close=(reason=uiError('ocr.cancelled'))=>{
    if(closed) return; closed=true; worker.terminate();
    if(pending){clearTimeout(pending.timer);pending.reject(reason);pending=null;}
    signal.removeEventListener('abort',onAbort);
  };
  const onAbort=()=>close(uiError('ocr.cancelled'));
  signal.addEventListener('abort',onAbort,{once:true});
  worker.onerror=()=>close(uiError('ocr.failed'));
  worker.onmessage=({data})=>{
    if(data.status==='progress') { progress({stage:'recognize',fraction:data.data.progress || 0}); return; }
    if(!pending || data.jobId!==pending.id) return;
    const job=pending; pending=null;clearTimeout(job.timer);
    if(data.status==='resolve') job.resolve(data.data); else job.reject(uiError('ocr.failed'));
  };
  const call=(action,payload)=>new Promise((resolve,reject)=>{
    if(closed || signal.aborted){reject(uiError('ocr.cancelled'));return;}
    const id=String(++next),timer=setTimeout(()=>close(uiError('ocr.timeout')),120000);
    pending={id,resolve,reject,timer};
    worker.postMessage({workerId:'papermark',jobId:id,action,payload});
  });
  try {
    progress({stage:'initialize',fraction:0});
    await call('load',{options:{lstmOnly:true}});
    // The worker resolves this reserved virtual URL from bundled bytes. Its
    // fetch/importScripts implementations reject every other destination.
    await call('loadLanguage',{langs:language,options:{langPath:'https://papermark.invalid/ocr',cacheMethod:'none',gzip:true,lstmOnly:true}});
    await call('initialize',{langs:language,oem:1,config:{}});
    await call('setParameters',{params:{tessedit_pageseg_mode:'3',user_defined_dpi:'180'}});
    return {
      recognize:async canvas=>{
        const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
        if(!blob) throw uiError('ocr.failed');
        return call('recognize',{image:new Uint8Array(await blob.arrayBuffer()),options:{},output:{text:true,blocks:true}});
      }, close
    };
  } catch(error) {close(error);throw error;}
}
