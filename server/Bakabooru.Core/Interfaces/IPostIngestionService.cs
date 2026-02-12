using Bakabooru.Core.Entities;

namespace Bakabooru.Core.Interfaces;

public interface IPostIngestionService
{
    Task EnqueuePostAsync(Post post, CancellationToken cancellationToken);
    Task FlushAsync(CancellationToken cancellationToken);
}
