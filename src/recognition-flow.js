const {t} = require('./i18n');

// UI-only state. Tokens remain in the input until consumed by one confirmed run.
// No PDF bytes, credentials or consent are persisted.
function createRecognitionFlow(root, {connect, onRun, onLocal, onReview, onMode}) {
  const $ = id => root.getElementById(id);
  let doc = null, busy = false, online = false, client = null, step = 1;
  let generation = 0, connecting = false, errorKey = '', retry = false;
  const validToken = () => /^[A-Za-z0-9_.+=/-]{20,2048}$/.test($('mineru-token').value.trim());
  const ready = () => !!doc?.model && doc.status === 'ready' && !doc.error;
  const eligible = () => ready() && doc.writable && doc.pdf.numPages <= 200;
  const clearConsent = () => { $('mineru-consent').checked = false; };
  const canUpload = () => online && step === 3 && !busy && eligible() && !!client && validToken() && $('mineru-consent').checked;
  function render() {
    $('local-panel').hidden = online;
    $('mineru-panel').hidden = !online;
    $('local-options').hidden = online;
    for (const [id, active] of [['mode-local', !online], ['mode-mineru', online]]) {
      $(id).setAttribute('aria-pressed', String(active)); $(id).disabled = busy;
    }
    const missing = doc?.model?.imagePages.filter(n => !doc.model.pages[n - 1].ocrLayout).length || 0;
    const unavailable = busy ? 'flow.working' : !ready() ? 'flow.waitFile' : !doc.writable ? 'flow.readOnly' : online && doc.pdf.numPages > 200 ? 'mineru.limit' : '';
    $('flow-unavailable').hidden = !unavailable;
    $('flow-unavailable').textContent = unavailable ? t(unavailable) : '';
    $('local-heading').textContent = t(missing ? 'flow.scanTitle' : 'flow.localReady');
    $('local-description').textContent = t(missing ? 'flow.scansLeft' : 'flow.localReadyHelp', {count: missing});
    $('local-start').textContent = t(missing ? 'flow.localStart' : 'flow.review');
    $('local-start').disabled = busy || !ready();
    const complete = !!doc?.mineruResult && !retry;
    $('mineru-steps').hidden = complete;
    $('mineru-complete').hidden = !complete || busy;
    $('mineru-working').hidden = !busy;
    for (let n = 1; n <= 3; n++) {
      $('mineru-step-' + n).hidden = step !== n || busy || complete;
      if (step === n) $('step-marker-' + n).setAttribute('aria-current', 'step');
      else $('step-marker-' + n).removeAttribute('aria-current');
    }
    $('mineru-connect').disabled = busy || connecting || !/^[a-f0-9]{48}$/.test($('mineru-code').value.trim()) || !ready();
    $('mineru-code').disabled = busy || connecting;
    $('mineru-token').disabled = busy;
    $('mineru-connection-status').textContent = t(connecting ? 'flow.connecting' : client ? 'mineru.connected' : 'flow.needCode');
    $('mineru-next').disabled = busy || !client;
    $('mineru-consent').disabled = busy || !eligible();
    $('mineru-upload-file').textContent = doc ? t('flow.uploadFile', {name:doc.name, pages:doc.pdf?.numPages || 0}) : '';
    $('mineru-consent-label').textContent = doc ? t('flow.consent', {name:doc.name}) : '';
    $('mineru-run').disabled = !canUpload();
    $('mineru-run-hint').textContent = t(busy ? 'flow.working' : !eligible() ? 'flow.uploadUnavailable' : !client ? 'mineru.disconnected' : !validToken() ? 'mineru.tokenError' : !$('mineru-consent').checked ? 'flow.needConsent' : 'flow.readyUpload');
    $('mineru-flow-error').hidden = !errorKey;
    $('mineru-flow-error').textContent = errorKey ? t(errorKey) : '';
    $('mineru-import').disabled = busy || !ready() || !doc.writable;
    $('mineru-save').disabled = busy || !doc?.mineruResult;
    $('mineru-saved-hint').textContent = t(doc?.mineruResult ? 'flow.savePrivate' : 'flow.importLocal');
    for (const id of ['mineru-back-connect', 'mineru-back-token', 'mineru-review', 'mineru-retry']) $(id).disabled = busy;
    root.querySelector('.privacy [data-i18n]').textContent = t(online ? 'mineru.privacyBadge' : 'privacy');
  }
  function go(next) {
    step = next; clearConsent(); errorKey = ''; render();
    $(next === 1 ? 'connect-heading' : next === 2 ? 'token-heading' : 'upload-heading').focus();
  }
  function mode(value) {
    if (busy || online === value) return;
    online = value; generation++; connecting = false; errorKey = ''; retry = false;
    client = null; $('mineru-code').value = ''; $('mineru-token').value = ''; step = 1; clearConsent();
    render(); onMode();
  }
  $('mode-local').onclick = () => mode(false);
  $('mode-mineru').onclick = () => mode(true);
  $('local-start').onclick = () => {
    if (busy || !ready()) return;
    if (doc.model.imagePages.some(n => !doc.model.pages[n - 1].ocrLayout)) onLocal(); else onReview();
  };
  $('mineru-code').oninput = () => {generation++; client = null; connecting = false; clearConsent(); errorKey = ''; render();};
  $('mineru-token').oninput = () => {clearConsent(); errorKey = ''; render();};
  $('mineru-consent').onchange = render;
  $('mineru-connect').onclick = async () => {
    if (busy || connecting || !ready() || !online) return;
    const attempt = ++generation; connecting = true; errorKey = ''; render();
    try {
      const connected = await connect($('mineru-code').value.trim());
      if (attempt !== generation || !online) return;
      client = connected; connecting = false; go(2);
    } catch {
      if (attempt !== generation) return;
      client = null; connecting = false; errorKey = 'mineru.connectionError'; render();
    }
  };
  $('mineru-next').onclick = () => {
    if (busy || !client || !online) return;
    if (!validToken()) {errorKey = 'mineru.tokenError'; render(); $('mineru-token').focus(); return;}
    go(3);
  };
  $('mineru-back-connect').onclick = () => {if (!busy) go(1);};
  $('mineru-back-token').onclick = () => {if (!busy) go(2);};
  $('mineru-run').onclick = () => {if (canUpload()) onRun();};
  $('mineru-review').onclick = onReview;
  $('mineru-retry').onclick = () => {if (!busy) {retry = true; go(client ? 2 : 1);}};
  return {
    isOnline: () => online,
    update(context) {
      if (context.doc !== doc) {
        // Consent and Token never transfer to another PDF, even while connecting.
        generation++; connecting = false; $('mineru-token').value = ''; clearConsent();
        step = client ? 2 : 1; errorKey = ''; retry = false;
      }
      doc = context.doc; busy = context.busy; render();
    },
    takeUpload() {
      if (!canUpload()) return null;
      const upload = {doc, client, token:$('mineru-token').value.trim()};
      $('mineru-token').value = ''; clearConsent(); step = 2; retry = true; render();
      return upload;
    },
    finish(success, error) {
      retry = !success; errorKey = error?.i18nKey || (error ? 'mineru.failed' : '');
      if (errorKey === 'mineru.connectionError') {client = null; step = 1;}
      clearConsent(); render();
    }
  };
}
module.exports = {createRecognitionFlow};
