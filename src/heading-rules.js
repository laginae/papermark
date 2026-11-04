'use strict';
// Shared text evidence for PDF text and OCR lines. Layout remains engine-specific.
const SEMANTIC = /^(?:abstract|introduction|background|related work|literature review|materials?(?: and methods?)?|methods?|methodology|results?(?: and discussion)?|discussion|conclusions?(?: and (?:discussion|future work))?|references|bibliography|acknowledg(?:e)?ments?|appendi(?:x|ces)(?:\s+[A-Z])?|supplementary materials?|funding|author contributions?|competing interests|additional information|(?:data(?: and code)?|code) availability(?: statement)?|conflicts? of interest|摘要|关键词|引言|绪论|研究方法|实验方法|结果与讨论|结果|讨论|结论|参考文献|致谢|数据(?:(?:与|和)(?:程序|代码))?(?:可获取性|可用性)(?:声明)?|代码可用性(?:声明)?|作者贡献(?:声明)?|利益冲突(?:声明)?|生成式\s*AI(?:\s*及\s*AI)?\s*辅助技术使用声明|附录(?:[A-Z一二三四五六七八九十\d]+)?)\s*[.:：。]?$/i;
const ACADEMIC = /^(?:(?:theorem|lemma|proposition|corollary|definition|assumption)\s+(?:\d+(?:\.\d+)*|[A-Z](?:\.\d+)*|[IVXLC]+)|(?:定理|引理|命题|推论|定义|假设)\s*(?:\d+(?:\.\d+)*|[一二三四五六七八九十百零〇]+))(?=\s|[(:：.。]|$)/i;
const normalized = text => text.trim().normalize('NFKC');
const commonHeading = text => SEMANTIC.test(normalized(text));
function containsSentence(text) {
  return /[。；;]\s*\S|[.!?]\s+(?:We|The|This|These|Those|It|They|Our)\b/.test(text);
}
function academicTail(text) {
  text = normalized(text);
  const prefix = text.match(ACADEMIC) || text.match(/^(?:proof\b|证明)(?=\s|[.:：。]|$)/i);
  return prefix ? text.slice(prefix[0].length).trim() : null;
}
function academicBlock(text) {
  let tail = academicTail(text);
  if (tail === null) return false;
  // A bare label or parenthesized name introduces an academic block. A topic
  // such as "Theorem 2 and its consequences" still needs normal heading checks.
  tail = tail.replace(/^\([^()]*\)\s*/, '').replace(/^[.:：。]\s*/, '');
  return !tail || containsSentence(tail) || /[.!?。]$/.test(tail)
    || /^(?:let|suppose|assume|if|then|given|consider|every|all|we|there exists|for (?:any|every|all)|it (?:is|follows)|since|by (?:definition|contradiction|induction))\b/i.test(tail)
    || /^(?:令|设|若|假设|对于|任意|存在|由此|根据|首先|先考虑)/.test(tail);
}
const academicTopic = text => academicTail(text) !== null && !academicBlock(text);
function unfinishedHeading(text) {
  return /\b(?:of|for|on|about|to|using|via|and)(?:\s+the)?\s*$/i.test(text)
    || /(?:关于|针对|对于|基于|与|和|及)\s*$/.test(text);
}
function academicContinuation(title, next) {
  if (!unfinishedHeading(title)) return false;
  const value = normalized(next), prefix = value.match(ACADEMIC);
  if (!prefix) return false;
  const tail = value.slice(prefix[0].length).trim();
  return !tail || /^\([^()]*\)$/.test(tail);
}
function numberedProse(num, line, next, style, nextStyle, bodyHeight) {
  if (!num || style.prominent) return false;
  const text = num.body;
  if (containsSentence(text)) return true;
  const narrative = /\b(?:is|are|was|were|has|have|had|contains?|contained|includes?|included|increased?|decreased?|yielded?|remained?)\b|包含|增加|减少|增至|降至|得到|采用|分别|共有|共计|其中/i.test(text);
  const unit = /^(?:[pnumkMGT]?(?:W(?:h)?|Hz|Pa|V|A|J)|mm|cm|km|m|ms|s|kg|g|mol|K|%)\s*[,，;；]/.test(text);
  if (unit && narrative) return true;
  // Same-font text below a heading can be a new paragraph. Only treat it as
  // continuation when a count phrase, a filled line and continuing language agree.
  const count = num.kind === 'decimal' && num.level === 1
    && /^(?:(?:observations?|samples?|records?|patients?|participants?|measurements?)\b|(?:个|条|组|项|次|名|份)(?:样本|记录|数据|试验|实验|测量|参与者|患者))/i.test(text);
  const nextText = next ? normalized(next.text) : '';
  const continuationText = /^[a-z]/.test(nextText) || /^(?:这些|上述|其中|并|以及|而|因此|从而|分别|其余|剩余)/.test(nextText);
  const continues = next && nextStyle && continuationText
    && line.y - next.y >= bodyHeight * .65 && line.y - next.y <= bodyHeight * 1.9
    && Math.abs(next.xMin - line.xMin) <= bodyHeight * 2.5
    && line.xMax >= next.xMax - bodyHeight * 2
    && nextStyle.font === style.font && Math.abs(nextStyle.size - style.size) < .5;
  const clauses = text.split(/[,，]/).filter(part => /\p{L}/u.test(part)).length;
  return !!continues && count && narrative && /\d/.test(text) && clauses >= 2;
}
module.exports = { commonHeading, academicBlock, academicTopic, academicContinuation, unfinishedHeading, containsSentence, numberedProse };
