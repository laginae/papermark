'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const {ocrHeadings, detectWithOcr} = require('../src/ocr-layout');

function layout(rows) {
  let y = 790, text = '';
  const lines = [...rows, ...Array.from({length: 10}, () => ({text: 'Public synthetic body text establishes ordinary OCR line height.', gap: 22}))].map(row => {
    y -= row.gap ?? 40;
    const line = {text: row.text, height: row.height || 10.5, y, xMin: row.x ?? 42, xMax: (row.x ?? 42) + (row.width || 450), offset: text.length};
    text += row.text + '\n'; return line;
  });
  return {lines, text, number: 2, width: 595, height: 842, bodyHeight: 10.5, scale: 1, transform: [1,0,0,-1,0,842]};
}
const heading = text => ({text, height: 16});

test('OCR rejects academic labels while accepting shared end-matter declarations', () => {
  for (const label of ['定理3（存在性）', '命题 2（示例性质）。令所有元素互异', 'Theorem 3 (Existence)', 'Lemma A.2 (Auxiliary result)', 'Proof. Consider a simple example', '证明：先考虑一个简单例子']) {
    const data = layout([heading('1 Introduction'), heading(label), {text: '数据可用性声明'}, {text: 'Data and code availability'}, {text: '作者贡献'}, {text: 'References'}]);
    for (const sensitivity of ['balanced', 'strict']) assert.deepEqual(ocrHeadings(data, {sensitivity}).map(row => row.title), ['1 Introduction', '数据可用性声明', 'Data and code availability', '作者贡献', 'References'], label);
  }
});

test('OCR keeps numbered declarative titles but filters quantity paragraphs', () => {
  for (const title of ['2.1 采用3种模型，提高预测精度', '2.1 Model 3 has lower error, with stable convergence']) {
    const data = layout([heading('1 Introduction'), {text: title},
      {text: 'The next paragraph explains the evaluation procedure.', gap: 14},
      {text: '12.5 MW, the measured value was used for the next calculation'},
      {text: '18 个样本包含3种颜色，分别采用两套规则，最终得到6组记录'},
      {text: '这些记录仅用于合成测试。', gap: 14}, heading('References')]);
    for (const sensitivity of ['balanced', 'strict']) assert.deepEqual(ocrHeadings(data, {sensitivity}).map(row => row.title), ['1 Introduction', title.normalize('NFKC'), 'References']);
  }
});

test('OCR preserves wrapped proof titles and formal theorem-topic headings', () => {
  const data = layout([heading('1 Introduction'), heading('3 Proof of'), {...heading('Theorem 2'), gap: 20},
    heading('Theorem 2 and its consequences'), heading('4 MAIN RESULT'), {...heading('Theorem 3 (Example)'), gap: 20}, heading('References')]);
  const before = structuredClone(data);
  for (const sensitivity of ['balanced', 'strict']) assert.deepEqual(ocrHeadings(data, {sensitivity}).map(row => row.title), ['1 Introduction', '3 Proof of Theorem 2', 'Theorem 2 and its consequences', '4 MAIN RESULT', 'References']);
  assert.deepEqual(data, before);
});

test('OCR does not join body blocks, distant references, other columns or body-height lines', () => {
  for (const next of [
    {...heading('Theorem 2'), gap: 20, x: 340},
    {...heading('Theorem 2'), gap: 60},
    {...heading('Theorem 2 (Example). Let every element be distinct'), gap: 20},
    {text: 'Theorem 2', gap: 20},
  ]) {
    const rows = ocrHeadings(layout([heading('1 Introduction'), heading('3 Proof of'), next, heading('References')]));
    assert.deepEqual(rows.map(row => row.title), ['1 Introduction', '3 Proof of', 'References']);
  }
});

test('OCR can join an explicit proof title when measured glyph heights match body text', () => {
  const data = layout([heading('1 Introduction'), {text: '3 Proof of', height: 13}, {text: 'Theorem 2', height: 13, gap: 20}]);
  for (const line of data.lines) if (line.height === 10.5) line.height = 13;
  data.bodyHeight = 13;
  assert.deepEqual(ocrHeadings(data).map(row => row.title), ['1 Introduction', '3 Proof of Theorem 2']);
});

test('OCR accounts for Latin glyph boxes being shorter than the printed line spacing', () => {
  const data = layout([heading('1 Introduction'), {text: '3 Proof of', height: 10.5}, {text: 'Theorem 2', height: 10.5, gap: 20}]);
  for (let i = 3; i < data.lines.length; i++) data.lines[i].height = 7.5;
  data.bodyHeight = 7.5;
  assert.deepEqual(ocrHeadings(data).map(row => row.title), ['1 Introduction', '3 Proof of Theorem 2']);
});

test('shared OCR rules preserve source geometry, review flags and explicit service outlines', () => {
  const data = layout([heading('1 Introduction'), heading('3 Proof of'), {...heading('Theorem 2'), gap: 20}, {text: '数据可用性声明'}]);
  const before = structuredClone(data);
  const empty = {text: '', items: [], lines: [], styles: {}, height: 842, width: 595, view: [0,0,595,842], bodyHeight: 10.5};
  const rows = detectWithOcr([{...empty, number: 1}, {...empty, number: 2, ocrLayout: data}]);
  assert.deepEqual(rows.map(row => row.title), ['1 Introduction', '3 Proof of Theorem 2', '数据可用性声明']);
  assert.ok(rows.every(row => row.review && row.reason === 'reason.ocr' && row.page === 2));
  assert.equal(rows[1].offset, data.lines[1].offset); assert.equal(rows[1].x, 42);
  assert.equal(rows[1].y, data.lines[1].y + 16 * 1.15); assert.deepEqual(data, before);
  const supplied = [{title: 'Theorem 2', page: 2, level: 1, x: 42, y: 700}];
  assert.equal(ocrHeadings({...data, headings: supplied}), supplied);
});
