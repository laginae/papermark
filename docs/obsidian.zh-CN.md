# PaperMark Obsidian 插件

[English](obsidian.md)

**本地 OCR · 可搜索 PDF · 智能书签** · 维护者：[laginae](https://github.com/laginae)

在 Obsidian 中合并图片、识别扫描页、添加可搜索复制的文字层，并自动生成、编辑 PDF 书签。默认英文，可随时切换中文，原文件保留。

## 安装

打开[社区插件页面](https://community.obsidian.md/plugins/papermark)，选择 **Add to Obsidian**，或在“设置 → 第三方插件 → 浏览”中搜索 **PaperMark**，安装后启用。

手动安装步骤：

1. 从 [0.9.4 发布页](https://github.com/laginae/papermark/releases/tag/0.9.4)下载 **PaperMark-0.9.4-obsidian.zip**。
2. 解压后，把 `papermark` 文件夹放进笔记库的 `.obsidian/plugins/` 下。文件夹内应直接包含 `main.js`、`manifest.json` 和 `styles.css`，不要再多套一层目录。
3. 重启 Obsidian 或重新加载插件，在“设置 → 第三方插件”中启用 **PaperMark**。
4. 点击侧栏的 PaperMark 图标，或在命令面板运行 **PaperMark: Open workspace**。

无需安装 Node.js。插件已包含 PDF 引擎、内置 OCR 及中英文识别数据，首次使用也无需下载模型。

## 将图片合并为可搜索的 PDF

1. 点击“图片合并 PDF”，选择库内图片，或从设备添加 JPG、PNG、WebP。也可以在 Obsidian 文件列表中多选图片，右键选择“用 PaperMark 合并所选图片”。
2. 调整图片顺序和方向，或按文件名排序。每张图片生成一页，可选择适应图片尺寸或 A4，再点击“合并 PDF 并打开编辑器”。
3. 点击“识别并生成书签”。内置本地 OCR 无需配置；如需更换语言或使用 Paddle，请先展开“本地 OCR 选项”。
4. 核对并编辑书签，保持“导出可搜索 PDF”开启，点击“导出 PDF”，选择库内文件夹和文件名。重名时自动添加编号，保留已有文件。

只需合并图片时，可在合并后直接导出。处理现有 PDF 可使用“添加 PDF”、文件列表右键菜单或“从设备添加 PDF”。原有书签编辑、撤销、目录 JSON、MinerU 结果导入导出、批量 ZIP 导出均保留。设备导入的文件仅在内存中处理，直到你主动保存输出。

请在**导出的 PDF** 中搜索、选择和复制文字，可使用 Obsidian 自带 PDF 阅读器或其他阅读器。PaperMark 内的预览用于核对页面和书签位置，不提供文字选择。文字层不会替换原页面图像；已有文字层不会重复添加或修复。已有或手工编辑的书签会保留，除非主动选择重新检测。

## 扫描图书目录

选择 **图书目录页**，依次识别印刷目录、校准页码、核对并应用草稿。此流程使用当前选择的本地引擎，支持 Paddle Small，默认保留已有书签。人工页码对应、插页处理和整本书的可搜索文字层见[图书目录使用说明](book-contents.zh-CN.md)。

## 可选的 Paddle 本地 OCR

默认使用内置 Tesseract。桌面版还可接入 Cozy 插件的本机 OCR 助手，其引擎为 [SimdPaddleOCR](https://github.com/sdcb/SimdPaddleOCR)。**Small** 偏重识别质量，**Tiny** 偏重速度。此前十张合成印刷页的对照测试中，Small 的正文识别更好，但这不能保证它在实际扫描论文、表格、公式上同样占优；重要引文仍需对照原图核查。

Windows x64 配置方法：

1. 在 [Cozy Read Aloud 1.4.0 发布页](https://github.com/laginae/note-reader-cosyvoice/releases/tag/1.4.0)下载 `cozy-ocr-helper-windows-x64.zip`，解压后保留整个目录，不能只取出 exe。
2. 在“设置 → PaperMark”中填写 `CozyOcr.exe` 的完整路径。请使用可信的助手文件，插件会执行该程序。
3. 在工作区展开“本地 OCR 选项 → 本地 OCR 引擎”，选择 **Paddle Small** 或 **Paddle Tiny**，再运行识别。不需要另行双击启动助手。

助手仅在运行 Paddle OCR 时启动，通过本机进程管道接收像素，不上传 PDF、不需要 Token，也不开放网络服务。任务完成、取消或关闭工作区后会停止。使用时需要额外数百 MB 内存；插件设置保存助手路径和首选 OCR 引擎，不保存识别内容。

此助手与 **MinerU 连接助手** 不同。Windows 助手不能在 macOS/Linux 运行，其他平台的原生助手尚待验证，目前请使用内置 OCR。插件包含桌面端原生 OCR 适配接口，因此仅支持 Obsidian 桌面端；其他设备仍可使用独立网页版。

## 隐私和兼容范围

内置 OCR 模型使 `main.js` 约为 17 MB，超过 Obsidian Sync Standard 的 5 MB 单文件限制。该套餐用户应在每台桌面设备上分别安装插件。

- 默认本地处理，无统计追踪，不自动上传文档。
- MinerU 仍需主动选择，使用自己的 Token，并通过本机 MinerU 连接助手转发。每份 PDF 上传前均要求明确确认。Obsidian 请使用 PaperMark 0.8.0 或更新版的连接助手；详情见 [MinerU 说明](mineru.md)。
- 只读取主动选择的文件。导出需选择库内位置，不主动覆盖已有文件。若笔记库开启了其他同步服务，保存的输出也受该服务同步规则影响。
- 插件设置保存界面语言、导出文件夹、首选 OCR 引擎和可选助手路径，不保存 Token、文档或识别结果。
- 关闭或重新加载工作区会丢失未保存的文件和修改，请先导出 PDF 或目录 JSON。在工作区切换语言不会丢失编辑；设置页中的修改在重新打开工作区后应用。
- PDF 限制：最多 20 份，单份 100 MB、2,000 页，总计 250 MB。图片限制：最多 100 张，单张 20 MB、2500 万像素，总计 200 MB。大批量扫描件可能很慢或超出设备内存。
- 本版在 Windows x64、Obsidian 1.14.4 及 Chrome 中验证。核心使用跨平台库文件接口；macOS、Linux 尚未进行真机测试。声明的最低 Obsidian 版本为 1.8.7。

## 构建

运行 `npm ci`、`npm test`、`npm run build`，插件安装文件位于 `dist/obsidian/`。`npm run package` 生成插件 ZIP 和发布所需的三个单独文件。离线应用嵌入 `main.js`，标准三文件安装即可完整运行。可选原生 OCR 适配代码按 MIT 许可改编自 Cozy Read Aloud，署名与许可已包含在内嵌许可面板和源码包中。
