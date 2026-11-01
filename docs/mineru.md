# Optional MinerU mode / 可选 MinerU 模式

MinerU mode is **off by default**. Local OCR and offline export remain available without a Token, account, helper or upload. Every user provides their **own** MinerU API Token and uses their own quota. The project contains no shared Token.

## Use the online mode

Add your PDF first, then choose **MinerU online recognition**. The current setup step is shown beneath a persistent local-helper status. First-time download instructions are under **First use: download and start the helper**.

The status distinguishes not connected, connecting, checking, connected and connection lost. **Check connection** only contacts the local helper; it does not validate a Token or upload a PDF. **Disconnect** clears this page's connection without stopping the helper. The connection stays in page memory across mode and document changes, with local health checks while visible and idle in online mode. Token and upload consent are still cleared on each mode or document change and on connection loss. Refreshing or closing the page requires connecting again.

MinerU also supplies text for **searchable/copyable PDF export**. The service recognizes text and layout; PaperMark writes the invisible text layer locally when you export with **Export searchable PDF** enabled. This keeps original pages and current bookmarks, but the recognition step still uploads the entire PDF after confirmation. See [OCR selection and text-layer guidance](ocr-guide.md); Paddle and MinerU use different helpers.

1. **Windows 10/11 x64:** download [PaperMark-MinerU-Windows-x64.zip](https://github.com/laginae/papermark/releases/latest/download/PaperMark-MinerU-Windows-x64.zip), extract it, and double-click **PaperMark-MinerU.exe**. No Node.js installation, commands or administrator access are needed. Keep its program window open. It automatically opens a local control page at `http://127.0.0.1:8768/`.
2. Click **Copy connection code** on the control page, then **Open PaperMark**. Choose **MinerU online recognition**, paste the code into **Helper connection code**, and click **Connect helper**. If the browser asks, allow local network access. This connection code is not the MinerU Token.
3. Obtain your own API Token at <https://mineru.net/apiManage/token> and enter it in the password field. OpenXLab Access Key / Secret Key pairs are not the same credential.
4. Click **Next** after entering your Token. Review the filename and page count, check the whole-document upload consent box, then click **Upload & start recognition**. Only this final action starts an upload to MinerU. Changing files clears the Token and consent; each retry needs new consent. Limits: 100 MB and 200 pages per PDF.
5. Review the resulting outline and export with **Export searchable PDF** enabled. Original page images, geometry, annotations, and existing or manually edited bookmarks stay intact. Use **Detect again** if you deliberately want to replace an existing outline with detected headings. When finished, click **Stop helper** on the local control page or close the helper program window. Closing just its browser tab does not stop it.

The control page has English / 中文 buttons and opens in English by default. It does not request an API Token, access your PDFs or contact external sites automatically. Its copy button copies only the short-lived connection code; API Tokens belong in the PaperMark page. Restarting the helper changes the code, so reconnect with the new one. Opening the program twice reopens the existing helper's control page if it is already running.

**macOS / Linux and existing Node.js users:** the separate `PaperMark-MinerU-helper.cjs` still runs with `node PaperMark-MinerU-helper.cjs` using Node.js 22.13 or later. The new runtime-free desktop package is Windows x64 only. Phone/tablet browsers cannot run that Windows program; local OCR remains available there.

**Troubleshooting:** if the control page does not open automatically, visit the local address while the program runs. If connection fails, copy the current code again and check the browser's local-network permission. If port 8768 belongs to an unrelated program, close that program or use local OCR. No firewall or antivirus protection needs to be disabled. The Windows executable is unsigned and may show an unknown publisher; obtain it from this project's GitHub release and compare its ZIP against `SHA256SUMS.txt`. Managed devices may prevent unsigned programs from running.

The Token is kept only in browser/helper memory for the operation, cleared from the form on submission, and never written to storage or logs. Refreshing clears connection state; disabling the mode clears both fields. The helper listens only on the loopback interface, requires a fresh per-launch connection code, restricts browser origins and outbound hosts, and forwards the Token only to the official API. Upload/result storage requests do not carry the Token. Fork maintainers must update the explicit origin allowlist in the helper before using a different Pages origin.

GitHub Pages is static hosting. The local helper supplies the connection the service's current cross-origin restrictions prevent the page from making directly. No public proxy is provided. The helper needs an internet connection, and browser local-network policies may require a permission prompt or a supported desktop browser. Platforms unable to run the helper can still use local OCR or import a previously saved result.

After an upload, MinerU handles the document under its own terms and privacy policy. Stopping locally cannot guarantee deletion or cancellation of a task already accepted by MinerU. The helper discards in-memory job data on client cleanup or expiry; closing the helper also clears it.

Expand **Import or save recognition results** to access the local import and save actions. No helper or Token is needed for import.

**Save MinerU result** downloads document text and layout, tied to the original PDF's SHA-256. **Import saved MinerU result** checks that fingerprint and applies the file locally. Only PaperMark's saved result format is accepted, not an arbitrary Markdown file or raw service ZIP. Treat these result files as private document exports.

Search/copy uses the returned text in an invisible layer, with local OCR line positions when available. Paragraph-only output needs approximate line placement. Formula/table extraction and exact glyph selection are not guaranteed. Existing source text layers, including a reopened searchable PDF, are retained rather than duplicated or replaced. Always use the original scan for correcting an old OCR layer.

## 中文使用说明

默认关闭在线模式；本地 OCR、书签和可搜索 PDF 导出继续离线运行，无需 Token。

面板会持续显示本机助手的未连接、正在连接、正在检查、已连接或连接断开状态。下载说明收在 **首次使用：下载并启动助手** 中。**检查连接**只访问本机助手，不验证 Token、不上传 PDF；**断开**只清除此页面的连接，不会关闭助手程序。连接在当前页面内存中保留，切换模式或文档不需要重复粘贴连接码，但 Token 和上传确认仍会清空。在线模式下页面可见且空闲时会检查助手；连接失效同样清空 Token 和确认，刷新或关闭页面后需要重新连接。

MinerU 也用于 **可搜索、复制的 PDF 文本层**：服务返回文字与版面，PaperMark 在本机导出时写入隐形文字层，保留原页面和当前书签。请保持 **导出可搜索 PDF** 开启。文本层在本机写入不代表在线识别也在本机完成，整份 PDF 仍会在确认后上传。Paddle 与 MinerU 使用不同助手，详见 [OCR 选择与文本层说明](ocr-guide.zh-CN.md)。

1. **Windows 10/11 x64：**下载 [Windows 免安装助手 ZIP](https://github.com/laginae/papermark/releases/latest/download/PaperMark-MinerU-Windows-x64.zip)，解压后双击 **PaperMark-MinerU.exe**。无需安装 Node.js、输入命令或管理员权限。保持程序窗口打开，它会自动在默认浏览器打开本机控制页 `http://127.0.0.1:8768/`。
2. 在控制页点击 **复制连接码**，再点击 **打开 PaperMark**。先添加 PDF，再选择 **MinerU 在线识别**，将代码粘贴到 **助手连接码** 并点击 **连接助手**。如浏览器询问，允许访问本地网络。连接码不是 API Token。
3. 在 MinerU 官网获取**你自己账号的 API Token**，填入网页密码框。项目不提供共享密钥，也不使用作者的额度。
4. 填写 Token 后点击 **下一步**，核对文件名和页数，勾选整份文档上传确认，再点击 **上传并开始识别**。切换文件会清空 Token 和确认；重试需要重新确认。每份文件限制为 100 MB、200 页。Token 提交后从输入框清空，仅在处理期间的内存中使用，不保存到浏览器、磁盘或日志。
5. 核对目录后，保持 **导出可搜索 PDF** 开启并导出。保留原页面、批注、已有或手工编辑的书签；需要用新标题替换原目录时，主动点击“重新识别”。用完后在本机控制页点击 **停止助手**，或关闭助手程序窗口。仅关闭浏览器标签页不会停止程序。

控制页默认英文，可点击 **中文** 切换。它不收集 API Token、不读取 PDF、不会自动联系外部网站；复制按钮仅复制本次启动的连接码。重新启动后须使用新连接码连接；重复双击会打开已运行助手的控制页。

**其他平台：**macOS/Linux 仍可下载 `.cjs` 脚本助手，使用 Node.js 22.13 或更新版本运行。本次免安装程序仅适用于 Windows x64，手机和平板不能运行 Windows 程序，但仍可使用本地 OCR 或导入已保存的识别结果。

**连接排查：**未自动打开控制页时，请保持程序运行并访问上述本机地址；连接失败时，重新复制当前连接码，并检查浏览器的本地网络权限。端口 8768 被其他程序占用时，请关闭占用程序或使用本地 OCR，无需关闭防火墙或杀毒防护。此程序未进行代码签名，Windows 可能显示“未知发布者”；请仅从本项目发行页下载并核对 `SHA256SUMS.txt`。受管理的电脑可能禁止运行未签名程序。

GitHub Pages 无法直接承担服务端连接，当前官方接口也限制跨域请求，因此需要本机助手；没有公共中转服务。不同浏览器的本地网络限制可能不同，建议使用桌面 Chrome 或 Edge。手机等无法运行助手的设备仍可使用本地 OCR，或导入已保存的结果。

## Building the Windows package

After `npm ci` and `npm run build`, run `npm run package:helper` on Windows x64, then `npm run package`. The build downloads Node.js 24.22.2 from the official distribution, verifies the pinned archive and executable SHA-256 values, and uses Node.js SEA with postject to embed the bundled helper. The modified executable does not retain the upstream Node.js signature. Snapshot and code cache are disabled; relative input names avoid embedding local build paths. The ZIP includes runtime/dependency licenses, bilingual instructions and build provenance. Native binaries and runtime caches stay outside Git under `release/` and `qa/`; the source and pinned build recipe are public.

在线处理会把整份 PDF 发送给 MinerU，适用其服务条款和隐私政策。本机取消不保证远端已上传任务停止或删除。关闭助手会清除其内存数据。

“保存 MinerU 结果”包含论文正文和版面，请按私人文档保管；“导入已保存的 MinerU 结果”校验原 PDF 的 SHA-256，在本机应用。只接受 PaperMark 保存的格式，不直接接受 Markdown 或官网原始 ZIP。

选字位置优先参考本地 OCR 的行坐标；只有段落坐标时采用近似排布。复杂表格、公式和字符级定位仍需核对。已有文字层不会被覆盖，改善旧 OCR 时请重新打开原始扫描 PDF。
