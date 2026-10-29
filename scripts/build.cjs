'use strict';
const esbuild = require('esbuild');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8').replace(/\r\n?/g, '\n');
const pkg = JSON.parse(read('package.json'));
const {JSDOM}=require('jsdom');
const {setLanguage,translateDom}=require('../src/i18n');
const escapeHtml = text => text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
(async () => {
  const worker = await esbuild.build({ entryPoints: [path.join(root, 'node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs')],
    bundle: true, format: 'iife', minify: true, write: false, platform: 'browser', target: 'es2022', legalComments: 'inline' });
  const resources = {}, licenseTexts = [];
  for (const [directory, kind] of [['cmaps','cMapUrl'],['standard_fonts','standardFontDataUrl'],['wasm','wasmUrl']]) {
    const base = path.join(root, 'node_modules/pdfjs-dist', directory);
    for (const name of fs.readdirSync(base).sort()) {
      if (/^LICENSE/i.test(name)) {
        const text = fs.readFileSync(path.join(base,name), 'utf8').replace(/\r\n?/g, '\n');
        fs.writeFileSync(path.join(root, 'licenses', `pdfjs-${directory}-${name}.txt`), text);
      } else if (!/\.js$/.test(name)) resources[`${kind}/${name}`] = fs.readFileSync(path.join(base,name)).toString('base64');
    }
  }
  for (const pkg of ['pdfjs-dist','pdf-lib','fflate','@pdf-lib/standard-fonts','@pdf-lib/upng','pako','tslib','tesseract.js','tesseract.js-core','regenerator-runtime','zlibjs','idb-keyval','wasm-feature-detect','is-url']) {
    const base = path.join(root,'node_modules',pkg);
    if (!fs.existsSync(base)) continue;
    for (const name of fs.readdirSync(base).filter(name => /^(LICENSE|COPYING)/i.test(name))) {
      if (!fs.statSync(path.join(base,name)).isFile()) continue;
      fs.writeFileSync(path.join(root,'licenses', pkg.replaceAll('/','-').replace('@','') + '-' + name + '.txt'), fs.readFileSync(path.join(base,name),'utf8').replace(/\r\n?/g,'\n'));
    }
  }
  fs.copyFileSync(path.join(root,'node_modules/tesseract.js/dist/worker.min.js.LICENSE.txt'), path.join(root,'licenses/tesseract-worker-NOTICES.txt'));
  for (const filename of fs.readdirSync(path.join(root,'licenses')).sort()) licenseTexts.push(filename + '\n' + read('licenses/' + filename));
  const ocr=require('./ocr-resources.cjs')(root), ocrJson=JSON.stringify(ocr);
  const ocrHash=crypto.createHash('sha256').update(ocrJson).digest('hex'), ocrFile=`ocr-resources-${ocrHash.slice(0,12)}.json`;
  fs.mkdirSync(path.join(root,'dist'), { recursive: true });
  for(const filename of fs.readdirSync(path.join(root,'dist'))) if(/^ocr-resources-[a-f0-9]{12}\.json$/.test(filename) && filename!==ocrFile) fs.unlinkSync(path.join(root,'dist',filename));
  fs.writeFileSync(path.join(root,'dist',ocrFile),ocrJson);
  const dom=new JSDOM(read('src/index.html'));setLanguage('en');translateDom(dom.window.document);
  const template=dom.serialize();dom.window.close();
  async function buildHtml(standalone) {
  const result = await esbuild.build({ entryPoints: [path.join(root,'src/app.js')], bundle: true, write: false,
    format: 'iife', platform: 'browser', target: 'es2022', minify: true, legalComments: 'inline',
    define: { __APP_VERSION__: JSON.stringify(pkg.version) },
    plugins: [{ name: 'embed-pdf-runtime', setup(build) {
      build.onResolve({ filter: /^embedded-(worker|resources|ocr)$/ }, args => ({ path: args.path, namespace: 'embedded' }));
      build.onLoad({ filter: /.*/, namespace: 'embedded' }, args => ({
        contents: `export default ${JSON.stringify(args.path === 'embedded-worker' ? worker.outputFiles[0].text : args.path==='embedded-resources' ? resources : {data:standalone ? ocr : null,file:ocrFile,sha256:ocrHash})}`, loader: 'js' }));
    } }] });
  // The replacement callback avoids interpreting dollar sequences in bundled code.
  return template.replace('/* APP_STYLES */', () => read('src/styles.css')+'\n'+read('src/mineru.css'))
    .replaceAll('{{VERSION}}', pkg.version)
    .replace('/* STARTUP_SCRIPT */', () => read('src/startup.js'))
    .replace('/* THIRD_PARTY_LICENSES */', () => escapeHtml(licenseTexts.join('\n\n')))
    .replace('/* APP_SCRIPT */', () => result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script'));
  }
  const html=await buildHtml(true), web=await buildHtml(false);
  fs.writeFileSync(path.join(root,'dist/PaperMark.html'), html, 'utf8');
  fs.writeFileSync(path.join(root,'dist/index.html'), web, 'utf8');
  await esbuild.build({entryPoints:[path.join(root,'scripts/mineru-helper.cjs')],bundle:true,platform:'node',format:'cjs',target:'node22',minify:true,legalComments:'inline',outfile:path.join(root,'dist/PaperMark-MinerU-helper.cjs')});
  const helper=fs.readFileSync(path.join(root,'dist/PaperMark-MinerU-helper.cjs'));
  const manifest = { app: 'PaperMark', version: pkg.version, bytes: Buffer.byteLength(html),
    sha256: crypto.createHash('sha256').update(html).digest('hex'), offlineResources: Object.keys(resources).length,
    dependencies: pkg.dependencies,
    helper:{file:'PaperMark-MinerU-helper.cjs',bytes:helper.length,sha256:crypto.createHash('sha256').update(helper).digest('hex')},
    web:{file:'index.html',bytes:Buffer.byteLength(web),sha256:crypto.createHash('sha256').update(web).digest('hex')},
    ocr:{file:ocrFile,bytes:Buffer.byteLength(ocrJson),sha256:ocrHash} };
  fs.writeFileSync(path.join(root,'dist/build-manifest.json'), JSON.stringify(manifest,null,2) + '\n');
  console.log(JSON.stringify(manifest,null,2));
})().catch(error => { console.error(error); process.exitCode = 1; });
