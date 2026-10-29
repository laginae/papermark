'use strict';
const core = require('./vendor/pdf-layout-core');
function extractPdfTextLayout(items, options) {
  const layout = core.extractPdfTextLayout(items, options);
  const visible = (items || []).filter(item => item?.str?.trim());
  if (!layout.lines.length && visible.length === 1) {
    const item = visible[0], x = item.x ?? item.transform?.[4], y = item.y ?? item.transform?.[5];
    if (Number.isFinite(x) && Number.isFinite(y) && item.width > 0 && item.height > 0) {
      layout.lines = [{ text: layout.text, xMin: x, xMax: x + item.width, y, height: item.height }];
    }
  }
  return layout;
}
module.exports = { ...core, extractPdfTextLayout };
