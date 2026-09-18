# Raycast Windows 汉化

Raycast Windows Simplified Chinese Localization，支持主界面、设置、商店和热门插件。非官方项目。

**适配 Microsoft Store 版 Raycast 2.4.0.0 x64。**

[下载 Windows 版](https://github.com/zwjtano/raycast-windows-zh-CN/releases/latest) · [macOS 版](https://github.com/zwjtano/raycast-macos-zh-CN)

## 安装与卸载

1. 下载并完整解压。更新前先运行新版包内的 `卸载汉化.cmd`。
2. 从托盘退出 Raycast，双击 `安装汉化.cmd`，允许管理员授权。
3. 正常打开 Raycast 即可。

卸载：双击 `卸载汉化.cmd`。遇到问题可运行 `检查状态.cmd`。

## 汉化范围

涵盖 Windows 热门榜前十页的 [100 个插件](docs/extensions.md)，插件需自行安装。部分动态内容和托盘菜单仍为英文。

![Raycast 中文商店](docs/screenshots/windows-store.png)

![Raycast 中文主界面](docs/screenshots/windows-main.png)

## 注意

Raycast 更新后需使用对应版本的汉化包。本组件使用本机调试接口，仅支持单用户场景。插件修改有备份，卸载时恢复；手动修改冲突会提示处理。

[验证范围](docs/validation.md) · [第三方许可](THIRD-PARTY-NOTICES.md)

## 开发

`npm ci` → `npm test` → `npm run build` → `npm run package`

构建需安装上述版本的 Raycast。
