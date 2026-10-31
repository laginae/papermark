'use strict';
const {t,uiError}=require('./i18n');
const {pageLabel,parsePageRange,calibrate,entriesFromDraft}=require('./book-toc');
function createBookFlow(root,{onWork,onApply,onPreview,onError}) {
  const $=id=>root.getElementById(id);let doc=null,busy=false;
  function state(){return doc&&(doc.book||(doc.book={mode:false,range:'',columns:'auto',rows:[],tocPages:[],anchors:[],scanLimit:20,bodyRange:'',message:null,replace:false}));}
  function guarded(action){return async()=>{if(busy||!doc?.model)return;try{await action(state());}catch(error){onError(error);}render();};}
  for(const [id,value] of [['book-mode',true],['paper-mode',false]])$(id).onclick=guarded(s=>{s.mode=value;});
  for(const [id,key] of [['book-range','range'],['book-columns','columns'],['book-body-range','bodyRange']])$(id).oninput=()=>{if(state())state()[key]=$(id).value;};
  $('book-limit').onchange=()=>{if(state())state().scanLimit=Number($('book-limit').value);};
  $('book-replace').onchange=()=>{if(state())state().replace=$('book-replace').checked;};
  $('book-find').onclick=guarded(s=>onWork('find',s));
  $('book-read').onclick=guarded(s=>{parsePageRange(s.range,doc.model.pages.length);return onWork('read',s);});
  $('book-calibrate').onclick=guarded(s=>onWork('calibrate',s));
  $('book-anchor-add').onclick=guarded(s=>{
    const label=pageLabel($('book-anchor-print').value),pdfPage=Number($('book-anchor-pdf').value);
    if(!label||!Number.isInteger(pdfPage)||pdfPage<1||pdfPage>doc.model.pages.length||s.tocPages.includes(pdfPage))throw uiError('book.badAnchor');
    s.anchors=s.anchors.filter(a=>!(a.family===label.family&&a.number===label.number));s.anchors.push({...label,pdfPage});
    s.rows=calibrate(s.rows,doc.model.pages,s.tocPages,s.anchors);
  });
  $('book-anchors-clear').onclick=guarded(s=>{s.anchors=[];s.rows=calibrate(s.rows,doc.model.pages,s.tocPages);});
  $('book-confirm-all').onclick=guarded(s=>{for(const row of s.rows)if(row.include&&row.pdfPage)row.verified=true;});
  $('book-row-add').onclick=guarded(s=>{if(s.rows.length>=1000)throw uiError('validation.count');s.rows.push({id:'manual-'+Date.now(),title:'',level:1,printedLabel:'',pdfPage:null,method:'manual',verified:false,include:true,issues:[]});});
  $('book-apply').onclick=guarded(s=>{const entries=entriesFromDraft(s.rows,doc.model.pages);onApply(entries,s.replace);s.message={key:'book.applied',count:entries.length};});
  function validation(){
    const s=state();if(!s)return;
    $('book-review-summary').textContent=t('book.summary',{total:s.rows.length,checked:s.rows.filter(r=>r.include&&r.verified).length,unresolved:s.rows.filter(r=>r.include&&!r.pdfPage).length});
    let valid=false,error=null;try{entriesFromDraft(s.rows,doc.model.pages);valid=true;}catch(value){error=value;}
    $('book-apply').disabled=busy||!valid;
    $('book-validation').textContent=error&&error.i18nKey!=='book.reviewRequired'?error.message:'';
  }
  function render(){
    const s=state(),ready=!!doc?.model;
    $('paper-mode').setAttribute('aria-pressed',String(!s?.mode));$('book-mode').setAttribute('aria-pressed',String(!!s?.mode));
    $('paper-panel').hidden=!!s?.mode;$('book-panel').hidden=!s?.mode;
    for(const button of [$('paper-mode'),$('book-mode')])button.disabled=busy||!ready;
    if(!s)return;
    for(const [id,key] of [['book-range','range'],['book-columns','columns'],['book-body-range','bodyRange'],['book-limit','scanLimit']])$(id).value=s[key];
    $('book-replace').checked=s.replace;
    $('book-message').textContent=s.message?t(s.message.key,s.message):'';
    $('book-draft').hidden=!s.rows.length;
    $('book-review-summary').textContent=t('book.summary',{total:s.rows.length,checked:s.rows.filter(r=>r.include&&r.verified).length,unresolved:s.rows.filter(r=>r.include&&!r.pdfPage).length});
    $('book-anchors').textContent=s.anchors.map(a=>`${a.label} → ${a.pdfPage}`).join(' · ');
    $('book-rows').replaceChildren();
    for(const row of s.rows){
      const tr=root.createElement('tr');tr.dataset.tocRow=row.id;
      function cell(){const td=root.createElement('td');tr.append(td);return td;}
      function input(type,value,label,onInput){const node=root.createElement('input');node.type=type;node.setAttribute('aria-label',t(label));if(type==='checkbox')node.checked=value;else node.value=value??'';node.disabled=busy;node.oninput=()=>{onInput(type==='checkbox'?node.checked:node.value);validation();const check=tr.querySelector('.book-check input');if(check){check.checked=row.verified;check.disabled=busy||!row.pdfPage||!row.title.trim();}const method=tr.querySelector('small');if(method)method.textContent=t('book.method.'+row.method);};return node;}
      const include=input('checkbox',row.include,'book.include',value=>{row.include=value;render();});cell().append(include);
      const title=input('text',row.title,'title',value=>{row.title=value;row.verified=false;});title.maxLength=500;cell().append(title);
      const level=input('number',row.level,'level',value=>{row.level=Number(value);row.verified=false;});level.min=1;level.max=6;cell().append(level);
      const print=input('text',row.printedLabel,'book.printed',value=>{row.printedLabel=value;row.verified=false;row.pdfPage=null;row.method='unresolved';const destination=tr.querySelector('td:nth-child(5) input');if(destination)destination.value='';});print.maxLength=24;cell().append(print);
      const page=input('number',row.pdfPage,'pdfPage',value=>{row.pdfPage=value?Number(value):null;row.method='manual';row.verified=false;});page.min=1;page.max=doc.model.pages.length;cell().append(page);
      const status=cell(),method=root.createElement('small');method.textContent=t('book.method.'+row.method)+(row.issues?.length?' · '+t('book.checkText'):'');status.append(method);
      const check=input('checkbox',row.verified,'book.checked',value=>{row.verified=value;render();});check.disabled=busy||!row.pdfPage||!row.title.trim();const label=root.createElement('label');label.className='book-check';label.append(check,root.createTextNode(t('book.checked')));status.append(label);
      const previews=cell();
      for(const [text,key] of [['book.source','tocPage'],['book.destination','pdfPage']]){const button=root.createElement('button');button.className='quiet small';button.textContent=t(text);button.disabled=busy||(key==='tocPage'&&!row.tocPage);button.onclick=()=>{const n=row[key];if(n>=1&&n<=doc.model.pages.length)onPreview(n);};previews.append(button);}
      $('book-rows').append(tr);
    }
    for(const node of $('book-panel').querySelectorAll('button,input,select'))if(!node.closest('#book-rows'))node.disabled=busy||!ready;
    $('book-calibrate').disabled=busy||!s.rows.length;
    validation();
  }
  return {update(context){doc=context.doc;busy=context.busy;render();},refresh:render};
}
module.exports={createBookFlow};
