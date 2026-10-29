'use strict';
const {writePdfBookmarks}=require('./pdf-bookmarks');
const {validateEntries}=require('./model');
const {addOcrTextLayer}=require('./pdf-text-layer');
async function exportPdf(bytes,pages,entries,{preserveOutline=false,searchable=true}={}) {
  const rows=entries.length ? validateEntries(entries,pages) : [];
  const bookmarked=preserveOutline ? new Uint8Array(bytes) : await writePdfBookmarks(bytes,rows,'replace');
  return searchable ? addOcrTextLayer(bookmarked,pages) : {bytes:bookmarked,textPages:0};
}
module.exports={exportPdf};
