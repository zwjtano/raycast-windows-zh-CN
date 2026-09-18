const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const crypto=require('node:crypto');
const hash=data=>crypto.createHash('sha256').update(data).digest('hex');
const transform=require('./plugin-transform.cjs');
const scopes=require('./plugin-scopes.cjs');
const writeJson=(file,data)=>{fs.writeFileSync(file+'.tmp',JSON.stringify(data,null,2));fs.renameSync(file+'.tmp',file);};
function settings(installRoot, options={}) {
  const bundle=options.bundle || path.join(installRoot,'bundle');
  return {installRoot,bundle,
    roots: options.roots || [path.join(os.homedir(),'.config','raycast','extensions'),path.join(process.env.LOCALAPPDATA,'Raycast','extensions')],
    allowed:new Set(JSON.parse(fs.readFileSync(path.join(bundle,'extensions.json'),'utf8')).map(x=>x.name)),
    dictionary:JSON.parse(fs.readFileSync(path.join(bundle,'plugin-dictionary.json'),'utf8')),
    parser:require(path.join(bundle,'acorn.cjs')),
    stateFile:path.join(installRoot,'plugins.json'),
    backupDir:path.join(installRoot,'plugin-backups')};
}
function readState(s){try{return JSON.parse(fs.readFileSync(s.stateFile,'utf8'));}catch(e){if(e.code==='ENOENT')return {format:1,files:{}};throw e;}}
function inside(file,roots){return roots.some(root=>file.toLowerCase().startsWith(path.resolve(root).toLowerCase()+path.sep));}
function apply(installRoot,options={}) {
  const s=settings(installRoot,options),state=readState(s);const result={extensions:{},skipped:[]};
  for(const root of s.roots) {
    if(!fs.existsSync(root))continue;
    for(const dir of fs.readdirSync(root,{withFileTypes:true})) {
      if(!dir.isDirectory()||dir.isSymbolicLink())continue;
      const folder=path.join(root,dir.name);let meta;
      try{meta=JSON.parse(fs.readFileSync(path.join(folder,'package.json'),'utf8'));}catch{continue;}
      if(!s.allowed.has(meta.name)||!Array.isArray(meta.commands))continue;
      for(const command of meta.commands) {
        if(typeof command.name!=='string'||!/^[\w-]+$/.test(command.name))continue;
        const file=path.join(folder,command.name+'.js');if(!fs.existsSync(file)||!inside(fs.realpathSync(file),s.roots))continue;
        const buffer=fs.readFileSync(file),before=hash(buffer),id=hash(file.toLowerCase()),old=state.files[id];
        if(old && before===old.patchedHash){result.extensions[meta.name]=(result.extensions[meta.name]||0)+old.count;continue;}
        if(old && buffer.includes(Buffer.from('// raycast-zh-CN:1 '))){result.skipped.push({extension:meta.name,command:command.name,reason:'modified-after-patch'});continue;}
        if(Date.now()-fs.statSync(file).mtimeMs<3000)continue;
        let changed;
        try{
          const scoped=scopes[meta.name]||{};
          changed=transform(buffer.toString('utf8'),s.parser,v=>Object.hasOwn(scoped,v)?scoped[v]:Object.hasOwn(s.dictionary,v)?s.dictionary[v]:v);
        }catch{result.skipped.push({extension:meta.name,command:command.name,reason:'syntax-not-supported'});continue;}
        if(!changed.edits.length)continue;
        const output=Buffer.from(changed.output+'\n// raycast-zh-CN:1 '+before+'\n'),backup=id+'-'+before+'.js';
        fs.mkdirSync(s.backupDir,{recursive:true});
        const backupPath=path.join(s.backupDir,backup);
        if(!fs.existsSync(backupPath))fs.writeFileSync(backupPath,buffer,{flag:'wx'});
        if(hash(fs.readFileSync(backupPath))!==before)throw new Error('Extension backup verification failed');
        if(hash(fs.readFileSync(file))!==before){result.skipped.push({extension:meta.name,command:command.name,reason:'file-changed'});continue;}
        state.files[id]={file,extension:meta.name,originalHash:before,patchedHash:hash(output),backup,count:changed.edits.length};
        // Journal before replacement: a power failure can always be recovered.
        writeJson(s.stateFile,state);
        const temp=file+'.raycast-zh-CN.tmp';
        fs.writeFileSync(temp,output,{flag:'wx'});
        fs.renameSync(temp,file);
        result.extensions[meta.name]=(result.extensions[meta.name]||0)+changed.edits.length;
      }
    }
  }
  writeJson(path.join(installRoot,'plugin-status.json'),result);
  return result;
}
function restore(installRoot,options={}) {
  const s=settings(installRoot,options),state=readState(s);const result={restored:0,conflicts:[],preservedUpdates:[]};
  // Validate every existing target before restoring any file.
  for(const item of Object.values(state.files)) {
    if(!inside(item.file,s.roots)||path.basename(item.backup)!==item.backup)throw new Error('Invalid extension backup path');
    if(!fs.existsSync(item.file))continue;
    if(!inside(fs.realpathSync(item.file),s.roots))throw new Error('Extension path changed to a link');
    const data=fs.readFileSync(item.file),current=hash(data);
    if(current!==item.originalHash&&current!==item.patchedHash) {
      if(data.includes(Buffer.from('// raycast-zh-CN:1 ')))result.conflicts.push(item.extension);
      else result.preservedUpdates.push(item.extension);
    }
    if(hash(fs.readFileSync(path.join(s.backupDir,item.backup)))!==item.originalHash)throw new Error('Extension backup fingerprint mismatch');
  }
  if(result.conflicts.length)return result;
  for(const item of Object.values(state.files))if(fs.existsSync(item.file)) {
    if(hash(fs.readFileSync(item.file))===item.patchedHash) {
      const temp=item.file+'.raycast-zh-CN.tmp';
      fs.writeFileSync(temp,fs.readFileSync(path.join(s.backupDir,item.backup)),{flag:'wx'});
      fs.renameSync(temp,item.file);result.restored++;
    }
  }
  // Only files generated by this patcher are removed, never arbitrary extras.
  if(fs.existsSync(s.backupDir)) {
    for(const file of fs.readdirSync(s.backupDir))if(/^[a-f0-9]{64}-[a-f0-9]{64}\.js$/.test(file))fs.unlinkSync(path.join(s.backupDir,file));
    if(!fs.readdirSync(s.backupDir).length)fs.rmdirSync(s.backupDir);
  }
  for(const file of [s.stateFile,path.join(installRoot,'plugin-status.json')])if(fs.existsSync(file))fs.unlinkSync(file);
  return result;
}
module.exports={apply,restore};
if(require.main===module) {
  try{const result=(process.argv[2]==='restore'?restore:apply)(path.resolve(process.argv[3]));console.log(JSON.stringify(result));if(result.conflicts?.length)process.exitCode=2;}
  catch(error){console.error(error.message);process.exitCode=1;}
}
