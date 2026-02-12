# Bakabooru

Self-hosted booru monorepo (ASP.NET Core backend + Angular client).

## Current State Snapshot
- Backend is usable for library scanning, post browsing, job orchestration, and duplicate workflows.
- Client is present and actively used, but still carries Oxibooru compatibility shims and multiple stubbed API paths.
- Large parts of the product are still work in progress.

## Monorepo Structure
- `server/` - .NET 10 backend solution (`Bakabooru.Server`, `Bakabooru.Processing`, `Bakabooru.Data`, `Bakabooru.Core`).
- `client/` - Angular client adapted from an Oxibooru-oriented codebase.
- `data/` - runtime storage location (thumbnails/temp/db depending on your config).

## Prerequisites
- .NET 10 SDK
- Node.js 22+ and npm
- FFmpeg + FFprobe available on `PATH` (required for thumbnailing, metadata, and perceptual hashing)

## Quick Start (Windows)
From repository root:

**PowerShell**
```powershell
.\DevStart.ps1
```

**Command Prompt**
```cmd
DevStart.bat
```

This launches API and client in separate windows.

## Manual Start
### Backend API
```bash
cd server
dotnet run --project Bakabooru.Server
```

### Frontend
```bash
cd client
npm install
npm start
```

### Optional Manual Migration Command
`Bakabooru.Server` auto-applies pending migrations on startup. If you want to run EF manually:

```bash
cd server
dotnet ef database update --project Bakabooru.Data --startup-project Bakabooru.Server
```

## Process Roles and Scheduler Caveat
- `Bakabooru.Server` hosts HTTP controllers and background services from `Bakabooru.Processing`.
- Scheduler execution is controlled via `Bakabooru:Processing:RunScheduler`.

For predictable local behavior, run API + client as the default setup.

## Documentation
- Server overview: [server/README.md](server/README.md)
- Server setup: [server/SETUP.md](server/SETUP.md)
- Server architecture: [server/ARCHITECTURE.md](server/ARCHITECTURE.md)
- Client overview: [client/README.md](client/README.md)
- Known gaps/backlog: [TODO.md](TODO.md)
