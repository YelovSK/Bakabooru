using Bakabooru.Core.Interfaces;
using Bakabooru.Processing.Infrastructure;
using Microsoft.Extensions.DependencyInjection;

using Bakabooru.Processing.Scanning;
using Bakabooru.Processing.Services;
using Bakabooru.Processing.Pipeline;

namespace Bakabooru.Processing;

public static class ServiceCollectionExtensions
{
    public static IServiceCollection AddBakabooruProcessing(this IServiceCollection services)
    {
        // Infrastructure
        services.AddSingleton<IHasherService, Md5Hasher>();
        // Strategies
        services.AddSingleton<IMediaProcessorStrategy, ImageSharpStrategy>();
        services.AddSingleton<IMediaProcessorStrategy, FFmpegStrategy>();
        
        // Delegator
        services.AddSingleton<IImageProcessor, MediaProcessorDelegator>();
        services.AddSingleton<ISimilarityService, ImageHashService>();

        // Core Pipeline Services
        services.AddSingleton<IMediaProcessor, PipelineProcessor>();
        
        services.AddSingleton<ChannelPostIngestionService>();
        services.AddSingleton<IPostIngestionService>(sp => sp.GetRequiredService<ChannelPostIngestionService>());
        services.AddHostedService(sp => sp.GetRequiredService<ChannelPostIngestionService>());
        
        services.AddSingleton<IJobService, JobService>();
        services.AddHostedService<SchedulerService>(); // Scheduler
        services.AddSingleton<IMediaSource, FileSystemMediaSource>();
        services.AddTransient<IScannerService, RecursiveScanner>();

        // Jobs
        services.AddTransient<IJob, Jobs.ScanAllLibrariesJob>();
        services.AddTransient<IJob, Jobs.FindDuplicatesJob>();
        services.AddTransient<IJob, Jobs.GenerateThumbnailsJob>();
        services.AddTransient<IJob, Jobs.ExtractMetadataJob>();
        services.AddTransient<IJob, Jobs.ComputeSimilarityJob>();

        return services;
    }
}

