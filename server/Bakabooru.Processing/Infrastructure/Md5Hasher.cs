using Bakabooru.Core.Interfaces;
using System.Security.Cryptography;

namespace Bakabooru.Processing.Infrastructure;

public class Md5Hasher : IHasherService
{
    public async Task<string> ComputeMd5Async(string filePath, CancellationToken cancellationToken = default)
    {
        using var stream = File.OpenRead(filePath);
        return await ComputeMd5Async(stream, cancellationToken);
    }

    public async Task<string> ComputeMd5Async(Stream stream, CancellationToken cancellationToken = default)
    {
        using var md5 = MD5.Create();
        var hashBytes = await md5.ComputeHashAsync(stream, cancellationToken);
        return Convert.ToHexString(hashBytes).ToLowerInvariant();
    }
}
