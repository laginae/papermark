# Verification for 0.6.0

The release was checked with synthetic PDFs. No personal research papers are included in the repository or release archives.

## Automated checks

`npm run fixtures` followed by `npm test` passes 37 tests covering heading recognition, nested sections, existing bookmarks, destination validation, rotated/cropped pages, preserved annotations, file naming, signature/restriction handling, both interface languages, OCR layout conversion and searchable export.

Language checks cover the English default, stored preference, unavailable browser storage, translation key/placeholder completeness, document language and accessible labels. Searchable export tests cover PDF text extraction, unchanged rendered pixels, retained outlines and annotations, 0/90/180/270-degree rotations with crop offsets, duplicate-layer prevention, disabled text layers, no-heading export and explicitly cleared bookmarks. Chinese spacing normalization retains English word spaces.

New checks cover small-angle deskewing, rejection of body sentences as OCR headings, paired-helper origin/host/connection-code/consent enforcement, bounded ZIP extraction, outbound destination validation, document fingerprints, page geometry, numeric MinerU heading hierarchy and invisible Chinese/English text layers.

## OCR comparison

The recognition/export algorithms are unchanged in 0.6.0. The following comparison was made for 0.5.0; 0.6.0 changes the connection helper and usage instructions.

A fixed four-page synthetic comparison uses clean/degraded English two-column and Chinese single-column pages. Degradation reduces resolution to 100 DPI, rotates 1.2 degrees, blurs, reduces contrast and uses JPEG compression. Character errors are Levenshtein distance after whitespace removal and Unicode normalization.

| Page | Local 0.4.0 errors | Local 0.5.0 errors | MinerU text errors |
| --- | ---: | ---: | ---: |
| English, clean | 0 / 833 | 0 / 833 | 0 / 833 |
| English, degraded | 3 / 833 | 2 / 833 | 0 / 833 |
| Chinese, clean | 2 / 340 | 0 / 340 | 0 / 340 |
| Chinese, degraded | 13 / 340 | 12 / 340 | 0 / 340 |

At default sensitivity, 0.4.0 produced 16 correct headings and 9 body-text false positives; 0.5.0 and the MinerU result each produced 16 correct headings and no false positives on these pages. MinerU was tested through the official API with `model_version: vlm`; returned metadata identified backend `hybrid`, version `3.4.4`. These small synthetic samples do not establish accuracy on arbitrary papers, handwriting, formulas or tables. The degraded Chinese page still has local OCR errors.

## Browser checks

Checked the hosted build and the single-file HTML in Windows Chrome:

- English starts by default even with a Chinese browser locale.
- The English / 中文 buttons work during OCR. A pending Unicode bookmark edit survives switching and another manual OCR pass.
- A four-page image-only PDF produces the expected nine headings and exports a searchable PDF with the network disabled. Disabling searchable export yields a bookmark-only file without text.
- A two-page Chinese scan with an existing outline keeps its original parent/child bookmarks and annotation. In a fresh browser context, the standalone HTML performs OCR and searchable export with the network disabled before first open; no HTTP requests occur.
- Independent pypdf and Poppler extraction recover English sentences and continuous Chinese headings. An independent PDF.js reader finds “第一章绪论”; selecting, copying and pasting it returns exactly the same text.
- Poppler renders of the original and searchable pages are pixel-identical. Original image bytes, page boxes, rotations, annotations and original bookmark destinations are independently checked. Text is added in a separate invisible form; the original image is not regenerated.
- A mixed text/scan document receives a text layer on its scan page only. Reopening and exporting the result without edits is byte-identical.
- The hosted build downloads only the fixed same-origin OCR resource JSON with GET and no request body during OCR. No file content, filenames or recognized text are sent. The resource remains about 10 MB, with its expected SHA-256 embedded in the application.
- The updated welcome controls have no document-level horizontal overflow at a 390-pixel viewport.

Additional 0.5.0 checks:

- MinerU is initially off and both credential fields are empty. Disabling it clears the Token and connection code. Only the language preference is stored. Declining the per-document confirmation sends no PDF request.
- A real four-page synthetic upload, polling, result application, result saving and searchable export completed through the paired helper. The Token field was cleared on submission; the saved result contains no credentials.
- Importing that saved result while offline preserves a manually edited outline and does not upload the document.
- An independent PDF.js reader finds “第一章绪论” in the MinerU export; selection and clipboard paste return exactly that text. Independent pypdf extraction verifies the comparison text above.
- The local and MinerU exports retain original image bytes, content streams, page boxes and rotations. The checked Poppler render is pixel-identical.
- The standalone 0.5.0 HTML completes local OCR and export with the browser offline before first open, retaining a two-page Chinese scan's original parent/child bookmarks and annotation.

Optional MinerU processing requires a local Node.js connection helper because the official API's cross-origin restrictions prevent direct browser calls. Browser local-network policy may require permission. No public proxy or shared Token is provided. Platforms without the helper can use local OCR or saved-result import. Search selection is approximate where only paragraph boxes are returned; existing PDF text layers are retained, so improving an old OCR layer requires reopening the original scan.

These checks do not establish accuracy on every paper layout or full compatibility with every browser/operating system. Other desktop operating systems and mobile file-opening behavior were not verified for this release.

The basic image-only fixture can be reproduced after `npm run fixtures` using `python scripts/ocr-chinese-fixture.py` (Pillow, reportlab and a supported Chinese font required), then `node scripts/ocr-fixtures.cjs`. Generated PDFs stay under the ignored `qa/fixtures/` directory. Those basic fixtures use upright, legible print; the separate comparison above includes degraded pages. OCR text can contain errors, and selection/reading order is approximate for complex layouts; the original scan remains the source to check.

## Windows helper and setup checks in 0.6.0

- The packaged Windows x64 executable runs from a directory containing only that EXE, including spaces and Chinese characters, with Node.js removed from the process search path. Its embedded-runtime self-test creates/reopens a PDF and extracts a bounded ZIP result.
- The embedded runtime is Node.js 24.22.2, obtained from the official distribution. Both the runtime ZIP and original executable match the pinned upstream SHA-256 values. The app uses Node.js SEA with no snapshot/code cache. The invalidated upstream signature is removed; the application is explicitly unsigned, not represented as signed by Node.js.
- A browser copies the connection code, switches the local control page between English and Chinese, and connects the packaged program to the hosted PaperMark page. The API Token field remains empty. The control page does not collect API Tokens or upload PDFs.
- Repeated program launch detects the existing helper. Authenticated Stop closes the listening server and exits the native process with code 0; the control page clears its connection code. Tests reject unauthenticated stop requests, foreign origins and shutdown from the hosted app origin.
- The control page rejects cross-origin reads and framing, has no external assets or browser storage, and does not put the connection code in outgoing URLs. Existing per-file consent and Token forwarding tests continue to pass.
- The web page defaults to English with MinerU off. Its five-step guide opens when the mode is enabled, provides the Windows ZIP link, and translates without losing inputs. Both pages have no document-level horizontal overflow at 390 pixels.
- The native ZIP is reopened and every member byte-compared to its inputs. It includes the EXE, bilingual start instructions, license notices and build provenance. It is also checked against the private credential values without printing them. Remote release digests and website files are compared to the audited local outputs.

These are Windows Chrome and Windows x64 checks. macOS/Linux native apps, Windows ARM64, mobile execution of the helper, code-signing trust and organization-specific execution policies are not verified. The existing script helper remains available for other desktop systems with Node.js.

## Publication checks

The publication allowlist contains source, tests, build scripts, documentation, reviewed empty-interface screenshots, licenses, both built HTML variants, the OCR resource bundle and the standalone helper. It excludes dependencies, generated test PDFs, browser profiles, logs, local configuration, temporary files and private diagnostics.

`npm run audit:public` checks common absolute-path, private-address and credential patterns, UTF-8 decoding, screenshot metadata, dependency registry URLs and all four build hashes. The specific private test credentials are also compared against public files and release members without logging their values. This is a bounded publication check, not a comprehensive security audit. Required upstream license notices retain their public author information.

`npm run package` reopens each ZIP, checks paths and publication patterns, and compares every archived file with its source bytes. SHA-256 checksums are included with the release assets.
