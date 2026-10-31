# PaperMark for Obsidian

[简体中文](obsidian.zh-CN.md)

PaperMark opens a PDF workspace inside Obsidian. It merges images into PDFs, adds searchable local OCR text, and detects and edits bookmarks. The interface starts in English and can be switched to Chinese. The original files are kept.

## Install

1. Download **PaperMark-0.9.1-obsidian.zip** from the [0.9.1 release](https://github.com/laginae/papermark/releases/tag/0.9.1).
2. Extract the `papermark` folder into your vault's `.obsidian/plugins/` folder. It must contain `main.js`, `manifest.json` and `styles.css` directly, without an extra nested folder.
3. Restart Obsidian or reload its plugins, then enable **PaperMark** under **Settings → Community plugins**.
4. Click the PaperMark ribbon icon or run **PaperMark: Open workspace** from the command palette.

This is a manually installed plugin release, not an approved Obsidian community-directory entry. No Node.js installation is needed. PDF rendering, built-in OCR and English/Chinese recognition data are bundled in the plugin; they do not download on first use.

## Images to a searchable PDF

1. Click **Images → PDF**. Choose vault images or add JPG, PNG or WebP images from your device. You can also select multiple images in Obsidian's file explorer and choose **Merge selected images with PaperMark** from the context menu.
2. Move images up/down, rotate them, or sort by filename. Each image becomes one page. Choose image-sized pages or A4, then **Create PDF & open editor**.
3. Click **Recognize & create bookmarks**. Built-in local OCR is ready to use. Under **Local OCR options**, select the recognition language or optional Paddle engine before starting.
4. Review and edit the bookmarks. Keep **Export searchable PDF** enabled, then **Export PDF** and choose a vault folder and filename. If the name exists, a numbered copy is saved.

To merge without OCR, export immediately after creating the PDF. To edit an existing PDF, use **Add PDFs**, the file-explorer context menu, or **Add PDFs from device**. All existing outline editing, undo, outline JSON, MinerU result import/export and batch ZIP features remain available. Device imports stay in memory until you explicitly save an output.

Search and copy text in the **exported PDF**, using Obsidian's PDF reader or another PDF reader. The PaperMark preview is a canvas for checking pages and bookmark positions. OCR does not replace the page image. Existing text layers are not duplicated or repaired; existing and manually edited bookmarks are retained until you choose to rebuild them.

## Scanned book contents

Select **Book contents pages**, read the printed contents, calibrate page numbers, then review and apply the draft. This uses your chosen local engine, including Paddle Small. Existing bookmarks are kept by default. See the [book contents guide](book-contents.md) for manual page anchors, inserted-page handling and whole-book searchable text.

## Optional Paddle OCR on desktop

The built-in Tesseract engine is the default. PaperMark can also use the **Cozy OCR helper**, based on [SimdPaddleOCR](https://github.com/sdcb/SimdPaddleOCR). **Small** favors recognition quality; **Tiny** favors speed. A prior comparison on ten synthetic printed-text pages favored Small for body text; this is not a guarantee for your scanned papers, tables or equations. Check important quotations against the image.

For Windows x64:

1. Download `cozy-ocr-helper-windows-x64.zip` from [Cozy Read Aloud 1.4.0](https://github.com/laginae/note-reader-cosyvoice/releases/tag/1.4.0). Keep its entire extracted folder together, including models and runtime files.
2. In **Settings → PaperMark**, enter the full path to `CozyOcr.exe`. Use a trusted copy: the plugin will execute this file on your computer.
3. In the workspace, open **Local OCR options → Local OCR engine** and choose **Paddle Small** or **Paddle Tiny**, then run OCR. No separate manual launch is necessary.

The helper starts only for a Paddle OCR task. Pixels pass through local process pipes; no PDF upload, API Token or listening network service is needed. It is stopped after recognition, cancellation or workspace closure. Allow several hundred MB of additional memory. The settings store the executable path and preferred OCR engine; documents and recognized text are not saved in plugin settings.

The helper is optional and separate from the **MinerU helper**. The Windows helper does not run on macOS/Linux. Native helper builds for those systems require separate validation; use built-in OCR there for now. The Obsidian plugin is desktop-only because its native OCR adapter uses desktop APIs. The standalone browser edition remains available on other devices.

## Privacy and compatibility

- Default processing stays on the device. The plugin has no analytics and no automatic document uploads.
- MinerU remains opt-in. It needs your own Token and the existing local MinerU connection helper. Each document requires explicit whole-PDF upload consent. Use the PaperMark 0.8.0 helper or newer for the Obsidian origin. Token handling and saved-result imports work as in the browser version; see the [MinerU guide](mineru.md).
- Only selected files are read. Export prompts for a vault destination and never intentionally overwrites an existing file. If your vault is synced by another application, that application's sync also applies to saved outputs.
- Language, export-folder and OCR-engine preferences, and the optional helper executable path, are saved in Obsidian's plugin settings. Tokens and document contents are not.
- Closing/reloading the workspace discards unsaved files and edits. Export your PDF or outline JSON first. Changing the language in the workspace preserves edits; settings changes apply when a workspace is reopened.
- PDF limits: 20 files, 100 MB per file, 250 MB total and 2,000 pages per PDF. Images: 100 files, 20 MB and 25 megapixels per image, 200 MB total. Large scans may be slow or exceed available memory.
- Verified on Windows x64 with Obsidian 1.14.4 and in Chrome. The core uses Obsidian's portable vault APIs; macOS and Linux have not been device-tested for this release. Minimum declared Obsidian version: 1.8.7.

## Build

Run `npm ci`, `npm test` and `npm run build`. The plugin's three installation files are written to `dist/obsidian/`. `npm run package` also produces the plugin ZIP and individual files for releases. The shared offline application is embedded in `main.js`, so the standard three-file installation remains self-contained. The optional native OCR adapter is adapted from Cozy Read Aloud under the MIT license; its attribution is included in the embedded license panel and source package.
