// Runs before the bundled PDF engine so a partial download is never a silent UI.
(function () {
  'use strict';
  var banner = document.getElementById('startup-status');
  var title = document.getElementById('startup-title');
  var detail = document.getElementById('startup-detail');
  var retry = document.getElementById('startup-retry');
  var chinese = false, ready = false, failed = false;
  try { chinese = localStorage.getItem('papermark.language') === 'zh-CN'; } catch (_) {}
  var messages = chinese ? {
    loading: '正在加载 PaperMark…',
    detail: '程序就绪后即可添加 PDF。首次打开可能需要稍等。',
    slow: '仍在加载，请稍候。若长时间没有变化，可以重新加载页面。',
    failed: 'PaperMark 未能启动',
    recovery: '请重新加载页面。如果正在查看 HTML 预览，请在浏览器中打开完整文件或在线版。建议使用较新的 Chrome、Edge、Firefox 或 Safari。',
    retry: '重新加载'
  } : {
    loading: 'Loading PaperMark…',
    detail: 'You can add PDFs when the app is ready. The first visit may take a moment.',
    slow: 'Still loading. Please wait, or reload the page if nothing changes.',
    failed: 'PaperMark could not start',
    recovery: 'Reload the page. If you are viewing an HTML preview, open the full file or online app in a browser. Use a recent Chrome, Edge, Firefox or Safari.',
    retry: 'Reload page'
  };
  title.textContent = messages.loading;
  detail.textContent = messages.detail;
  retry.textContent = messages.retry;
  retry.onclick = function () { location.reload(); };
  function fail() {
    if (ready || failed) return;
    failed = true;
    clearTimeout(slowTimer);
    banner.dataset.state = 'failed';
    banner.setAttribute('role', 'alert');
    title.textContent = messages.failed;
    detail.textContent = messages.recovery;
    retry.hidden = false;
  }
  function onError(event) {
    // Ignore incidental resource errors (for example an unavailable favicon).
    if (event.target === window || event.target?.id === 'app-runtime') fail();
  }
  function onLoad() { if (!ready) fail(); }
  var slowTimer = setTimeout(function () {
    if (ready || failed) return;
    detail.textContent = messages.slow;
    retry.hidden = false;
  }, 12000);
  window.addEventListener('error', onError, true);
  window.addEventListener('load', onLoad, {once: true});
  window.paperMarkStartup = {
    ready: function () {
      ready = true;
      clearTimeout(slowTimer);
      window.removeEventListener('error', onError, true);
      window.removeEventListener('load', onLoad);
      for (var region of document.querySelectorAll('[data-startup-region]')) {
        region.removeAttribute('inert');
        region.removeAttribute('aria-busy');
      }
      document.documentElement.dataset.appReady = 'true';
      banner.hidden = true;
    }
  };
})();
