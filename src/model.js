'use strict';
const { uiError } = require('./i18n');
function validateEntries(entries, pages) {
  if (!entries.length) throw uiError('validation.empty');
  if (entries.length > 1000) throw uiError('validation.count');
  let prev = 0;
  return entries.map((entry, index) => {
    const row = { ...entry, title: String(entry.title || '').trim() };
    if (!row.title || row.title.length > 500) throw uiError('validation.title', { index: index + 1 });
    if (!Number.isInteger(row.level) || row.level < 1 || row.level > 6 || row.level > prev + 1)
      throw uiError('validation.level', { index: index + 1 });
    if (!Number.isInteger(row.page) || !pages[row.page - 1]) throw uiError('validation.page', { index: index + 1 });
    const view = pages[row.page - 1].view;
    if (!Number.isFinite(row.x) || !Number.isFinite(row.y) || row.x < view[0] - 1 || row.x > view[2] + 1
      || row.y < view[1] - 1 || row.y > view[3] + 1) throw uiError('validation.position', { index: index + 1 });
    prev = row.level;
    return row;
  });
}
function safeFilename(name, suffix = '.with-bookmarks.pdf') {
  const stem = String(name).replace(/\.pdf$/i, '').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/[. ]+$/g, '').slice(0, 150) || 'document';
  return stem + suffix;
}
function uniqueFilename(filename, used) {
  let result = filename, n = 2;
  const dot = filename.lastIndexOf('.'), stem = dot < 0 ? filename : filename.slice(0, dot), extension = dot < 0 ? '' : filename.slice(dot);
  while (used.has(result.toLowerCase())) result = `${stem} (${n++})${extension}`;
  used.add(result.toLowerCase()); return result;
}
module.exports = { validateEntries, safeFilename, uniqueFilename };
