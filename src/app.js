import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import workerCode from 'embedded-worker';
import resources from 'embedded-resources';
import { zipSync } from 'fflate';
import { scanPdfOutline } from './pdf-outline';
import { detectWithOcr, ocrLayout } from './ocr-layout';
import { createLocalOcr } from './ocr';
import { createPaddleOcr } from './paddle-ocr';
import { createImageComposer } from './image-composer';
import { createHostBridge } from './host-bridge';
import {prepareOcrCanvas} from './ocr-preprocess';
import {createMineruClient} from './mineru-client';
import {createRecognitionFlow} from './recognition-flow';
import {mineruLayouts} from './mineru-layout';
import {createUnicodeTextLayer} from './unicode-text-layer';
import { loadWritablePdf } from './pdf-bookmarks';
import { exportPdf } from './pdf-export';
import { textLayerPages } from './pdf-text-layer';
import { validateEntries, safeFilename, uniqueFilename } from './model';
import { t, getLanguage, restoreLanguage, saveLanguage, translateDom, uiError, reasonLabel } from './i18n';

const $ = id => document.getElementById(id);
function languageStorage() { try { return window.localStorage; } catch { return null; } }
restoreLanguage(languageStorage());
const records = []; let current = null, scanning = false, exporting = false, composing = false, cancelled = false;
let nextId = 1, selection = -1, currentPage = 1, zoom = 1, renderTask = null, renderGeneration = 0;
let viewport = null, locating = false, toastTimer, renderTimer, ocrAbort = null;
const workerUrl = URL.createObjectURL(new Blob([workerCode], { type: 'text/javascript' }));
class EmbeddedBinaryDataFactory {
  async fetch({ kind, filename }) {
    const encoded = resources[`${kind}/${filename}`];
    if (!encoded) throw new Error(t('error.resource', { name: filename }));
    return Uint8Array.from(atob(encoded), c => c.charCodeAt(0));
  }
}
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const clone = value => JSON.parse(JSON.stringify(value));
const busy = () => scanning || exporting || composing;
const hasTextExport = doc => $('searchable').checked && !!doc?.model && textLayerPages(doc.model.pages).length>0;
const canExport = doc => doc?.writable && doc?.model && !doc.error && (doc.generated || doc.entries.length>0 || hasTextExport(doc));
const entry = () => current?.entries?.[selection];
const recognition = createRecognitionFlow(document, {
  connect: async code => { const client = createMineruClient(code); await client.check(); return client; },
  onRun: runMineru,
  onLocal: () => runOcr(false),
  onReview: () => { $('bookmark-editor').scrollIntoView({block:'start', behavior:'smooth'}); $('bookmark-editor').focus({preventScroll:true}); },
  onMode: () => setControls()
});
const host=createHostBridge({
  onInit:data=>{saveLanguage(data.language,languageStorage());$('open-device').hidden=false;$('images-vault').hidden=false;$('paddle-options').hidden=!data.desktop;refreshLanguage();},
  onFiles:files=>{if(busy())throw uiError('host.busy');return acceptFiles(files);}
});
const images=createImageComposer(document,{onCreate:file=>addFiles([file],{generated:true}),onError:error=>toast(friendlyError(error),true),onBusy:value=>{composing=value;setControls();},pickVault:()=>host.pick('images')});
async function acceptFiles(files) {
  const pictures=[...files].filter(file=>/\.(png|jpe?g|webp)$/i.test(file.name));
  const pdfs=[...files].filter(file=>/\.pdf$/i.test(file.name));
  if(pdfs.length)await addFiles(pdfs);if(pictures.length)await images.add(pictures);
}
async function choosePdf(){try{if(host.connected)await addFiles(await host.pick('pdf'));else $('files').click();}catch(error){toast(friendlyError(error),true);}}
function toast(message, error = false) {
  clearTimeout(toastTimer); $('toast').textContent = message; $('toast').classList.toggle('error', error);
  $('toast').hidden = false; toastTimer = setTimeout(() => $('toast').hidden = true, error ? 9000 : 5000);
}
function friendlyError(error) {
  if (error?.i18nKey) return t(error.i18nKey, error.i18nValues);
  const msg = String(error?.message || error);
  if (/password|encrypt/i.test(msg)) return t('error.encrypted');
  if (/signed|signature|restricted|permission/i.test(msg)) return t('error.signed');
  if (/Invalid PDF|PDF header|parse|xref/i.test(msg)) return t('error.invalidPdf');
  if (/Cancelled|cancelled|destroyed/i.test(msg)) return t('error.cancelled');
  if (/2,000-page/.test(msg)) return t('error.pages');
  if (/text limit/.test(msg)) return t('error.textLimit');
  return msg;
}
function status(text, kind = '') {
  $('status').textContent = text; $('status').className = 'status' + (kind ? ' ' + kind : '');
}
function refreshStatus() {
  if (!current) return;
  if (current.status === 'loading') { status(current.progress ? t(current.progress.key || 'progress', current.progress) : t('status.reading')); return; }
  if (current.error) { status(friendlyError(current.error), 'error'); return; }
  if (!current.model) return;
  const messages = [];
  if (current.writeError) messages.push(friendlyError(current.writeError));
  if (current.ocrWarning) messages.push(friendlyError(current.ocrWarning));
  const ocrPages=current.model.pages.filter(page=>page.ocrLayout).length;
  if(ocrPages) messages.push(t('ocr.done',{count:ocrPages}));
  if(ocrPages && $('searchable').checked) messages.push(t('ocr.searchableReady',{count:textLayerPages(current.model.pages).length}));
  if (current.model.unsupportedBookmarks) messages.push(t('status.unsupported'));
  const missing=current.model.imagePages.filter(n=>!current.model.pages[n-1].ocrLayout);
  if (missing.length) {
    messages.push(t('status.scanned', { pages: missing.slice(0, 8).join(', '), more: missing.length > 8 ? t('status.more') : '' }));
  }
  if (!current.entries.length) messages.push(t('status.none'));
  else if (current.model.bookmarks.length && !current.dirty) messages.push(t('status.existing', { count: current.entries.length }));
  else messages.push(t('status.ready', { count: current.entries.length }));
  const review = current.entries.filter(e => e.review).length;
  if (review) messages.push(t('status.review', { count: review }));
  status(messages.join(' '), !current.writable || current.model.imagePages.length || review || !current.entries.length ? 'warn' : '');
}
function renderQueue() {
  $('file-count').textContent = records.length;
  $('queue').replaceChildren();
  for (const doc of records) {
    const button = document.createElement('button'); button.className = 'queue-item' + (doc === current ? ' selected' : '');
    button.setAttribute('aria-label', doc.name); button.title = doc.name;
    const icon = document.createElement('span'); icon.className = 'file-icon'; icon.textContent = 'PDF';
    const info = document.createElement('span'), title = document.createElement('span'), sub = document.createElement('span');
    title.className = 'queue-title'; title.textContent = doc.name;
    sub.className = 'queue-sub'; sub.textContent = doc.status === 'loading' ? t('queue.loading') : doc.error ? t('queue.failed') : t('queue.summary', { pages: doc.pdf?.numPages || 0, count: doc.entries?.length || 0 });
    info.append(title, sub); button.append(icon, info); button.onclick = () => selectDocument(doc); $('queue').append(button);
  }
  $('welcome').hidden = records.length > 0; $('workspace').hidden = !records.length;
  setControls();
}
function setControls() {
  const ready = current?.model && current?.status === 'ready';
  $('open').disabled = $('add-more').disabled = busy();
  $('images-open').disabled = $('open-device').disabled = $('ocr-engine').disabled = busy();
  $('auto-ocr').disabled = $('ocr-language').disabled = $('ocr-range').disabled = busy();
  $('searchable').disabled = busy();
  recognition.update({doc:current, busy:busy()});
  $('ocr-run').disabled = !ready || busy();
  $('export').disabled = !ready || !canExport(current) || busy();
  $('export-all').disabled = busy() || !records.some(canExport);
  for (const id of ['rescan', 'add-bookmark', 'save-json', 'load-json', 'sensitivity']) $(id).disabled = !ready || busy();
  for (const id of ['entry-title', 'entry-level', 'entry-page', 'entry-position', 'move-up', 'move-down', 'delete', 'locate']) $(id).disabled = !entry() || busy();
  $('undo').disabled = !current?.history?.length || busy();
  $('clear').disabled = busy();
  $('cancel').hidden = !scanning;
  $('cancel').disabled = cancelled;
  $('progress').hidden = !scanning;
  for (const id of ['page','prev','next','zoom-in','zoom-out']) $(id).disabled = !ready;
  if (ready) { $('prev').disabled = currentPage <= 1; $('next').disabled = currentPage >= current.pdf.numPages; }
}
function selectDocument(doc) {
  if (current && current !== doc) { current.selected = selection; current.previewPage = currentPage; }
  current = doc; selection = doc.selected ?? (doc.entries?.length ? 0 : -1);
  currentPage = doc.previewPage || doc.entries?.[selection]?.page || 1; zoom = 1; locating = false;
  $('doc-name').textContent = doc.name; $('doc-info').textContent = t('doc.info', { size: (doc.size / 1024 / 1024).toFixed(2), pages: doc.pdf?.numPages || 0 });
  $('sensitivity').value = doc.sensitivity;
  $('page-total').textContent = `/ ${doc.pdf?.numPages || 0}`;
  $('page').max = doc.pdf?.numPages || 1; $('page').value = currentPage;
  $('canvas-wrap').hidden = true; $('preview-empty').hidden = false;
  $('preview-empty').textContent = doc.error ? t('preview.failed') : t('preview.loading');
  renderQueue(); renderOutline(); refreshStatus(); if (doc.model) requestRender();
}
function renderOutline() {
  const rows = current?.entries || []; $('outline-list').replaceChildren();
  $('bookmark-count').textContent = rows.length;
  const review = rows.filter(e => e.review).length;
  $('review-count').textContent = review ? t('review.count', { count: review }) : '';
  if (!rows.length) {
    const p = document.createElement('p'); p.className = 'outline-empty';
    p.textContent = current?.status === 'loading' ? t('outline.searching') : t('outline.empty'); $('outline-list').append(p);
  }
  rows.forEach((row, i) => {
    const button = document.createElement('button'); button.className = 'bookmark-row' + (selection === i ? ' selected' : '');
    button.style.setProperty('--depth', row.level - 1); button.title = row.title; button.dataset.index = i;
    const mark = document.createElement('span'); mark.className = 'level-mark'; mark.textContent = row.level > 1 ? '↳' : '▱';
    const text = document.createElement('span'); text.className = 'bookmark-text'; text.textContent = row.title;
    const page = document.createElement('span'); page.className = 'bookmark-page'; page.textContent = row.page;
    button.append(mark, text);
    if (row.review) { const dot = document.createElement('span'); dot.className = 'review-dot'; dot.title = t('review'); button.append(dot); }
    button.append(page); button.setAttribute('aria-label', t('bookmark.aria', { title: row.title, page: row.page, level: row.level }));
    button.onclick = () => { selection = i; currentPage = row.page; locating = false; renderOutline(); requestRender(true); };
    $('outline-list').append(button);
  });
  refreshInspector(); setControls();
}
function refreshInspector() {
  const row = entry(); $('inspector').hidden = !row;
  $('preview-tip').textContent = locating ? t('locate.tip') : t('previewTip');
  if (!row) return;
  $('entry-title').value = row.title; $('entry-level').value = row.level; $('entry-page').value = row.page;
  $('entry-page').max = current.pdf.numPages;
  const view = current.model.pages[row.page - 1].view;
  $('entry-position').value = ((view[3] - row.y) / (view[3] - view[1]) * 100).toFixed(1);
  $('entry-reason').textContent = reasonLabel(row.reason);
  $('locate').classList.toggle('active', locating);
  $('preview-tip').textContent = locating ? t('locate.tip') : t('previewTip');
}
function snapshot(doc = current) {
  doc.history.push({ entries: clone(doc.entries), selection:doc === current ? selection : doc.selected, dirty: doc.dirty });
  if (doc.history.length > 40) doc.history.shift();
  doc.dirty = true;
}
function edited() { renderOutline(); renderQueue(); refreshStatus(); markDestination(); }
function requestRender(scrollToMark = false) {
  clearTimeout(renderTimer); renderTimer = setTimeout(() => renderPage(scrollToMark), 40);
}
async function renderPage(scrollToMark = false) {
  if (!current?.pdf || !current.model) return;
  const generation = ++renderGeneration, doc = current;
  if (renderTask) { renderTask.cancel(); try { await renderTask.promise; } catch {} renderTask = null; }
  try {
    const page = await doc.pdf.getPage(currentPage);
    if (generation !== renderGeneration || doc !== current) return;
    const available = Math.max(220, $('preview-scroll').clientWidth - 48);
    const base = page.getViewport({ scale: 1 });
    viewport = page.getViewport({ scale: Math.min(2, available / base.width) * zoom });
    const ratio = Math.min(window.devicePixelRatio || 1, 2), canvas = $('pdf-canvas');
    canvas.width = Math.ceil(viewport.width * ratio); canvas.height = Math.ceil(viewport.height * ratio);
    canvas.style.width = `${viewport.width}px`; canvas.style.height = `${viewport.height}px`;
    $('canvas-wrap').style.width = `${viewport.width}px`; $('canvas-wrap').style.height = `${viewport.height}px`;
    $('canvas-wrap').hidden = false; $('preview-empty').hidden = true;
    const task = page.render({ canvasContext: canvas.getContext('2d'), viewport,
      transform: ratio !== 1 ? [ratio,0,0,ratio,0,0] : null, annotationMode: pdfjs.AnnotationMode.ENABLE });
    renderTask = task; await task.promise;
    if (generation !== renderGeneration || doc !== current) return;
    renderTask = null; $('page').value = currentPage; $('zoom-label').textContent = zoom === 1 ? t('fit') : Math.round(zoom * 100) + '%';
    markDestination(); setControls();
    if (scrollToMark && entry()?.page === currentPage) {
      const point = viewport.convertToViewportPoint(entry().x, entry().y);
      $('preview-scroll').scrollTop = Math.max(0, point[1] - 60);
    } else $('preview-scroll').scrollTop = 0;
  } catch (error) {
    if (error?.name !== 'RenderingCancelledException' && generation === renderGeneration) {
      $('preview-tip').textContent = t('preview.error', { error: friendlyError(error) });
    }
  }
}
function markDestination() {
  const row = entry(); $('destination').hidden = !row || row.page !== currentPage || !viewport;
  $('canvas-wrap').classList.toggle('locating', locating);
  if ($('destination').hidden) return;
  const [x,y] = viewport.convertToViewportPoint(row.x, row.y);
  $('destination').style.left = `${Math.max(0, Math.min(viewport.width - 64, x))}px`;
  $('destination').style.top = `${Math.max(0, Math.min(viewport.height, y))}px`;
}
async function addFiles(files,{generated=false}={}) {
  if (busy()) return;
  const candidates = [...files]; if (!candidates.length) return;
  scanning = true; cancelled = false; renderQueue();
  let total = records.reduce((sum,d) => sum + d.size, 0);
  for (const file of candidates) {
    if (cancelled) break;
    if (!/\.pdf$/i.test(file.name)) { toast(t('file.skip', { name: file.name }), true); continue; }
    if (records.length >= 20 || file.size > 100 * 1024**2 || total + file.size > 250 * 1024**2) {
      toast(t('file.limit'), true); break;
    }
    total += file.size;
    const doc = { id: nextId++, name: file.name, size: file.size, status: 'loading', sensitivity: $('sensitivity').value,
      entries: [], history: [], dirty: false, writable: true, selected: -1, generated };
    records.push(doc); selectDocument(doc);
    try {
      doc.bytes = new Uint8Array(await file.arrayBuffer());
      // File data is copied because PDF.js transfers its buffer into a worker.
      doc.fingerprint = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', doc.bytes)), b => b.toString(16).padStart(2,'0')).join('');
      try { await loadWritablePdf(doc.bytes); } catch (error) { doc.writable = false; doc.writeError = error; }
      doc.workerPort = new Worker(workerUrl);
      doc.pdfWorker = new pdfjs.PDFWorker({ port: doc.workerPort });
      const loading = pdfjs.getDocument({ data: doc.bytes.slice(), worker: doc.pdfWorker, BinaryDataFactory: EmbeddedBinaryDataFactory,
        useWorkerFetch: false, isEvalSupported: false, enableXfa: false, cMapPacked: true,
        useSystemFonts: true, useWasm: true, stopAtErrors: false });
      doc.loadingTask = loading;
      const passwordFailure = new Promise((resolve, reject) => {
        loading.onPassword = () => { reject(new Error('Encrypted PDF')); loading.destroy().catch(() => {}); };
      });
      doc.pdf = await Promise.race([loading.promise, passwordFailure]);
      doc.model = await scanPdfOutline(doc.pdf, { sensitivity: doc.sensitivity, isCurrent: () => !cancelled,
        progress: (page, count) => {
          doc.progress = { page, count };
          $('progress').max = count; $('progress').value = page;
          if (current === doc) refreshStatus();
        } });
      if (cancelled) throw new Error('Cancelled');
      if (doc.model.unsupportedBookmarks) doc.writable = false;
      if (!recognition.isOnline() && $('auto-ocr').checked && doc.model.imagePages.length) await performOcr(doc);
      doc.entries = clone(doc.model.entries); doc.status = 'ready'; doc.selected = doc.entries.length ? 0 : -1;
      if (doc.entries[0]?.level !== 1 && doc.entries.length) doc.entries[0].level = 1;
    } catch (error) {
      doc.error = error; doc.status = 'error';
      if (doc.loadingTask) await doc.loadingTask.destroy().catch(() => {});
      doc.pdf = null;
      doc.pdfWorker?.destroy(); doc.workerPort?.terminate();
    }
    if (current === doc) selectDocument(doc); else renderQueue();
    await tick();
  }
  scanning = false; setControls(); if (cancelled) toast(t('cancel.done'));
}
async function download(bytes, filename, type) {
  if(host.connected){const saved=await host.save(bytes,filename,type);if(!saved)throw uiError('host.cancelled');return;}
  const url = URL.createObjectURL(new Blob([bytes], { type })), link = document.createElement('a');
  link.href = url; link.download = filename; document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
async function exportDocument(doc) {
  if (!doc.writable || !doc.model || doc.error) throw doc.writeError || uiError('export.unavailable');
  return exportPdf(doc.bytes,doc.model.pages,doc.entries,{
    preserveOutline:doc.model.bookmarks.length>0 && !doc.dirty,searchable:$('searchable').checked});
}
async function exportCurrent() {
  if (busy() || !current) return;
  exporting = true; setControls(); const doc = current; status(t('export.writing'));
  try {
    await tick(); const {bytes,textPages} = await exportDocument(doc);
    await download(bytes, safeFilename(doc.name,textPages ? '.searchable.pdf' : '.with-bookmarks.pdf'), 'application/pdf');
    toast(t(textPages ? 'export.searchableDone' : 'export.done',{count:textPages}));
  } catch (error) { toast(friendlyError(error), true); }
  finally { exporting = false; setControls(); refreshStatus(); }
}
async function exportAll() {
  if (busy()) return;
  exporting = true; setControls();
  const files = {}, used = new Set(), report = [];
  try {
    for (const doc of records) {
      try {
        if (!canExport(doc)) throw uiError('export.skip');
        status(t('export.packing', { name: doc.name })); await tick();
        const {bytes,textPages} = await exportDocument(doc), name = uniqueFilename(safeFilename(doc.name,textPages ? '.searchable.pdf' : '.with-bookmarks.pdf'), used);
        files[name] = bytes; report.push({ source: doc.name, output: name, bookmarks: doc.entries.length, searchablePagesAdded:textPages, status: 'exported' });
      } catch (error) { report.push({ source: doc.name, status: 'skipped', reason: friendlyError(error) }); }
    }
    if (!Object.keys(files).length) throw uiError('export.none');
    files['export-report.json'] = new TextEncoder().encode(JSON.stringify({ app: `PaperMark ${__APP_VERSION__}`, files: report }, null, 2));
    await download(zipSync(files, { level: 0 }), 'PaperMark-bookmarked.zip', 'application/zip');
    const count = report.filter(r => r.status === 'exported').length;
    toast(t('export.batch', { count }) + (count < report.length ? ' ' + t('export.skipped', { count: report.length - count }) : ''));
  } catch (error) { toast(friendlyError(error), true); }
  finally { exporting = false; setControls(); refreshStatus(); }
}
async function performOcr(doc, all = false) {
  const candidates=all ? doc.model.pages.map(p=>p.number) : doc.model.imagePages.filter(n=>!doc.model.pages[n-1].ocrLayout);
  if (!candidates.length) { toast(t('ocr.noPages')); return; }
  const controller=new AbortController(); ocrAbort=controller; let engine=null, pageNumber=0;
  doc.ocrWarning=null;
  const update=(key,percent=0)=>{
    doc.progress={key,page:pageNumber,count:candidates.length,percent:Math.round(percent*100)};
    $('progress').max=candidates.length; $('progress').value=candidates.indexOf(pageNumber)+Math.max(0,percent);
    if(current===doc) refreshStatus();
  };
  try {
    update('ocr.resources');
    const paddle=host.connected&&host.desktop&&$('ocr-engine').value!=='builtin';
    const engineFactory=paddle?createPaddleOcr:createLocalOcr;
    engine=await engineFactory({host,model:$('ocr-engine').value,language:$('ocr-language').value,signal:controller.signal,progress:({stage,fraction})=>{
      update(pageNumber ? 'ocr.progress' : stage==='resources' ? 'ocr.resources' : 'ocr.preparing',fraction);
    }});
    for (const n of candidates) {
      controller.signal.throwIfAborted(); pageNumber=n; update('ocr.progress');
      const pdfPage=await doc.pdf.getPage(n), base=pdfPage.getViewport({scale:1});
      const scale=Math.min(240/72,Math.sqrt((paddle?3900000:6000000)/(base.width*base.height)),paddle?2400/Math.max(base.width,base.height):Infinity);
      let view=pdfPage.getViewport({scale});const canvas=document.createElement('canvas');
      canvas.width=Math.ceil(view.width); canvas.height=Math.ceil(view.height);
      let task=pdfPage.render({canvasContext:canvas.getContext('2d'),viewport:view,annotationMode:pdfjs.AnnotationMode.DISABLE});
      const abortRender=()=>task.cancel(); controller.signal.addEventListener('abort',abortRender,{once:true});
      try {
        await task.promise; controller.signal.throwIfAborted();
        let prepared=await prepareOcrCanvas(canvas,view);controller.signal.throwIfAborted();
        let result;try{result=await engine.recognize(prepared.canvas);}finally{prepared.canvas.width=prepared.canvas.height=1;}
        let pixelWidth=canvas.width,pixelHeight=canvas.height;
        // More pixels are not always more accurate. Retry weak pages, keeping
        // the first pass unless the engine's confidence actually improves.
        if(!paddle&&(result.confidence||0)<88){
          const high=pdfPage.getViewport({scale:Math.min(300/72,Math.sqrt(9000000/(base.width*base.height)))});
          canvas.width=Math.ceil(high.width);canvas.height=Math.ceil(high.height);
          task=pdfPage.render({canvasContext:canvas.getContext('2d'),viewport:high,annotationMode:pdfjs.AnnotationMode.DISABLE});await task.promise;
          const retry=await prepareOcrCanvas(canvas,high);let candidate;
          try{candidate=await engine.recognize(retry.canvas);}finally{retry.canvas.width=retry.canvas.height=1;}
          if(candidate.confidence>(result.confidence||0)+1){result=candidate;prepared=retry;pixelWidth=canvas.width;pixelHeight=canvas.height;}
        }
        controller.signal.throwIfAborted();
        const layout=ocrLayout(result,doc.model.pages[n-1],prepared.viewport);
        const chars=doc.model.pages.reduce((sum,p)=>sum+(p.number===n ? 0 : (p.ocrLayout?.text.length ?? p.text.length)),0)+layout.text.length;
        if(chars>5000000) throw uiError('error.textLimit');
        doc.model.pages[n-1].ocrLayout=layout;
        doc.model.pages[n-1].ocrPdf=paddle?await createUnicodeTextLayer(layout):result.pdf;
        doc.model.pages[n-1].ocrPixelWidth=paddle?layout.width:pixelWidth;
        doc.model.pages[n-1].ocrPixelHeight=paddle?layout.height:pixelHeight;
        doc.ocrChanged=true;
        update('ocr.progress',1);
      } finally {
        controller.signal.removeEventListener('abort',abortRender); canvas.width=canvas.height=1;
      }
      await tick();
    }
  } catch(error) { doc.ocrWarning=controller.signal.aborted ? uiError('ocr.cancelled') : error?.i18nKey ? error : uiError('ocr.failed'); }
  finally { engine?.close(); if(ocrAbort===controller) ocrAbort=null; }
  doc.model.detected=detectWithOcr(doc.model.pages,{sensitivity:doc.sensitivity});
  if(!doc.model.bookmarks.length) doc.model.entries=doc.model.detected;
}
async function runOcr(all = $('ocr-range').value === 'all') {
  if(busy() || !current?.model) return;
  const doc=current;
  if(!all && !doc.model.imagePages.some(n=>!doc.model.pages[n-1].ocrLayout)){toast(t('ocr.noPages'));return;}
  const keepOutline=doc.entries.length>0 && (doc.model.bookmarks.length>0 || doc.dirty);
  scanning=true;cancelled=false;doc.status='loading';setControls();
  try {
    await performOcr(doc,all);
    if(!keepOutline) { const wasDirty=doc.dirty;snapshot(doc);doc.dirty=wasDirty;doc.entries=clone(doc.model.detected);doc.selected=doc.entries.length ? 0 : -1; }
  } catch(error) { doc.ocrWarning=error?.i18nKey ? error : uiError('ocr.failed');
  } finally {
    doc.status='ready';scanning=false;
    if(current===doc) selectDocument(doc); else renderQueue(); setControls();
  }
}
async function applyMineruResult(doc,envelope) {
  const viewports=[];for(let n=1;n<=doc.pdf.numPages;n++)viewports.push((await doc.pdf.getPage(n)).getViewport({scale:1}));
  const layouts=mineruLayouts(envelope,doc.model.pages,viewports,doc.fingerprint),pending=[];
  for(const layout of layouts){
    ocrAbort?.signal.throwIfAborted();
    const page=doc.model.pages[layout.number-1];
    // Existing source text stays intact; recognized scan text is replaced in
    // memory and written only once when a new PDF is exported.
    const pdf=(page.text||'').replace(/\s/g,'').length<30&&layout.text.trim()?await createUnicodeTextLayer(layout):null;
    pending.push({page,layout,pdf});await tick();
  }
  ocrAbort?.signal.throwIfAborted();
  const keepOutline=doc.model.bookmarks.length>0||doc.dirty;
  for(const {page,layout,pdf} of pending){page.ocrLayout=layout;page.ocrPdf=pdf;page.ocrPixelWidth=layout.width;page.ocrPixelHeight=layout.height;}
  doc.model.detected=detectWithOcr(doc.model.pages,{sensitivity:doc.sensitivity});
  if(!keepOutline){doc.history.push({entries:clone(doc.entries),selection:doc.selected??0,dirty:doc.dirty});doc.entries=clone(doc.model.detected);doc.selected=doc.entries.length?0:-1;}
  doc.mineruResult=envelope;doc.ocrChanged=true;doc.ocrWarning=null;
}
async function runMineru() {
  const upload=recognition.takeUpload(); if(!upload)return;
  const {doc,client}=upload; let token=upload.token; upload.token='';
  const controller=new AbortController();ocrAbort=controller;scanning=true;cancelled=false;doc.status='loading';doc.progress={key:'mineru.uploading'};setControls();refreshStatus();
  try{
    const envelope=await client.recognize(doc.bytes,token,controller.signal,phase=>{
      doc.progress={key:phase==='uploading'?'mineru.uploading':'mineru.processing'};if(current===doc)refreshStatus();
    });token='';
    // Local line positions improve selection alignment for a document that
    // was opened with automatic OCR off. No additional uploads occur here.
    if(doc.model.imagePages.some(n=>!doc.model.pages[n-1].ocrLayout)){
      await performOcr(doc);ocrAbort=controller;if(cancelled)controller.abort();controller.signal.throwIfAborted();
    }
    doc.progress={key:'mineru.applying'};if(current===doc)refreshStatus();
    await applyMineruResult(doc,envelope);if(current===doc)recognition.finish(true);toast(t('mineru.done'));
  }catch(error){doc.ocrWarning=controller.signal.aborted?uiError('mineru.cancelled'):error?.i18nKey?error:uiError('mineru.failed');if(current===doc)recognition.finish(false,doc.ocrWarning);}
  finally{token='';ocrAbort=null;scanning=false;doc.status='ready';if(current===doc)selectDocument(doc);else renderQueue();setControls();}
}
async function importMineru(file) {
  if(!file||busy()||!current?.model||!current.writable||!recognition.isOnline())return;
  const doc=current;
  if(file.size>40*1024**2){toast(t('mineru.invalid'),true);return;}
  scanning=true;cancelled=false;ocrAbort=new AbortController();doc.status='loading';doc.progress={key:'mineru.applying'};setControls();refreshStatus();
  try{const envelope=JSON.parse(await file.text());await applyMineruResult(doc,envelope);if(current===doc)recognition.finish(true);toast(t('mineru.done'));}
  catch(error){toast(friendlyError(error?.i18nKey?error:uiError('mineru.invalid')),true);}
  finally{ocrAbort=null;scanning=false;doc.status='ready';if(current===doc)selectDocument(doc);else renderQueue();}
}
function rescan() {
  if (busy() || !current?.model) return;
  if (current.entries.length && !confirm(t('confirm.rescan'))) return;
  snapshot(); current.sensitivity = $('sensitivity').value;
  current.entries = clone(detectWithOcr(current.model.pages, { sensitivity: current.sensitivity }));
  selection = current.entries.length ? 0 : -1; currentPage = entry()?.page || 1; edited(); requestRender(true);
}
function addBookmark() {
  if (busy() || !current?.model) return;
  snapshot(); const view = current.model.pages[currentPage - 1].view;
  const row = { title: t('bookmark.new'), level: 1, page: currentPage, x: view[0], y: view[3], reason: 'reason.added', review: false };
  const index = selection < 0 ? current.entries.length : selection + 1;
  current.entries.splice(index, 0, row); selection = index; edited(); $('entry-title').focus(); $('entry-title').select();
}
function editField(kind) {
  const row = entry(); if (!row || busy()) return;
  const value = $(kind).value;
  try {
    if (kind === 'entry-title') {
      if (!value.trim()) throw uiError('error.title');
      if (value === row.title) return;
      snapshot(); row.title = value.trim();
    } else if (kind === 'entry-level') {
      const number = Number(value); if (number === row.level) return;
      snapshot(); row.level = number;
    } else if (kind === 'entry-page') {
      const number = Number(value);
      if (!Number.isInteger(number) || number < 1 || number > current.pdf.numPages) throw uiError('error.page');
      if (number === row.page) return;
      snapshot(); row.page = number; const view = current.model.pages[number - 1].view;
      row.x = view[0]; row.y = view[3]; currentPage = number; requestRender(true);
    } else {
      const number = Number(value);
      if (value === '' || !Number.isFinite(number) || number < 0 || number > 100) throw uiError('error.position');
      snapshot(); const view = current.model.pages[row.page - 1].view;
      row.y = view[3] - (view[3] - view[1]) * number / 100;
    }
    row.reason = 'reason.edited'; row.review = false; edited();
  } catch (error) { toast(friendlyError(error), true); refreshInspector(); }
}
function moveEntry(direction) {
  if (!entry() || busy()) return;
  const target = selection + direction; if (target < 0 || target >= current.entries.length) return;
  snapshot(); const [row] = current.entries.splice(selection, 1); current.entries.splice(target, 0, row); selection = target; edited();
}
async function saveJson() {
  if (!current?.model) return;
  try{await download(JSON.stringify({ format: 'papermark-outline', version: 1, source: current.name, sha256: current.fingerprint,
    pages: current.pdf.numPages, entries: current.entries }, null, 2), safeFilename(current.name, '.bookmarks.json'), 'application/json');}catch(error){toast(friendlyError(error),true);}
}
async function loadJson(file) {
  if (!file || !current?.model || busy()) return;
  const doc = current;
  try {
    if (file.size > 3 * 1024**2) throw uiError('error.jsonSize');
    const data = JSON.parse(await file.text());
    if (current !== doc) throw uiError('error.changedPdf');
    if (data.format !== 'papermark-outline' || data.version !== 1 || !Array.isArray(data.entries)) throw uiError('error.jsonFormat');
    if (data.sha256 !== doc.fingerprint || data.pages !== doc.pdf.numPages) throw uiError('error.jsonMismatch');
    const rows = validateEntries(data.entries, doc.model.pages);
    snapshot(); doc.entries = rows; selection = 0; currentPage = rows[0].page; edited(); requestRender(true); toast(t('json.loaded'));
  } catch (error) { toast(friendlyError(error), true); }
}

for (const id of ['open','add-more','dropzone']) $(id).onclick = choosePdf;
$('open-device').onclick=()=>$('files').click();
$('images-open').onclick=()=>images.open();
$('files').onchange = event => { const files = [...event.target.files]; event.target.value = ''; addFiles(files); };
let dragDepth = 0;
document.addEventListener('dragenter', event => { if (event.dataTransfer?.types.includes('Files')) { event.preventDefault(); dragDepth++; document.body.classList.add('drag-over'); } });
document.addEventListener('dragover', event => { if (event.dataTransfer?.types.includes('Files')) event.preventDefault(); });
document.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; document.body.classList.remove('drag-over'); } });
document.addEventListener('drop', event => { event.preventDefault(); dragDepth = 0; document.body.classList.remove('drag-over'); if(!busy())acceptFiles(event.dataTransfer.files); });
$('export').onclick = exportCurrent; $('export-all').onclick = exportAll;
$('rescan').onclick = rescan; $('add-bookmark').onclick = addBookmark;
$('ocr-run').onclick = () => runOcr();
$('mineru-import').onclick=async()=>{try{if(host.connected)await importMineru((await host.pick('json'))[0]);else $('mineru-file').click();}catch(error){toast(friendlyError(error),true);}};
$('mineru-file').onchange=event=>{importMineru(event.target.files[0]);event.target.value='';};
$('mineru-save').onclick=async()=>{try{if(current?.mineruResult)await download(new TextEncoder().encode(JSON.stringify(current.mineruResult)),safeFilename(current.name,'.mineru.json'),'application/json');}catch(error){toast(friendlyError(error),true);}};
for (const id of ['entry-title','entry-level','entry-page','entry-position']) $(id).onchange = () => editField(id);
$('move-up').onclick = () => moveEntry(-1); $('move-down').onclick = () => moveEntry(1);
$('delete').onclick = () => {
  if (!entry() || busy()) return;
  snapshot(); current.entries.splice(selection, 1); selection = Math.min(selection, current.entries.length - 1); edited();
};
$('undo').onclick = () => {
  if (!current?.history.length || busy()) return;
  const saved = current.history.pop(); current.entries = saved.entries; current.dirty = saved.dirty;
  selection = saved.selection; currentPage = entry()?.page || currentPage; edited(); requestRender(true);
};
$('locate').onclick = () => {
  if (!entry() || busy()) return;
  locating = !locating; currentPage = entry().page; refreshInspector(); requestRender(true);
};
$('canvas-wrap').onclick = event => {
  if (!locating || !entry() || !viewport || busy()) return;
  const bounds = $('pdf-canvas').getBoundingClientRect();
  const [x,y] = viewport.convertToPdfPoint((event.clientX - bounds.left) * viewport.width / bounds.width,
    (event.clientY - bounds.top) * viewport.height / bounds.height);
  const view = current.model.pages[currentPage - 1].view;
  snapshot(); Object.assign(entry(), { page: currentPage, x: Math.max(view[0], Math.min(view[2], x)),
    y: Math.max(view[1], Math.min(view[3], y)), reason: 'reason.positioned', review: false });
  locating = false; edited(); toast(t('position.saved'));
};
function navigate(page) {
  if (!current?.model) return;
  if (!Number.isInteger(page) || page < 1 || page > current.pdf.numPages) { $('page').value = currentPage; return; }
  currentPage = page; locating = false; refreshInspector(); requestRender();
}
$('prev').onclick = () => navigate(currentPage - 1); $('next').onclick = () => navigate(currentPage + 1);
$('page').onchange = () => navigate(Number($('page').value));
$('zoom-in').onclick = () => { zoom = Math.min(2.5, Math.round((zoom + .25) * 100) / 100); requestRender(); };
$('zoom-out').onclick = () => { zoom = Math.max(.5, Math.round((zoom - .25) * 100) / 100); requestRender(); };
$('cancel').onclick = () => { cancelled = true; ocrAbort?.abort(); $('cancel').disabled = true; };
$('clear').onclick = async () => {
  if (busy() || !confirm(t('confirm.clear'))) return;
  ++renderGeneration; renderTask?.cancel();
  for (const doc of records) {
    if (doc.loadingTask) await doc.loadingTask.destroy().catch(() => {});
    doc.pdfWorker?.destroy(); doc.workerPort?.terminate();
  }
  records.length = 0; current = null; viewport = null; selection = -1; renderQueue();
};
$('save-json').onclick = saveJson; $('load-json').onclick = async () => {try{if(host.connected)await loadJson((await host.pick('json'))[0]);else $('json-file').click();}catch(error){toast(friendlyError(error),true);}};
$('json-file').onchange = event => { loadJson(event.target.files[0]); event.target.value = ''; };
$('help').onclick = () => $('help-dialog').showModal(); $('licenses').onclick = () => $('license-dialog').showModal();
document.querySelectorAll('.close-dialog').forEach(button => button.onclick = () => button.closest('dialog').close());
for (const dialog of document.querySelectorAll('dialog')) dialog.addEventListener('click', event => { if (event.target === dialog && !(dialog.id==='images-dialog'&&composing)) dialog.close(); });
document.querySelector('.brand').onclick = event => { event.preventDefault(); if (!records.length) window.scrollTo({ top: 0 }); };
window.addEventListener('resize', () => requestRender());
window.addEventListener('beforeunload', event => { if (records.some(doc => doc.dirty || doc.ocrChanged)) { event.preventDefault(); event.returnValue = ''; } });
$('searchable').onchange=()=>{setControls();refreshStatus();};
function refreshLanguage() {
  const scroll = $('outline-list').scrollTop;
  translateDom(document);
  for(const button of document.querySelectorAll('[data-language]')) button.setAttribute('aria-pressed',String(button.dataset.language===getLanguage()));
  $('toast').hidden = true;
  $('zoom-label').textContent = zoom === 1 ? t('fit') : Math.round(zoom * 100) + '%';
  if (current) {
    $('doc-info').textContent = t('doc.info', { size: (current.size / 1024 / 1024).toFixed(2), pages: current.pdf?.numPages || 0 });
    $('preview-empty').textContent = current.error ? t('preview.failed') : t('preview.loading');
    renderQueue(); renderOutline(); refreshStatus(); $('outline-list').scrollTop = scroll;
  } else {
    $('doc-name').textContent = t('reading'); $('preview-empty').textContent = t('previewEmpty');
    $('preview-tip').textContent = t('previewTip');
  }
  setControls();
}
for(const button of document.querySelectorAll('[data-language]')) button.onclick = () => {
  if(!busy() && entry()) for(const field of ['entry-title','entry-page','entry-position']) {
    // Normal blur commits first. Also keep pending text when assistive controls
    // activate the language button without moving focus.
    if(document.activeElement?.id===field) editField(field);
  }
  saveLanguage(button.dataset.language, languageStorage()); host.language(getLanguage());refreshLanguage();images.refresh();
};
window.addEventListener('papermark-dispose',()=>{cancelled=true;ocrAbort?.abort();images.dispose();for(const doc of records){doc.workerPort?.terminate();}URL.revokeObjectURL(workerUrl);});
refreshLanguage();
window.paperMarkStartup?.ready();
