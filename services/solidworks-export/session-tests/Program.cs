using System.Diagnostics;

var tests = new (string, Action)[] {
    ("No existing session", () => new Fixture().Run()),
    ("Saved session closes before build", () => {
        var f = new Fixture(new FakeProcess()); f.Run();
        Check(f.Connection.Closed && f.Connection.Disposed && f.Processes[0].Disposed);
        Check(f.Progress && f.ListCalls == 2);
    }),
    ("Unsaved documents remain open", () => {
        var f = new Fixture(new FakeProcess()); f.Connection.Dirty = ["Деталь1", "Сборка2"];
        f.Reject("Деталь1, Сборка2"); Check(!f.Connection.Closed && f.Connection.Disposed);
    }),
    ("Busy automation remains open", () => {
        var f = new Fixture(new FakeProcess()); f.Connection.CommandInProgress = true;
        f.Reject("другую автоматическую операцию"); Check(!f.Connection.Closed);
    }),
    ("Ambiguous sessions remain open", () => {
        var f = new Fixture(new FakeProcess(), new FakeProcess());
        f.Reject("несколько сеансов"); Check(f.ConnectCalls == 0 && f.Processes.All(p => p.Disposed));
    }),
    ("Wrong COM process is never closed", () => {
        var f = new Fixture(new FakeProcess()); f.Connection.ProcessId = 999;
        f.Reject("однозначно определить"); Check(!f.Connection.Closed);
    }),
    ("Export does not close user session", () => {
        var f = new Fixture(new FakeProcess()); f.Reject("Для экспорта", close: false);
        Check(f.ConnectCalls == 0 && !f.Connection.Closed);
    }),
    ("Export waits for previous clean exit", () => {
        var f = new Fixture(new FakeProcess { ExitOnWait = true }); f.Run(false);
        Check(f.ConnectCalls == 0);
    }),
    ("Closing timeout does not force termination", () => {
        var f = new Fixture(new FakeProcess()); f.Connection.ExitCompletes = false;
        f.Reject("не завершил закрытие"); Check(f.Connection.Closed && f.Processes[0].Disposed);
    }),
    ("Session opened during shutdown blocks new builder", () => {
        var f = new Fixture(new FakeProcess()); f.NewProcess = new FakeProcess();
        f.Reject("появился другой сеанс"); Check(f.NewProcess.Disposed);
    }),
    ("Already exited process is ignored", () => {
        var f = new Fixture(new FakeProcess { Exited = true }); f.Run(); Check(f.ConnectCalls == 0);
    }),
    ("Failed COM connection never closes process", () => {
        var f = new Fixture(new FakeProcess()); f.ConnectFails = true;
        f.Reject("COM unavailable"); Check(!f.Connection.Closed && f.Processes[0].Disposed);
    }),
};
foreach (var (name, run) in tests) { run(); Console.WriteLine("PASS " + name); }
Console.WriteLine($"Passed {tests.Length} session lifecycle tests.");

static void Check(bool value) { if (!value) throw new Exception("Assertion failed"); }

sealed class Fixture(params FakeProcess[] processes)
{
    public FakeProcess[] Processes = processes;
    public FakeConnection Connection = new(processes.FirstOrDefault());
    public FakeProcess? NewProcess;
    public int ListCalls, ConnectCalls;
    public bool Progress, ConnectFails;
    public void Run(bool close = true) => SessionPreparation.Prepare(close,
        () => ++ListCalls == 1 ? Processes : NewProcess is null ? [] : [NewProcess],
        p => { ConnectCalls++; if (ConnectFails) throw new InvalidOperationException("COM unavailable"); return Connection; },
        () => Progress = true);
    public void Reject(string message, bool close = true)
    {
        try { Run(close); }
        catch (InvalidOperationException error) when (error.Message.Contains(message)) { return; }
        throw new Exception("Expected rejection: " + message);
    }
}

sealed class FakeProcess : ICadProcess
{
    public int Id => 123;
    public bool Exited, Disposed, ExitOnWait;
    public bool WaitForExit(int milliseconds) => Exited || (milliseconds > 0 && ExitOnWait);
    public void Dispose() => Disposed = true;
}

sealed class FakeConnection(FakeProcess? process) : ICadConnection
{
    public int ProcessId { get; set; } = 123;
    public bool CommandInProgress { get; set; }
    public string[] Dirty = [];
    public bool Closed, Disposed, ExitCompletes = true;
    public IReadOnlyList<string> UnsavedDocuments() => Dirty;
    public void RequestExit() { Closed = true; if (process is not null && ExitCompletes) process.Exited = true; }
    public void Dispose() => Disposed = true;
}
