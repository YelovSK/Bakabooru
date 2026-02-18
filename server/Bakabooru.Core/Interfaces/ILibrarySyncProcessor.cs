using Bakabooru.Core.Entities;
using Bakabooru.Core.Results;

namespace Bakabooru.Core.Interfaces;

public interface ILibrarySyncProcessor
{
    /// <summary>
     /// Processes a single file.
    /// </summary>
    Task ProcessFileAsync(Library library, MediaSourceItem item, CancellationToken cancellationToken);

    /// <summary>
    /// Processes all files in a directory.
    /// </summary>
    Task<ScanResult> ProcessDirectoryAsync(Library library, string directoryPath, IProgress<float>? progress = null, IProgress<string>? status = null, CancellationToken cancellationToken = default);
}
