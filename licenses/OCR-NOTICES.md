# OCR components

- Tesseract.js 7.0.0 and tesseract.js-core 7.0.0 use Apache-2.0. Their license texts and the browser worker's bundled notices are included here.
- English and Simplified Chinese models are the `4.0.0_best_int` files from `@tesseract.js-data/eng@1.0.0` and `@tesseract.js-data/chi_sim@1.0.0`, installed through the locked npm packages. The package metadata declares MIT; the upstream trained data in [naptha/tessdata](https://github.com/naptha/tessdata) is distributed under Apache-2.0. `tessdata-LICENSE.txt` preserves that upstream license. Model files are bundled without modification.
- The browser worker includes buffer (MIT), ieee754 (BSD-3-Clause), regenerator-runtime (MIT) and zlib.js (MIT); their notices/license texts are preserved.
- PaperMark concatenates the portable LSTM core and browser worker, removes the worker source-map reference, and inserts a local resource resolver. That resolver supplies the bundled models from memory and rejects unexpected network access. The recognition engine and trained models are not retrained or otherwise altered.
- Searchable export reuses the engine's text-only PDF and embedded Unicode font. For pages containing Chinese, PaperMark places normalized OCR lines over their recognized bounds and adjusts the font's declared character advances. The resulting invisible text is embedded over the original PDF; source page images are not regenerated.

License sources: the installed upstream packages, [trained data license](https://github.com/naptha/tessdata/blob/gh-pages/LICENSE), [buffer license](https://github.com/feross/buffer/blob/master/LICENSE), and [ieee754 license](https://github.com/feross/ieee754/blob/master/LICENSE).
