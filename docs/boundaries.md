# 汉化边界

只翻译 Raycast 自己的界面文案。凡是用户或第三方产生的内容、机器标识、品牌名，一律保留原文——宁可留英文，也不误译数据。

## 保留原文的类别

| 类别 | 判定 | 实测例子 |
| --- | --- | --- |
| 品牌与产品名 | 不译 | `Raycast`、`Raycast AI`、`Raycast Pro`、`MCP`、`Slack` |
| 第三方应用、扩展、命令名 | 不译，属于用户环境 | `Emacs (Alt+B, Alt+F…)`、`PowerShell 7 (x64)`、`Ask Chart`、`Ask DALL·E 3`、`GPT-6 Luna` |
| 主题与配色预设名 | 不译，是作品名 | `Raycast Dark`、`Raycast Light`、`Sky`、`Sunset`、`Gelato`、`Paper Slice` |
| 快捷键字形 | 不译 | `Ctrl`、`Tab`、`Esc`、`Ctrl ↵ / Ctrl Esc` |
| 路径、网址、文件名 | 不译 | `C:\Users\Albert`、`node_modules`、`~/.rayignore` |
| 示例代码与输入表达式 | 不译，照抄才能用 | `weather in Paris`、`flight BA117`、`sum(1, 2, 3)`、`let` / `return` / `guard` |
| 用户内容 | 不译 | 笔记标题与正文、对话消息、剪贴板条目、账户名 `yang Albert`、应用名 `Sex of Thrones 👑 Prologue` |
| 机器标识 | 不译 | 存储键、枚举值、路由、API 参数、扩展 ID、图标名 `Aa` |
| 数字、版本与计量 | 不译 | `2.12.1.0`、`693 kB`、`100%` |

## 代码里怎么落实

- `src/transform.mjs:5`：只改 `title`/`description`/`descriptionLines`/`label`/`placeholder` 等显示属性，绝不全局替换字符串——同一个英文词可能是枚举、API 参数、路由或存储键。
- `src/inject.js:8`：DOM 层排除 `input`、`textarea`、`pre`、`code`、`kbd`、`[class*="shortcut__"]`、`[class*="hotkey"]`、`contenteditable`、`.tiptap`、`.ProseMirror`，输入内容、快捷键字形与笔记/对话正文不动。
- `src/inject.js:81`：设置窗口的宿主文案按设计系统文本节点补译，但跳过列表行（`standard-list-item`，那里是应用或扩展自己的名字）、快捷键字形与可编辑区。
- `src/agent.mjs:100`：补丁只对安全窗口整页重载，`notes-window`、`ai-chat-window` 保留原文档，避免丢弃草稿。
- `src/inject.js:37`：更新日志的块级替换只在 `/whats-new` 与 `/changelog/:id` 生效，其他页面的相同文字不受影响。
- 词典是**白名单精确匹配**：没收录的文案保持原样，不做任何模糊替换。

## 复核方法

```
npm run audit:ui
```

连接正在运行的 Raycast，列出各窗口里所有仍非中文的可见文本，并按上面九类给出判定（`brand`、`keycap`、`path-or-url`、`code-sample`、`technical`、`name-or-label`、`review`）。`review` 与 `name-or-label` 需要人工过一眼，其余属于边界内、应当保留。

只读：只附加、取文本、断开，不修改任何内容。

## 已知未覆盖

主题编辑器（`theme-studio-window.html`，Pro 功能）当前仍是英文：该窗口的 bundle 未被替换，界面文案未翻译。同窗口的示例 Markdown 与代码高亮属于演示内容，本身也在边界内、应保留原文。
