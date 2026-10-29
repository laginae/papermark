'use strict';
// Adapted from Note Reader's inferOutline; typography is evidence, not certainty.
const SEMANTIC = /^(?:abstract|introduction|background|related work|literature review|materials?(?: and methods?)?|methods?|methodology|results?(?: and discussion)?|discussion|conclusions?(?: and (?:discussion|future work))?|references|bibliography|acknowledg(?:e)?ments?|appendi(?:x|ces)(?:\s+[A-Z])?|supplementary materials?|funding|author contributions?|competing interests|additional information|data availability(?: statement)?|conflicts? of interest|摘要|关键词|引言|绪论|研究方法|实验方法|结果与讨论|结果|讨论|结论|参考文献|致谢|附录(?:[A-Z一二三四五六七八九十\d]+)?)\s*[.:：。]?$/i;
const NUMBER = /^(?:(\d{1,2}(?:\.\d{1,2}){0,5})\.?\s+|([IVXLC]+)[.)]\s+|(第[一二三四五六七八九十百零〇\d]+[章节])\s*|([A-H])[.)]\s+)(\S.+)$/;
function numbering(text) {
  const m = text.match(NUMBER);
  if (!m) return null;
  return { token: m[1] || m[2] || m[3] || m[4], body: m[5],
    level: m[1] ? m[1].split('.').length : m[3]?.endsWith('节') || m[4] ? 2 : 1,
    kind: m[1] ? 'decimal' : m[2] ? 'roman' : m[3] ? 'chinese' : 'letter' };
}
function styleFor(line, page, bodyHeight) {
  const items = page.items.filter(i => Math.abs(i.transform[5] - line.y) <= bodyHeight * .55
    && i.transform[4] >= line.xMin - 2 && i.transform[4] + i.width <= line.xMax + 3);
  const size = items.length ? Math.max(...items.map(i => i.height || Math.abs(i.transform[3]))) : bodyHeight;
  const bold = items.some(i => /bold|black|demi|heavy/i.test((page.styles[i.fontName]?.fontFamily || '') + i.fontName));
  const fonts = new Map();
  for(const item of items) fonts.set(item.fontName || '',(fonts.get(item.fontName || '') || 0)+item.str.length);
  const font = [...fonts].sort((a,b)=>b[1]-a[1])[0]?.[0] || '';
  return { size, bold, font, prominent: size >= bodyHeight * 1.12 || bold };
}
// Separate side notes sharing a baseline with a heading, and rejoin split ligatures.
function refineLines(page) {
  const lines = [];
  for (const line of page.lines) {
    const items = page.items.filter(i => Math.abs(i.transform[5] - line.y) <= page.bodyHeight * .4
      && i.transform[4] >= line.xMin - 2 && i.transform[4] + i.width <= line.xMax + 2).sort((a,b)=>a.transform[4]-b.transform[4]);
    if (!items.length) { lines.push(line); continue; }
    let group = [];
    const flush = () => {
      if (!group.length) return;
      let text = '';
      for (let i=0;i<group.length;i++) {
        const item = group[i], previous = group[i-1];
        const gap = previous ? item.transform[4] - previous.transform[4] - previous.width : 0;
        const space = previous && gap > Math.min(item.height, previous.height) * .12
          && !/[\u3400-\u9fff]$/.test(text) && !/^[,.;:!?，。；：]/.test(item.str);
        text += (space && !/\s$/.test(text) ? ' ' : '') + item.str;
      }
      lines.push({ ...line, text: text.trim(), xMin: group[0].transform[4],
        xMax: Math.max(...group.map(i=>i.transform[4]+i.width)), y: group[0].transform[5] }); group=[];
    };
    for (const item of items) {
      const previous=group.at(-1);
      if (previous && (Math.abs(item.height-previous.height) > Math.max(item.height,previous.height)*.25
        || item.transform[4]-previous.transform[4]-previous.width > Math.max(item.height,previous.height)*3)) flush();
      group.push(item);
    }
    flush();
  }
  return lines;
}
function detectHeadings(pages, { sensitivity = 'balanced' } = {}) {
  pages = pages.map(page=>({...page, lines:refineLines(page)}));
  const weights = new Map(), repeats = new Map(), fontWeights = new Map();
  for (const page of pages) for (const item of page.items) {
    const size = Math.round((item.height || Math.abs(item.transform[3])) * 2) / 2;
    if (size > 0) weights.set(size, (weights.get(size) || 0) + item.str.trim().length);
    fontWeights.set(item.fontName, (fontWeights.get(item.fontName) || 0) + item.str.trim().length);
  }
  const bodyHeight = [...weights].sort((a,b) => b[1] - a[1])[0]?.[0] || 10;
  const bodyFont = [...fontWeights].sort((a,b)=>b[1]-a[1])[0]?.[0];
  const headingFonts = new Set();
  for (const page of pages) for (const line of page.lines) {
    const style = styleFor(line,page,bodyHeight);
    if (SEMANTIC.test(line.text.trim()) && style.size >= bodyHeight*.94) headingFonts.add(style.font);
  }
  const globalAnchors = new Map();
  for(const page of pages) for(const line of page.lines) if(line.text.length>65 && /[a-z]{3}/.test(line.text)) {
    const x=Math.round(line.xMin/4)*4; globalAnchors.set(x,(globalAnchors.get(x)||0)+1);
  }
  const anchors = [...globalAnchors].filter(([,count])=>count>=5).sort((a,b)=>b[1]-a[1]).slice(0,8).map(([x])=>x);
  const key = s => s.replace(/\d+/g, '#').replace(/\s+/g, '').toLowerCase();
  for (const page of pages) for (const line of page.lines) {
    const y0 = page.view?.[1] || 0;
    if (line.y - y0 < page.height * .08 || line.y - y0 > page.height * .92) {
      if (!repeats.has(key(line.text))) repeats.set(key(line.text), new Set());
      repeats.get(key(line.text)).add(page.number);
    }
  }
  const rows = []; let inReferences = false;
  for (const page of pages) {
    const tocLines = page.lines.filter(l => /(?:\.{3,}|…|·{3,})\s*\d+\s*$/.test(l.text)).length;
    if (tocLines >= 3) continue;
    for (let index = 0; index < page.lines.length; index++) {
      const line = page.lines[index], text = line.text.trim().normalize('NFKC');
      if (line.offset < 0 || text.length < 2 || text.length > 160) continue;
      const y = line.y - (page.view?.[1] || 0);
      if (y < page.height * .035 || y > page.height * .975) continue;
      if ((repeats.get(key(text))?.size || 0) > 1) continue;
      if (/^(?:fig(?:ure)?\.?|table|equation|eq\.?|图|表)\s*[\dIVX一二三四五六七八九十]/i.test(text)
        || /^\(?[\d.]+\)?$/.test(text) || /(?:\.{3,}|…|·{3,})\s*\d+\s*$/.test(text)
        || /https?:\/\/|doi\s*:|@|©/i.test(text)) continue;
      const num = numbering(text), semantic = SEMANTIC.test(text);
      if (/^(?:appendix|appendices|附录)/i.test(text)) inReferences = false;
      const style = styleFor(line, page, bodyHeight);
      const familiar = headingFonts.has(style.font);
      if (familiar && style.font !== bodyFont && style.size >= bodyHeight*.98) style.prominent = true;
      const aligned = !anchors.length || anchors.some(x => Math.abs(line.xMin - x) < bodyHeight * .8);
      if (inReferences && !semantic && (!familiar || num?.kind === 'decimal')) continue;
      if (num?.kind === 'letter' && !rows.some(row => numbering(row.title))) continue;
      if (style.size < bodyHeight * .92) continue;
      if (!semantic && /[=+−×∑∫Δ∆{}\[\]\\\x00-\x08\x0e-\x1f]/.test(text)) continue;
      if (!semantic && !aligned) continue;
      if (num && (num.token.startsWith('0') || !/^[A-Z\u3400-\u9fff]/.test(num.body))) continue;
      if (!num && !semantic && (!/^[A-Z\u3400-\u9fff]/.test(text) || text.length < 5)) continue;
      if (!num && !semantic && headingFonts.size && !familiar) continue;
      if (!num && !semantic && (!style.prominent || page.number === 1 || text.length > 85
        || /[.;:,，。；：]$/.test(text) || text.split(/\s+/).length > 13)) continue;
      if (num && (!/[\p{L}]/u.test(num.body) || /[;；。]$/.test(text)
        || text.length > 115 || text.split(/\s+/).length > 18
        || (!style.prominent && /[.,，]$/.test(num.body))
        || (num.kind === 'decimal' && !style.prominent && /^[a-z]/.test(num.body)))) continue;
      if (sensitivity === 'strict' && !semantic && !style.prominent) continue;
      let title = text;
      // Wrapped headings are joined only when their typography differs from body text.
      let lastLine = line;
      for(let continuation=0;continuation<3;continuation++) {
      const next = page.lines[index + 1];
      if (!semantic && style.prominent && next && !/[.!?。:：]$/.test(title)
        && !numbering(next.text) && !SEMANTIC.test(next.text) && next.text.length < 85
        && !/[.;。；]$/.test(next.text) && Math.abs(next.xMin - line.xMin) < style.size * 1.5
        && lastLine.y - next.y > style.size * .65 && lastLine.y - next.y < style.size * 1.8) {
        const ns = styleFor(next, page, bodyHeight);
        if (ns.font === style.font && Math.abs(ns.size - style.size) < .5) {
          title += /[\u3400-\u9fff]$/.test(title) ? next.text : ' ' + next.text; index++; lastLine=next;
        } else break;
      } else break;
      }
      let level = num?.level || 1;
      const previous = rows.at(-1);
      if (!previous) level = 1;
      else level = Math.min(level, previous.level + 1);
      const strong = semantic || (num && style.prominent);
      rows.push({ title, level, page: page.number, offset: line.offset, x: line.xMin, headingSize: style.size, numbered: !!num,
        y: Math.min(page.view?.[3] ?? page.height, line.y + style.size * 1.15),
        inferred: true, review: !strong, reason: semantic ? '常见章节标题' : num ? '章节编号' + (style.prominent ? '与字体特征' : '，建议核对') : '字体与版式特征，建议核对' });
      if (/^(?:references|bibliography|参考文献)\s*[.:：。]?$/i.test(num?.body || text)) inReferences = true;
      if (rows.length >= 1000) break;
    }
  }
  const sizes = [...new Set(rows.filter(row=>!row.numbered).map(row=>Math.round(row.headingSize*2)/2))].sort((a,b)=>b-a);
  const capsStyle = rows.filter(row=>!row.numbered && /[A-Z]{3}/.test(row.title) && row.title === row.title.toUpperCase()).length >= 3;
  let previousLevel=0;
  return rows.map(row=>{
    if (!row.numbered && !SEMANTIC.test(row.title)) row.level = Math.min(3, sizes.indexOf(Math.round(row.headingSize*2)/2)+1);
    if (capsStyle && !row.numbered && !SEMANTIC.test(row.title) && /[a-z]/.test(row.title)) row.level = Math.max(2,row.level);
    row.level = Math.min(row.level, previousLevel+1); previousLevel=row.level;
    return row;
  });
}
module.exports = { detectHeadings, numbering, refineLines };
