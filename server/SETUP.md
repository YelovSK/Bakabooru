# Bakabooru Setup Guide

## Prerequisites
- .NET 10 SDK
- FFmpeg and FFprobe available on `PATH`
- Node.js 22+ and npm (if running client)

Optional but common:
- `dotnet-ef` CLI tool for manual migration commands

## 1. Configure Paths First
Current `appsettings.json` files define storage paths. Update these before first run:

- `server/Bakabooru.Server/appsettings.json`

At minimum verify:
- `ConnectionStrings:DefaultConnection`
- `Bakabooru:Storage:DatabasePath`
- `Bakabooru:Storage:ThumbnailPath`
- `Bakabooru:Storage:TempPath`

Path behavior:
- Relative storage paths are resolved against the server host content root (`server/Bakabooru.Server`).

## 2. Start API Host
```bash
cd server
dotnet run --project Bakabooru.Server
```

By default this serves on `http://localhost:5119` in development.

Important behavior:
- `Bakabooru.Server` auto-applies pending EF migrations on startup.

### Optional manual migration command
```bash
cd server
dotnet ef database update --project Bakabooru.Data --startup-project Bakabooru.Server
```

## 3. Start Client
```bash
cd client
npm install
npm start
```

Client default dev URL: `http://localhost:4200`

## Safe Local-Run Guidance
Scheduler runs inside `Bakabooru.Server` and is controlled by `Bakabooru:Processing:RunScheduler`.

## Quick Validation Checklist
After startup, validate these URLs:
- Swagger UI: `http://localhost:5119/swagger`
- System info: `http://localhost:5119/api/system/info`
- Jobs API: `http://localhost:5119/api/jobs`
- Duplicates API: `http://localhost:5119/api/duplicates`

Related docs:
- [README.md](README.md)
- [ARCHITECTURE.md](ARCHITECTURE.md)
