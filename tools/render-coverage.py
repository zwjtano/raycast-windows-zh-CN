import json,pathlib
root=pathlib.Path(__file__).resolve().parent.parent
snapshot=json.loads((root/'docs/windows-popular-top100.json').read_text(encoding='utf-8'))
audit={e['name']:e for e in json.loads((root/'docs/extensions-audit.json').read_text(encoding='utf-8'))['extensions']}
source={e['name']:e for e in json.loads((root/'docs/plugin-source-audit.json').read_text(encoding='utf-8'))['extensions']}
lines=['# Windows 热门榜前 100 插件','',f"榜单快照：{snapshot['checkedAt']}。来源：[Raycast Windows 热门榜]({snapshot['source']})。排除精选推荐，按第 1–10 页的榜单顺序。",'',
'全部 100 个插件的上游 package.json 声明支持 Windows。表中的“匹配”仅统计安全转换器能识别的静态显示字面量；不包含动态拼接文本或自定义组件，未匹配项也可能是品牌名、代码示例或网址。此数字不是整款插件的翻译覆盖率。', '',
'仅 Video Downloader 初始表单在本机实测；其他插件完成源码语法检查，尚未逐页验收。插件的登录、付费、外部设备功能以及仅支持 macOS 的子功能保持上游行为。','',
'| 排名 | 插件 | 页码 | 已检查源码文件 | 匹配显示字面量 | 本机验收 |','| --- | --- | --- | --- | --- | --- |']
for e in snapshot['extensions']:
 s=source[e['name']];title=audit[e['name']]['title']
 lines.append(f"| {e['rank']} | [{title}]({e['store']}) | {e['page']} | {s['files']} | {s['matchedDisplayLiterals']} / {s['displayLiterals']} | {'初始表单' if e['name']=='video-downloader' else '未逐页实测'} |")
lines+=['','[源码快照](plugin-source-snapshot.json) · [平台核对](extensions-audit.json) · [源码检查详情](plugin-source-audit.json)','']
(root/'docs/extensions.md').write_text('\n'.join(lines),encoding='utf-8')
print(json.dumps({'extensions':len(source),'files':sum(x['files'] for x in source.values()),'matched':sum(x['matchedDisplayLiterals'] for x in source.values()),'literals':sum(x['displayLiterals'] for x in source.values())}))
