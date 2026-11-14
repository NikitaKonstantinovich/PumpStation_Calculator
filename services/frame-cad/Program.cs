using SolidWorks.Interop.sldworks;
using SolidWorks.Interop.swconst;
using System.Diagnostics;
using System.Security.Cryptography;
using System.Text.Json;
class Program {
 static string Sha(string p){using var stream=new FileStream(p,FileMode.Open,FileAccess.Read,FileShare.ReadWrite|FileShare.Delete);return Convert.ToHexString(SHA256.HashData(stream)).ToLowerInvariant();}
 static List<Feature> Features(ModelDoc2 doc){var list=new List<Feature>();for(Feature? f=doc.FirstFeature() as Feature;f!=null;f=f.GetNextFeature() as Feature)list.Add(f);return list;}
 static void Save(ModelDoc2 doc,string path){int e=0,w=0;doc.ClearSelection2(true);if(!doc.Extension.SaveAs(path,0,(int)swSaveAsOptions_e.swSaveAsOptions_Silent,null,ref e,ref w)||e!=0)throw new Exception("Save failed "+path+": "+e);}
 static double[] Bounds(Body2 body){var b=new double[6];for(int i=0;i<6;i++){int j=i%3,s=i<3?-1:1;body.GetExtremePoint(j==0?s:0,j==1?s:0,j==2?s:0,out double x,out double y,out double z);b[i]=1000*new[]{x,y,z}[j];}return b;}
 static void Verify(SldWorks sw,string folder){
  var records=JsonSerializer.Deserialize<List<JsonElement>>(File.ReadAllText(Path.Combine(folder,"manifest.json")))!;
  if(records.Count!=90)throw new Exception("Expected 90 frame variants");
  var checkedRows=new List<object>();
  foreach(var row in records){
   var path=Path.Combine(folder,row.GetProperty("native").GetString()!);int e=0,w=0;
   ModelDoc2 doc=sw.OpenDoc6(path,1,3,"",ref e,ref w);
   if(doc==null||e!=0)throw new Exception("Reopen failed: "+path+" "+e);
   try{
    var bodies=((PartDoc)doc).GetBodies2(0,false) as object[];
    if(bodies?.Length!=1)throw new Exception("Invalid body count: "+path);
    var body=(Body2)bodies[0];var bounds=Bounds(body);var extents=Enumerable.Range(0,3).Select(i=>bounds[i+3]-bounds[i]).Order().ToArray();
    var sheet=(Feature)doc.Extension.GetTemplateSheetMetal();var data=(SheetMetalFeatureData)sheet.GetDefinition();
    var mass=(MassProperty)doc.Extension.CreateMassProperty();var color=(double[])doc.MaterialPropertyValues;
    if(Math.Abs(extents[2]-row.GetProperty("lengthMm").GetDouble())>.1||Math.Abs(extents[0]-50)>.1||Math.Abs(data.Thickness*1000-row.GetProperty("thicknessMm").GetDouble())>.001||Math.Abs(mass.Mass-row.GetProperty("massKg").GetDouble())>.001)throw new Exception("Reopened dimensions/mass differ: "+path);
    var red=row.GetProperty("color").GetString()=="red";if(red?color[0]<=color[2]:color[2]<=color[0])throw new Exception("Incorrect appearance: "+path);
    if(Sha(path)!=row.GetProperty("nativeHash").GetString())throw new Exception("Hash differs: "+path);
    checkedRows.Add(new{id=row.GetProperty("id").GetString(),configuration=doc.ConfigurationManager.ActiveConfiguration.Name,thicknessMm=data.Thickness*1000,massKg=mass.Mass,boundsMm=bounds,color,bodyColor=body.MaterialPropertyValues2});
    Console.WriteLine("Verified "+checkedRows.Count+"/90");
   }finally{sw.CloseDoc(doc.GetTitle());}
  }
  File.WriteAllText(Path.Combine(folder,"verification.json"),JsonSerializer.Serialize(checkedRows,new JsonSerializerOptions{WriteIndented=true}));
 }
 static void ExportHardware(SldWorks sw,string list,string folder){
  var records=JsonSerializer.Deserialize<List<JsonElement>>(File.ReadAllText(list))!;var output=new List<object>();
  foreach(var row in records){
   var path=row.GetProperty("path").GetString()!;var id=row.GetProperty("id").GetString()!;ModelDoc2? doc=null;
   try{
    int e=0,w=0;doc=sw.OpenDoc6(path,1,3,"",ref e,ref w);
    if(doc==null||e!=0)throw new Exception("Open error "+e);
    var bodies=((PartDoc)doc).GetBodies2(0,false) as object[];if(bodies==null||bodies.Length==0)throw new Exception("No solid bodies");
    var boxes=bodies.Select(b=>Bounds((Body2)b)).ToArray();var bounds=Enumerable.Range(0,6).Select(i=>i<3?boxes.Min(b=>b[i]):boxes.Max(b=>b[i])).ToArray();
    var mass=(MassProperty)doc.Extension.CreateMassProperty();Save(doc,Path.Combine(folder,id+".stl"));Save(doc,Path.Combine(folder,id+".step"));
    output.Add(new{id,path,sourceHash=Sha(path),boundsMm=bounds,cadMassKg=mass.Mass,volumeM3=mass.Volume,stl=id+".stl",stlHash=Sha(Path.Combine(folder,id+".stl")),step=id+".step",geometryVerified=true});
    Console.WriteLine("Prepared hardware "+id);
   }catch(Exception error){output.Add(new{id,path,geometryVerified=false,error=error.Message});Console.WriteLine("Unavailable "+id+": "+error.Message);}
   finally{if(doc!=null)sw.CloseDoc(doc.GetTitle());}
   File.WriteAllText(Path.Combine(folder,"hardware-manifest.json"),JsonSerializer.Serialize(output,new JsonSerializerOptions{WriteIndented=true}));
  }
 }
 [STAThread] static int Main(string[] args){
  if(args.Length<2){Console.Error.WriteLine("FrameCad <verified-sheet-metal-template> <output-directory> [single]");return 2;}
  var folder=Path.GetFullPath(args[1]);Directory.CreateDirectory(folder);
  var existing=Process.GetProcessesByName("SLDWORKS").Select(p=>p.Id).ToHashSet();SldWorks? sw=null;
  try{
   var candidate=new SldWorks();if(existing.Contains(candidate.GetProcessID())){System.Runtime.InteropServices.Marshal.ReleaseComObject(candidate);throw new Exception("SOLIDWORKS занят пользовательской сессией");}
   sw=candidate;sw.Visible=false;sw.UserControl=false;sw.CommandInProgress=true;
   sw.SetUserPreferenceIntegerValue((int)swUserPreferenceIntegerValue_e.swExportStlUnits,(int)swLengthUnit_e.swMM);
   sw.SetUserPreferenceToggle((int)swUserPreferenceToggle_e.swSTLBinaryFormat,true);
   sw.SetUserPreferenceToggle((int)swUserPreferenceToggle_e.swSTLDontTranslateToPositive,true);
   if(args.Length>2&&args[2]=="hardware"){ExportHardware(sw,args[0],folder);return 0;}
   if(args.Length>2&&args[2]=="verify"){Verify(sw,folder);return 0;}
   var manifestPath=Path.Combine(folder,"manifest.json");
   var manifest=File.Exists(manifestPath)?JsonSerializer.Deserialize<List<JsonElement>>(File.ReadAllText(manifestPath))!.Select(x=>(object)x).ToList():new List<object>();
   foreach(int thickness in new[]{3,4,5})for(int length=600;length<=2000;length+=100){
    if(manifest.OfType<JsonElement>().Count(x=>x.GetProperty("lengthMm").GetInt32()==length&&x.GetProperty("thicknessMm").GetInt32()==thickness)==2)continue;
    var working=Path.Combine(folder,"working-template.SLDPRT");File.Copy(Path.GetFullPath(args[0]),working,true);File.SetAttributes(working,FileAttributes.Normal);
    int e=0,w=0;ModelDoc2 doc=sw.OpenDoc6(working,1,1,"",ref e,ref w);
    if(doc==null||e!=0)throw new Exception("Template open: "+e);
    try{
     var names=(string[])doc.GetConfigurationNames();
     var folded=names.First(n=>!n.Contains("FLAT",StringComparison.OrdinalIgnoreCase)&&!n.Contains("развер",StringComparison.OrdinalIgnoreCase)&&!n.Contains("развёр",StringComparison.OrdinalIgnoreCase));
     doc.ShowConfiguration2(folded);
     Console.WriteLine("Configuration "+doc.ConfigurationManager.ActiveConfiguration.Name+" of "+String.Join(";",names));
     if(doc.ConfigurationManager.ActiveConfiguration.Name!=folded)throw new Exception("Cannot activate folded configuration");
     var features=Features(doc);
     foreach(var f in features.Where(f=>f.GetTypeName2()=="FlatPattern"))f.SetSuppression2((int)swFeatureSuppressionAction_e.swSuppressFeature,(int)swInConfigurationOpts_e.swThisConfiguration,null);
     foreach(var f in features.Where(f=>new[]{"HoleWzd","Cut","LPattern","CirPattern","MirrorPattern"}.Contains(f.GetTypeName2())))
      if(!f.SetSuppression2((int)swFeatureSuppressionAction_e.swSuppressFeature,(int)swInConfigurationOpts_e.swThisConfiguration,null))throw new Exception("Cannot suppress "+f.Name);
     Console.WriteLine("Suppressed project holes");
     var sheet=doc.Extension.GetTemplateSheetMetal() as Feature ?? features.Single(f=>f.GetTypeName2()=="SheetMetal");
     var data=(SheetMetalFeatureData)sheet.GetDefinition();
     if(!data.AccessSelections(doc,null))throw new Exception("Cannot access sheet metal");
     data.Thickness=thickness/1000.0;
     Console.WriteLine("Setting sheet thickness "+sheet.Name);
     if(!sheet.ModifyDefinition(data,doc,null))throw new Exception("Cannot change sheet thickness");
     var dimension=(Dimension)doc.Parameter("D2@Эскиз1");
     if(dimension==null)throw new Exception("Template length parameter missing");
     dimension.SystemValue=length/1000.0;
     doc.ShowConfiguration2(folded);
     foreach(var f in Features(doc).Where(f=>f.GetTypeName2()=="FlatPattern"))f.SetSuppression2((int)swFeatureSuppressionAction_e.swSuppressFeature,(int)swInConfigurationOpts_e.swThisConfiguration,null);
     doc.ForceRebuild3(false);
     Console.WriteLine("Rebuilt");
     var check=(SheetMetalFeatureData)sheet.GetDefinition();if(Math.Abs(check.Thickness*1000-thickness)>.001)throw new Exception("Thickness did not update");
     var bodies=((PartDoc)doc).GetBodies2(0,false) as object[];
     if(bodies?.Length!=1)throw new Exception("Expected one solid");
     var body=(Body2)bodies[0];var bounds=Bounds(body);var extents=Enumerable.Range(0,3).Select(i=>bounds[i+3]-bounds[i]).Order().ToArray();
     if(Math.Abs(extents[2]-length)>.1||Math.Abs(extents[0]-50)>.1)throw new Exception("Invalid envelope "+String.Join(",",extents));
     var mass=(MassProperty)doc.Extension.CreateMassProperty();
     if(mass.Mass<=0||mass.Volume<=0)throw new Exception("Invalid mass properties");
     var stem=$"frame-410-{length}-{thickness}";
     Console.WriteLine("Saving native before export");Save(doc,Path.Combine(folder,stem+"-unpainted.SLDPRT"));
     Console.WriteLine("Exporting mesh");Save(doc,Path.Combine(folder,stem+".stl"));Console.WriteLine("Exporting STEP");Save(doc,Path.Combine(folder,stem+".step"));
     foreach(var color in new[]{"blue","red"}){
      double[] appearance=color=="blue"?new[]{.0,.32,.58,1,.8,.3,.3,0,0}:new[]{.64,.09,.12,1,.8,.3,.3,0,0};
      doc.MaterialPropertyValues=appearance;
      var native=Path.Combine(folder,stem+"-"+color+".SLDPRT");Save(doc,native);
      manifest.Add(new{id=$"bent-frame-410-{length}-{thickness}-{color}",lengthMm=length,thicknessMm=thickness,widthMm=410,color,massKg=mass.Mass,volumeM3=mass.Volume,boundsMm=bounds,native=Path.GetFileName(native),stl=stem+".stl",step=stem+".step",nativeHash=Sha(native),stlHash=Sha(Path.Combine(folder,stem+".stl")),templateHash=Sha(args[0]),verified=true});
     }
     File.WriteAllText(Path.Combine(folder,"manifest.json"),JsonSerializer.Serialize(manifest,new JsonSerializerOptions{WriteIndented=true}));
     Console.WriteLine($"Prepared {length} x {thickness}; {manifest.Count}/90");
    }catch(Exception error){Console.Error.WriteLine(error);throw;}finally{try{sw.CloseDoc(doc.GetTitle());}catch(Exception error){Console.Error.WriteLine("Close: "+error.Message);}}
    if(args.Length>2)return 0;
   }
  }catch(Exception ex){File.WriteAllText(Path.Combine(folder,"error.txt"),ex.ToString());Console.Error.WriteLine(ex);return 1;}
  finally{if(sw!=null){try{sw.CommandInProgress=false;sw.ExitApp();}catch(Exception error){Console.Error.WriteLine("Exit: "+error.Message);}}}
  return 0;
 }
}
