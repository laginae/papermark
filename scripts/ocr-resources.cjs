'use strict';
const fs=require('node:fs'),path=require('node:path');
module.exports=function(root){
  const langs={};
  for(const code of ['eng','chi_sim']) langs[code]=fs.readFileSync(path.join(root,'node_modules/@tesseract.js-data',code,'4.0.0_best_int',code+'.traineddata.gz')).toString('base64');
  const core=fs.readFileSync(path.join(root,'node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js'),'utf8');
  const runtime=fs.readFileSync(path.join(root,'node_modules/tesseract.js/dist/worker.min.js'),'utf8').replace(/\/\/# sourceMappingURL=.*$/gm,'');
  // Everything the worker needs is already in memory. Its virtual language
  // fetches never reach the network, and unexpected requests fail closed.
  const guard=`;(() => { const models=${JSON.stringify(langs)};
    self.fetch=async input=>{const url=String(input);const code=Object.keys(models).find(code=>url==='https://papermark.invalid/ocr/'+code+'.traineddata.gz');
      if(!code) throw new Error('OCR network access is disabled');
      return new Response(Uint8Array.from(atob(models[code]),c=>c.charCodeAt(0)),{status:200});};
    self.importScripts=()=>{throw new Error('OCR script downloads are disabled');};
    self.XMLHttpRequest=class {constructor(){throw new Error('OCR network access is disabled');}};
    self.WebSocket=class {constructor(){throw new Error('OCR network access is disabled');}};
  })();\n`;
  return {format:1,engine:'tesseract.js@7.0.0',languages:['eng','chi_sim'],worker:core+'\n'+guard+runtime};
};
