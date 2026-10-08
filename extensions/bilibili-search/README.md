# 哔哩哔哩搜索 · Windows 中文版

基于 [55b 的 Bilibili Search](https://www.raycast.com/55b/bilibili-search) 移植，原作者保留署名，Windows 贡献者为 zwjacl。

下载并解压安装包，双击 `安装插件.cmd`。无需另外安装 Node.js。安装后在 Raycast 搜索“哔哩哔哩”。

输入关键词查看联想，按 Enter 在浏览器中搜索。操作菜单可复制搜索链接。搜索历史和剪贴板预填默认关闭，可在插件设置中启用。

卸载：在 Raycast 设置 → 扩展中选择本插件并卸载。

支持 Microsoft Store Raycast 2.7.1.0 x64，已在本机验证安装、命令打开和实时联想。尚未在第二台电脑验证。

[官方 Windows 适配 PR](https://github.com/raycast/extensions/pull/32048) 正在审核，合并后才会进入商店。商店提交版保留英文；本目录为独立中文版。

## 开发

需要 Node.js 22.22.2 或更高版本。运行 `npm ci`、`npm test`、`npm run build`。打包输出：`npm run build -- --output dist`。

上游版本见 `UPSTREAM.json`，许可证为 MIT。
