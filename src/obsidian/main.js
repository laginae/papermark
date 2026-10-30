import {Plugin,ItemView,PluginSettingTab,Setting,Notice,Platform,TFile} from 'obsidian';
import html from 'papermark-offline-html';
import {CHANNEL} from '../host-bridge';
import {label} from './strings';
import {PickFilesModal,SaveFileModal,readFiles} from './modals';
import {folderPath,supports,outputName} from './files';
const VIEW='papermark-workspace';
const defaults={language:'en',exportFolder:'PaperMark',paddleExecutable:''};
class PaperMarkView extends ItemView {
  constructor(leaf,plugin){super(leaf);this.plugin=plugin;this.jobs=new Map();this.deliveries=new Map();this.session=crypto.randomUUID();this.ready=new Promise(resolve=>this.resolveReady=resolve);}
  getViewType(){return VIEW;}
  getDisplayText(){return 'PaperMark';}
  getIcon(){return 'book-open-check';}
  async onOpen(){
    this.contentEl.empty();this.contentEl.addClass('papermark-workspace');
    const frame=this.contentEl.createEl('iframe',{cls:'papermark-frame',attr:{title:'PaperMark',sandbox:'allow-scripts allow-same-origin allow-modals allow-downloads allow-popups allow-popups-to-escape-sandbox'}});this.frame=frame;
    const win=this.contentEl.ownerDocument.defaultView;
    this.registerDomEvent(win,'message',event=>this.message(event));frame.srcdoc=html;
  }
  send(data){if(!this.closed)this.frame?.contentWindow?.postMessage({channel:CHANNEL,session:this.session,...data},'*');}
  async message(event){
    const data=event.data;
    if(this.closed||event.source!==this.frame?.contentWindow||data?.channel!==CHANNEL)return;
    if(data.type==='hello'){this.send({type:'init',language:this.plugin.settings.language,desktop:Platform.isDesktopApp});this.resolveReady(true);return;}
    if(data.session!==this.session)return;
    if(data.type==='language'){this.plugin.settings.language=data.value==='zh-CN'?'zh-CN':'en';await this.plugin.saveSettings();return;}
    if(data.type==='files-done'){this.deliveries.get(data.id)?.(data.error);return;}
    if(data.type==='cancel'){const job=this.jobs.get(data.id);job?.controller.abort();job?.modal?.close();return;}
    if(data.type!=='request'||typeof data.id!=='string'||data.id.length>40||this.jobs.has(data.id)||this.jobs.size>8)return;
    const job={controller:new AbortController()};this.jobs.set(data.id,job);
    try{const value=await this.action(data.action,data.payload,job);if(!job.controller.signal.aborted)this.send({type:'result',id:data.id,value});}
    catch(error){const allowed=['ocr.helperMissing','ocr.helperFailed','ocr.cancelled'];this.send({type:'result',id:data.id,error:allowed.includes(error.message)?error.message:'host.failed'});}
    finally{this.jobs.delete(data.id);}
  }
  async action(action,p,job){
    if(action==='pick'){
      if(!['pdf','images','json'].includes(p?.kind))throw new Error('host.failed');
      const modal=new PickFilesModal(this.plugin,p.kind);this.openModal(modal,job);const files=await modal.promise;
      if(job.controller.signal.aborted)return [];return readFiles(this.app.vault,files,p.kind);
    }
    if(action==='save'){
      if(!(p?.bytes instanceof ArrayBuffer)||!p.bytes.byteLength||p.bytes.byteLength>300*1024**2)throw new Error('host.failed');
      const modal=new SaveFileModal(this.plugin,p.bytes,outputName(p.name));this.openModal(modal,job);return modal.promise;
    }
    if(action==='ocr-start'){
      this.ocr?.close();this.ocr=null;
      if(!Platform.isDesktopApp||!this.plugin.settings.paddleExecutable)throw new Error('ocr.helperMissing');
      try{const {OcrProcess}=require('./native/ocr-process');this.ocr=new OcrProcess(this.plugin.settings.paddleExecutable,p?.model);return true;}
      catch{throw new Error('ocr.helperFailed');}
    }
    if(action==='ocr-recognize'){
      if(!this.ocr||!(p?.bytes instanceof ArrayBuffer)||p.bytes.byteLength>12000000)throw new Error('ocr.helperFailed');
      try{return await this.ocr.recognize(new Uint8Array(p.bytes),p.width,p.height,job.controller.signal);}
      catch{throw new Error(job.controller.signal.aborted?'ocr.cancelled':'ocr.helperFailed');}
    }
    if(action==='ocr-close'){this.ocr?.close();this.ocr=null;return true;}
    throw new Error('host.failed');
  }
  openModal(modal,job){
    // Obsidian's selection restorer expects its own Element extensions, which
    // are absent in the isolated iframe. Restore focus with standard DOM APIs.
    const focused=this.frame?.contentDocument?.activeElement;
    modal.restoreFocus=()=>{if(!this.closed&&focused?.isConnected)focused.focus({preventScroll:true});};
    job.modal=modal;modal.open();
  }
  async addFiles(files){
    const ready=await Promise.race([this.ready,new Promise(resolve=>setTimeout(()=>resolve(false),30000))]);if(!ready||this.closed)throw new Error('host.failed');
    const kind=files.every(f=>supports(f,'images'))?'images':'pdf',prepared=await readFiles(this.app.vault,files,kind),id=crypto.randomUUID();
    return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this.deliveries.delete(id);reject(new Error('host.failed'));},180000);
      this.deliveries.set(id,error=>{clearTimeout(timer);this.deliveries.delete(id);error?reject(new Error('host.busy')):resolve();});this.send({type:'files',id,files:prepared});});
  }
  async onClose(){
    this.send({type:'dispose'});this.closed=true;this.resolveReady(false);this.ocr?.close();this.ocr=null;
    for(const job of this.jobs.values()){job.controller.abort();job.modal?.close();}this.jobs.clear();
    for(const done of [...this.deliveries.values()])done(true);this.frame?.remove();this.contentEl.empty();
  }
}
class PaperMarkSettings extends PluginSettingTab {
  constructor(app,plugin){super(app,plugin);this.plugin=plugin;}
  display(){
    const {containerEl}=this,plugin=this.plugin,tr=key=>label(plugin.settings.language,key);containerEl.empty();containerEl.createEl('h2',{text:tr('settings')});containerEl.createEl('p',{text:tr('privacy')});
    new Setting(containerEl).setName(tr('language')).addDropdown(drop=>drop.addOption('en','English').addOption('zh-CN','中文').setValue(plugin.settings.language).onChange(async value=>{plugin.settings.language=value;await plugin.saveSettings();this.display();}));
    new Setting(containerEl).setName(tr('destination')).setDesc(tr('destinationHelp')).addText(text=>text.setValue(plugin.settings.exportFolder).onChange(async value=>{try{plugin.settings.exportFolder=folderPath(value);await plugin.saveSettings();}catch{}}));
    if(Platform.isDesktopApp)new Setting(containerEl).setName(tr('helper')).setDesc(tr('helperHelp')).addText(text=>text.setPlaceholder('CozyOcr executable').setValue(plugin.settings.paddleExecutable).onChange(async value=>{plugin.settings.paddleExecutable=value.trim();await plugin.saveSettings();}));
    containerEl.createEl('a',{text:tr('guide'),href:'https://github.com/laginae/papermark/blob/main/docs/obsidian.md'});containerEl.createEl('p',{text:tr('close')});
  }
}
export default class PaperMarkPlugin extends Plugin {
  async onload(){
    const saved=await this.loadData();this.settings={...defaults};
    if(saved?.language==='zh-CN')this.settings.language='zh-CN';
    try{if(typeof saved?.exportFolder==='string')this.settings.exportFolder=folderPath(saved.exportFolder);}catch{}
    if(typeof saved?.paddleExecutable==='string')this.settings.paddleExecutable=saved.paddleExecutable;
    this.registerView(VIEW,leaf=>new PaperMarkView(leaf,this));this.addRibbonIcon('book-open-check','PaperMark',()=>this.open());
    this.addCommand({id:'open-papermark',name:'Open PaperMark',callback:()=>this.open()});this.addSettingTab(new PaperMarkSettings(this.app,this));
    this.registerEvent(this.app.workspace.on('file-menu',(menu,file)=>{if(file instanceof TFile)this.addMenu(menu,[file]);}));
    this.registerEvent(this.app.workspace.on('files-menu',(menu,files)=>this.addMenu(menu,files)));
  }
  async saveSettings(){await this.saveData(this.settings);}
  addMenu(menu,files){
    if(!files.length)return;const images=files.every(f=>f instanceof TFile&&supports(f,'images')),pdf=files.every(f=>f instanceof TFile&&supports(f,'pdf'));if(!images&&!pdf)return;
    menu.addItem(item=>item.setTitle(label(this.settings.language,images?'images':'pdf')).setIcon('book-open-check').onClick(()=>this.open(files)));
  }
  async open(files){
    try{let leaf=this.app.workspace.getLeavesOfType(VIEW).find(item=>!item.view.closed);if(!leaf){leaf=this.app.workspace.getLeaf('tab');await leaf.setViewState({type:VIEW,active:true});}await this.app.workspace.revealLeaf(leaf);if(files?.length)await leaf.view.addFiles(files);}
    catch(error){new Notice(label(this.settings.language,error.message==='host.busy'?'busy':'failed'));}
  }
  onunload(){this.app.workspace.detachLeavesOfType(VIEW);}
}
