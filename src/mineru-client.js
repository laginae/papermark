import {uiError} from './i18n';
const BASE='http://127.0.0.1:8768';
export function createMineruClient(connection) {
  if(!/^[a-f0-9]{48}$/.test(connection.trim()))throw uiError('mineru.connectionError');
  const headers={'X-PaperMark-Connection':connection.trim()};
  const call=async(path,options={},signal)=>{
    let response;
    try{response=await fetch(BASE+path,{...options,headers:{...headers,...options.headers},signal,credentials:'omit',referrerPolicy:'no-referrer',redirect:'error'});}
    catch(error){if(signal?.aborted)throw uiError('mineru.cancelled');throw uiError('mineru.connectionError');}
    let data;try{data=await response.json();}catch{throw uiError('mineru.connectionError');}
    if(!response.ok)throw uiError(data.error==='token'?'mineru.tokenError':data.error==='limit'?'mineru.limit':data.error==='busy'?'mineru.busy':'mineru.connectionError');
    return data;
  };
  return {
    check:async()=>{const data=await call('/health',{},AbortSignal.timeout(5000));if(data.app!=='PaperMark MinerU helper'||data.version!==1)throw uiError('mineru.connectionError');},
    recognize:async(bytes,token,signal,progress)=>{
      let id;
      try{
        const task=await call('/jobs',{method:'POST',headers:{'Content-Type':'application/pdf','X-MinerU-Token':token,'X-PaperMark-Consent':'upload-to-mineru'},body:bytes},signal);token='';id=task.id;
        if(!/^[a-f0-9-]{36}$/.test(id))throw uiError('mineru.invalid');
        const until=Date.now()+16*60*1000;
        while(Date.now()<until){
          signal.throwIfAborted();const data=await call('/jobs/'+id,{},signal);progress(data.state);
          if(data.state==='done')return data.result;
          if(data.state==='failed')throw uiError(data.error==='token'?'mineru.tokenError':'mineru.failed');
          if(data.state==='cancelled')throw uiError('mineru.cancelled');
          await new Promise((resolve,reject)=>{const cleanup=()=>{clearTimeout(timer);signal.removeEventListener('abort',abort);};const abort=()=>{cleanup();reject(uiError('mineru.cancelled'));};const timer=setTimeout(()=>{cleanup();resolve();},1500);signal.addEventListener('abort',abort,{once:true});});
        }throw uiError('mineru.failed');
      }finally{token='';if(id)await call('/jobs/'+id,{method:'DELETE'},AbortSignal.timeout(5000)).catch(()=>{});}
    }
  };
}
