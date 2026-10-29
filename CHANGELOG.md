# Changelog

## 0.3.0

- Replaced the language menu with English / 中文 buttons, available during processing and usable with keyboard navigation.
- Added local OCR for scanned PDFs, with bundled English and Simplified Chinese models, automatic scan detection, cancellation and manual retry.
- Kept PDF images unchanged; OCR creates reviewable bookmark candidates with page destinations, without adding a text layer.
- Hosted OCR resources are loaded from the same site and hash-verified; no PDF bytes, filenames or OCR text are uploaded. The standalone HTML embeds all OCR resources for offline use.
- Added OCR layout tests, synthetic scan fixtures and independent exported-PDF checks.

## 0.2.0

- English is now the default interface language.
- Added a language selector for English and Simplified Chinese, with a locally saved preference.
- Localized help, controls, accessibility labels, detection messages, validation and export feedback.
- Switching languages preserves the current PDF, bookmarks, selection and edits.
- Added translation coverage and language-switch regression checks.
- Updated PDF.js to 6.4.299, beyond the affected versions in [GHSA-hq66-cqwq-w95j](https://github.com/advisories/GHSA-hq66-cqwq-w95j).
- First public GitHub release, with offline HTML and source packages.

## 0.1.0

- Initial local prototype: PDF heading detection, outline editing, page preview and offline export.
