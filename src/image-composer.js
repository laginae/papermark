'use strict';
const {t,uiError}=require('./i18n');
const {IMAGE_LIMITS,imagesToPdf,decodeImage}=require('./image-pdf');
function createImageComposer(root,{onCreate,onError,onBusy=()=>{},pickVault}={}) {
  const $=id=>root.getElementById(id),dialog=$('images-dialog');
  const items=[];let busy=false,controller=null;
  const el=(tag,text,className)=>{const node=root.createElement(tag);if(text)node.textContent=text;if(className)node.className=className;return node;};
  function draw() {
    $('images-count').textContent=t('images.count',{count:items.length});$('images-list').replaceChildren();
    items.forEach((item,index)=>{
      const row=el('li',null,'image-page'),thumb=el('img');thumb.src=item.thumbnail;thumb.alt='';thumb.style.transform=`rotate(${-item.rotation}deg)`;
      const info=el('div',null,'image-page-info');info.append(el('strong',`${index+1}. ${item.file.name}`));
      const actions=el('div',null,'image-page-actions');
      for(const [label,action,disabled] of [
        [t('moveUp'),()=>{[items[index-1],items[index]]=[items[index],items[index-1]];},index===0],
        [t('moveDown'),()=>{[items[index],items[index+1]]=[items[index+1],items[index]];},index===items.length-1],
        [t('images.rotate'),()=>{item.rotation=(item.rotation+270)%360;},false],
        [t('delete'),()=>{URL.revokeObjectURL(item.thumbnail);items.splice(index,1);},false]
      ]){const button=el('button',label,'quiet small');button.type='button';button.disabled=busy||disabled;button.onclick=()=>{action();draw();};actions.append(button);}
      info.append(actions);row.append(thumb,info);$('images-list').append(row);
    });
    for(const id of ['images-add','images-vault','images-sort','images-clear','images-mode','images-name'])$(id).disabled=busy;
    $('images-create').disabled=busy||!items.length;$('images-close').disabled=busy;$('images-cancel').hidden=!busy;
    $('images-empty').hidden=!!items.length;
  }
  async function add(files) {
    if(busy)return;if(!dialog.open)dialog.showModal();busy=true;onBusy(true);draw();
    try {
      for(const file of files) {
        if(!/\.(png|jpe?g|webp)$/i.test(file.name))throw uiError('images.invalid');
        if(items.length>=IMAGE_LIMITS.count||items.reduce((n,x)=>n+x.file.size,0)+file.size>IMAGE_LIMITS.total)throw uiError('images.limit');
        const thumb=await decodeImage(file,true);
        items.push({file,rotation:0,thumbnail:URL.createObjectURL(thumb.blob)});draw();
      }
    }catch(error){onError(error);}finally{busy=false;onBusy(false);draw();}
  }
  function clear(){items.forEach(item=>URL.revokeObjectURL(item.thumbnail));items.length=0;draw();}
  $('images-add').onclick=()=>$('image-files').click();
  $('image-files').onchange=event=>{add([...event.target.files]);event.target.value='';};
  $('images-vault').onclick=async()=>{try{await add(await pickVault());}catch(error){onError(error);}};
  $('images-sort').onclick=()=>{items.sort((a,b)=>a.file.name.localeCompare(b.file.name,'en',{numeric:true}));draw();};
  $('images-clear').onclick=clear;$('images-close').onclick=()=>dialog.close();
  $('images-cancel').onclick=()=>controller?.abort();
  dialog.addEventListener('cancel',event=>{if(busy){event.preventDefault();controller?.abort();}});
  $('images-create').onclick=async()=>{
    if(busy||!items.length)return;busy=true;controller=new AbortController();onBusy(true);draw();
    try {
      const bytes=await imagesToPdf(items,{mode:$('images-mode').value,decode:decodeImage,signal:controller.signal,
        progress:(page,count)=>$('images-progress').textContent=t('images.progress',{page,count})});
      if(bytes.length>100*1024**2)throw uiError('file.limit');
      const name=($('images-name').value.trim()||'images').replace(/\.pdf$/i,'')+'.pdf';
      busy=false;onBusy(false);dialog.close();clear();
      await onCreate(new File([bytes],name,{type:'application/pdf'}));
    }catch(error){if(!controller.signal.aborted)onError(error);}
    finally{controller=null;busy=false;onBusy(false);$('images-progress').textContent='';draw();}
  };
  draw();return {open:()=>{draw();dialog.showModal();},add,refresh:draw,dispose:()=>{controller?.abort();clear();}};
}
module.exports={createImageComposer};
