"""Fetch public command sources for offline display-string audits; never execute them."""
import concurrent.futures,json,pathlib,urllib.request,urllib.error
root=pathlib.Path(__file__).resolve().parent.parent
audit=json.loads((root/'docs/extensions-audit.json').read_text(encoding='utf-8'))
jobs=[]
for e in audit['extensions']:
 if not e.get('windows'):continue
 p=json.loads((root/'.cache/upstream-extensions'/(e['name']+'.json')).read_text(encoding='utf-8'))['package']
 directory=e['source'].split('/extensions/')[-1].rsplit('/package.json',1)[0]
 for c in p.get('commands',[]):jobs.append((e['name'],directory,c['name']))
def fetch(job):
 name,directory,command=job
 folder=root/'.cache/extension-sources'/name
 for suffix in ('.tsx','.ts','.jsx','.js'):
  file=folder/(command+suffix)
  if file.exists():return True
  try:
   url=f'https://raw.githubusercontent.com/raycast/extensions/main/extensions/{directory}/src/{command}{suffix}'
   content=urllib.request.urlopen(url,timeout=30).read()
   file.parent.mkdir(parents=True,exist_ok=True);file.write_bytes(content);return True
  except urllib.error.HTTPError as error:
   if error.code!=404:return False
  except Exception:return False
 return False
with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool:results=list(pool.map(fetch,jobs))
print(json.dumps({'commands':len(jobs),'sourcesFetched':sum(results),'missing':[j[0]+'/'+j[2] for j,r in zip(jobs,results) if not r]}))
