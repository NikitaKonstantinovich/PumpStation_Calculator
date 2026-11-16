internal interface ICadProcess : IDisposable
{
    int Id { get; }
    bool WaitForExit(int milliseconds);
}

internal interface ICadConnection : IDisposable
{
    int ProcessId { get; }
    bool CommandInProgress { get; }
    IReadOnlyList<string> UnsavedDocuments();
    void RequestExit();
}

internal static class SessionPreparation
{
    // Processes supplied by the Windows adapter belong only to this Windows session.
    // No forced termination or implicit saving of someone else's documents is allowed.
    public static void Prepare(bool closeExisting, Func<ICadProcess[]> list,
        Func<ICadProcess, ICadConnection> connect, Action closing)
    {
        var processes = list();
        try
        {
            var running = processes.Where(p => !p.WaitForExit(0)).ToArray();
            if (running.Length == 0) return;
            if (running.Length > 1)
                throw new InvalidOperationException("Открыто несколько сеансов SOLIDWORKS. Закройте лишние сеансы и повторите сборку.");
            var process = running[0];
            if (!closeExisting)
            {
                // Our previous runner may still be finishing ExitApp.
                if (process.WaitForExit(10000)) return;
                throw new InvalidOperationException("Для экспорта закройте открытый SOLIDWORKS и повторите сохранение. При нажатии «Собрать в SOLIDWORKS» текущий сеанс закрывается автоматически.");
            }
            closing();
            using (var connection = connect(process))
            {
                if (connection.ProcessId != process.Id)
                    throw new InvalidOperationException("Не удалось однозначно определить текущий сеанс SOLIDWORKS. Закройте его вручную и повторите сборку.");
                if (connection.CommandInProgress)
                    throw new InvalidOperationException("SOLIDWORKS выполняет другую автоматическую операцию. Дождитесь её завершения и повторите сборку.");
                var unsaved = connection.UnsavedDocuments();
                if (unsaved.Count > 0)
                    throw new InvalidOperationException("В SOLIDWORKS есть несохранённые документы: " + string.Join(", ", unsaved) +
                        ". Сохраните изменения или закройте эти документы в SOLIDWORKS и повторите сборку.");
                connection.RequestExit();
            }
            // Release the COM reference before waiting for the application to exit.
            if (!process.WaitForExit(30000))
                throw new InvalidOperationException("SOLIDWORKS не завершил закрытие. Завершите сохранение или закройте открытое диалоговое окно в SOLIDWORKS и повторите сборку.");
        }
        finally { foreach (var process in processes) process.Dispose(); }

        // Do not let COM attach the builder to a session opened during shutdown.
        var remaining = list();
        try
        {
            if (remaining.Any(p => !p.WaitForExit(0)))
                throw new InvalidOperationException("Перед запуском сборки появился другой сеанс SOLIDWORKS. Закройте его и повторите сборку.");
        }
        finally { foreach (var process in remaining) process.Dispose(); }
    }
}
