"""Snapshot the first ten Windows popular pages, excluding featured cards."""
import concurrent.futures,datetime,html,json,pathlib,re,urllib.request
root=pathlib.Path(__file__).resolve().parent.parent
def page(number):
    url='https://www.raycast.com/store/popular'+('' if number==1 else f'/{number}')+'?platform=Windows'
    request=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0'})
    content=urllib.request.urlopen(request,timeout=60).read().decode()
    cards=re.findall(r'<a class="ExtensionCard-[^"]*__card" href="([^"]+)">(.*?)</a>',content,re.S)
    entries=[]
    for route,card in cards:
        title=re.search(r'<span class="ExtensionCard-[^"]*__title">(.*?)</span>',card,re.S)
        if not title:raise ValueError('Card title missing')
        entries.append({'rank':(number-1)*10+len(entries)+1,'page':number,'name':route.rstrip('/').split('/')[-1],'title':html.unescape(title.group(1)),'store':'https://www.raycast.com'+html.unescape(route)})
    if len(entries)!=10:raise ValueError(f'Expected 10 ranked cards on page {number}, got {len(entries)}')
    return entries
with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
    entries=[entry for group in pool.map(page,range(1,11)) for entry in group]
if len({x['name'] for x in entries})!=100:raise ValueError('Duplicate identities across pages; retry snapshot')
output={'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'source':'https://www.raycast.com/store/popular?platform=Windows#list','extensions':entries}
(root/'docs/windows-popular-top100.json').write_text(json.dumps(output,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
existing=[{'name':x['name'],'title':x['title']} for x in entries]
(root/'translations/extensions.json').write_text(json.dumps(existing,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'popular':len(entries),'merged':len(existing),'entries':entries},ensure_ascii=False))
