'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {ocrLayout,toPdfPoint,detectWithOcr}=require('../src/ocr-layout');
const {validateEntries}=require('../src/model');
const {ocrHeadings}=require('../src/ocr-layout');
test('scan heading detection rejects tall body sentences without losing numbered sections in strict mode',()=>{
  const lines=[
    {text:'第一章 绪论',height:13,y:700},
    {text:'可靠的文档处理需要准确的文字识别和稳定的阅读顺序。本文采用人工编写的测试内容',height:16,y:660},
    {text:'2.1. Data preparation',height:9,y:600},
    {text:'Each page is converted into a raster image before recognition.',height:14,y:570},
    ...Array.from({length:10},(_,i)=>({text:'Normal body text used to establish the reading layout.',height:10,y:520-i*20}))
  ].map((l,i)=>({...l,offset:i*100,xMin:40,xMax:500}));
  for(const sensitivity of ['balanced','strict'])assert.deepEqual(ocrHeadings({lines,number:2,height:800,bodyHeight:10},{sensitivity}).map(x=>x.title),['第一章 绪论','2.1. Data preparation']);
});
const original={number:1,view:[20,30,620,830],height:800,width:600,text:'',items:[],lines:[]};
const data={confidence:88,blocks:[{paragraphs:[{lines:[
  {text:'1. Introduction',bbox:{x0:80,y0:100,x1:420,y1:140}},
  ...Array.from({length:12},(_,i)=>({text:'Normal text of the synthetic research document.',bbox:{x0:80,y0:180+i*35,x1:900,y1:200+i*35}}))
]}]}]};
test('OCR headings use real crop-relative PDF destinations and require review',()=>{
  const layout=ocrLayout(data,original,{width:1200,height:1600,scale:2,transform:[2,0,0,-2,-40,1660]});
  const rows=detectWithOcr([{...original,ocrLayout:layout}]);
  assert.equal(rows.length,1);assert.equal(rows[0].title,'1. Introduction');
  assert.equal(rows[0].x,60);assert.ok(rows[0].y>760&&rows[0].y<810);
  assert.equal(rows[0].review,true);assert.equal(rows[0].reason,'reason.ocr');
  validateEntries(rows,[original]);
});
test('rotated OCR coordinates invert the actual viewport transform',()=>{
  const layout={width:800,height:600,scale:2,transform:[0,2,2,0,-60,-40]};
  assert.deepEqual(toPdfPoint(50,540,layout),[80,80]);
});
test('OCR Chinese spacing is normalized and malformed boxes are ignored',()=>{
  const result=ocrLayout({blocks:[{paragraphs:[{lines:[{text:'第 一 章 绪 论',bbox:{x0:30,y0:50,x1:220,y1:80}},{text:'bad',bbox:{x0:0,y0:0,x1:NaN,y1:3}}]}]}]},original,{width:600,height:800,scale:1,transform:[1,0,0,-1,0,800]});
  assert.equal(result.lines.length,1);assert.equal(result.lines[0].text,'第一章绪论');
  assert.equal(result.lines[0].offset,0);
});
