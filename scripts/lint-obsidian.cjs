'use strict';
// The host adapter is plain JavaScript. The standalone app runs in its own
// iframe and intentionally uses browser DOM APIs, not Obsidian UI helpers.
(async()=>{
  const {ESLint}=require('eslint');
  const {default:obsidian}=await import('eslint-plugin-obsidianmd');
  const eslint=new ESLint({overrideConfigFile:true,overrideConfig:[{
    files:['src/obsidian/**/*.js'],
    plugins:{obsidianmd:obsidian},
    rules:{...obsidian.ruleConfigs.recommended,
      'obsidianmd/ui/sentence-case':['warn',{brands:['PaperMark','CozyOcr','Paddle Small','Paddle Tiny']}],
      // Retain display() for the declared Obsidian 1.8.7 minimum.
      'obsidianmd/settings-tab/prefer-setting-definitions':'off'
    }
  },{
    files:['src/obsidian/native/**/*.js'],
    // The native adapter is also exercised directly in Node.js, without a DOM.
    rules:{'obsidianmd/prefer-window-timers':'off'}
  }]});
  const results=await eslint.lintFiles(['src/obsidian/**/*.js']);
  const output=(await eslint.loadFormatter('stylish')).format(results);
  if(output)console.log(output);
  if(results.some(result=>result.errorCount||result.warningCount))process.exitCode=1;
  else console.log('Obsidian JavaScript guideline checks passed.');
})().catch(error=>{console.error(error.message);process.exitCode=1;});
