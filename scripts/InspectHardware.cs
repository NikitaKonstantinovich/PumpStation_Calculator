// Compile as an x64 console application referencing SolidWorks.Interop.sldworks.
// Pass the DIN 933, DIN 934, DIN 125 and stud SLDPRT paths. Redirect the UTF-8
// output to the audit accepted by index-solidworks-parts.py --hardware-audit.
using System;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text;
using SolidWorks.Interop.sldworks;

class InspectHardware {
    [STAThread] static int Main(string[] paths) {
        if (Process.GetProcessesByName("SLDWORKS").Length != 0) return 7;
        CultureInfo.DefaultThreadCurrentCulture = CultureInfo.InvariantCulture;
        Console.OutputEncoding = new UTF8Encoding(false);
        var sw = new SldWorks { Visible = false, UserControl = false, CommandInProgress = true };
        try {
            foreach (string path in paths) {
                int errors=0, warnings=0;
                var doc=sw.OpenDoc6(Path.GetFullPath(path),1,3,"",ref errors,ref warnings);
                if (doc == null || errors != 0) throw new IOException("Cannot open " + path);
                try {
                    var configs=(string[])doc.GetConfigurationNames();
                    Console.WriteLine("FILE " + Path.GetFileName(path) + " configs=" + configs.Length);
                    foreach (string cfg in configs.Where(c=>c!="PreviewCfg")) {
                        if(doc.ConfigurationManager.ActiveConfiguration.Name!=cfg && !doc.ShowConfiguration2(cfg))continue;
                        var bodies=((PartDoc)doc).GetBodies2(0,false) as object[];
                        if(bodies==null || bodies.Length!=1)continue;
                        var body=(Body2)bodies[0]; var ext=new double[6];
                        for(int j=0;j<6;j++){
                            double x,y,z; int sign=j<3?-1:1;
                            body.GetExtremePoint(j%3==0?sign:0,j%3==1?sign:0,j%3==2?sign:0,out x,out y,out z);
                            ext[j]=1000*new[]{x,y,z}[j%3];
                        }
                        Console.WriteLine(cfg+" EXT "+String.Join(",",ext.Select(v=>v.ToString("0.###"))));
                        foreach(Face2 face in (object[])body.GetFaces()){
                            var surface=(Surface)face.GetSurface();
                            if(surface.IsCylinder())Console.WriteLine("CYL "+String.Join(",",((double[])surface.CylinderParams).Select(v=>v.ToString("0.#####"))));
                        }
                    }
                } finally { sw.CloseDoc(doc.GetTitle()); }
            }
        } finally { sw.CloseAllDocuments(true); sw.CommandInProgress=false; sw.ExitApp(); }
        return 0;
    }
}
