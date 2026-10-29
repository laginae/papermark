# Changelog

## 0.7.0

- Put adding a PDF first and moved recognition settings into the selected document. Local OCR starts from one primary action; automatic OCR of subsequently added files remains available in advanced options.
- Replaced the long MinerU setup form with three bilingual steps: connect the local helper, enter your own Token, and confirm this document's upload.
- Show the whole-document upload notice, filename and page count before submission. Upload requires an unchecked-by-default consent box and the explicit upload button. File changes, retries and stepping back revoke consent; submission and file/mode changes clear the Token.
- Kept searchable PDF export, original pages and bookmarks, outline editing, manual OCR, result import/save and batch export. Folded troubleshooting and secondary settings; improved narrow-screen access and readable action labels.
- Added interaction tests for consent, asynchronous connections, bilingual state, local imports and recovery.

## 0.6.0

- Added a self-contained Windows 10/11 x64 helper: extract the ZIP and double-click the program, without installing Node.js or entering commands.
- Added a local bilingual control page with connection-code copying, an app link and authenticated shutdown. Duplicate launches reopen the running helper.
- Added visible five-step English/Chinese instructions, connection troubleshooting and clear platform/signature boundaries on the web page.
- Retained the default-off MinerU mode, per-user Tokens, per-document upload confirmation and existing PDF export behavior. No public relay was added.
- Added a pinned, checksum-verified Node.js SEA build, native package provenance and runtime license notices.

## 0.5.0

- Improved local scan preprocessing with higher-resolution recognition, contrast adjustment and bounded deskewing, while retaining the original PDF pages and coordinate mapping.
- Separated OCR heading detection from selectable-text typography, filtering body sentences and retaining numbered headings in conservative mode.
- Added optional MinerU high precision, disabled by default, with an empty per-user API Token field and confirmation before each whole-document upload.
- Added a paired loopback-only connection helper for the static site; no shared Token, public relay or persistent credential storage.
- Added fingerprint-bound result save/import, Unicode searchable text layers, local line-position alignment and retained original/edited outlines.
- Added tests for upload consent, origin/host restrictions, pairing, destination restrictions, result validation, Unicode extraction, unchanged rendering and deskew geometry.

## 0.4.0

- Added searchable PDF export, enabled by default: invisible Unicode OCR text supports search, selection and copying in PDF readers.
- Preserved original images, page dimensions/rotation, annotations and existing bookmarks while adding text layers; manual OCR also keeps edited bookmarks.
- Added automatic OCR for scanned documents that already have outlines, and text-only export when no headings are found.
- Kept existing text pages and reopened PaperMark text layers from receiving duplicate OCR text. The option can be disabled for bookmark-only export.
- Normalized Chinese OCR spacing and retained text positions; added cropped/rotated-page, visual-preservation and export regression tests.

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
