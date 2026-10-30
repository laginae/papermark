'use strict';
const TYPES={pdf:['pdf'],images:['png','jpg','jpeg','webp'],json:['json']};
const MAX_FILES={pdf:20,images:100,json:1};
function supports(file,kind){return !!TYPES[kind]?.includes(file?.extension?.toLowerCase());}
function folderPath(value) {
  const path=String(value||'').trim().replace(/\\/g,'/');
  if(path.startsWith('/')||path.split('/').some(part=>part==='..'||part==='.'||/[\x00-\x1f<>:"|?*]/.test(part)||/[. ]$/.test(part)))throw new Error('host.failed');
  return path.replace(/\/+$/,'');
}
function outputName(value) {
  const name=String(value||'').normalize('NFC').replace(/[\x00-\x1f<>:"/\\|?*]/g,'_').replace(/[. ]+$/,'').slice(0,200);
  if(!name||name==='.'||name==='..'||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)||! /\.(pdf|zip|json)$/i.test(name))throw new Error('host.failed');
  return name;
}
function availablePath(vault,folder,name) {
  const base=folderPath(folder),safe=outputName(name),dot=safe.lastIndexOf('.');
  for(let n=0;n<10000;n++){
    const leaf=n?`${safe.slice(0,dot)} (${n+1})${safe.slice(dot)}`:safe,path=base?`${base}/${leaf}`:leaf;
    if(!vault.getAbstractFileByPath(path))return path;
  }
  throw new Error('host.failed');
}
async function ensureFolder(vault,folder){
  const parts=folderPath(folder).split('/').filter(Boolean);let path='';
  for(const part of parts){path=path?`${path}/${part}`:part;if(!vault.getAbstractFileByPath(path))await vault.createFolder(path);}
}
module.exports={supports,MAX_FILES,folderPath,outputName,availablePath,ensureFolder};
