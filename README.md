# PaperMark

[简体中文](README.zh-CN.md)

Give research papers a clickable outline. PaperMark detects section headings in PDFs, lets you review and edit the bookmarks, and exports a new PDF. It runs locally in your browser, including without an internet connection.

## Open online or download

**[Open PaperMark in your browser](https://laginae.github.io/papermark/)** — no download or installation required.

Download **PaperMark.html** from the [latest release](https://github.com/laginae/papermark/releases/latest), then open it in a recent desktop browser. No installer, account or server is required. An offline ZIP is also available.

1. Add one or more PDFs. Papers without bookmarks are analyzed automatically.
2. Review the outline against the page preview. Edit titles, nesting, page numbers and positions as needed.
3. Export a PDF, or export available documents together as a ZIP. Open the bookmarks/outline panel in your PDF reader to navigate.

The interface starts in **English**. Choose **简体中文** in the top bar to switch languages. The choice is remembered when browser storage is available. Switching languages preserves the loaded files and edits; it never translates paper text or bookmark titles.

![PaperMark English interface](docs/interface-en.png)

## Features

- English and Chinese heading detection using numbering, font size and page layout.
- Balanced and conservative detection, with uncertain candidates marked for review.
- Page preview, editable nested bookmarks and click-to-position destinations.
- Load existing bookmarks, undo edits and save/load outline JSON for the same original PDF.
- Batch PDF export as ZIP with an export report.
- Single offline HTML file with embedded PDF worker, character maps, fonts and WebAssembly resources.

## Privacy and file handling

PDF processing happens in browser memory. The app has no upload endpoint, telemetry, account system or remote runtime resources. Only the language preference is written to browser storage. Refreshing or closing the page loses loaded files and edits.

The online version downloads the static application from GitHub Pages when you open it. Selecting a PDF does not send its contents or filename to GitHub. Once the app has loaded, PDF processing works even if you disconnect from the network while keeping the tab open. Opening or refreshing the online page may need a connection; use the HTML download for reliable offline access.

Export creates a new file; it does not overwrite the original. Saved outline JSON includes the original filename, SHA-256 fingerprint and bookmarks. Batch reports include filenames and export results. These downloads remain on your device unless you choose to share them.

Adding bookmarks is **not anonymization**: existing PDF metadata, text and annotations remain part of the exported document. Review your files before sharing them.

## Scope and limitations

- Intended for PDFs with selectable text. OCR is not included; scanned or unreadable pages need OCR or manual bookmarks.
- Detection is heuristic and needs review, especially for unusual layouts. It does not insert a printed table-of-contents page.
- Encrypted PDFs, signed PDFs, writing restrictions and unsupported original outline targets prevent export.
- Limits: 100 MB and 2,000 pages per PDF; 20 files and 250 MB total; up to 1,000 new bookmarks. Large files can use substantially more memory than their file size.
- Designed for current desktop Chrome, Edge, Firefox and Safari. Release 0.2.0 was checked in Chrome on Windows; macOS, Linux and other browsers have not been verified for this release. Mobile local-HTML support varies; a static web host may be needed.
- Page numbers are physical PDF pages, starting at 1, rather than printed page labels.

## Build from source

Use Node.js 22.13 or later and npm:

```sh
npm ci
npm run fixtures
npm test
npm run build
```

Open `dist/PaperMark.html`, or use `npm run serve` and the local URL it prints. Building requires downloading locked npm dependencies; using the finished HTML does not require a network connection.

`npm run audit:public` checks the publication allowlist for common private-path and credential patterns. `npm run package` creates the offline and source ZIPs plus SHA-256 checksums under `release/`. Generated test PDFs and browser logs are excluded from publication. Tests generate only synthetic research documents.

## GitHub Pages deployment

The Pages workflow publishes the committed `dist/PaperMark.html` as `index.html` after checking its build hash and auditing public files. Only that HTML, the build manifest and the license are deployed. There is no server component or upload API.

After changing the app, build it and commit the updated `dist/` files to `main`; the workflow deploys automatically. It also supports manual dispatch. In a fork, enable **Settings → Pages → Source → GitHub Actions** before running the workflow. `node scripts/prepare-pages.cjs` prepares the same site locally under the ignored `_site/` directory.

## Credits and license

PaperMark is released under the [MIT license](LICENSE). PDF layout and bookmark foundations are adapted from [Note and PDF Voice Reader](https://github.com/laginae/note-reader-cosyvoice) / note-reader-core, with their MIT notices preserved. PDF parsing and rendering use [Mozilla PDF.js](https://github.com/mozilla/pdf.js); writing uses [pdf-lib](https://github.com/Hopding/pdf-lib); ZIP export uses [fflate](https://github.com/101arrowz/fflate).

Upstream notices are in [licenses/](licenses/) and embedded in the app's credits dialog. See [CHANGELOG.md](CHANGELOG.md) for release changes and [docs/verification.md](docs/verification.md) for the validation scope.
