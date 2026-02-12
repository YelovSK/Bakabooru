using Bakabooru.Core.Interfaces;

namespace Bakabooru.Processing.Infrastructure;

public interface IMediaProcessorStrategy : IImageProcessor
{
    bool CanProcess(string extension);
}
