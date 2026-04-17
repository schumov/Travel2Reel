# Copilot Instructions – Travel2Reel

## Project Overview

Full-stack web application for managing travel photo/video routes, generating AI-powered captions, and producing short video reels. Users upload photos or videos (with or without GPS), organize them into routes, write or AI-generate captions per item, manually set locations, and export the route as a combined video reel.

**Current status:** MVP + Persistence / AI Captions / Video Generation / Video Thumbnail / Guest Access / Redis Cache / Image Processing / GPS-Optional Upload / Location Picker / Server-Synced Delete & Reorder / Combined Video / Logging complete.

**App title:** Travel storyboard, media management and reel generation

---

## Technology Stack

### Backend
- **Runtime:** Node.js v20
- **Framework:** Express.js v5.2.1
- **Language:** TypeScript 6.0.2 — strict mode enabled; never use `any`
- **ORM:** Prisma v6.19.3 — dual schema support (SQLite dev / SQL Server prod)
- **Auth:** Passport.js + `passport-google-oauth20`; guest sessions via signed HMAC cookie
- **Sessions:** `express-session` with HTTP-only cookies
- **Validation:** Zod v4.3.6 for all runtime schema validation (see `src/utils/validators.ts`)
- **Map rendering:** Leaflet v1.9.4 inside Puppeteer v24.4.0 headless browser → PNG screenshot
- **EXIF parsing:** `exifr` v7.1.3
- **Image processing:** `sharp` v0.34.5 (auto-rotate, compress, strip EXIF before storage)
- **Video thumbnail:** `ffmpeg-static` (bundled binary) + `fluent-ffmpeg` — extracts JPEG frame at ~1 s
- **Geocoding:** Nominatim (OSM) + Wikipedia API
- **Caching:** Redis-first with automatic in-memory fallback; controlled via `REDIS_ENABLED` env var
- **File upload:** `multer` v2.1.1
- **API docs:** OpenAPI 3.0.3 + Swagger UI Express v5.0.1
- **External video API:** `https://image2video.shumov.eu` — `/generate`, `/generate-video`, `/combine`

### Frontend
- Plain HTML5 / CSS3 / Vanilla JavaScript — **no framework, no build step**
- Responsive grid, viewport-based layout in `public/styles.css`
- All logic in `public/app.js`; state kept in a single `state` object + LocalStorage

### Infrastructure
- Docker multi-stage build (`Dockerfile`)
- `docker-compose.yml` for local full-stack
- SQLite default; SQL Server in production

---

## Directory Structure

```
src/
  auth/
    passport.ts          # Google OAuth strategy
    session.ts           # express-session middleware
    guestCookie.ts       # HMAC sign/verify for guest cookie key
  cache/
    redisClient.ts       # Redis singleton + connection lifecycle
  config/
    env.ts               # Zod-validated env config (single source of truth for all env vars)
  db/
    client.ts            # Prisma client singleton
  middleware/
    requireAuth.ts       # Auth guard for protected routes
    attachGuestUser.ts   # Resolves guest cookie into req.user context
  routes/
    mapRoutes.ts         # GET /api/map/render (public)
    getMapRoute.ts       # POST /api/getmap|getinfo|getroute|getroute-set (stateless public)
    authRoutes.ts        # /auth/* endpoints
    userRoutes.ts        # /api/user/* (authenticated CRUD + video generation)
  services/
    mapTemplate.ts       # HTML templates for single-pin / two-point / multi-point maps
    mapRenderService.ts  # Puppeteer PNG rendering
    exifService.ts       # GPS extraction + validation
    imageService.ts      # auto-rotate / compress / strip EXIF
    locationInfoService.ts # Nominatim + Wikipedia reverse geocode
    cacheService.ts      # Redis-first cache with memory fallback
    storageService.ts    # Filesystem I/O, SHA256 hashing, path resolution
    videoThumbnailService.ts # ffmpeg thumbnail extraction from video buffer
    claudeAiService.ts   # Claude AI caption generation + translation
  swagger/
    openapi.ts           # OpenAPI 3.0.3 spec document
  utils/
    validators.ts        # Zod schemas for request validation
  server.ts              # Express app setup, route registration, error handling
prisma/
  schema.sqlite.prisma
  schema.sqlserver.prisma
public/
  index.html
  app.js
  styles.css
storage/                 # Runtime filesystem assets — git-ignored
dist/                    # Compiled output — git-ignored
```

---

## Data Models (Prisma)

### Core relationships
```
User (1) ──► RouteSession (many)
RouteSession (1) ──► RouteImage (many) + RouteAsset (many)
RouteImage (1) ──► RouteAsset (many)
All relations use cascade delete.
```

### Key fields to know
- `User.googleSub` — unique; Google UID for OAuth users, `guest:<uuid>` for guests
- `RouteImage.orderIndex` — 0-based position in the route sequence
- `RouteImage.userNote` — nullable, per-item user annotation
- `RouteImage.aiSummary` — nullable, AI-generated or manually written captions
- `RouteImage.hasSourceVideo` — true when an `ORIGINAL_VIDEO` asset exists for the image slot
- `RouteImage.isVideoItem` — true when the primary media is a video (no original image)
- `RouteImage.videoUrl` — presigned URL of the generated video clip (from external API)
- `RouteSession.combinedVideoUrl` — URL of the combined route reel (persisted)
- `RouteAsset.assetType` — enum: `ORIGINAL_IMAGE | IMAGE_MAP | ROUTE_MAP | ORIGINAL_VIDEO | VIDEO_THUMBNAIL`
- `RouteAsset.storagePath` — relative path under `storage/`
- `RouteAsset.sha256` — content hash for deduplication
- `RouteSession.status` — enum: `ACTIVE | COMPLETED`

---

## API Conventions

### Auth model
- **Public:** No cookie needed
- **Authenticated:** Requires either Google OAuth session cookie **or** guest signed cookie
- `requireAuth` middleware returns 401 if neither is present
- Ownership is always enforced — users can only access their own data (403 otherwise)

### Successful responses
```json
{ "routeSessions": [...] }
{ "routeSession": { "id": "...", ... } }
{ "uploadedImages": [...], "failedImages": [] }
{ "uploadedImages": [...], "failedImages": [{ "filename": "...", "reason": "..." }] }  // HTTP 207
```

### Error responses
```json
{ "error": "Human-readable message" }
```
Use the `HttpError` class from `src/utils/validators.ts` to throw typed HTTP errors.

### File upload
- `multipart/form-data` via multer
- `images` field = file array (JPEG/PNG/video)
- `noteByIndex` field = JSON-stringified string array (notes per image, by upload order)

---

## Key Patterns & Conventions

### TypeScript
- Strict mode — no implicit `any`, `strictNullChecks` enforced
- All environment variables are accessed via `src/config/env.ts` (Zod-validated) — never `process.env` directly elsewhere
- Use `HttpError` for all API error responses with explicit HTTP status codes
- Express route handlers must be `async` and wrapped in error forwarding
- `fetch`'s `Response` conflicts with Express's `Response` in the same file — use `globalThis.Response` and `globalThis.fetch` in routes

### GPS handling
- `tryExtractGpsCoordinates` → returns `null` for missing/invalid GPS (use for upload, route-set, generate)
- `extractGpsCoordinates` → throws `HttpError(400)` (use only when GPS is strictly required)
- Route generation and `/api/getroute-set` skip images without GPS and require ≥2 GPS images

### Video generation (external API)
- Base URL: `env.VIDEO_GEN_API_URL` (e.g. `https://image2video.shumov.eu`)
- All calls go through `videoGenFetch()` wrapper in `userRoutes.ts` — it logs request params and response status
- `/generate` — image → video clip; accepts `effect`, `captionPosition`, `captionStyle`, `fontSize`
- `/generate-video` — source video → video clip; same params as `/generate`
- `/combine` — combines clip URLs into a reel; returns `{ videoUrl }`
- Valid effects: `none | zoom-in | zoom-out | pan-left | pan-right | ken-burns | shake`
- Valid captionPosition: `top | center | bottom`
- Valid captionStyle: `word-by-word | karaoke`
- `fontSize`: integer 8–120, optional (omitted = API default)
- All params forwarded as `multipart/form-data` to external API
- `extractLogParams()` helper logs non-binary FormData fields for debugging

### Video thumbnail generation
- `videoThumbnailService.extractVideoThumbnail(buffer, mimeType)` extracts a JPEG at ~1 s via ffmpeg-static
- Returns `Buffer | null` (null = graceful failure, falls back to placeholder)
- Stored as `VIDEO_THUMBNAIL` asset; served via `GET /api/user/assets/:assetId`
- Called automatically on `POST .../source-video` upload

### Cache pattern
```typescript
import { cacheService } from '../services/cacheService';
const cached = await cacheService.get(key);
await cacheService.set(key, value, ttlSeconds);
```

### Storage pattern
- All file I/O goes through `storageService`
- Files are stored under `storage/` with SHA256-named paths
- Paths in DB are relative (not absolute)

### Image pipeline order
1. Receive binary from multer
2. `imageService` → auto-rotate → compress → strip EXIF
3. `storageService` → write to filesystem + compute SHA256
4. Create `RouteAsset` DB record
5. `exifService` → extract GPS from **original** buffer (before processing)

### Auth middleware order (in server.ts)
```
express.json() → session middleware → passport.initialize → passport.session → attachGuestUser
```
`requireAuth` is applied per-router, not globally.

### Prisma usage
- Always use the singleton from `src/db/client.ts`
- Use the correct schema for the target DB: `schema.sqlite.prisma` (dev) or `schema.sqlserver.prisma` (prod)
- Run migrations with `npm run prisma:db:push:sqlite` or `npm run prisma:db:push:sqlserver`
- **Keep both schemas in sync** when modifying the data model

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | ✅ | SQLite: `file:./dev.db` \| SQL Server: connection string |
| `SESSION_SECRET` | ✅ | Long random string for session signing |
| `GOOGLE_CLIENT_ID` | ✅ | Google OAuth app client ID |
| `GOOGLE_CLIENT_SECRET` | ✅ | Google OAuth app client secret |
| `GOOGLE_CALLBACK_URL` | ✅ | OAuth redirect URL |
| `VIDEO_GEN_API_URL` | ✅ | Base URL of the video generation API |
| `VIDEO_GEN_API_TOKEN` | ❌ | Bearer token for video API (if required) |
| `VIDEO_MAX_SIZE_MB` | ❌ | Max source video upload size in MB |
| `PORT` | ❌ | Default: `3000` |
| `REDIS_ENABLED` | ❌ | `true` to enable Redis; defaults to in-memory |
| `REDIS_URL` | ❌ | Redis connection string (when `REDIS_ENABLED=true`) |
| `NODE_ENV` | ❌ | `development` \| `production` |

---

## User-Facing API Endpoints (userRoutes.ts)

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/user/routes` | List all routes for current user |
| `POST` | `/api/user/routes` | Create new route session |
| `GET` | `/api/user/routes/:routeId` | Fetch route with images + assets |
| `DELETE` | `/api/user/routes/:routeId` | Delete route + all assets |
| `POST` | `/api/user/routes/:routeId/images` | Upload images/videos into route |
| `DELETE` | `/api/user/routes/:routeId/images/:imageId` | Delete image + re-index |
| `PATCH` | `/api/user/routes/:routeId/images/:imageId/note` | Save user note |
| `PATCH` | `/api/user/routes/:routeId/images/:imageId/location` | Set GPS + regenerate map |
| `PATCH` | `/api/user/routes/:routeId/reorder` | Persist full image order |
| `POST` | `/api/user/routes/:routeId/generate` | Generate route PNG |
| `GET` | `/api/user/routes/:routeId/route-map` | Download latest route PNG |
| `GET` | `/api/user/assets/:assetId` | Download any asset (image/map/thumb) |
| `POST` | `/api/user/routes/:routeId/images/:imageId/summary` | Generate AI captions via Claude |
| `PATCH` | `/api/user/routes/:routeId/images/:imageId/summary` | Save captions |
| `POST` | `/api/user/routes/:routeId/images/:imageId/translate` | Translate captions |
| `POST` | `/api/user/routes/:routeId/images/:imageId/video` | Generate video clip from image |
| `POST` | `/api/user/routes/:routeId/images/:imageId/source-video` | Upload source video for item |
| `GET` | `/api/user/routes/:routeId/images/:imageId/source-video` | Stream source video (for playback) |
| `POST` | `/api/user/routes/:routeId/images/:imageId/video-from-video` | Generate video clip from source video |
| `POST` | `/api/user/routes/:routeId/combine-video` | Combine all clips into a reel |

---

## Frontend State Shape (`public/app.js`)

```javascript
state = {
  auth: { authenticated, guest, user: { id, email, displayName, avatarUrl } | null, loading },
  activeRouteSessionId: string | null,
  dirty: bool,              // true only when unpersisted (new upload) local-only items exist
  combineVideoUrl: string,  // URL of the combined reel (persisted to RouteSession.combinedVideoUrl)
  combineVideoStatus: string,
  items: [{
    id: string,                    // local random ID
    serverImageId: string | null,  // DB RouteImage.id after upload
    file: File | null,
    localFingerprint: string,
    originalFilename: string,
    byteSize: number,
    mimeType: string,
    thumbUrl: string | null,       // blob URL; for videos: VIDEO_THUMBNAIL asset or placeholder
    mapUrl: string | null,
    locationInfo: object | null,
    isVideo: bool,                 // true when primary media is a video (no image)
    userNote: string,
    noteSaved: bool,
    noteStatus: string,
    aiSummary: string,             // captions text
    summaryStatus: string,
    summaryLoading: bool,
    translateLoading: bool,
    videoUrl: string,              // generated clip URL (presigned, ~1 h)
    videoLoading: bool,
    videoStatus: string,
    videoFromVideoLoading: bool,
    hasSourceVideo: bool,
    sourceVideoFilename: string,
    sourceVideoUploading: bool,
    sourceVideoStatus: string,
    persisted: bool | null,
    hasGps: bool | null,
    message: string,
    messageType: "ok" | "warn"
  }],
  routeSessions: [{ id, title, createdAt, updatedAt }]
}
```

**`state.dirty`** is only set by drag-drop reordering when there are local-only (unpersisted) items. Deletions and reorders of persisted items are synced immediately and do NOT set `state.dirty`.

The frontend is vanilla JS — do not introduce npm packages, bundlers, or frameworks into `public/`.

---

## Development Workflow

```bash
npm install
npm run prisma:db:push:sqlite
npm run dev          # → http://localhost:3000

# Type-check without full build (avoids Prisma DLL lock on Windows)
npx tsc --noEmit

# Production build (stop server first on Windows — Prisma DLL is locked while running)
npm run build && npm start

# Capture server logs on Windows
npm start | Tee-Object -FilePath server.log
```

---

## Known Limitations / Gotchas

1. **Puppeteer rendering is synchronous** — heavy map renders block other requests
2. **No rate limiting** — `express-rate-limit` is not yet configured
3. **File storage is local filesystem** — `storage/` must be a writable mounted volume in Docker
4. **No test suite** — no Jest/Vitest configured; manual E2E only
5. **Frontend is plain JS** — no TypeScript, no bundler; keep `public/app.js` as vanilla ES6+
6. **Redis is opt-in** — default runtime uses in-memory cache
7. **Dual Prisma schemas** — always keep `schema.sqlite.prisma` and `schema.sqlserver.prisma` in sync
8. **`orderIndex` is 0-based** — always contiguous; DELETE re-indexes remaining images
9. **Prisma DLL lock on Windows** — running `npm run build` while server is running causes `EPERM`; use `npx tsc --noEmit` for type-checking
10. **`globalThis.fetch` / `globalThis.Response`** — required in `userRoutes.ts` to avoid conflict with Express `Response` type
11. **Video clip URLs expire** — presigned links from the external API expire in ~1 hour; re-generate to refresh
12. **ffmpeg path is bundled** — `videoThumbnailService` calls `Ffmpeg.setFfmpegPath(ffmpegPath)` from `ffmpeg-static`; no system ffmpeg needed
13. **`captionStyle` always sent** — even as default `word-by-word`; API accepts it
14. **Combined video chip** — `#combine-video-state` lives OUTSIDE `#combined-video-section`; section only appears when `state.combineVideoUrl` is set

---

## What NOT to Do

- Do not access `process.env` directly — use `src/config/env.ts`
- Do not call Redis client directly from routes — use `cacheService`
- Do not bypass `storageService` for filesystem reads/writes
- Do not skip ownership checks when accessing `RouteSession` or `RouteImage` records
- Do not add framework dependencies (React, Vue, etc.) to the frontend without a build step
- Do not store secrets or credentials in source code
- Do not use `extractGpsCoordinates` (hard-fail) where GPS is optional — use `tryExtractGpsCoordinates`
- Do not call `L.map()` on a hidden element — the location picker div must be visible first
- Do not set `state.dirty = true` for image deletions or reorders — those are immediately server-synced
- Do not call the external video API directly from routes — always use `videoGenFetch()` so calls are logged
- Do not run `npm run build` while the server is running on Windows (Prisma DLL lock)


---

## Technology Stack

### Backend
- **Runtime:** Node.js v20
- **Framework:** Express.js v5.2.1
- **Language:** TypeScript 6.0.2 — strict mode enabled; never use `any`
- **ORM:** Prisma v6.19.3 — dual schema support (SQLite dev / SQL Server prod)
- **Auth:** Passport.js + `passport-google-oauth20`; guest sessions via signed HMAC cookie
- **Sessions:** `express-session` with HTTP-only cookies
- **Validation:** Zod v4.3.6 for all runtime schema validation (see `src/utils/validators.ts`)
- **Map rendering:** Leaflet v1.9.4 inside Puppeteer v24.4.0 headless browser → PNG screenshot
- **EXIF parsing:** `exifr` v7.1.3
- **Image processing:** `sharp` v0.34.5 (auto-rotate, compress, strip EXIF before storage)
- **Geocoding:** Nominatim (OSM) + Wikipedia API
- **Caching:** Redis-first with automatic in-memory fallback; controlled via `REDIS_ENABLED` env var
- **File upload:** `multer` v2.1.1
- **API docs:** OpenAPI 3.0.3 + Swagger UI Express v5.0.1

### Frontend
- Plain HTML5 / CSS3 / Vanilla JavaScript — **no framework, no build step**
- Responsive grid, viewport-based layout in `public/styles.css`
- All logic in `public/app.js`; state kept in a single `state` object + LocalStorage

### Infrastructure
- Docker multi-stage build (`Dockerfile`)
- `docker-compose.yml` for local full-stack
- SQLite default; SQL Server in production

---

## Directory Structure

```
src/
  auth/
    passport.ts          # Google OAuth strategy
    session.ts           # express-session middleware
    guestCookie.ts       # HMAC sign/verify for guest cookie key
  cache/
    redisClient.ts       # Redis singleton + connection lifecycle
  config/
    env.ts               # Zod-validated env config (single source of truth for all env vars)
  db/
    client.ts            # Prisma client singleton
  middleware/
    requireAuth.ts       # Auth guard for protected routes
    attachGuestUser.ts   # Resolves guest cookie into req.user context
  routes/
    mapRoutes.ts         # GET /api/map/render (public)
    getMapRoute.ts       # POST /api/getmap|getinfo|getroute|getroute-set (stateless public)
    authRoutes.ts        # /auth/* endpoints
    userRoutes.ts        # /api/user/* (authenticated CRUD)
  services/
    mapTemplate.ts       # HTML templates for single-pin / two-point / multi-point maps
    mapRenderService.ts  # Puppeteer PNG rendering
    exifService.ts       # GPS extraction + validation
    imageService.ts      # auto-rotate / compress / strip EXIF
    locationInfoService.ts # Nominatim + Wikipedia reverse geocode
    cacheService.ts      # Redis-first cache with memory fallback
    storageService.ts    # Filesystem I/O, SHA256 hashing, path resolution
  swagger/
    openapi.ts           # OpenAPI 3.0.3 spec document
  utils/
    validators.ts        # Zod schemas for request validation
  server.ts              # Express app setup, route registration, error handling
prisma/
  schema.sqlite.prisma
  schema.sqlserver.prisma
public/
  index.html
  app.js
  styles.css
storage/                 # Runtime filesystem assets — git-ignored
dist/                    # Compiled output — git-ignored
```

---

## Data Models (Prisma)

### Core relationships
```
User (1) ──► RouteSession (many)
RouteSession (1) ──► RouteImage (many) + RouteAsset (many)
RouteImage (1) ──► RouteAsset (many)
All relations use cascade delete.
```

### Key fields to know
- `User.googleSub` — unique; Google UID for OAuth users, `guest:<uuid>` for guests
- `RouteImage.orderIndex` — 0-based position in the route sequence
- `RouteImage.userNote` — nullable, max ~5000 chars, stored as plaintext
- `RouteAsset.assetType` — enum: `ORIGINAL_IMAGE | IMAGE_MAP | ROUTE_MAP`
- `RouteAsset.storagePath` — relative path under `storage/`
- `RouteAsset.sha256` — content hash for deduplication
- `RouteSession.status` — enum: `ACTIVE | COMPLETED`

---

## API Conventions

### Auth model
- **Public:** No cookie needed
- **Authenticated:** Requires either Google OAuth session cookie **or** guest signed cookie
- `requireAuth` middleware returns 401 if neither is present
- Ownership is always enforced — users can only access their own data (403 otherwise)

### Successful responses
```json
// Collection
{ "routeSessions": [...] }
// Single resource
{ "routeSession": { "id": "...", ... } }
// Upload (all success)
{ "uploadedImages": [...], "failedImages": [] }
// Upload (partial success) → HTTP 207
{ "uploadedImages": [...], "failedImages": [{ "filename": "...", "reason": "..." }] }
```

### Error responses
```json
{ "error": "Human-readable message" }
```
Use the `HttpError` class from `src/utils/validators.ts` to throw typed HTTP errors.

### File upload
- `multipart/form-data` via multer
- `images` field = file array
- `noteByIndex` field = JSON-stringified string array (notes per image, by upload order)
- MIME type must be `image/jpeg` or `image/png`

---

## Key Patterns & Conventions

### TypeScript
- Strict mode — no implicit `any`, `strictNullChecks` enforced
- All environment variables are accessed via `src/config/env.ts` (Zod-validated) — never `process.env` directly elsewhere
- Use `HttpError` for all API error responses with explicit HTTP status codes
- Express route handlers must be `async` and wrapped in error forwarding

### GPS handling
- `tryExtractGpsCoordinates` → returns `null` for missing/invalid GPS (use for upload, route-set, generate)
- `extractGpsCoordinates` → throws `HttpError(400)` (use only when GPS is strictly required)
- Route generation and `/api/getroute-set` skip images without GPS and require ≥2 GPS images

### Cache pattern
```typescript
// Always use cacheService, never call Redis client directly from routes
import { cacheService } from '../services/cacheService';
const cached = await cacheService.get(key);
await cacheService.set(key, value, ttlSeconds);
```

### Storage pattern
- All file I/O goes through `storageService`
- Files are stored under `storage/` with SHA256-named paths
- Paths in DB are relative (not absolute)

### Image pipeline order
1. Receive binary from multer
2. `imageService` → auto-rotate → compress → strip EXIF
3. `storageService` → write to filesystem + compute SHA256
4. Create `RouteAsset` DB record
5. `exifService` → extract GPS from **original** buffer (before processing)
   - Use `tryExtractGpsCoordinates` (returns `null`) for optional GPS (upload, route-set, generate)
   - Use `extractGpsCoordinates` (throws 400) only when GPS is strictly required

### Auth middleware order (in server.ts)
```
session middleware → passport.initialize → passport.session → attachGuestUser
```
`requireAuth` is applied per-router, not globally.

### Prisma usage
- Always use the singleton from `src/db/client.ts`
- Use the correct schema for the target DB: `schema.sqlite.prisma` (dev) or `schema.sqlserver.prisma` (prod)
- Run migrations with `npm run prisma:db:push:sqlite` or `npm run prisma:db:push:sqlserver`

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | ✅ | SQLite: `file:./dev.db` \| SQL Server: connection string |
| `SESSION_SECRET` | ✅ | Long random string for session signing |
| `GOOGLE_CLIENT_ID` | ✅ | Google OAuth app client ID |
| `GOOGLE_CLIENT_SECRET` | ✅ | Google OAuth app client secret |
| `GOOGLE_CALLBACK_URL` | ✅ | OAuth redirect URL |
| `PORT` | ❌ | Default: `3000` |
| `REDIS_ENABLED` | ❌ | `true` to enable Redis; defaults to in-memory |
| `REDIS_URL` | ❌ | Redis connection string (when `REDIS_ENABLED=true`) |
| `NODE_ENV` | ❌ | `development` \| `production` |

---

## New API Endpoints (added this session)

| Method | Path | Purpose |
|--------|------|---------|
| `DELETE` | `/api/user/routes/:routeId/images/:imageId` | Delete image + assets; re-index remaining |
| `PATCH` | `/api/user/routes/:routeId/images/:imageId/location` | Set/update GPS location; re-generates IMAGE_MAP |
| `PATCH` | `/api/user/routes/:routeId/reorder` | Persist full image order; body: `{ imageIds: string[] }` |

### DELETE image behaviour
- Deletes filesystem files first, then DB record (cascade removes `RouteAsset`)
- Re-indexes remaining `RouteImage.orderIndex` to keep values contiguous (0-based)
- Returns 403 if image doesn't belong to authenticated user's session

### PATCH location behaviour
- Validates `lat` (−90…90) and `lng` (−180…180)
- Fetches Nominatim + Wikipedia reverse geocode
- Renders new IMAGE_MAP via Puppeteer, writes to `storage/`, creates new `RouteAsset`
- Deletes the old IMAGE_MAP asset (file + DB row)
- Updates `gpsLat`, `gpsLng`, `locationInfoJson` on `RouteImage`

### PATCH reorder behaviour
- Accepts full ordered array; validates every ID belongs to the route and user
- Runs `prisma.routeImage.update` in `Promise.all` — all or nothing
- Frontend sends only `serverImageId` values (skips local-only items)

---

## Frontend State Shape (`public/app.js`)

```javascript
state = {
  auth: {
    authenticated: bool,
    guest: bool,
    user: { id, email, displayName, avatarUrl } | null,
    loading: bool
  },
  activeRouteSessionId: string | null,
  dirty: bool,                  // true only when unpersisted (new upload) items exist
  items: [{
    id: string,                   // local random ID
    serverImageId: string | null, // DB RouteImage.id after upload
    file: File | null,
    localFingerprint: string,     // hash(filename + size)
    originalFilename: string,
    byteSize: number,
    mimeType: string,
    thumbUrl: string | null,
    mapUrl: string | null,
    locationInfo: object | null,
    userNote: string,
    noteSaved: bool,
    noteStatus: string,           // "Saved" | "Unsaved changes" | etc.
    persisted: bool | null,       // null=pending, true=uploaded, false=failed
    hasGps: bool | null,
    message: string,
    messageType: "ok" | "warn"
  }],
  routeSessions: [{ id, title, createdAt, updatedAt }]
}
```

**`state.dirty`** is only set by drag-drop reordering when there are local-only (unpersisted) items that couldn't be included in the server reorder call. Deletions and reorders of persisted items are synced immediately — they do NOT set `state.dirty`.

The frontend is vanilla JS — do not introduce npm packages, bundlers, or frameworks into `public/`.

---

## Development Workflow

```bash
# Install + generate Prisma client
npm install

# Push schema to SQLite dev DB
npm run prisma:db:push:sqlite

# Start dev server with hot reload
npm run dev
# → http://localhost:3000

# Production build
npm run build && npm start
```

---

## Known Limitations / Gotchas

1. **Puppeteer rendering is synchronous** — heavy map renders block other requests; do not add long rendering logic inline
2. **No rate limiting** — `express-rate-limit` is not yet configured; don't rely on request volume assumptions
3. **File storage is local filesystem** — not cloud-native; `storage/` must be a writable mounted volume in Docker
4. **No test suite** — no Jest/Vitest configured; manual E2E only; do not assume test infrastructure exists
5. **Frontend is plain JS** — no TypeScript, no bundler, no tree-shaking; keep `public/app.js` as vanilla ES6+
6. **Redis is opt-in** — default runtime uses in-memory cache; distributed caching requires `REDIS_ENABLED=true` + running Redis
7. **User notes are plaintext** — not encrypted at rest; avoid storing sensitive data in note fields
8. **Dual Prisma schemas** — always keep `schema.sqlite.prisma` and `schema.sqlserver.prisma` in sync when modifying the data model
9. **`orderIndex` is 0-based** — always contiguous; the DELETE image endpoint re-indexes remaining images after removal
10. **Location picker requires internet** — Leaflet tiles served from OSM CDN; offline environments need a tile proxy
11. **`reorderItems` is fire-and-forget on drop** — the drag handler calls `reorderItems()` without awaiting; network errors surface via `updateStatus()` only
12. **Leaflet map init timing** — picker `<div>` must be visible before `L.map()` is called; use `requestAnimationFrame` to defer init

---

## What NOT to Do

- Do not access `process.env` directly — use `src/config/env.ts`
- Do not call Redis client directly from routes — use `cacheService`
- Do not bypass `storageService` for filesystem reads/writes
- Do not skip ownership checks when accessing `RouteSession` or `RouteImage` records
- Do not add framework dependencies (React, Vue, etc.) to the frontend without a build step
- Do not store secrets or credentials in source code
- Do not use `extractGpsCoordinates` (hard-fail) where GPS is optional — use `tryExtractGpsCoordinates`
- Do not call `L.map()` on a hidden element — the location picker div must be visible first
- Do not set `state.dirty = true` for image deletions or reorders — those are now immediately server-synced
