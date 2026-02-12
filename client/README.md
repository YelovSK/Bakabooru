# Oxibooru - Angular

This is an Angular client for the [Oxibooru](https://github.com/liamw1/oxibooru) image board. Oxibooru API should be compatible with [Szurubooru](https://github.com/rr-/szurubooru), so it should be usable with that as well.

**NOTE**: This project is 90% vibe-coded, will not be maintained, and is not recommended for production use. Feel free to try it out, but try not to expect anything.

## Motivation
The original Szurubooru client is functional, but not something I want to modify or build upon.

I want to be able to play around and experiment with features I want to use personally, without having to rely on 3rd party CLI utilities, browser extensions, etc.

One such feature is auto-tagging by reverse-searching images, and using tags from booru boards like Gelbooru and Danbooru. This is something that is probably more suitable for a server, but I have zero experience with rust, so modifying the backend is also not something I want to do.

The idea is that a lot of functionality can be implemented with the existing Oxibooru APIs and some client-side logic.

Angular is the only frontend framework I've used, so that's what I went with here.

As I do not have the energy and motivation to do much coding after work, I decided I'd try using coding agents and guiding them as much as possible to structure and style the code the way I'd do it by-hand. There's a lot of stuff I hate in this codebase, but WCYD.

## What (partially) works:
- Login/Registration
- Posts grid
- Post detail view
- Editing of (some) post details
- Uploading
- Auto-tagging via SauceNAO -> Gelbooru, Danbooru (makes API calls directly from the client, API keys are stored in localStorage, so use at your own risk). Has an interface for adding more tagging providers.

## What doesn't work:
- Everything else

## Deploying

Refer to the [Oxibooru docker-compose.yml](https://github.com/liamw1/oxibooru/blob/master/docker-compose.yml). To use this Angular client instead of the default, simply replace the `client` service:

```yaml
client:
  image: ghcr.io/yelovsk/oxibooru-angular:latest
  depends_on:
    - server
  environment:
    - BACKEND_HOST=server
    - BACKEND_PORT=6666
  volumes:
    - "${YOUR_DATA_DIR}:/data:ro"
  ports:
    - "${YOUR_PORT}:80"
```

Or, if you have cloned this repo locally, use `build: .` instead of the ghcr image.

Is the Dockerfile and nginx config setup correctly? Probably not.

## Running Locally (Client Only)

### Prerequisites

You can run the Angular client locally and point it to any existing Oxibooru (or compatible) backend instance.

For me, this is the most convenient way to develop and test changes.

- [Node.js](https://nodejs.org/) v22+ (for local development)
- [Docker](https://www.docker.com/) and Docker Compose (for containerized deployment)
- An [Oxibooru](https://github.com/liamw1/oxibooru) or [Szurubooru](https://github.com/rr-/szurubooru) backend instance

1. **Clone the repository:**
   ```bash
   git clone https://github.com/your-username/oxibooru-angular.git
   cd oxibooru-angular
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure the API proxy:**
   
   Edit `proxy.conf.json` to point to your running Oxibooru instance:
   ```json
   {
     "/api": {
       "target": "http://your-oxibooru-host:port",
       "secure": false,
       "changeOrigin": true
     },
     "/data": {
       "target": "http://your-oxibooru-host:port",
       "secure": false,
       "changeOrigin": true
     }
   }
   ```

4. **Start the development server:**
   ```bash
   npm start
   ```
   
   The app will be available at `http://localhost:4200`.
