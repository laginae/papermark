'use strict';
const defaults={language:'en',exportFolder:'PaperMark',paddleExecutable:'',ocrEngine:'builtin'};
function localOcrEngine(value,desktop=true){return desktop&&['small','tiny'].includes(value)?value:'builtin';}
module.exports={defaults,localOcrEngine};
