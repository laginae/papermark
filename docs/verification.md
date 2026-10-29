# Verification for 0.3.0

The release was checked with synthetic PDFs. No personal research papers are included in the repository or release archives.

## Automated checks

`npm run fixtures` followed by `npm test` passes 24 tests covering heading recognition, nested sections, existing bookmarks, destination validation, rotated/cropped pages, preserved annotations, file naming, signature/restriction handling, both interface languages and OCR layout conversion.

Language checks cover the English default, stored preference, unavailable browser storage, translation key/placeholder completeness, document language and accessible labels. Switching static text preserves input values and file inputs. Validation errors and legacy outline reasons can be translated again after a language change.

## Browser checks

Checked the hosted build and the single-file HTML in Windows Chrome:

- English starts by default even with a Chinese browser locale.
- Clicking the English / 中文 buttons, keyboard activation and switching while OCR is running update the interface. Reloading restores the chosen language.
- A pending Unicode title edit is committed and survives switching languages.
- A four-page text PDF produces nine bookmarks without downloading OCR resources. Existing bookmarks are preserved, and an unchanged document exports byte-for-byte identically.
- A four-page image-only PDF (two English pages and two Chinese pages) produces the expected nine headings. An independent pypdf readback confirms their page destinations and nesting; all page content streams and embedded image bytes match the original, and no text layer is added.
- Canceling OCR at the start of page two keeps page one's two bookmarks. Continuing with the network disabled recognizes the remaining pages and restores all nine candidates.
- In a fresh browser context, with the network disabled before opening the standalone HTML, a two-page Chinese scan produces four expected headings and exports successfully. No HTTP requests occur. Independent readback confirms unchanged images/content and valid outline destinations.
- On the hosted build, the first OCR operation downloads only the fixed same-origin OCR resource JSON with GET and no request body. No file content, filenames or recognized text are sent. The resource is about 10 MB, and its expected SHA-256 is embedded in the application.
- Blocking the resource request produces a translated retry message and leaves manual bookmark editing and the OCR retry control available.
- Welcome and editor layouts have no document-level horizontal overflow at a 390-pixel viewport. PDF previews can be scrolled.
- Scanned-page and resource-failure notices update when the language changes.

These checks do not establish accuracy on every paper layout or full compatibility with every browser/operating system. Other desktop operating systems and mobile file-opening behavior were not verified for this release.

The image-only fixture can be reproduced after `npm run fixtures` using `python scripts/ocr-chinese-fixture.py` (Pillow, reportlab and a supported Chinese font required), then `node scripts/ocr-fixtures.cjs`. Generated PDFs stay under the ignored `qa/fixtures/` directory. The fixtures use upright, legible print and do not measure OCR quality on degraded scans.

## Publication checks

The publication allowlist contains source, tests, build scripts, documentation, reviewed empty-interface screenshots, licenses, both built HTML variants and the OCR resource bundle. It excludes dependencies, generated test PDFs, browser profiles, logs, local configuration, temporary files and private diagnostics.

`npm run audit:public` checks common absolute-path, private-address and credential patterns, UTF-8 decoding, screenshot metadata, dependency registry URLs and all three build hashes. This is a bounded publication check, not a comprehensive security audit. Required upstream license notices retain their public author information. `npm audit` reported zero known dependency vulnerabilities at release verification.

`npm run package` reopens each ZIP, checks paths and publication patterns, and compares every archived file with its source bytes. SHA-256 checksums are included with the release assets.
