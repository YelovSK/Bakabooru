using System.Threading;
using System.Threading.Tasks;

namespace Bakabooru.Core.Interfaces;

public interface IScannerService
{
    Task ScanLibraryAsync(int libraryId, IProgress<float>? progress = null, IProgress<string>? status = null, CancellationToken cancellationToken = default);
    Task ScanAllLibrariesAsync(IProgress<float>? progress = null, IProgress<string>? status = null, CancellationToken cancellationToken = default);
}
