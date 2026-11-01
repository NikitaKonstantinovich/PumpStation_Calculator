using System.Runtime.InteropServices;
using System.Text.Json;
using SolidWorks.Interop.sldworks;
using SolidWorks.Interop.swconst;

record Instance(string Id, string Name, string Path, double[] Transform, bool Hidden);
record Manifest(Instance[] Instances);
record Omission(string Id, string Code, string Reason);

internal static class Program
{
    static readonly JsonSerializerOptions Json = new() { PropertyNameCaseInsensitive = true, WriteIndented = true };

    [STAThread]
    static int Main(string[] args)
    {
        if (args.Length is < 2 or > 3) { Console.Error.WriteLine("Usage: SolidWorksExport <job-directory> <assembly-template> [part-template]"); return 2; }
        bool export = args[0] == "--edrawings";
        var folder = System.IO.Path.GetFullPath(export ? args[1] : args[0]);
        SldWorks? sw = null;
        bool? oldInterconnect = null;
        bool? oldDefaultTemplates = null;
        string? oldPartTemplate = null;
        string? oldAssemblyTemplate = null;
        try
        {
            if (System.Diagnostics.Process.GetProcessesByName("SLDWORKS").Length != 0)
                throw new Exception("SOLIDWORKS уже запущен. Исполнитель требует отдельной свободной Windows-сессии.");
            Console.WriteLine("Starting SOLIDWORKS");
            sw = new SldWorks { Visible = System.Environment.GetEnvironmentVariable("CAD_EXPORT_DIAGNOSTIC_UI") == "1", UserControl = false };
            if (export)
            {
                var packed = OpenSnapshot(sw, folder);
                Save(packed, Path.Combine(folder, "assembly.easm"));
                return 0;
            }
            oldInterconnect = sw.GetUserPreferenceToggle((int)swUserPreferenceToggle_e.swMultiCAD_Enable3DInterconnect);
            sw.SetUserPreferenceToggle((int)swUserPreferenceToggle_e.swMultiCAD_Enable3DInterconnect, false);
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
                    if (oldDefaultTemplates.HasValue)
                    {
                        sw.SetUserPreferenceStringValue((int)swUserPreferenceStringValue_e.swDefaultTemplatePart, oldPartTemplate);
                        sw.SetUserPreferenceStringValue((int)swUserPreferenceStringValue_e.swDefaultTemplateAssembly, oldAssemblyTemplate);
                        sw.SetUserPreferenceToggle((int)swUserPreferenceToggle_e.swAlwaysUseDefaultTemplates, oldDefaultTemplates.Value);
                    }
                    sw.ExitApp();
                }
                catch (Exception error) { Console.Error.WriteLine($"Cleanup: {error.Message}"); }
            }
        }
    }

    static void Build(SldWorks sw, string folder, string template, Instance[] instances)
    {
        var native = Path.Combine(folder, "native");
        Directory.CreateDirectory(native);
        var files = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        var omissions = new List<Omission>();
        foreach (var group in instances.GroupBy(i => i.Path, StringComparer.OrdinalIgnoreCase))
        {
            var source = group.Key;
            var code = "import_error";
            try
            {
                int errors = 0, warnings = 0;
                var extension = Path.GetExtension(source).ToLowerInvariant();
                var doc = extension is ".sldprt" or ".sldasm"
                    ? sw.OpenDoc6(source, extension == ".sldasm" ? 2 : 1, 3, "", ref errors, ref warnings)
                    : sw.LoadFile4(source, "r", sw.GetImportFileData(source), ref errors);
                if (doc is null || errors != 0) throw new InvalidDataException($"Не удалось открыть модель (код {errors}).");
                code = "part_creation";
                var name = $"Part_{files.Count + 1:D5}";
                var path = Path.Combine(native, name + (doc.GetType() == 2 ? ".sldasm" : ".sldprt"));
                Save(doc, path);
                files.Add(source, path);
            }
            catch (Exception error) when (error is COMException or InvalidDataException)
            {
                omissions.AddRange(group.Select(p => new Omission(p.Id, code, error.Message)));
            }
        }

        var model = (ModelDoc2)sw.NewDocument(Path.GetFullPath(template), 0, 0, 0);
        if (model is null || model.GetType() != 2) throw new Exception("Не удалось создать сборку по шаблону.");
        var assembly = (AssemblyDoc)model;
        var included = new Dictionary<string, Instance>();
        foreach (var part in instances)
        {
            if (!files.TryGetValue(part.Path, out var path)) continue;
            Component2? component;
            try
            {
                var result = assembly.AddComponents3(new[] {path}, part.Transform, new[] {""}) as object[];
                component = result?.FirstOrDefault() as Component2;
                if (component is null) throw new InvalidDataException("SOLIDWORKS не вставил деталь в сборку.");
            }
            catch (Exception error) when (error is COMException or InvalidDataException)
            {
                omissions.Add(new Omission(part.Id, "part_creation", error.Message));
                continue;
            }
            model.ClearSelection2(true);
            if (!component.Select4(false, null, false)) throw new Exception($"Не удалось зафиксировать {part.Name}.");
            assembly.FixComponent();
            component.ComponentReference = part.Id;
            component.Visible = part.Hidden ? (int)swComponentVisibilityState_e.swComponentHidden : (int)swComponentVisibilityState_e.swComponentVisible;
            included.Add(part.Id, part);
        }
        File.WriteAllText(Path.Combine(folder, "runner-omissions.json"), JsonSerializer.Serialize(omissions,
            new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase }));
        if (included.Count == 0) throw new Exception("Ни одного физического элемента собрать не удалось.");
        model.ClearSelection2(true);
        if (!model.EditRebuild3()) throw new Exception("Ошибка перестроения сборки.");
        Verify(assembly, included);
        model.ShowNamedView2("", 7);
        model.ViewZoomtofit2();
        Save(model, Path.Combine(native, "PumpStation.SLDASM"));

        var snapshot = Path.Combine(folder, "snapshot");
        Directory.CreateDirectory(snapshot);
        var pack = model.Extension.GetPackAndGo();
        pack.IncludeDrawings = false;
        if (!pack.GetDocumentNames(out object names) || names is not string[] references)
            throw new Exception("Не удалось получить список файлов Pack and Go.");
        var assemblyPath = model.GetPathName();
        var destinations = references.Select((path, index) => Path.Combine(snapshot,
            path.Equals(assemblyPath, StringComparison.OrdinalIgnoreCase) ? "PumpStation.SLDASM" :
            $"CAD_{index:D5}{Path.GetExtension(path)}")).ToArray();
        if (!pack.SetDocumentSaveToNames(destinations)) throw new Exception("Не удалось назначить пути Pack and Go.");
        var statuses = model.Extension.SavePackAndGo(pack) as int[];
        if (statuses is null || statuses.Length == 0 || statuses.Any(x => x != 0)) throw new Exception("Ошибка Pack and Go.");
        sw.CloseAllDocuments(true);
        var reopened = (AssemblyDoc)OpenSnapshot(sw, folder);
        reopened.ResolveAllLightWeightComponents(false);
        Verify(reopened, included);
        foreach (Component2 c in (object[])reopened.GetComponents(false))
        {
            var path = Path.GetFullPath(c.GetPathName());
            if (!path.StartsWith(snapshot + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase) || !File.Exists(path) || c.GetModelDoc2() is null)
                throw new Exception($"Не удалось сохранить зависимость {c.Name2} внутри снимка.");
        }
        File.WriteAllText(Path.Combine(folder, "verification.json"), JsonSerializer.Serialize(new { count = included.Count,
            instances = included.Select(p => new { id = p.Value.Id, name = p.Value.Name, transform = p.Value.Transform, component = p.Key }) }, Json));
    }

    static ModelDoc2 OpenSnapshot(SldWorks sw, string folder)
    {
        var path = Directory.GetFiles(Path.Combine(folder, "snapshot"), "PumpStation.SLDASM", SearchOption.AllDirectories).Single();
        int errors = 0, warnings = 0;
        var model = sw.OpenDoc6(path, 2, 3, "", ref errors, ref warnings);
        if (model is null || errors != 0) throw new Exception($"Не удалось открыть готовую сборку (код {errors}).");
        return model;
    }

    static void Verify(AssemblyDoc assembly, Dictionary<string, Instance> expected)
    {
        var top = assembly.GetComponents(true) as object[];
        if (top?.Length != expected.Count) throw new Exception("Состав сборки не совпадает с отчётом.");
        foreach (Component2 c in top)
        {
            var part = expected[c.ComponentReference];
            var actual = (double[])c.Transform2.ArrayData;
            if (Enumerable.Range(0, 13).Any(i => Math.Abs(actual[i] - part.Transform[i]) > (i is >= 9 and <= 11 ? 1e-7 : 1e-8)))
                throw new Exception($"Изменилось положение детали {part.Name}.");
        }
    }

    static void Save(ModelDoc2 model, string path)
    {
        int errors = 0, warnings = 0;
        if (!model.Extension.SaveAs(path, 0, 1, null, ref errors, ref warnings) || errors != 0 || !File.Exists(path))
            throw new InvalidDataException($"Не удалось сохранить {System.IO.Path.GetFileName(path)} (код {errors}, предупреждения {warnings})");
    }
}
