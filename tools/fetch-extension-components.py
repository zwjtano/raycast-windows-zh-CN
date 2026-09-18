"""Fetch public src trees at one pinned upstream commit for syntax-only audits."""
import concurrent.futures,json,pathlib,subprocess,urllib.request
root=pathlib.Path(__file__).resolve().parent.parent
def api(endpoint):return json.loads(subprocess.check_output(['gh','api',endpoint],encoding='utf-8'))
commit=api('repos/raycast/extensions/commits/main')['sha']
entries=json.loads((root/'docs/extensions-audit.json').read_text(encoding='utf-8'))['extensions']
def tree(entry):
 directory=entry['source'].split('/extensions/')[-1].rsplit('/package.json',1)[0]
 data=api(f'repos/raycast/extensions/git/trees/{commit}:extensions/{directory}/src?recursive=1')
 return [(entry['name'],directory,x['path']) for x in data['tree'] if x['type']=='blob' and x['path'].endswith(('.ts','.tsx','.js','.jsx')) and not x['path'].endswith('.d.ts')]
with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:jobs=[x for group in pool.map(tree,[e for e in entries if e.get('windows')]) for x in group]
def fetch(job):
 name,directory,relative=job
 file=root/'.cache/extension-sources'/name/relative
 try:
  data=urllib.request.urlopen(f'https://raw.githubusercontent.com/raycast/extensions/{commit}/extensions/{directory}/src/{relative}',timeout=40).read()
  file.parent.mkdir(parents=True,exist_ok=True);file.write_bytes(data);return True
 except Exception:return False
with concurrent.futures.ThreadPoolExecutor(max_workers=16) as pool:results=list(pool.map(fetch,jobs))
report={'commit':commit,'files':len(jobs),'downloaded':sum(results),'failed':[j for j,r in zip(jobs,results) if not r]}
(root/'docs/plugin-source-snapshot.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
print(json.dumps(report))
