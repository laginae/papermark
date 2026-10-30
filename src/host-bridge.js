'use strict';
const {uiError}=require('./i18n');
const CHANNEL='papermark/v1';
function createHostBridge({onInit,onFiles}={}) {
  const pending=new Map();let serial=0,session=null;
  const bridge={connected:false,desktop:false};
  const send=message=>window.parent.postMessage({channel:CHANNEL,session,...message},'*');
  window.addEventListener('message',async event=>{
    const data=event.data;
    if(window.parent===window||event.source!==window.parent||data?.channel!==CHANNEL)return;
    if(data.type==='init'&&!session&&typeof data.session==='string'){
      session=data.session;bridge.connected=true;bridge.desktop=data.desktop===true;onInit?.(data);return;
    }
    if(!session||data.session!==session)return;
    if(data.type==='result'){
      const job=pending.get(data.id);if(!job)return;pending.delete(data.id);job.cleanup();
      if(data.error)job.reject(uiError(data.error));else job.resolve(data.value);return;
    }
    if(data.type==='files'){
      try{await onFiles?.(toFiles(data.files));send({type:'files-done',id:data.id});}
      catch{send({type:'files-done',id:data.id,error:true});}
    }
    if(data.type==='dispose')window.dispatchEvent(new Event('papermark-dispose'));
  });
  function request(action,payload={},signal) {
    if(!bridge.connected)return Promise.reject(uiError('host.unavailable'));
    if(signal?.aborted)return Promise.reject(uiError('ocr.cancelled'));
    return new Promise((resolve,reject)=>{
      const id=String(++serial),abort=()=>{pending.delete(id);cleanup();send({type:'cancel',id});reject(uiError('ocr.cancelled'));};
      const timer=setTimeout(()=>{pending.delete(id);cleanup();send({type:'cancel',id});reject(uiError('host.timeout'));},action==='save'?600000:180000);
      const cleanup=()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);};
      pending.set(id,{resolve,reject,cleanup});signal?.addEventListener('abort',abort,{once:true});send({type:'request',id,action,payload});
    });
  }
  function toFiles(files) {
    if(!Array.isArray(files)||files.length>100)throw uiError('file.limit');
    return files.map(file=>{
      if(typeof file.name!=='string'||!(file.bytes instanceof ArrayBuffer)||file.bytes.byteLength>100*1024**2)throw uiError('file.limit');
      return new File([file.bytes],file.name,{type:file.type||''});
    });
  }
  bridge.pick=async kind=>toFiles(await request('pick',{kind}));
  bridge.save=async(bytes,name,type)=>{
    const buffer=await new Blob([bytes]).arrayBuffer();return request('save',{bytes:buffer,name,type});
  };
  bridge.language=value=>{if(session)send({type:'language',value});};
  bridge.request=request;
  if(window.parent!==window)send({type:'hello'});
  return bridge;
}
module.exports={CHANNEL,createHostBridge};
