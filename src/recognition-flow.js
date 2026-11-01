const {t} = require('./i18n');

// UI-only state. Tokens remain in the input until consumed by one confirmed run.
// No PDF bytes, credentials or consent are persisted.
function createRecognitionFlow(root, {connect, onRun, onLocal, onReview, onMode}) {
  const $ = id => root.getElementById(id);
  let doc = null, busy = false, online = false, client = null, step = 1;
  let generation = 0, connecting = false, errorKey = '', retry = false;
  let checking = false, disconnected = false, disposed = false;
  const validToken = () => /^[A-Za-z0-9_.+=/-]{20,2048}$/.test($('mineru-token').value.trim());
  const ready = () => !!doc?.model && doc.status === 'ready' && !doc.error;
  const eligible = () => ready() && doc.writable && doc.pdf.numPages <= 200;
  const clearConsent = () => { $('mineru-consent').checked = false; };
  const canUpload = () => !disposed && online && step === 3 && !busy && !checking && eligible() && !!client && validToken() && $('mineru-consent').checked;
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
    $('mineru-connect').disabled = busy || connecting || checking || !/^[a-f0-9]{48}$/.test($('mineru-code').value.trim()) || !ready();
    $('mineru-code').disabled = busy || connecting || checking;
    $('mineru-token').disabled = busy;
    const connectionState = connecting ? 'connecting' : checking ? 'checking' : client ? 'connected' : disconnected ? 'lost' : 'idle';
    $('mineru-connection-status').textContent = t('connection.' + connectionState);
    $('mineru-connection-status').dataset.state = connectionState;
    $('mineru-check').hidden = !client;
    $('mineru-check').disabled = busy || connecting || checking;
    $('mineru-disconnect').hidden = !client && !connecting;
    $('mineru-disconnect').disabled = busy;
    $('step-marker-1').classList.toggle('complete', !!client && !checking);
    $('mineru-next').disabled = busy || checking || !client;
    $('mineru-consent').disabled = busy || !eligible();
    $('mineru-upload-file').textContent = doc ? t('flow.uploadFile', {name:doc.name, pages:doc.pdf?.numPages || 0}) : '';
    $('mineru-consent-label').textContent = doc ? t('flow.consent', {name:doc.name}) : '';
    $('mineru-run').disabled = !canUpload();
    $('mineru-run-hint').textContent = t(busy ? 'flow.working' : !eligible() ? 'flow.uploadUnavailable' : checking ? 'connection.checking' : !client ? 'mineru.disconnected' : !validToken() ? 'mineru.tokenError' : !$('mineru-consent').checked ? 'flow.needConsent' : 'flow.readyUpload');
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
    if (disposed || busy || online === value) return;
    online = value; generation++; connecting = false; checking = false; errorKey = ''; retry = false;
    $('mineru-token').value = ''; step = client ? 2 : 1; clearConsent();
    render(); onMode();
    if (online && client) void checkConnection();
  }
  function loseConnection() {
    client = null; checking = false; disconnected = true; step = 1;
    $('mineru-token').value = ''; clearConsent(); errorKey = 'mineru.connectionError';
  }
  async function checkConnection() {
    if (disposed || !online || !client || !doc || busy || connecting || checking) return;
    const attempt = ++generation, connected = client;
    checking = true; render();
    try {
      await connected.check();
      if (disposed || attempt !== generation || client !== connected) return;
      checking = false; disconnected = false;
    } catch {
      if (disposed || attempt !== generation || client !== connected) return;
      loseConnection();
    }
    render();
  }
  function disconnect() {
    if (busy || disposed) return;
    generation++; client = null; connecting = checking = disconnected = false;
    $('mineru-code').value = ''; $('mineru-token').value = ''; clearConsent();
    step = 1; errorKey = ''; render();
  }
  const win = root.defaultView;
  const monitor = () => { if (!root.hidden) return checkConnection(); };
  const timer = win.setInterval(monitor, 30000);
  win.addEventListener('focus', monitor);
  root.addEventListener('visibilitychange', monitor);
  $('mineru-check').onclick = checkConnection;
  $('mineru-disconnect').onclick = disconnect;
  $('mode-local').onclick = () => mode(false);
  $('mode-mineru').onclick = () => mode(true);
  $('local-start').onclick = () => {
    if (busy || !ready()) return;
    if (doc.model.imagePages.some(n => !doc.model.pages[n - 1].ocrLayout)) onLocal(); else onReview();
  };
  $('mineru-code').oninput = () => {generation++; client = null; connecting = checking = disconnected = false; $('mineru-token').value = ''; clearConsent(); errorKey = ''; render();};
  $('mineru-token').oninput = () => {clearConsent(); errorKey = ''; render();};
  $('mineru-consent').onchange = render;
  $('mineru-connect').onclick = async () => {
    if (disposed || busy || connecting || checking || !ready() || !online) return;
    const attempt = ++generation; connecting = true; errorKey = ''; render();
    try {
      const connected = await connect($('mineru-code').value.trim());
      if (disposed || attempt !== generation || !online) return;
      client = connected; connecting = false; disconnected = false; go(2);
    } catch {
      if (disposed || attempt !== generation) return;
      connecting = false; loseConnection(); render();
    }
  };
  $('mineru-next').onclick = () => {
    if (busy || checking || !client || !online) return;
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
      if (disposed) return;
      const changed = context.doc !== doc;
      if (changed) {
        // Consent and Token never transfer to another PDF, even while connecting.
        generation++; connecting = checking = false; $('mineru-token').value = ''; clearConsent();
        step = client ? 2 : 1; errorKey = ''; retry = false;
      }
      doc = context.doc; busy = context.busy; render();
      if (changed && client) void checkConnection();
    },
    takeUpload() {
      if (!canUpload()) return null;
      const upload = {doc, client, token:$('mineru-token').value.trim()};
      $('mineru-token').value = ''; clearConsent(); step = 2; retry = true; render();
      return upload;
    },
    finish(success, error) {
      retry = !success; errorKey = error?.i18nKey || (error ? 'mineru.failed' : '');
      if (errorKey === 'mineru.connectionError') loseConnection();
      clearConsent(); render();
    },
    dispose() {
      disposed = true; generation++; client = null;
      win.clearInterval(timer); win.removeEventListener('focus', monitor);
      root.removeEventListener('visibilitychange', monitor);
      $('mineru-code').value = ''; $('mineru-token').value = ''; clearConsent();
    }
  };
}
module.exports = {createRecognitionFlow};
