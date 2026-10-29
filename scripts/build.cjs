'use strict';
const esbuild = require('esbuild');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8').replace(/\r\n?/g, '\n');
const pkg = JSON.parse(read('package.json'));
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
  for (const pkg of ['pdfjs-dist','pdf-lib','fflate','@pdf-lib/standard-fonts','@pdf-lib/upng','pako','tslib']) {
    const base = path.join(root,'node_modules',pkg);
    if (!fs.existsSync(base)) continue;
    for (const name of fs.readdirSync(base).filter(name => /^(LICENSE|COPYING)/i.test(name))) {
      if (!fs.statSync(path.join(base,name)).isFile()) continue;
      fs.writeFileSync(path.join(root,'licenses', pkg.replaceAll('/','-').replace('@','') + '-' + name + '.txt'), fs.readFileSync(path.join(base,name),'utf8').replace(/\r\n?/g,'\n'));
    }
  }
  for (const filename of fs.readdirSync(path.join(root,'licenses')).sort()) licenseTexts.push(filename + '\n' + read('licenses/' + filename));
  const result = await esbuild.build({ entryPoints: [path.join(root,'src/app.js')], bundle: true, write: false,
    format: 'iife', platform: 'browser', target: 'es2022', minify: true, legalComments: 'inline',
    define: { __APP_VERSION__: JSON.stringify(pkg.version) },
    plugins: [{ name: 'embed-pdf-runtime', setup(build) {
      build.onResolve({ filter: /^embedded-(worker|resources)$/ }, args => ({ path: args.path, namespace: 'embedded' }));
      build.onLoad({ filter: /.*/, namespace: 'embedded' }, args => ({
        contents: `export default ${JSON.stringify(args.path === 'embedded-worker' ? worker.outputFiles[0].text : resources)}`, loader: 'js' }));
    } }] });
  // The replacement callback avoids interpreting dollar sequences in bundled code.
  let html = read('src/index.html').replace('/* APP_STYLES */', () => read('src/styles.css'))
    .replaceAll('{{VERSION}}', pkg.version)
    .replace('/* THIRD_PARTY_LICENSES */', () => escapeHtml(licenseTexts.join('\n\n')))
    .replace('/* APP_SCRIPT */', () => result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script'));
  fs.mkdirSync(path.join(root,'dist'), { recursive: true });
  fs.writeFileSync(path.join(root,'dist/PaperMark.html'), html, 'utf8');
  const manifest = { app: 'PaperMark', version: pkg.version, bytes: Buffer.byteLength(html),
    sha256: crypto.createHash('sha256').update(html).digest('hex'), offlineResources: Object.keys(resources).length,
    dependencies: JSON.parse(read('package.json')).dependencies };
  fs.writeFileSync(path.join(root,'dist/build-manifest.json'), JSON.stringify(manifest,null,2) + '\n');
  console.log(JSON.stringify(manifest,null,2));
})().catch(error => { console.error(error); process.exitCode = 1; });
