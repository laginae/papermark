# Optional MinerU mode / 可选 MinerU 模式

MinerU mode is **off by default**. Local OCR and offline export remain available without a Token, account, helper or upload. Every user provides their **own** MinerU API Token and uses their own quota. The project contains no shared Token.

## Use the online mode

1. Download `PaperMark-MinerU-helper.cjs` from the release. Install Node.js 22.13 or later if needed, and run `node PaperMark-MinerU-helper.cjs` in a terminal. Keep that terminal open.
2. Open PaperMark, load a PDF, enable **MinerU high precision**, and paste the helper's connection code. Click **Connect**. If the browser asks, allow local network access. The connection code protects the local helper; it is not the MinerU Token.
3. Obtain your own API Token at <https://mineru.net/apiManage/token> and enter it in the password field. OpenXLab Access Key / Secret Key pairs are not the same credential.
4. Click **Review upload & run MinerU**. The confirmation identifies the entire file and page count. Only accepting it starts an upload to MinerU. Limits: 100 MB and 200 pages per PDF.
5. Review the resulting outline and export with **Export searchable PDF** enabled. Original page images, geometry, annotations, and existing or manually edited bookmarks stay intact. Use **Detect again** if you deliberately want to replace an existing outline with detected headings.

The Token is kept only in browser/helper memory for the operation, cleared from the form on submission, and never written to storage or logs. Refreshing clears connection state; disabling the mode clears both fields. The helper listens only on the loopback interface, requires a fresh per-launch connection code, restricts browser origins and outbound hosts, and forwards the Token only to the official API. Upload/result storage requests do not carry the Token. Fork maintainers must update the explicit origin allowlist in the helper before using a different Pages origin.

GitHub Pages is static hosting. The local helper supplies the connection the service's current cross-origin restrictions prevent the page from making directly. No public proxy is provided. The helper needs an internet connection, and browser local-network policies may require a permission prompt or a supported desktop browser. Mobile platforms without Node.js can still use local OCR or import a previously saved result.

After an upload, MinerU handles the document under its own terms and privacy policy. Stopping locally cannot guarantee deletion or cancellation of a task already accepted by MinerU. The helper discards in-memory job data on client cleanup or expiry; closing the helper also clears it.

**Save MinerU result** downloads document text and layout, tied to the original PDF's SHA-256. **Import saved MinerU result** checks that fingerprint and applies the file locally. Only PaperMark's saved result format is accepted, not an arbitrary Markdown file or raw service ZIP. Treat these result files as private document exports.

Search/copy uses the returned text in an invisible layer, with local OCR line positions when available. Paragraph-only output needs approximate line placement. Formula/table extraction and exact glyph selection are not guaranteed. Existing source text layers, including a reopened searchable PDF, are retained rather than duplicated or replaced. Always use the original scan for correcting an old OCR layer.

## 中文使用说明

默认关闭在线模式；本地 OCR、书签和可搜索 PDF 导出继续离线运行，无需 Token。

1. 从发行版下载 `PaperMark-MinerU-helper.cjs`，安装 Node.js 22.13 或更新版本，在终端运行 `node PaperMark-MinerU-helper.cjs`，保持窗口打开。
2. 网页添加 PDF 后，勾选 **MinerU 高精度**，填写助手显示的连接码并连接。如浏览器询问，允许访问本地网络。连接码不是 API Token。
3. 在 MinerU 官网获取**你自己账号的 API Token**，填入网页密码框。项目不提供共享密钥，也不使用作者的额度。
4. 点击 **确认上传并运行 MinerU**，核对整份文件及页数，确认后才上传。每份文件限制为 100 MB、200 页。Token 提交后从输入框清空，仅在处理期间的内存中使用，不保存到浏览器、磁盘或日志。
5. 核对目录后，保持 **导出可搜索 PDF** 开启并导出。保留原页面、批注、已有或手工编辑的书签；需要用新标题替换原目录时，主动点击“重新识别”。

GitHub Pages 无法直接承担服务端连接，当前官方接口也限制跨域请求，因此需要本机助手；没有公共中转服务。不同浏览器的本地网络限制可能不同，建议使用桌面 Chrome 或 Edge。手机等无法运行助手的设备仍可使用本地 OCR，或导入已保存的结果。

在线处理会把整份 PDF 发送给 MinerU，适用其服务条款和隐私政策。本机取消不保证远端已上传任务停止或删除。关闭助手会清除其内存数据。

“保存 MinerU 结果”包含论文正文和版面，请按私人文档保管；“导入已保存的 MinerU 结果”校验原 PDF 的 SHA-256，在本机应用。只接受 PaperMark 保存的格式，不直接接受 Markdown 或官网原始 ZIP。

选字位置优先参考本地 OCR 的行坐标；只有段落坐标时采用近似排布。复杂表格、公式和字符级定位仍需核对。已有文字层不会被覆盖，改善旧 OCR 时请重新打开原始扫描 PDF。
