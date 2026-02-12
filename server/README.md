# Bakabooru Server

Backend for Bakabooru, built on .NET 10.

This is a real, runnable backend in WIP shape: core library scanning and post browsing flows work, while several editing/auth features are still partial or stubbed.

## Tech Stack
- **Framework**: ASP.NET Core 10 Web API + Worker Services
- **Data**: SQLite via EF Core 10 (migrations included)
- **Media processing**: FFmpeg/FFprobe through `FFMpegCore`
- **Scheduling**: `Cronos`

## Implemented Features
- Library registration and removal (`/api/libraries`)
- Post listing and detail fetch (`/api/posts`) with basic include/exclude tag query parsing
- Raw file streaming endpoint (`/api/posts/{id}/content`)
- Basic post tag assignment/removal (`POST`/`DELETE` tag endpoints on posts)
- Tag category listing + creation (`/api/tagcategories`)
- Job management API (`/api/jobs`) with run/cancel/history/schedules
- Duplicate workflows (`/api/duplicates`) for exact and perceptual groups
- System stats endpoint (`/api/system/info`)
- Legacy admin job endpoints (`/api/admin/jobs`)
- Thumbnail static file serving from configured thumbnail directory (`/thumbnails/...`)

## Background Jobs and Scheduling
Registered jobs:
- `Scan All Libraries`
- `Generate Thumbnails`
- `Extract Metadata`
- `Compute Similarity`
- `Find Duplicates`

Scheduling state is persisted in DB (`ScheduledJobs`). Jobs can be triggered manually from API or via schedule polling.

## Duplicate Detection
- **Exact duplicates**: grouped by content hash stored in `Post.ContentHash` (currently generated via fast partial xxHash64 hashing).
- **Perceptual duplicates**: grouped by dHash similarity (hamming-distance threshold in `FindDuplicatesJob`).
- Resolution options include keep-all, keep-one, and bulk resolve exact groups.

## Supported Media (Current)
Based on `server/Bakabooru.Core/SupportedMedia.cs`.

- **Images**: `.jpg`, `.jpeg`, `.png`, `.gif`, `.bmp`, `.tga`, `.webp`, `.jxl`
- **Videos**: `.mp4`, `.webm`, `.mkv`, `.avi`, `.mov`

Notes:
- `.jxl` is supported through FFmpeg decode path.
- Perceptual hashing currently runs only for extensions treated as image formats in `SupportedMedia.IsImage`.

## Implemented vs Partial
### Implemented enough to use
- Library scanning and post ingestion
- Post browsing and content streaming
- Job execution/scheduling basics
- Duplicate detection and resolution APIs

### Partial / incomplete
- Tag categories: basic subset only (list + create; no full management workflow)
- Post editing APIs: several client-facing edit operations are still stubs
- Upload/create-post APIs expected by client are not fully implemented server-side
- Authentication/authorization and role model are not implemented

## Solution Layout
- `Bakabooru.Server` - API host and HTTP controllers
- `Bakabooru.Processing` - scanning, ingestion pipeline, jobs, scheduler
- `Bakabooru.Data` - EF Core context + migrations
- `Bakabooru.Core` - entities, interfaces, shared domain types

For deeper technical details, see [ARCHITECTURE.md](ARCHITECTURE.md).
For setup/run instructions, see [SETUP.md](SETUP.md).
