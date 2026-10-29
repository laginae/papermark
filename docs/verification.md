# Verification for 0.2.0

The release was checked with synthetic PDFs. No personal research papers are included in the repository or release archives.

## Automated checks

`npm run fixtures` followed by `npm test` passes 21 tests covering heading recognition, nested sections, existing bookmarks, destination validation, rotated/cropped pages, preserved annotations, file naming, signature/restriction handling and both interface languages.

Language checks cover the English default, stored preference, unavailable browser storage, translation key/placeholder completeness, document language and accessible labels. Switching static text preserves input values and file inputs. Validation errors and legacy outline reasons can be translated again after a language change.

## Browser checks

Checked the built, single-file HTML in Windows Chrome:

- English starts by default even with a Chinese browser locale.
- Switching to Chinese and reloading restores the chosen language.
- Titles, levels, selected bookmark and preview page survive a language round trip.
- An edited input is committed before switching, including when the input still has focus.
- Invalid nesting produces the appropriate English or Chinese validation message.
- A synthetic four-page paper produces nine bookmarks, and exports with network access disabled.
- An independent pypdf readback confirms the edited Unicode title, page destination, unchanged page text and preserved annotation count.
- Welcome and editor layouts have no document-level horizontal overflow at a 390-pixel viewport. PDF previews can be scrolled.
- Scanned-page notices update when the language changes.

These checks do not establish accuracy on every paper layout or full compatibility with every browser/operating system. Other desktop operating systems and mobile file-opening behavior were not verified for this release.

## Publication checks

The publication allowlist contains source, tests, build scripts, documentation, reviewed empty-interface screenshots, licenses and the built HTML. It excludes dependencies, generated test PDFs, browser profiles, logs, local configuration, temporary files and private diagnostics.

`npm run audit:public` checks common absolute-path, private-address and credential patterns, UTF-8 decoding, screenshot metadata, dependency registry URLs and the build hash. This is a bounded publication check, not a comprehensive security audit. Required upstream license notices retain their public author information.

`npm run package` reopens each ZIP, checks paths and publication patterns, and compares every archived file with its source bytes. SHA-256 checksums are included with the release assets.
