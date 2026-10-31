# Scanned book contents

[简体中文](book-contents.zh-CN.md)

PaperMark 0.9 adds a local **Book contents pages** workflow, alongside the existing paper-heading detector. It reads a book's printed table of contents; it does not invent a contents list for a book without one. English and Chinese UI are available in the browser, offline HTML and Obsidian plugin.

1. Add a PDF and select **Book contents pages** under Local recognition. Enter the actual PDF pages containing the contents, for example `2-4, 6`. If needed, expand **Not sure where the contents are?** to search the first 10, 20 or 40 pages. Check the proposed range, then choose **Read contents**.
2. Choose **Auto-calibrate pages**. PaperMark matches printed page labels and unique body titles. It uses existing text first, then the selected local OCR engine for scanned pages. Obsidian desktop supports the configured Paddle Small/Tiny helper; the browser uses bundled Tesseract. No PDF, image or recognized text is uploaded.
3. Review the draft. Edit titles, levels, printed page labels or destination PDF pages. Use **Source** and **Destination** to inspect the preview. Mark included entries as **Checked**, or remove their Include checkmark. The bulk confirmation is an explicit statement that you have checked all suggested destinations. Unresolved entries still require a page or exclusion.
4. Choose **Apply checked contents**, then export a new PDF. By default the new entries are appended, retaining current bookmarks; applying an identical outline block again does not duplicate it. **Replace the current bookmark list** is an explicit option; Apply can be undone using the bookmark editor's Undo button. Existing images and annotations are retained.

## Calibration and review

- PDF pages count every sheet from 1, including covers and inserts. Printed page labels may use Arabic numbers (`12`), Roman front matter (`iv`) or chapter-local numbers (`II-12`, `A-3`). These families are calibrated separately.
- Single- and two-column layouts are supported, including separate title/page-number boxes and simple wrapped titles. Numbering and indentation determine proposed levels. Hierarchy remains editable; ambiguous or corrected levels need review. Use the column selector if automatic splitting is wrong.
- Auto-calibration samples up to 40 PDF pages, then up to 40 pages near proposed destinations. It is not an exhaustive scan of every page in a long book. Each page is reused once its OCR is available. An optional PDF range (up to 40 pages) lets you inspect another region on the next calibration.
- Page-offset inference requires evidence from at least two pages. Different offsets can describe different book segments. Conflicting evidence or an uncertain gap between segments is left unresolved. Extrapolated offsets are labeled as estimates; every entry still requires review.
- For manual correction, enter a known pair, such as printed `1` → PDF `9`, then **Add page anchor**. This affects unconfirmed entries from that printed number onward, within the same numbering family. Add another pair after an insertion or omission. Confirmed rows and individually assigned destinations stay unchanged. Uncheck a confirmation to recalculate an automatic result; edit its PDF page for a direct correction.
- Re-reading contents replaces only the current draft. It leaves the applied bookmark list intact. Drafts remain in memory per loaded document and survive language/file switching, but not page reload or closure. Save the applied outline as JSON or export the PDF before closing.

## Searchable text and limits

Only pages actually processed by OCR gain a text layer. To search and copy throughout a scanned book, expand **Local OCR options**, choose **All pages**, run OCR, and keep **Export searchable PDF** enabled. Original or manually edited bookmarks are retained by this OCR action. The preview is a canvas; search and select text in the exported PDF reader.

Blurry scans, decorative type, complex multi-column layouts, uncommon numbering, repeated printed-number sequences and missing contents page numbers can need manual correction. The automated checks use synthetic English/Chinese scans, not a representative accuracy benchmark for all books. Existing limits still apply: 100 MB / 2,000 pages per PDF and 1,000 bookmarks. Large scans consume substantial memory. Cancellation keeps completed OCR pages but does not apply a partial draft.

## Implementation references

This is an independent JavaScript implementation informed by the MIT-licensed [TOC Forge](https://github.com/electroniccc/toc_forge) (`parsing.py`, `page_map.py`) and [pdf-toc-ocr](https://github.com/ennheng/pdf-toc-ocr) (`app/core.py`). The reference ideas are geometry-based line reconstruction, numbering/indentation hierarchy, separate page-number families and offset evidence. Their Python applications and optional online models are not runtime dependencies of PaperMark. No online model is used by this workflow.
