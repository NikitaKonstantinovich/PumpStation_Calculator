using System.Runtime.InteropServices;
using System.Text.Json;
using System.Text.RegularExpressions;
using SolidWorks.Interop.sldworks;
using SolidWorks.Interop.swconst;

record Instance(string Id, string Name, string Path, double[] Transform, bool Hidden,
    string? DetailName = null, string? Configuration = null, string? Appearance = null, string? Material = null,
    string? SpecPosition = null, string? Origin = null, string? SourceFile = null, string? SourceHash = null, double[]? BrowserTransform = null)
{
    public string Label => Program.SafeName(Regex.Replace(DetailName ?? Name, @" · \d+\.\d+$", ""));
    public (string,string?,string) Document => (Path, Configuration, Label);
}
record Manifest(Instance[] Instances);
record Omission(string Id, string Code, string Reason);

internal static class Program
{
    static readonly JsonSerializerOptions Json = new() { PropertyNameCaseInsensitive = true, WriteIndented = true };

    [STAThread]
    static int Main(string[] args)
    {
        if (args.Length is < 2 or > 3) { Console.Error.WriteLine("Usage: SolidWorksExport <job-directory> <assembly-template> [part-template]"); return 2; }
        bool export = args[0] == "--edrawings", verify = args[0] == "--verify-snapshot";
        var folder = System.IO.Path.GetFullPath(export || verify ? args[1] : args[0]);
        SldWorks? sw = null;
        System.Diagnostics.Process? cadProcess = null;
        bool? oldInterconnect = null;
        bool? oldSurface = null;
        int? oldSew = null;
        bool? oldDefaultTemplates = null;
        string? oldPartTemplate = null;
        string? oldAssemblyTemplate = null;
        try
        {
            foreach (var existing in System.Diagnostics.Process.GetProcessesByName("SLDWORKS"))
                using (existing) {
                    if (!existing.HasExited && (existing.MainWindowHandle!=IntPtr.Zero || !existing.WaitForExit(10000)))
                        throw new Exception("SOLIDWORKS уже запущен. Исполнитель требует отдельной свободной Windows-сессии.");
                }
            Console.WriteLine("Starting SOLIDWORKS");
            sw = new SldWorks { Visible = System.Environment.GetEnvironmentVariable("CAD_EXPORT_DIAGNOSTIC_UI") == "1", UserControl = false };
            cadProcess = System.Diagnostics.Process.GetProcessById(sw.GetProcessID());
            sw.CommandInProgress = true;
            if (verify)
            {
                var inputs = JsonSerializer.Deserialize<Manifest>(File.ReadAllText(Path.Combine(folder, "resolved.json")), Json)!;
                var omitted = JsonSerializer.Deserialize<Omission[]>(File.ReadAllText(Path.Combine(folder, "runner-omissions.json")), Json)!;
                var skipped = omitted.Select(o => o.Id).ToHashSet();
                VerifyPacked(sw, folder, inputs.Instances.Where(i => !skipped.Contains(i.Id)).ToDictionary(i => i.Id));
                return 0;
            }
            if (export)
            {
                var packed = OpenSnapshot(sw, folder);
                ((AssemblyDoc)packed).ResolveAllLightWeightComponents(false);
                packed.ClearSelection2(true);
                Save(packed, Path.Combine(folder, "assembly.easm"));
                return 0;
            }
            oldInterconnect = sw.GetUserPreferenceToggle((int)swUserPreferenceToggle_e.swMultiCAD_Enable3DInterconnect);
            sw.SetUserPreferenceToggle((int)swUserPreferenceToggle_e.swMultiCAD_Enable3DInterconnect, false);
            oldSurface = sw.GetUserPreferenceToggle((int)swUserPreferenceToggle_e.swImportSolidSurface);
            oldSew = sw.GetUserPreferenceIntegerValue((int)swUserPreferenceIntegerValue_e.swCreateBodyFromSurfacesOption);
            sw.SetUserPreferenceToggle((int)swUserPreferenceToggle_e.swImportSolidSurface,true);
            sw.SetUserPreferenceIntegerValue((int)swUserPreferenceIntegerValue_e.swCreateBodyFromSurfacesOption,(int)swGeneralImportSurfaceSolidEntityOptions_e.swGeneralImportTryFormingSolids);
            if (args.Length == 3)
            {
                oldDefaultTemplates = sw.GetUserPreferenceToggle((int)swUserPreferenceToggle_e.swAlwaysUseDefaultTemplates);
                oldPartTemplate = sw.GetUserPreferenceStringValue((int)swUserPreferenceStringValue_e.swDefaultTemplatePart);
                oldAssemblyTemplate = sw.GetUserPreferenceStringValue((int)swUserPreferenceStringValue_e.swDefaultTemplateAssembly);
                sw.SetUserPreferenceStringValue((int)swUserPreferenceStringValue_e.swDefaultTemplatePart, System.IO.Path.GetFullPath(args[2]));
                sw.SetUserPreferenceStringValue((int)swUserPreferenceStringValue_e.swDefaultTemplateAssembly, System.IO.Path.GetFullPath(args[1]));
                sw.SetUserPreferenceToggle((int)swUserPreferenceToggle_e.swAlwaysUseDefaultTemplates, true);
            }
            var manifest = JsonSerializer.Deserialize<Manifest>(File.ReadAllText(Path.Combine(folder, "resolved.json")), Json)
                ?? throw new Exception("Нет компоновки");
            Build(sw, folder, args[1], manifest.Instances);
            return 0;
        }
        catch (Exception error)
        {
            File.WriteAllText(System.IO.Path.Combine(folder, "error.json"), JsonSerializer.Serialize(new { error = error.Message }, Json));
            Console.Error.WriteLine(error);
            return 1;
        }
        finally
        {
            if (sw is not null)
            {
                try
                {
                    if (oldInterconnect.HasValue) sw.SetUserPreferenceToggle((int)swUserPreferenceToggle_e.swMultiCAD_Enable3DInterconnect, oldInterconnect.Value);
                    if (oldSurface.HasValue) sw.SetUserPreferenceToggle((int)swUserPreferenceToggle_e.swImportSolidSurface,oldSurface.Value);
                    if (oldSew.HasValue) sw.SetUserPreferenceIntegerValue((int)swUserPreferenceIntegerValue_e.swCreateBodyFromSurfacesOption,oldSew.Value);
                    if (oldDefaultTemplates.HasValue)
                    {
                        sw.SetUserPreferenceStringValue((int)swUserPreferenceStringValue_e.swDefaultTemplatePart, oldPartTemplate);
                        sw.SetUserPreferenceStringValue((int)swUserPreferenceStringValue_e.swDefaultTemplateAssembly, oldAssemblyTemplate);
                        sw.SetUserPreferenceToggle((int)swUserPreferenceToggle_e.swAlwaysUseDefaultTemplates, oldDefaultTemplates.Value);
                    }
                    sw.CloseAllDocuments(true);
                    sw.CommandInProgress = false;
                    sw.ExitApp();
                }
                catch (Exception error) { Console.Error.WriteLine($"Cleanup: {error.Message}"); }
                finally {
                    if (Marshal.IsComObject(sw)) Marshal.FinalReleaseComObject(sw);
                    sw = null;
                    GC.Collect(); GC.WaitForPendingFinalizers();
                    // ExitApp is asynchronous. A queued EASM may start immediately
                    // after the assembly and must not collide with our closing session.
                    if (cadProcess != null && !cadProcess.WaitForExit(30000))
                        Console.Error.WriteLine("SOLIDWORKS still closing after ExitApp.");
                    cadProcess?.Dispose();
                }
            }
        }
    }

    static void Build(SldWorks sw, string folder, string template, Instance[] instances)
    {
        var native = Path.Combine(folder, "native");
        Directory.CreateDirectory(native);
        var files = new Dictionary<(string,string?,string), string>();
        var omissions = new List<Omission>();
        var groups = instances.GroupBy(i => i.Document).ToArray();
        // Keep one root document alive while converting parts. Closing the last
        // document in an automation-owned background session exits SOLIDWORKS.
        var model = (ModelDoc2)sw.NewDocument(Path.GetFullPath(template), 0, 0, 0);
        if (model is null || model.GetType() != 2) throw new Exception("Не удалось создать сборку по шаблону.");
        int imported = 0;
        Progress(folder, "import", 0, groups.Length);
        foreach (var group in groups)
        {
            var part = group.First();
            var source = part.Path;
            var code = "import_error";
            ModelDoc2? doc = null;
            try
            {
                int errors = 0, warnings = 0;
                var extension = Path.GetExtension(source).ToLowerInvariant();
                doc = extension is ".sldprt" or ".sldasm"
                    ? sw.OpenDoc6(source, extension == ".sldasm" ? 2 : 1, 3, part.Configuration ?? "", ref errors, ref warnings)
                    : sw.LoadFile4(source, "r", sw.GetImportFileData(source), ref errors);
                if (doc is null || errors != 0) throw new InvalidDataException($"Не удалось открыть модель (код {errors}).");
                code = "part_creation";
                if (part.Configuration is string cfg && doc.ConfigurationManager.ActiveConfiguration.Name != cfg && !doc.ShowConfiguration2(cfg))
                    throw new InvalidDataException($"Не открылась конфигурация {cfg}.");
                if (SolidCount(doc) == 0) throw new InvalidDataException("В исходной модели нет твёрдых тел.");
                var name = $"{part.Label} ({files.Count + 1:D3})";
                var path = Path.Combine(native, name + (doc.GetType() == 2 ? ".sldasm" : ".sldprt"));
                Save(doc, path);
                var props = doc.Extension.CustomPropertyManager[""];
                props.Add3("Наименование", 30, part.DetailName ?? part.Name, 2);
                props.Add3("Источник модели", 30, part.SourceFile ?? "Параметрическая деталь установки", 2);
                if (part.Material is string material) props.Add3("Материал обвязки",30,material,2);
                if (!doc.Save3(1,ref errors,ref warnings) || errors!=0) throw new InvalidDataException("Не удалось сохранить свойства документа.");
                files.Add(group.Key, path);
            }
            catch (Exception error) when (error is COMException or InvalidDataException)
            {
                omissions.AddRange(group.Select(p => new Omission(p.Id, code, error.Message)));
            }
            finally
            {
                // AddComponents3 reads the saved native path. Keeping imported
                // document windows open exhausts GDI handles on large stations.
                if (doc is not null) sw.CloseDoc(doc.GetTitle());
            }
            Progress(folder, "import", ++imported, groups.Length);
        }

        int activationError = 0;
        if (sw.ActivateDoc3(model.GetTitle(), false, (int)swRebuildOnActivation_e.swDontRebuildActiveDoc, ref activationError) is null || activationError != 0)
            throw new InvalidDataException("Не удалось активировать сборку после подготовки компонентов.");
        var assembly = (AssemblyDoc)model;
        var included = new Dictionary<string, Instance>();
        // This API uses true to suspend automatic rebuilds of the root assembly.
        assembly.EnableAssemblyRebuild = true;
        model.FeatureManager.EnableFeatureTree = false;
        var candidates = instances.Where(part => files.ContainsKey(part.Document)).ToArray();
        int processed = 0;
        Progress(folder, "insert", 0, candidates.Length);
        void Insert(Instance[] batch)
        {
            object[]? added = null;
            string reason = "SOLIDWORKS не вставил деталь в сборку.";
            try
            {
                added = assembly.AddComponents3(batch.Select(p => files[p.Document]).ToArray(),
                    batch.SelectMany(p => p.Transform).ToArray(), batch.Select(_ => "").ToArray()) as object[];
            }
            catch (COMException error) { reason = error.Message; }
            // After a partial COM failure, reconcile actual insertions before retrying singles.
            // Every component from earlier batches already has its snapshot ID.
            var inserted = added?.OfType<Component2>().ToArray();
            if (inserted?.Length != batch.Length)
                inserted = (assembly.GetComponents(true) as object[] ?? Array.Empty<object>()).Cast<Component2>()
                    .Where(c => !included.ContainsKey(c.ComponentReference ?? "")).ToArray();
            var missing = batch.ToList();
            foreach (var component in inserted)
            {
                string path = component.GetPathName();
                var actual = (double[])component.Transform2.ArrayData;
                int i = missing.FindIndex(p => files[p.Document].Equals(path, StringComparison.OrdinalIgnoreCase) && SamePose(actual, p.Transform));
                if (i < 0) throw new InvalidDataException("Не удалось сопоставить вставленный компонент со снимком.");
                var part = missing[i]; missing.RemoveAt(i);
                component.ComponentReference = part.Id;
                if (part.Configuration is string conf && component.ReferencedConfiguration != conf) component.ReferencedConfiguration = conf;
                if (Finish(part.Appearance) is double[] color) component.SetMaterialPropertyValues2(color,1,null);
                int visibility = part.Hidden ? (int)swComponentVisibilityState_e.swComponentHidden : (int)swComponentVisibilityState_e.swComponentVisible;
                if (component.Visible != visibility) component.Visible = visibility;
                included.Add(part.Id, part);
            }
            if (inserted.Length > 0)
            {
                model.ClearSelection2(true);
                if (model.Extension.MultiSelect2(inserted.Select(c => new DispatchWrapper(c)).ToArray(), false, null) == inserted.Length)
                    assembly.FixComponent();
                foreach (var c in inserted.Where(c => !c.IsFixed()))
                {
                    if (!c.Select4(false, null, false)) throw new InvalidDataException("Не удалось выбрать компонент для фиксации.");
                    assembly.FixComponent();
                    if (!c.IsFixed()) throw new InvalidDataException("Не удалось зафиксировать компонент.");
                }
            }
            if (batch.Length > 1) foreach (var p in missing) Insert(new[] { p });
            else if (missing.Count > 0) omissions.Add(new Omission(batch[0].Id, "part_creation", reason));
        }
        foreach (var batch in candidates.Chunk(32))
        {
            Insert(batch);
            processed += batch.Length;
            Progress(folder, "insert", processed, candidates.Length);
        }
        File.WriteAllText(Path.Combine(folder, "runner-omissions.json"), JsonSerializer.Serialize(omissions,
            new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase }));
        if (included.Count == 0) throw new Exception("Ни одного физического элемента собрать не удалось.");
        Progress(folder, "rebuild", 0, 0);
        model.ClearSelection2(true);
        model.FeatureManager.EnableFeatureTree = true;
        assembly.EnableAssemblyRebuild = false;
        if (!model.EditRebuild3()) throw new Exception("Ошибка перестроения сборки.");
        Verify(assembly, included);
        model.ShowNamedView2("", 7);
        model.ViewZoomtofit2();
        Save(model, Path.Combine(native, "PumpStation.SLDASM"));

        Progress(folder, "pack", 0, 0);
        var snapshot = Path.Combine(folder, "snapshot");
        Directory.CreateDirectory(snapshot);
        var pack = model.Extension.GetPackAndGo();
        pack.IncludeDrawings = false;
        if (!pack.GetDocumentNames(out object names) || names is not string[] references)
            throw new Exception("Не удалось получить список файлов Pack and Go.");
        var assemblyPath = model.GetPathName();
        var stagedFiles=files.Values.ToHashSet(StringComparer.OrdinalIgnoreCase);
        var used = new HashSet<string>(StringComparer.OrdinalIgnoreCase) {"PumpStation.SLDASM"};
        var destinations = references.Select(path => {
            if(path.Equals(assemblyPath,StringComparison.OrdinalIgnoreCase))return Path.Combine(snapshot,"PumpStation.SLDASM");
            var stem=Path.GetFileNameWithoutExtension(path);
            if(!stagedFiles.Contains(path))stem=SafeName(stem);
            var ext=Path.GetExtension(path);
            var name=stem+ext; int n=0;
            while(!used.Add(name)) name=$"{stem} ({++n}){ext}";
            return Path.Combine(snapshot,name);
        }).ToArray();
        if (!pack.SetDocumentSaveToNames(destinations)) throw new Exception("Не удалось назначить пути Pack and Go.");
        var statuses = model.Extension.SavePackAndGo(pack) as int[];
        if (statuses is null || statuses.Length == 0 || statuses.Any(x => x != 0)) throw new Exception("Ошибка Pack and Go.");
        sw.CloseAllDocuments(true);
        Progress(folder, "verify", 0, 0);
        var verified = VerifyPacked(sw, folder, included);
        File.WriteAllText(Path.Combine(folder, "verification.json"), JsonSerializer.Serialize(new { count = included.Count, instances = verified }, Json));
    }

    static void Progress(string folder, string phase, int done, int total)
    {
        // Progress is advisory. A concurrent status read must never fail a good build.
        var path = Path.Combine(folder, "progress.json");
        try {
            File.WriteAllText(path + ".tmp", JsonSerializer.Serialize(new { phase, done, total }));
            File.Move(path + ".tmp", path, true);
        } catch (IOException) { }
    }

    static List<object> VerifyPacked(SldWorks sw, string folder, Dictionary<string, Instance> included)
    {
        var snapshot = Path.Combine(folder, "snapshot");
        var reopened = (AssemblyDoc)OpenSnapshot(sw, folder);
        reopened.ResolveAllLightWeightComponents(false);
        Verify(reopened, included);
        var checkedDocuments = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (Component2 c in (object[])reopened.GetComponents(false))
        {
            var stored = c.GetPathName();
            if (string.IsNullOrEmpty(stored)) throw new InvalidDataException($"У компонента {c.Name2} отсутствует путь к файлу.");
            var path = Path.GetFullPath(stored, snapshot);
            if (!path.StartsWith(snapshot + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase) || !File.Exists(path))
                throw new InvalidDataException($"Компонент {c.Name2} ссылается на внешний или отсутствующий файл: {path}");
            var doc = c.GetModelDoc2() as ModelDoc2;
            if (doc == null && !checkedDocuments.Contains(path))
            {
                // Hidden or lightweight instances can have no in-memory document.
                // Open the exact packaged reference before accepting it.
                int errors = 0, warnings = 0;
                int type = Path.GetExtension(path).Equals(".sldasm", StringComparison.OrdinalIgnoreCase) ? 2 : 1;
                doc = sw.OpenDoc6(path, type, ResolvedReadOnly, "", ref errors, ref warnings);
                if (doc == null || errors != 0) throw new InvalidDataException($"Не удалось открыть зависимость {c.Name2} из снимка (код {errors}).");
            }
            if (doc != null && !Path.GetFullPath(doc.GetPathName()).Equals(path, StringComparison.OrdinalIgnoreCase))
                throw new InvalidDataException($"Для {c.Name2} загружен другой файл: {doc.GetPathName()}");
            checkedDocuments.Add(path);
        }
        Console.WriteLine($"Verified {included.Count} instances and {checkedDocuments.Count} packaged documents");
        var report=new List<object>();
        var bodies=new Dictionary<(string,string),int>();
        foreach(Component2 c in (object[])reopened.GetComponents(true)){
            var p=included[c.ComponentReference]; string path=c.GetPathName(), conf=c.ReferencedConfiguration;
            var doc=c.GetModelDoc2() as ModelDoc2 ?? sw.GetOpenDocumentByName(path) as ModelDoc2;
            if(doc is null)throw new InvalidDataException($"Не открылась деталь {p.Name}.");
            if(!bodies.TryGetValue((path,conf),out var solids)) bodies[(path,conf)]=solids=SolidCount(doc);
            if(solids==0 || p.Configuration!=null && conf!=p.Configuration)throw new InvalidDataException($"Неверное тело или конфигурация: {p.Name}.");
            var actualColor=c.GetMaterialPropertyValues2(1,null) as double[];
            if(Finish(p.Appearance) is double[] wanted && (actualColor==null || actualColor.Length<3 || Enumerable.Range(0,3).Any(i=>Math.Abs(actualColor[i]-wanted[i])>.005)))
                throw new InvalidDataException($"Не сохранился цвет {p.Name}.");
            if(!c.Name2.StartsWith(p.Label,StringComparison.OrdinalIgnoreCase))throw new InvalidDataException($"Потеряно имя экземпляра {p.Name}: {c.Name2}");
            report.Add(new { id=p.Id,name=p.Name,component=c.Name2,file=Path.GetFileName(path),configuration=conf,solids,
                origin=p.Origin,source=p.SourceFile,sourceHash=p.SourceHash,specPosition=p.SpecPosition,appearance=p.Appearance,
                rgb=actualColor?.Take(3),transform=p.BrowserTransform??p.Transform,nativeTransform=(double[])c.Transform2.ArrayData });
        }
        return report;
    }

    internal static string SafeName(string value) {
        // The EASM publisher uses commas as tree-field separators, even inside
        // component names. Preserve the unabridged Russian text in Наименование.
        var clean=Regex.Replace(value.Replace('/','⁄').Replace(',','.'),@"[^\p{L}\p{N} Øø×()._=+⁄\-–—]+"," ");
        clean=Regex.Replace(clean,@"\s+"," ").Trim(' ','.');
        return string.IsNullOrEmpty(clean)?"Деталь":clean[..Math.Min(80,clean.Length)].TrimEnd(' ','.');
    }

    static double[]? Finish(string? color) => color switch {
        "red" => new[]{.75,.045,.03,.3,.75,.35,.35,0,0},
        "blue" => new[]{.035,.22,.65,.3,.75,.35,.35,0,0},
        "metal" => new[]{.72,.74,.76,.3,.70,.9,.8,0,0}, _=>null };

    static int SolidCount(ModelDoc2 doc) {
        if(doc.GetType()==1) return (((PartDoc)doc).GetBodies2(0,false) as object[])?.Length??0;
        var a=(AssemblyDoc)doc;
        a.ResolveAllLightWeightComponents(false);
        return (a.GetComponents(false) as object[]??Array.Empty<object>()).Cast<Component2>()
            .Where(c=>!c.IsSuppressed()).Select(c=>c.GetModelDoc2()).OfType<PartDoc>()
            .Sum(p=>(p.GetBodies2(0,false) as object[])?.Length??0);
    }

    const int ResolvedReadOnly = (int)swOpenDocOptions_e.swOpenDocOptions_Silent |
        (int)swOpenDocOptions_e.swOpenDocOptions_ReadOnly |
        (int)swOpenDocOptions_e.swOpenDocOptions_OverrideDefaultLoadLightweight;

    static ModelDoc2 OpenSnapshot(SldWorks sw, string folder)
    {
        var path = Directory.GetFiles(Path.Combine(folder, "snapshot"), "PumpStation.SLDASM", SearchOption.AllDirectories).Single();
        int errors = 0, warnings = 0;
        var model = sw.OpenDoc6(path, 2, ResolvedReadOnly, "", ref errors, ref warnings);
        if (model is null || errors != 0) throw new Exception($"Не удалось открыть готовую сборку (код {errors}).");
        return model;
    }

    static void Verify(AssemblyDoc assembly, Dictionary<string, Instance> expected)
    {
        var top = assembly.GetComponents(true) as object[];
        if (top?.Length != expected.Count) throw new Exception("Состав сборки не совпадает с отчётом.");
        var seen = new HashSet<string>();
        foreach (Component2 c in top)
        {
            if (!seen.Add(c.ComponentReference)) throw new InvalidDataException("В сборке повторяется ID экземпляра.");
            var part = expected[c.ComponentReference];
            var actual = (double[])c.Transform2.ArrayData;
            if (!SamePose(actual, part.Transform))
                throw new Exception($"Изменилось положение детали {part.Name}.");
        }
    }

    static bool SamePose(double[] actual, double[] wanted) => actual.Length >= 13 &&
        Enumerable.Range(0, 13).All(i => Math.Abs(actual[i] - wanted[i]) <= (i is >= 9 and <= 11 ? 1e-7 : 1e-8));

    static void Save(ModelDoc2 model, string path)
    {
        int errors = 0, warnings = 0;
        if (!model.Extension.SaveAs(path, 0, 1, null, ref errors, ref warnings) || errors != 0 || !File.Exists(path))
            throw new InvalidDataException($"Не удалось сохранить {System.IO.Path.GetFileName(path)} (код {errors}, предупреждения {warnings})");
    }
}
