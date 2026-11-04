'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { detectHeadings } = require('../src/detection');

// Synthetic text and opaque PDF font IDs, with no private document content.
function page(rows, number = 2) {
  const result = { number, height: 842, width: 595, view: [0, 0, 595, 842],
    bodyHeight: 10.5, items: [], lines: [], text: '',
    styles: { f1: { fontFamily: 'serif' }, f2: { fontFamily: 'serif' } } };
  let y = 790;
  const body = 'This is public sample text for checking paragraph layout and heading detection.';
  for (const input of [...rows, ...Array.from({ length: 5 }, () => ({ text: body, gap: 14 }))]) {
    const row = typeof input === 'string' ? { text: input } : input;
    const size = row.size || 10.5, font = row.font || 'f1', x = row.x ?? 42;
    y -= row.gap ?? 26;
    const width = row.width || Math.min(490, row.text.length * size * .6);
    result.lines.push({ text: row.text, offset: result.text.length, y, xMin: x, xMax: x + width });
    result.items.push({ str: row.text, height: size, width, fontName: font,
      transform: [size, 0, 0, size, x, y] });
    result.text += row.text + '\n';
  }
  return result;
}
const heading = (text, size = 12) => ({ text, size, font: 'f2' });
const titles = (p, sensitivity = 'balanced') => detectHeadings([p], { sensitivity }).map(row => row.title);

test('numeric paragraph continuations are not section numbers in either mode', () => {
  const p = page([
    heading('1 Introduction'),
    { text: '18 个样本包含3种颜色，分别采用两套规则，最终得到6组记录', width: 490 },
    { text: '这些记录仅用于检查目录识别，不代表任何研究结果。', gap: 14 },
    '8 条记录需要复核。随后检查了所有页面的边界条件',
    '16 增至24，其他记录没有改变。下面继续介绍检查过程',
    { text: '24 Observations were divided into 3 groups, each group contained 8 samples, and the remaining', width: 490 },
    { text: 'records were reviewed independently by another reader.', gap: 14 },
    '12.5 MW, the measured value was used for the next calculation',
    heading('2 Results'),
  ]);
  for (const mode of ['balanced', 'strict']) {
    assert.deepEqual(titles(p, mode), ['1 Introduction', '2 Results']);
  }
});

test('weak headings with numbers or commas remain reviewable and need not be consecutive', () => {
  const p = page([
    heading('1 Introduction'),
    '2.1 Design, evaluation and version 3',
    { text: 'The following paragraph uses the same body font as the heading.', gap: 14 },
    heading('7 Limitations'),
    heading('12 方法概述'),
    heading('12.1 两种方法的比较', 10.5),
    heading('参考文献'),
  ]);
  const rows = detectHeadings([p]);
  assert.deepEqual(rows.map(row => row.title), [
    '1 Introduction', '2.1 Design, evaluation and version 3', '7 Limitations',
    '12 方法概述', '12.1 两种方法的比较', '参考文献',
  ]);
  assert.equal(rows.find(row => row.title.startsWith('2.1')).review, true);
  assert.equal(rows.find(row => row.title.startsWith('12.1')).review, false);
});

test('another column or a distant line is not evidence of paragraph continuation', () => {
  const title = '2.1 Three options were tested, with 4 additional checks';
  for (const next of [
    { text: 'Text from the other column is unrelated to this heading.', x: 340, gap: 14 },
    { text: 'A distant paragraph must not be joined to the heading.', gap: 70 },
  ]) {
    const rows = detectHeadings([page([heading('1 Introduction'), title, next, heading('References')])]);
    assert.ok(rows.some(row => row.title === title));
    assert.equal(rows.find(row => row.title === title).review, true);
  }
});

test('theorem and proof blocks are not chapter headings even in a learned heading font', () => {
  for (const label of [
    '命题 2（示例性质）。令所有元素属于同一个集合',
    '定理 3（存在性）', '引理 1.2（辅助结论）', '推论 4（边界性质）',
    '定义 5（测试对象）', '证明：先考虑一个简单例子',
    'Proposition 2 (Example). Let all elements belong to the same set',
    'Theorem 3 (Existence)', 'Lemma A.2 (Auxiliary result)',
    'Corollary 4 (Bounds)', 'Definition 5 (Test object)', 'Proof. Consider a simple example',
  ]) {
    const p = page([heading('1 Introduction'), heading(label, 10.5), heading('2 Results'), heading('References')]);
    for (const mode of ['balanced', 'strict']) {
      assert.deepEqual(titles(p, mode), ['1 Introduction', '2 Results', 'References'], label);
    }
  }
});

test('sections about theorems and proof methods are retained', () => {
  const p = page([
    heading('1 Introduction'), heading('2 命题与证明'),
    heading('3 Theorem 2 and its consequences'), heading('Proof methods'),
    heading('References'),
  ]);
  assert.deepEqual(titles(p), [
    '1 Introduction', '2 命题与证明', '3 Theorem 2 and its consequences', 'Proof methods', 'References',
  ]);
});

test('academic blocks and body sentences are not appended to preceding wrapped headings', () => {
  const p = page([
    heading('1 Introduction'), heading('2 MAIN RESULT'),
    { ...heading('Theorem 1 (Example)'), gap: 15 },
    heading('3 PUBLIC SAMPLE'),
    { ...heading('HEADING CONTINUED'), gap: 15 },
    { ...heading('This is a sentence. We continue with the explanation'), gap: 15 },
    heading('References'),
  ]);
  assert.deepEqual(titles(p), ['1 Introduction', '2 MAIN RESULT', '3 PUBLIC SAMPLE HEADING CONTINUED', 'References']);
});

test('common end-matter declarations have clear evidence while unfamiliar titles keep review flags', () => {
  const p = page([
    heading('1 Introduction'), heading('数据可用性声明'), heading('作者贡献'),
    heading('利益冲突声明'), heading('Data and code availability'),
    heading('Additional experiments'), heading('References'),
  ]);
  const rows = detectHeadings([p]);
  assert.deepEqual(rows.map(row => row.title), [
    '1 Introduction', '数据可用性声明', '作者贡献', '利益冲突声明',
    'Data and code availability', 'Additional experiments', 'References',
  ]);
  for (const title of ['数据可用性声明', '作者贡献', '利益冲突声明', 'Data and code availability']) {
    assert.equal(rows.find(row => row.title === title).review, false, title);
  }
  assert.equal(rows.find(row => row.title === 'Additional experiments').review, true);
});

test('a declaration mentioned inside a paragraph does not become a semantic heading', () => {
  const p = page([
    heading('1 Introduction'),
    '数据可用性声明将在最终版本中提供，所有示例均为公开测试内容。',
    'The data availability statement will be added after the review.',
    heading('References'),
  ]);
  assert.deepEqual(titles(p), ['1 Introduction', 'References']);
});

test('detection leaves source text, offsets and original page objects unchanged', () => {
  const p = page([heading('1 Introduction'), heading('2 研究方法'), heading('参考文献')]);
  const snapshot = structuredClone(p);
  const rows = detectHeadings([p]);
  assert.deepEqual(p, snapshot);
  for (const row of rows) {
    assert.ok(p.text.slice(row.offset).startsWith(row.title));
    assert.equal(row.page, 2);
    assert.equal(row.x, 42);
  }
});

test('declarative section titles keep review flags above same-font body paragraphs', () => {
  for (const title of ['2.1 Model 3 has lower error, with stable convergence', '2.1 采用3种模型，提高预测精度', '7 Model 3 has lower error, with stable convergence']) {
    const p = page([heading('1 Introduction'), title,
      { text: 'The next paragraph explains the evaluation procedure in ordinary body text.', gap: 14 }, heading('References')]);
    const row = detectHeadings([p]).find(row => row.title === title.normalize('NFKC'));
    assert.ok(row, title); assert.equal(row.review, true);
    // Conservative mode retains its existing requirement for stronger typography.
    assert.ok(!titles(p, 'strict').includes(title.normalize('NFKC')));
  }
});

test('formal sections discussing named theorems are not theorem labels', () => {
  for (const title of ['Theorem 2 and its consequences', 'Theorem 2: Proof and implications', '命题 2 的推导与应用', 'Proof: A geometric approach']) {
    const p = page([heading('1 Introduction'), heading(title), heading('References')]);
    for (const mode of ['balanced', 'strict']) assert.ok(titles(p, mode).includes(title), title);
    assert.equal(detectHeadings([p]).find(row => row.title === title).review, true);
  }
});

test('wrapped formal proof titles retain the theorem reference and first-line destination', () => {
  for (const [first, second, expected] of [
    ['3 Proof of', 'Theorem 2', '3 Proof of Theorem 2'],
    ['3 Proof of the', 'Lemma A.2 (Auxiliary result)', '3 Proof of the Lemma A.2 (Auxiliary result)'],
    ['第三章 关于', '定理 2', '第三章 关于定理 2'],
  ]) {
    const p = page([heading('1 Introduction'), heading(first), { ...heading(second), gap: 15 }, heading('References')]);
    const source = structuredClone(p);
    for (const mode of ['balanced', 'strict']) {
      const rows = detectHeadings([p], { sensitivity: mode }), row = rows.find(row => row.title === expected);
      assert.ok(row, expected); assert.equal(row.offset, p.lines[1].offset); assert.equal(row.x, p.lines[1].xMin);
      assert.equal(row.y, p.lines[1].y + 12 * 1.15); assert.equal(rows.length, 3);
    }
    assert.deepEqual(p, source);
  }
});

test('an unfinished heading cannot absorb theorem prose or a reference in another column', () => {
  for (const next of [
    { ...heading('Theorem 2 (Example). Let every element be distinct'), gap: 15 },
    { ...heading('Theorem 2'), gap: 15, x: 340 },
    { ...heading('Theorem 2'), gap: 60 },
    { text: 'Theorem 2', gap: 15 },
  ]) {
    const rows = detectHeadings([page([heading('1 Introduction'), heading('3 Proof of'), next, heading('References')])]);
    assert.deepEqual(rows.map(row => row.title), ['1 Introduction', '3 Proof of', 'References']);
    assert.equal(rows[1].review, true);
  }
});
