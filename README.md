# Raycast Windows 汉化｜简体中文界面与插件汉化包

适配 Microsoft Store 版 **Raycast 2.4.0.0 x64**，非官方项目。

Raycast Windows Simplified Chinese Localization：为 Raycast 主界面、设置、商店与热门插件提供中文显示，安装后直接使用原版入口，附卸载恢复工具。r3 托盘菜单保留英文。

## 选择你的平台

| 平台 | 项目与安装说明 | 汉化包下载 |
| --- | --- | --- |
| Windows · 2.4.0.0 x64 | [Raycast Windows 汉化](https://github.com/zwjtano/raycast-windows-zh-CN) | [Windows 下载](https://github.com/zwjtano/raycast-windows-zh-CN/releases) |
| macOS · 2.4.1.0 Apple Silicon | [Raycast macOS 汉化](https://github.com/zwjtano/raycast-macos-zh-CN) | [macOS 下载](https://github.com/zwjtano/raycast-macos-zh-CN/releases/latest) |

[下载 Windows 汉化包](https://github.com/zwjtano/raycast-windows-zh-CN/releases/tag/v2.4.0.0-r3) · [100 个插件清单与检查结果](docs/extensions.md) · [macOS 独立项目](https://github.com/zwjtano/raycast-macos-zh-CN)

## 使用

1. 完整解压 Windows ZIP；如装有旧版，先运行旧版卸载工具。
2. 保存内容，从 Raycast 托盘菜单选择 **Quit**，再双击 `安装汉化.cmd`，允许管理员授权。
3. 以后直接使用**原版 Raycast 图标、开始菜单或原有热键**。不创建额外中文快捷方式。
4. 双击 `卸载汉化.cmd`，允许管理员授权；也可在 Windows“已安装的应用”中卸载“Raycast 简体中文组件”。卸载会退出 Raycast、恢复插件备份并重新打开原版。

无需额外安装 Node、Python 或开发工具；运行时使用 Raycast 自带的 Node。汉化后台随当前用户登录启动，只等待原版 Raycast，不会替你自动启动 Raycast。初次加载可能先出现英文，再刷新为中文。

**托盘右键菜单保留英文。** r3 使用原版入口加载，不再使用 r2 的独立启动器和原生托盘模块。这是独立汉化组件，不是商店扩展。Raycast 更新后需卸载旧组件，等待对应版本的汉化包。

## 原理与边界

Windows 安装包启用了内容完整性校验。本组件不写入 WindowsApps，不修改 Raycast 官方可执行文件、资源、数据库或账户数据。主界面内存中的显示修改随进程退出而消失。

插件在用户扩展目录中处理：只修改语法分析确认的显示字符串，修改前保存完整备份与 SHA-256。卸载按校验恢复；遇到插件更新则保留新版，遇到汉化后手动修改则保留备份并报告冲突。命令 ID、请求参数、密码、用户输入和动态变量不作为替换目标。

安装器通过管理员授权，仅为 Raycast 的应用 ID 和 `Raycast.exe` 设置 WebView2 参数（HKLM 的 `Software\Policies\Microsoft\Edge\WebView2\AdditionalBrowserArguments`），不设置通配符或全局环境变量。后台通过安装时随机选择的本机回环端口加载中文资源。

Raycast 运行时，该本机调试接口能够访问其 WebView 内容；退出后接口关闭，卸载移除本组件写入的参数。此配置作用于这台电脑的 Raycast，当前版本只验收单用户使用，不适用于多人同时登录使用 Raycast 的场景。已有其他配置时拒绝覆盖；卸载遇到参数被改动也会停止并保留现场。

基础词典来源于独立 macOS r4 项目，另补充 Windows 与热门插件用语。构建工具通过 JavaScript AST 替换显示字段；运行时用精确词典补充按钮、菜单、标签和占位文字。不会将文本发送到在线翻译服务。

插件名单覆盖 **2026-09-18 Windows 热门榜第 1–10 页的 100 个插件**。检查过 2,876 个上游源码文件，支持已匹配的命令标题、偏好设置标签、表单、菜单、通知和确认提示。用户需自行从 Store 安装插件；组件不会批量安装它们。运行期间每 15 秒检查名单内的已安装插件，必要时返回主界面再进入插件以刷新显示。

**源码检查不等于逐页实测。** 此前版本验收包含主界面、设置和 Video Downloader 初始表单；r3 增加原版入口、退出后重开及卸载恢复验收。登录后、付费、外部设备及第三方服务页面未逐个验收。动态拼接文字、自定义组件、服务返回内容及未命中的说明仍可能保留英文。AI 回复、代码、输入框值、可编辑正文不作为动态替换目标。插件仅限 macOS 的子功能不会因汉化获得 Windows 支持。

r2 补充商店列表和详情页的显示转换，包含上述 100 个插件的介绍译文；商品名与品牌名按原名保留，Google Translate 显示为“Google 翻译”。已在本机确认商店列表中的 Google 翻译、VS Code、Linear、Slack、1Password 和 Notion 介绍显示中文。

![Raycast Windows 插件商店中文介绍与扩展列表](docs/screenshots/windows-store.png)

![Raycast Windows 简体中文主界面](docs/screenshots/windows-main.png)

![Raycast Windows Video Downloader 插件中文下载表单](docs/screenshots/windows-video-downloader.png)

译文条目数、静态替换数量不等于实测页面覆盖率。实际验证范围请参阅 Release 说明。

## 状态和故障处理

双击 `检查状态.cmd`。状态与错误日志位于 `%LOCALAPPDATA%\Raycast-zh-CN\runtime`。插件结果在 `plugin-status.json`，备份在 `plugin-backups`。

如启动未显示中文，先检查后台状态。若关闭了组件的登录启动项，请重新启用后重新登录 Windows；也可运行安装目录内的 `bundle/watch.ps1` 启动后台，然后重新打开原版 Raycast。若遇指纹不匹配，不要修改校验文件。卸载后使用官方原版即可。

安装文件位于 `%LOCALAPPDATA%\Raycast-zh-CN`。卸载只移除安装清单记录的组件文件、本组件登录启动项和匹配的加载参数，保留用户自行放入的额外文件。r3 不安装原生菜单模块。

## 开发

在仓库根目录执行 `npm ci`、`npm test`、`npm run build`、`npm run package`。构建需要本机安装适配的官方 Raycast；不会将官方程序打包进安装 ZIP。

榜单快照：`python tools/snapshot-store.py`；平台审计：`python tools/audit-extensions.py`；源码快照：`python tools/fetch-extension-components.py`；显示字段检查：`node tools/audit-plugin-sources.mjs`。审计使用公开源码与 `gh`，不执行插件业务逻辑。来源与许可见 [第三方说明](THIRD-PARTY-NOTICES.md)。

WebView2 调试参数：[Microsoft 文档](https://learn.microsoft.com/en-us/microsoft-edge/webview2/how-to/debug-visual-studio-code)。
