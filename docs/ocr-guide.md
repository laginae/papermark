# Choosing an OCR engine

[简体中文](ocr-guide.zh-CN.md)

PaperMark defaults to local processing. Open **Which OCR should I choose?** in the recognition area or **How to use** for the same concise guide in English or Chinese.

| Engine | When to try it | Processing and setup |
| --- | --- | --- |
| Built-in Tesseract, the default | Clear printed pages; start here when you want no setup. | Local, in the browser or Obsidian. |
| Paddle Tiny | Favor speed and lower resource use. Check important text against the scan. | Local, using the separately configured Cozy OCR helper in Windows desktop Obsidian. |
| Paddle Small | Favor text quality. Once configured, try this local option on a few representative pages. | Local, using the same optional Cozy OCR helper. |
| MinerU | Try when local results are insufficient or layouts are complex, if uploading is acceptable. | Online. Your own MinerU Token and a local connection helper are required. The whole PDF is uploaded only after per-document confirmation. Quotas or charges may apply. |

These are selection tips, not a universal accuracy ranking. Earlier Tesseract/MinerU comparisons used four synthetic pages; the prior Paddle comparison used a different ten-page set. They do not support a four-engine ranking or a general accuracy percentage. See the [verification scope](verification.md#ocr-comparison) and [Paddle setup](obsidian.md#optional-paddle-ocr-on-desktop). Compare text errors, bookmark titles and destinations, text-selection alignment and processing time on representative pages. Tables, formulas, handwriting and poor scans need particular care.

## Searchable text and bookmarks

All four engines can supply recognized text for searchable PDF export and bookmark detection. With **Export searchable PDF** enabled, exporting adds an invisible text layer to eligible scan pages while preserving the original page images and current bookmarks. Text becomes searchable and copyable in a PDF reader. The canvas preview in PaperMark is for checking the page and bookmark positions.

In MinerU mode, the service returns recognized text and layout. PaperMark prepares and writes the PDF text layer locally; this does not make the preceding online recognition local. The entire PDF still leaves your device after confirmation. Local OCR line positions improve alignment where available; paragraph-only results use approximate positions. Existing PDF text layers are retained, so reopen the original scan to correct an old OCR layer.

## Two separate helpers

The **Paddle helper** performs recognition locally and is started by the desktop plugin only when needed. The **MinerU helper** connects the page to the online MinerU service. Configuring one does not configure or connect the other.

The MinerU panel keeps its connection status visible throughout setup, recognition and result review. It distinguishes not connected, connecting, checking, connected and connection lost. Downloading or starting a helper alone does not connect the page, and a connected helper does not validate a MinerU Token or grant permission to upload.

The connection is retained only in the current page's memory across mode and document changes. It is checked again on returning to online mode, and about every 30 seconds while the page is visible, idle and online; returning to the page also checks it. **Check connection** performs only a local health check, without a Token or PDF. A failed check clears the Token and upload consent and returns to connection setup. Changing the document or mode also clears the Token and consent.

**Disconnect** clears the connection from this page but leaves the helper program running. Refreshing or closing the page requires connecting again. The connection code and Token are never saved in browser storage or plugin settings. To stop the helper itself, use its control page or close the program. See the [MinerU guide](mineru.md).
