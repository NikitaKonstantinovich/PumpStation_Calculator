using System.Diagnostics;
using System.Runtime.InteropServices;
using SolidWorks.Interop.sldworks;

internal sealed class WindowsCadProcess(Process process) : ICadProcess
{
    public int Id => process.Id;
    public bool WaitForExit(int milliseconds) => process.WaitForExit(milliseconds);
    public void Dispose() => process.Dispose();

    public static ICadProcess[] Current()
    {
        using var self = Process.GetCurrentProcess();
        var result = new List<ICadProcess>();
        foreach (var candidate in Process.GetProcessesByName("SLDWORKS"))
        {
            try
            {
                if (!candidate.HasExited && candidate.SessionId == self.SessionId)
                {
                    result.Add(new WindowsCadProcess(candidate));
                    continue;
                }
            }
            catch (InvalidOperationException) { /* Exited during enumeration. */ }
            candidate.Dispose();
        }
        return result.ToArray();
    }
}

internal sealed class WindowsCadConnection : ICadConnection
{
    private SldWorks? application;
    public int ProcessId => application!.GetProcessID();
    public bool CommandInProgress => application!.CommandInProgress;

    [DllImport("oleaut32.dll", PreserveSig = false)]
    private static extern void GetActiveObject(ref Guid clsid, IntPtr reserved,
        [MarshalAs(UnmanagedType.IUnknown)] out object value);

    private WindowsCadConnection(SldWorks application) => this.application = application;

    public static ICadConnection Connect(ICadProcess process)
    {
        try
        {
            var clsid = Type.GetTypeFromProgID("SldWorks.Application", throwOnError: true)!.GUID;
            // GetActiveObject never creates a new application. The coordinator checks
            // its PID before reading documents or requesting shutdown.
            GetActiveObject(ref clsid, IntPtr.Zero, out var active);
            return new WindowsCadConnection((SldWorks)active);
        }
        catch (COMException error)
        {
            throw new InvalidOperationException("Не удалось подключиться к текущему SOLIDWORKS для проверки сохранённых документов. Завершите запуск программы или закройте её вручную и повторите сборку.", error);
        }
    }

    public IReadOnlyList<string> UnsavedDocuments()
    {
        var unsaved = new List<string>();
        var documents = application!.GetDocuments() as object[] ?? [];
        try
        {
            foreach (ModelDoc2 document in documents)
                if (document.GetSaveFlag() || string.IsNullOrWhiteSpace(document.GetPathName()))
                    unsaved.Add(document.GetTitle());
        }
        finally
        {
            foreach (var document in documents)
                if (Marshal.IsComObject(document)) Marshal.FinalReleaseComObject(document);
        }
        return unsaved.Distinct().ToArray();
    }

    public void RequestExit()
    {
        // Ask the application itself to quit after the coordinator's save check.
        // Closing the frame window can leave an automation-connected process alive.
        // Never CloseDoc/CloseAllDocuments (which can discard changes) here.
        application!.ExitApp();
    }

    public void Dispose()
    {
        if (application is not null && Marshal.IsComObject(application)) Marshal.FinalReleaseComObject(application);
        application = null;
        GC.Collect();
        GC.WaitForPendingFinalizers();
    }
}
