// A process-local .NET startup hook. It changes only reviewed tray menu labels;
// no executable, resource file, command, settings or database is modified.
using System;
using System.Collections;
using System.Collections.Generic;
using System.Reflection;
using System.Threading;

public class StartupHook
{
    static Timer timer;
    static int busy;
    static int translated;
    static string lastStatus;
    static readonly BindingFlags Flags = BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance;
    static readonly Dictionary<string,string> Labels = new Dictionary<string,string>(StringComparer.Ordinal) {
        {"Open Raycast", "打开 Raycast"}, {"Send Feedback", "发送反馈"},
        {"Manual", "使用手册"}, {"Troubleshooting", "故障排查"},
        {"Subscribe for Updates", "订阅更新"}, {"Join our Community", "加入社区"},
        {"Follow us", "关注我们"}, {"Subscribe to Our Channel", "订阅我们的频道"},
        {"About Raycast", "关于 Raycast"}, {"Check for updates", "检查更新"},
        {"Settings...", "设置…"}, {"Settings…", "设置…"}, {"Settings", "设置"}, {"Quit", "退出"}
    };
    public static void Initialize()
    {
        // Only the actual Raycast host can load this hook; helper processes are ignored.
        if (!string.Equals(System.IO.Path.GetFileNameWithoutExtension(Environment.GetCommandLineArgs()[0]), "Raycast", StringComparison.OrdinalIgnoreCase)) return;
        Status("loaded");
        timer = new Timer(Tick, null, 500, 750);
    }
    static void Status(string phase)
    {
        try {
            string value="{\"state\":\""+phase+"\",\"translated\":"+translated+"}";
            if(value==lastStatus)return;
            string file=Environment.GetEnvironmentVariable("RAYCAST_ZH_NATIVE_STATUS");
            if(!string.IsNullOrEmpty(file)) System.IO.File.WriteAllText(file,value);
            lastStatus=value;
        }catch{}
    }
    static object Get(object obj, string name)
    {
        if(obj == null) return null;
        var p = obj.GetType().GetProperty(name, Flags);
        return p == null || p.GetIndexParameters().Length != 0 ? null : p.GetValue(obj, null);
    }
    static void Tick(object ignored)
    {
        if(Interlocked.Exchange(ref busy, 1) != 0) return;
        try {
            Type appType = null;
            foreach(var a in AppDomain.CurrentDomain.GetAssemblies()) {
                if(a.GetName().Name == "Raycast") { appType = a.GetType("Raycast.App"); break; }
            }
            if(appType == null) { Interlocked.Exchange(ref busy, 0); return; }
            var current = appType.GetProperty("Current", BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.DeclaredOnly).GetValue(null, null);
            if(current == null) { Interlocked.Exchange(ref busy, 0); return; }
            var dispatcher = Get(current,"Dispatcher");
            Action action = delegate {
                try {
                    var seen = new HashSet<object>();
                    // These are the two actual tray menus in MainWindow.xaml.
                    var main=Get(current,"RaycastWindowOrNull");
                    var resources=Get(main,"Resources") as IDictionary;
                    if(resources!=null) foreach(var key in new[]{"NotifyContextMenuDark","NotifyContextMenuLight"}) {
                        if(resources.Contains(key)) Walk(resources[key],seen,0);
                    }
                    var trayField=main==null?null:main.GetType().GetField("TrayIcon",Flags);
                    if(trayField!=null) Walk(Get(trayField.GetValue(main),"ContextMenu"),seen,0);
                    var trays=appType.GetField("_trayItems",Flags);
                    var values=trays==null?null:Get(trays.GetValue(current),"Values") as IEnumerable;
                    if(values!=null) foreach(var item in values) {
                        var icon=item.GetType().GetField("_icon",Flags);
                        if(icon!=null) Walk(Get(icon.GetValue(item),"ContextMenu"),seen,0);
                    }
                    Status("active");
                } catch { Status("menu-unavailable"); }
                finally { Interlocked.Exchange(ref busy, 0); }
            };
            var begin=dispatcher.GetType().GetMethod("BeginInvoke",new Type[]{typeof(Delegate),typeof(object[])});
            begin.Invoke(dispatcher,new object[]{action,new object[0]});
        } catch { Status("waiting");Interlocked.Exchange(ref busy, 0); }
    }
    static string Translate(string text)
    {
        string result;
        if(Labels.TryGetValue(text,out result)) return result;
        if(text.StartsWith("Version: ",StringComparison.Ordinal)) return "版本："+text.Substring(9);
        if(text.StartsWith("CPU: native ",StringComparison.Ordinal)) return "架构：原生 "+text.Substring(12);
        return text;
    }
    static void Walk(object obj,HashSet<object> seen,int depth)
    {
        if(obj==null || depth>8 || !seen.Add(obj)) return;
        var type=obj.GetType();
        if(type.FullName=="System.Windows.ResourceDictionary") {
            var values=Get(obj,"Values") as ICollection;
            if(values!=null) { var copy=new object[values.Count];values.CopyTo(copy,0);foreach(var v in copy) Walk(v,seen,depth+1); }
            var merged=Get(obj,"MergedDictionaries") as IEnumerable;
            if(merged!=null) foreach(var v in merged) Walk(v,seen,depth+1);
            return;
        }
        // Do not walk arbitrary windows or user documents: only menu objects.
        if(!type.Name.Contains("Menu") && !type.Name.Contains("TaskbarIcon")) return;
        var header=type.GetProperty("Header",Flags);
        var text=header==null?null:header.GetValue(obj,null) as string;
        if(text!=null) { var replacement=Translate(text);if(text!=replacement) {header.SetValue(obj,replacement,null);translated++;} }
        var items=Get(obj,"Items") as IEnumerable;
        if(items!=null) foreach(var item in items) Walk(item,seen,depth+1);
        Walk(Get(obj,"ContextMenu"),seen,depth+1);
    }
}
