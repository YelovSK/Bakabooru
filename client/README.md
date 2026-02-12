# Bakabooru Client (Angular)

Angular frontend for Bakabooru.

This client was adapted from an Oxibooru-focused codebase. The UI is usable for several Bakabooru workflows, but many internals still reflect Oxibooru-era models and compatibility shims.

## Provenance and Current Direction
- Origin: Oxibooru/Szurubooru-style client architecture and DTO assumptions.
- Current state: partially adapted to Bakabooru APIs.
- Result: some pages are functional, while others rely on stubs or incomplete backend coverage.

## Local Development
### Prerequisites
- Node.js 22+
- npm
- Bakabooru API running at `http://localhost:5119` (default dev proxy target)

### Run
```bash
cd client
npm install
npm start
```

App runs on `http://localhost:4200`.

Proxy config is in `client/proxy.conf.json`.

## What Works Now
The following areas are currently usable enough for development/testing:
- Posts browsing and post detail fetch against Bakabooru endpoints
- Libraries page basic CRUD (path-based create/delete)
- Jobs page (trigger jobs, view history, edit schedules)
- Duplicates page (review groups, keep-all/keep-one/resolve-all-exact)
- Settings pages for client-side options and auto-tagging provider configuration
- Auto-tagging provider framework and queueing (client-side orchestration)

## Known Gaps and Stubbed Areas
- Auth is mocked/stubbed in client service (`isLoggedIn` always true, mock token behavior)
- Several methods in `BakabooruService` are placeholders (tags, pools, comments, post edits, uploads, reverse search, etc.)
- Upload/create-post flow in UI expects APIs that are not fully implemented in Bakabooru backend yet
- Tag/category management breadth is incomplete (both UI and server)
- Multiple labels/names still say "Oxibooru" in UI and model namespaces

## External Integrations (Auto-Tagging)
Client can call external services through proxy routes:
- SauceNAO (`/saucenao`)
- Danbooru (`/danbooru`)
- Gelbooru (`/gelbooru`)
- WD Tagger (`/wd-tagger`, local/self-hosted expected)

Important security note:
- API keys/provider settings are currently stored client-side (local storage).

## Docker and Nginx Files
`client/Dockerfile`, `client/default.conf.template`, and `client/docker-compose.yml.example` are currently legacy/WIP artifacts from earlier Oxibooru-oriented deployment assumptions.

Treat them as starting points, not production-ready authoritative deployment docs.

## Related Docs
- Monorepo overview: [../README.md](../README.md)
- Server setup: [../server/SETUP.md](../server/SETUP.md)
- Current backlog/context: [../TODO.md](../TODO.md)
