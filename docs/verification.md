# Verification for 0.4.0

The release was checked with synthetic PDFs. No personal research papers are included in the repository or release archives.

## Automated checks

`npm run fixtures` followed by `npm test` passes 28 tests covering heading recognition, nested sections, existing bookmarks, destination validation, rotated/cropped pages, preserved annotations, file naming, signature/restriction handling, both interface languages, OCR layout conversion and searchable export.

Language checks cover the English default, stored preference, unavailable browser storage, translation key/placeholder completeness, document language and accessible labels. Searchable export tests cover PDF text extraction, unchanged rendered pixels, retained outlines and annotations, 0/90/180/270-degree rotations with crop offsets, duplicate-layer prevention, disabled text layers, no-heading export and explicitly cleared bookmarks. Chinese spacing normalization retains English word spaces.

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

These checks do not establish accuracy on every paper layout or full compatibility with every browser/operating system. Other desktop operating systems and mobile file-opening behavior were not verified for this release.

The image-only fixture can be reproduced after `npm run fixtures` using `python scripts/ocr-chinese-fixture.py` (Pillow, reportlab and a supported Chinese font required), then `node scripts/ocr-fixtures.cjs`. Generated PDFs stay under the ignored `qa/fixtures/` directory. The fixtures use upright, legible print and do not measure OCR quality on degraded scans. OCR text can contain errors, and selection/reading order is approximate for complex layouts; the original scan remains the source to check.

## Publication checks

The publication allowlist contains source, tests, build scripts, documentation, reviewed empty-interface screenshots, licenses, both built HTML variants and the OCR resource bundle. It excludes dependencies, generated test PDFs, browser profiles, logs, local configuration, temporary files and private diagnostics.

`npm run audit:public` checks common absolute-path, private-address and credential patterns, UTF-8 decoding, screenshot metadata, dependency registry URLs and all three build hashes. This is a bounded publication check, not a comprehensive security audit. Required upstream license notices retain their public author information. `npm audit` reported zero known dependency vulnerabilities at release verification.

`npm run package` reopens each ZIP, checks paths and publication patterns, and compares every archived file with its source bytes. SHA-256 checksums are included with the release assets.
