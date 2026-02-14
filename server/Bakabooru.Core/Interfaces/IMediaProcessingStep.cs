using Bakabooru.Core.Entities;

namespace Bakabooru.Core.Interfaces;

public interface IMediaProcessingStep
{
    /// <summary>
    /// Gets the order in which this step should be executed.
    /// </summary>
    int Order { get; }

    /// <summary>
    /// Executes the processing step.
    /// </summary>
    Task ExecuteAsync(MediaProcessingContext context, CancellationToken cancellationToken);
}

public class MediaProcessingContext
{
    public string FilePath { get; set; } = string.Empty;
    public string RelativePath { get; set; } = string.Empty;
    public Library Library { get; set; } = null!;

    // Results populated by steps
    public string? ContentHash { get; set; }
    public ulong? PerceptualDHash { get; set; }
    public ulong? PerceptualPHash { get; set; }
    public int Width { get; set; }
    public int Height { get; set; }
    public long SizeBytes { get; set; }
    public string ContentType { get; set; } = string.Empty;
    public string? ThumbnailPath { get; set; }

    // Control
    public bool ShouldContinue { get; set; } = true;
    public string? ErrorMessage { get; set; }
    public bool IsExistingPost { get; set; }
}
