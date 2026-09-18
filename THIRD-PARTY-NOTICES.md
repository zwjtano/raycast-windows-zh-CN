# 来源与第三方说明

- 简体中文词典：用户维护的 [zwjtano/raycast-macos-zh-CN](https://github.com/zwjtano/raycast-macos-zh-CN)，macOS `v2.4.1.0-r4` 发布包中的 `__rcStoreDisplayZh`。原包 SHA-256：`8da5b31c41f6b476452bff31357e2e6339940f83e1cc1a7cda3b1465a972e42a`。词典继承原项目的翻译及第三方内容权利说明；本项目不额外为它授予许可。
- Raycast 及其品牌、原始资源的权利归 Raycast。安装包不包含官方应用二进制文件。
- 运行时包含 Acorn（MIT），安装包附 `Acorn-LICENSE.txt`。jsdom 和 esbuild 仅用于开发检查，不随安装包分发。
- Windows 专用译文在 `translations/windows.json` 和 `translations/plugins-windows.json` 中维护，多义词按插件单独处理。
- 插件源码来自 [raycast/extensions](https://github.com/raycast/extensions)，仅用于本地语法审计，不在本仓库或安装包中分发。来源提交与检查结果见 `docs/`。
- 补丁清单只记录版本指纹、目标片段与译文，不分发完整官方 JavaScript 资源。

本项目与 Raycast 官方无隶属关系。

语言名称使用 Node.js Intl.DisplayNames（Unicode CLDR）生成，仅用于界面显示，语言代码保持原样。
