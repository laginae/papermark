import {Modal,Notice,TFile} from 'obsidian';
import {supports,MAX_FILES,folderPath,outputName,availablePath,ensureFolder} from './files';
import {label} from './strings';
export class PickFilesModal extends Modal {
  constructor(plugin,kind){super(plugin.app);this.shouldRestoreSelection=false;this.plugin=plugin;this.kind=kind;this.selected=new Map();this.promise=new Promise(resolve=>this.resolve=resolve);}
  text(key){return label(this.plugin.settings.language,key);}
  onOpen(){
    this.titleEl.setText(this.text('choose'));this.contentEl.addClass('papermark-picker');
    const search=this.contentEl.createEl('input',{type:'search',placeholder:this.text('filter')});search.setAttribute('aria-label',this.text('filter'));
    const list=this.contentEl.createDiv({cls:'papermark-file-list'}),count=this.contentEl.createEl('p');
    const files=this.app.vault.getFiles().filter(file=>supports(file,this.kind)).sort((a,b)=>a.path.localeCompare(b.path,undefined,{numeric:true}));
    const footer=this.contentEl.createDiv({cls:'papermark-modal-actions'}),add=footer.createEl('button',{text:this.text('add'),cls:'mod-cta'});
    footer.createEl('button',{text:this.text('cancel')}).onclick=()=>this.close();
    const update=()=>{count.setText(`${this.selected.size} / ${MAX_FILES[this.kind]}`);add.disabled=!this.selected.size;};
    const draw=()=>{
      list.empty();let found=0;
      for(const file of files){if(!file.path.toLowerCase().includes(search.value.toLowerCase()))continue;found++;
        const row=list.createEl('label',{cls:'papermark-file-choice'}),box=row.createEl('input',{type:'checkbox'});box.checked=this.selected.has(file.path);row.createSpan({text:file.path});
        box.onchange=()=>{if(box.checked){if(this.selected.size>=MAX_FILES[this.kind]){box.checked=false;new Notice(this.text('limit'));return;}this.selected.set(file.path,file);}else this.selected.delete(file.path);update();};
      }
      if(!found)list.createEl('p',{text:this.text('none')});update();
    };
    search.oninput=draw;add.onclick=()=>{this.resolve([...this.selected.values()]);this.close();};draw();search.focus();
  }
  onClose(){this.resolve([]);this.contentEl.empty();this.restoreFocus?.();}
}
export class SaveFileModal extends Modal {
  constructor(plugin,bytes,name){super(plugin.app);this.shouldRestoreSelection=false;this.plugin=plugin;this.bytes=bytes;this.name=name;this.promise=new Promise(resolve=>this.resolve=resolve);}
  text(key){return label(this.plugin.settings.language,key);}
  onOpen(){
    this.titleEl.setText(this.text('save'));this.contentEl.addClass('papermark-save');
    const field=(key,value)=>{const row=this.contentEl.createEl('label');row.createSpan({text:this.text(key)});return row.createEl('input',{type:'text',value});};
    const folder=field('folder',this.plugin.settings.exportFolder),filename=field('name',this.name);
    this.contentEl.createEl('p',{text:this.text('keep')});const error=this.contentEl.createEl('p',{cls:'papermark-error',attr:{role:'alert'}});
    const footer=this.contentEl.createDiv({cls:'papermark-modal-actions'}),save=footer.createEl('button',{text:this.text('save'),cls:'mod-cta'}),cancel=footer.createEl('button',{text:this.text('cancel')});
    cancel.onclick=()=>this.close();save.onclick=async()=>{
      save.disabled=true;cancel.disabled=true;
      try{const target=folderPath(folder.value),name=outputName(filename.value);await ensureFolder(this.app.vault,target);
        const path=availablePath(this.app.vault,target,name);await this.app.vault.createBinary(path,this.bytes);
        new Notice(this.text('saved')+path);this.resolve(true);this.close();
      }catch{error.setText(this.text('failed'));save.disabled=false;cancel.disabled=false;}
    };
  }
  onClose(){this.resolve(false);this.bytes=null;this.contentEl.empty();this.restoreFocus?.();}
}
export async function readFiles(vault,files,kind){
  if(!Array.isArray(files)||files.length>MAX_FILES[kind])throw new Error('host.failed');let total=0;const result=[];
  for(const file of files){
    const max=kind==='images'?20*1024**2:kind==='json'?30*1024**2:100*1024**2;
    if(!(file instanceof TFile)||!supports(file,kind)||file.stat.size>max||(total+=file.stat.size)>(kind==='images'?200:250)*1024**2)throw new Error('host.failed');
    const bytes=await vault.readBinary(file);if(bytes.byteLength>max)throw new Error('host.failed');
    result.push({name:file.name,bytes,type:kind==='pdf'?'application/pdf':kind==='json'?'application/json':`image/${file.extension==='jpg'?'jpeg':file.extension}`});
  }
  return result;
}
