'use strict';

const REFERENCES = /^(?:references|bibliography|\u53c2\u8003\u6587\u732e)\s*[.:\uFF1A\u3002]?$/i;
const APPENDIX = /^(?:appendix|appendices|\u9644\u5f55)/i;

const centerX = line => (line.xMin + line.xMax) / 2;
const capitalHeading = text => /[A-Z]{2}/.test(text) && !/\p{Ll}/u.test(text) && !/[.;:!?]$/.test(text);
function romanRank(token) {
  if (!/^(?:XC|XL|L?X{0,3})(?:IX|IV|V?I{0,3})$/.test(token)) return 0;
  const rank = { I: 1, V: 5, X: 10, L: 50, C: 100 };
  return [...token].reduce((n, ch, i) => n + (rank[ch] < rank[token[i + 1]] ? -rank[ch] : rank[ch]), 0);
}

// Measure the column from nearby body lines, not from the center of the physical page.
function neighboringColumn({ page, index, line }, size) {
  const x = centerX(line);
  let widest = null;
  for (let i = Math.max(0, index - 8); i <= Math.min(page.lines.length - 1, index + 8); i++) {
    const other = page.lines[i], width = other.xMax - other.xMin;
    if (i === index || other.footnote || other.offset < 0 || (page.bodyFont && other.font !== page.bodyFont)
      || Math.abs(other.fontSize - size) > size * .15 || width < size * 12
      || x < other.xMin || x > other.xMax || other.text.length < 24 || !/[a-z]{3,}/.test(other.text)) continue;
    if (!widest || width > widest.xMax - widest.xMin) widest = other;
  }
  return widest;
}

function markRomanHierarchy(rows, size) {
  let previous = null, inReferences = false, foundSeries = false;
  for (const row of rows) {
    const { num, line, page, index } = row;
    const label = num?.body || row.text;
    if (APPENDIX.test(label)) { previous = null; inReferences = false; }
    if (REFERENCES.test(label)) { previous = null; inReferences = true; }
    if (inReferences || num?.kind !== 'roman' || !capitalHeading(num.body)) continue;
    const rank = romanRank(num.token), column = rank && neighboringColumn(row, size);
    if (!column || Math.abs(centerX(line) - centerX(column)) > Math.max(size, (column.xMax - column.xMin) * .04)) continue;
    const before = page.lines[index - 1];
    if (before && centerX(line) >= before.xMin && centerX(line) <= before.xMax
      && before.y >= line.y && before.y - line.y < size * 1.25) continue;
    if (previous && rank === previous.rank + 1 && (page !== previous.row.page || line.font === previous.row.line.font)
      && Math.abs(line.fontSize - previous.row.line.fontSize) <= size * .12) {
      previous.row.romanSection = row.romanSection = true;
      previous.row.prominent = row.prominent = true;
      foundSeries = true;
    }
    previous = { rank, row };
  }
  if (!foundSeries) return;
  // Require a real A/B sequence and a separate heading face; do not learn that
  // every italic phrase is a heading. Disambiguate C. from Roman 100 in this series.
  let parent = false, children = [];
  const finish = () => {
    if (children.length >= 2) for (const child of children) {
      child.letterSection = child.prominent = true;
      child.num = { ...child.num, kind: 'letter', level: 2 };
    }
    children = [];
  };
  for (const row of rows) {
    const { num, line, page } = row;
    if (row.romanSection || (row.semantic && !num) || REFERENCES.test(num?.body || row.text)
      || APPENDIX.test(num?.body || row.text) || (num?.level === 1 && num.kind === 'decimal' && row.prominent)) {
      finish(); parent = !!row.romanSection; continue;
    }
    if (!parent || !num || !/^[A-H]$/.test(num.token) || !/^[A-Z]/.test(num.body) || /[.;:]$/.test(num.body)
      || !(line.bold || (line.font && (page.bodyFont ? line.font !== page.bodyFont : row.distinct)))) continue;
    const column = neighboringColumn(row, size);
    if (!column || Math.abs(line.xMin - column.xMin) > size * 1.6) continue;
    if (num.token === 'A') { finish(); children.push(row); }
    else if (children.length && num.token.charCodeAt(0) === 65 + children.length
      && line.font === children[0].line.font && Math.abs(line.fontSize - children[0].line.fontSize) < 1) children.push(row);
  }
  finish();
}

module.exports = { centerX, capitalHeading, markRomanHierarchy };
