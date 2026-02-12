using Bakabooru.Core.Interfaces;

namespace Bakabooru.Core.Interfaces;

public enum JobMode
{
    /// <summary>Only process items that haven't been processed yet.</summary>
    Missing,
    /// <summary>Reprocess all items, regenerating existing data.</summary>
    All
}

public class JobContext
{
    public string JobId { get; set; } = string.Empty;
    public CancellationToken CancellationToken { get; set; }
    public IProgress<float> Progress { get; set; } = null!;
    public IProgress<string> Status { get; set; } = null!;
    public JobMode Mode { get; set; } = JobMode.Missing;
}

public interface IJob
{
    string Name { get; }
    string Description { get; }
    Task ExecuteAsync(JobContext context);
}
