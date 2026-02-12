namespace Bakabooru.Core.Config;

public class BakabooruConfig
{
    public const string SectionName = "Bakabooru";

    public StorageConfig Storage { get; set; } = new();
    public ScannerConfig Scanner { get; set; } = new();
}

public class StorageConfig
{
    /// <summary>
    /// Path where the SQLite database is stored.
    /// Default: ./data/bakabooru.db
    /// </summary>
    public string DatabasePath { get; set; } = "data/bakabooru.db";

    /// <summary>
    /// Path where thumbnails are stored.
    /// Default: ./data/thumbnails
    /// </summary>
    public string ThumbnailPath { get; set; } = "data/thumbnails";

    /// <summary>
    /// Path for temporary files during processing.
    /// Default: ./data/temp
    /// </summary>
    public string TempPath { get; set; } = "data/temp";
}

public class ScannerConfig
{
    public bool SkipVideoHashing { get; set; } = true;
    public int BatchSize { get; set; } = 100;
}
