"""Record upstream platform declarations without installing any extensions."""
import base64
import concurrent.futures
import json
import pathlib
import subprocess

root=pathlib.Path(__file__).resolve().parent.parent
entries=json.loads((root/'translations/extensions.json').read_text(encoding='utf-8'))
cache=root/'.cache/upstream-extensions'
cache.mkdir(parents=True,exist_ok=True)
dictionary=json.loads((root/'translations/zh-CN.json').read_text(encoding='utf-8'))
dictionary.update(json.loads((root/'translations/plugins-windows.json').read_text(encoding='utf-8')))
def audit(entry):
    name=entry['name']
    directory={'translate':'google-translate','visual-studio-code':'visual-studio-code-recent-projects','raycast-system-monitor':'system-monitor','figma-files-raycast-extension':'figma-files','random':'random-data-generator','confluence':'confluence-search'}.get(name,name)
    result=dict(entry)
    file=cache/(name+'.json')
    try:
        if file.exists():
            payload=json.loads(file.read_text(encoding='utf-8'))
        else:
            data=subprocess.run(['gh','api',f'repos/raycast/extensions/contents/extensions/{directory}/package.json'],check=True,capture_output=True,encoding='utf-8')
            response=json.loads(data.stdout)
            payload={'sha':response['sha'],'url':response['html_url'],'package':json.loads(base64.b64decode(response['content']))}
            file.write_text(json.dumps(payload,ensure_ascii=False,indent=2),encoding='utf-8')
        package=payload['package']
        if package['name'] != name: raise ValueError('Upstream extension identity does not match')
        result.update(source=payload['url'],sha=payload['sha'],platforms=package.get('platforms',['macOS']),windows='Windows' in package.get('platforms',[]))
        texts=[]
        def visit(value):
            if isinstance(value,dict):
                for key,item in value.items():
                    if key in ('title','description','placeholder','label') and isinstance(item,str):texts.append(item)
                    elif isinstance(item,(dict,list)):visit(item)
            elif isinstance(value,list):
                for item in value:visit(item)
        # Plugin titles remain brand names. Commands and preferences are display text.
        visit(package.get('commands',[]));visit(package.get('preferences',[]))
        result['metadataTextCount']=len(set(texts))
        result['matchedMetadataTextCount']=sum(text in dictionary for text in set(texts))
    except Exception as error:
        result['error']=str(error)[:240]
    return result
with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
    results=list(pool.map(audit,entries))
out=root/'docs/extensions-audit.json'
out.write_text(json.dumps({'checkedAt':'2026-09-18','extensions':results},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'total':len(results),'declaredWindows':sum(x.get('windows',False) for x in results),'errors':[x['name'] for x in results if 'error'in x]},ensure_ascii=False))
