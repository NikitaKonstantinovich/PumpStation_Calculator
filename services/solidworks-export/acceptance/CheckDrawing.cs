using System;
using System.IO;
using System.Collections.Generic;
using System.Linq;
using System.Windows.Forms;
using eDrawings.Interop.EModelViewControl;

// Acceptance check using the installed eDrawings engine and its load events.
class DrawingHost : AxHost {
    public DrawingHost() : base(typeof(EModelViewControlClass).GUID.ToString()) {}
    public EModelViewControl Viewer { get { return (EModelViewControl)GetOcx(); } }
}
class CheckDrawing {
    [STAThread] static int Main(string[] args) {
        string path = Path.GetFullPath(args[0]);
        string output = null; bool executable = false;
        string[] expected = null;
        for (int i = 2; i < args.Length; i += 2) {
            if (i + 1 >= args.Length) return 3;
            if (args[i] == "--expected") expected = File.ReadAllLines(args[i+1]);
            else if (args[i] == "--exe" || args[i] == "--preview") {
                if (output != null) return 3;
                executable = args[i] == "--exe";
                output = Path.GetFullPath(args[i+1]);
                if (File.Exists(output) || !Path.GetExtension(output).Equals(executable ? ".exe" : ".jpg", StringComparison.OrdinalIgnoreCase)) return 3;
            } else return 3;
        }
        int required = int.Parse(args[1]), status = 1;
        using (var win = new Form { ShowInTaskbar = false, Opacity = 0, Width = 1200, Height = 760 })
        using (var host = new DrawingHost { Dock = DockStyle.Fill })
        using (var limit = new Timer { Interval = 120000 }) {
            win.Controls.Add(host);
            limit.Tick += (s,e) => { Console.Error.WriteLine("Viewer timed out"); win.Close(); };
            win.Shown += (s,e) => {
                limit.Start();
                var control = host.Viewer;
                control.OnFailedSavingDocument += (file,code,reason) => {
                    Console.Error.WriteLine("eDrawings could not save the file: {0} ({1})", reason, code);
                    status = 4; win.BeginInvoke(new Action(win.Close));
                };
                control.OnFinishedSavingDocument += () => win.BeginInvoke(new Action(() => {
                    status = output != null && File.Exists(output) && new FileInfo(output).Length > 0 ? 0 : 4;
                    win.Close();
                }));
                control.OnFailedLoadingDocument += (file,code,reason) => {
                    Console.Error.WriteLine("eDrawings rejected file: {0} ({1})",reason,code);
                    win.BeginInvoke(new Action(win.Close));
                };
                control.OnFinishedLoadingDocument += (file) => win.BeginInvoke(new Action(() => {
                    string cfg=control.ConfigurationCount>0?control.get_ConfigurationName(0):"";
                    int count = control.get_ComponentCount(cfg);
                    if(expected!=null){
                        var names=new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                        var root=control.get_ComponentName(cfg,0)+"/";
                        for(int i=1;i<count;i++){
                            string name=control.get_ComponentName(cfg,i);
                            if(name.StartsWith(root,StringComparison.OrdinalIgnoreCase))names.Add(name.Substring(root.Length));
                        }
                        var missing=expected.Where(n=>!names.Contains(n)).ToArray();
                        if(missing.Length>0){
                            Console.Error.WriteLine("Missing {0} assembly occurrences in EASM: {1}",missing.Length,String.Join(", ",missing.Take(3)));
                            status=2;win.Close();return;
                        }
                    }
                    Console.WriteLine("eDrawings finished loading: {0}; components: {1}; configurations: {2}",file,count,control.ConfigurationCount);
                    if (!String.Equals(Path.GetFullPath(file),path,StringComparison.OrdinalIgnoreCase) || count < required) {
                        status = 2; win.Close();
                    } else if (output != null) {
                        if (!executable) {
                            control.ViewOrientation = EMVViewOrientation.eMVOrientationIsoMetric;
                            control.ViewOrientation = EMVViewOrientation.eMVOrientationZoomToFit;
                        }
                        control.Save(output, false, "");
                    }
                    else { status = 0; win.Close(); }
                }));
                control.OpenDoc(path,false,false,true,"");
            };
            Application.Run(win);
        }
        return status;
    }
}
