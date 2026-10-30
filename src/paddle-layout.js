'use strict';
const {hasTwoColumnLayout,orderTwoColumnLines}=require('./pdf-layout');
function paddleResult(result) {
  const positioned=result.lines.map(line=>{
    const [x,y,right,bottom]=line.box,height=bottom-y;
    return {text:line.text,xMin:x,xMax:right,y:result.height-bottom,height,confidence:line.confidence*100,bbox:{x0:x,y0:y,x1:right,y1:bottom}};
  });
  // Use the existing column-aware layout pass instead of interleaving left/right rows.
  positioned.sort((a,b)=>b.y-a.y||a.xMin-b.xMin);
  const ordered=hasTwoColumnLayout(positioned,result.width)?orderTwoColumnLines(positioned,result.width):positioned;
  const lines=ordered.map(({text,bbox,confidence})=>({text,bbox,confidence}));
  const confidence=result.lines.length?result.lines.reduce((sum,line)=>sum+line.confidence,0)/result.lines.length*100:0;
  return {confidence,blocks:[{paragraphs:[{lines}]}]};
}
module.exports={paddleResult};
