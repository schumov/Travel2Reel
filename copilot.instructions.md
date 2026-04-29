# Copilot Instructions – Travel2Reel

## Project Overview

Full-stack web application for managing travel photo/video routes, generating AI-powered captions, and producing short video reels. Users upload photos or videos (with or without GPS), organize them into routes, write or AI-generate captions per item, manually set locations, and export the route as a combined video reel.

**Current status:** MVP + Persistence / AI Captions / Video Generation / Video Thumbnails / Guest Access / Redis Cache / Image Processing / GPS-Optional Upload / Location Picker / Server-Synced Delete & Reorder / Combined Video / Logging / Admin Area complete.

**App title / brand:** Travel2Reel  
**Homepage tagline:** "Travel2Reel: video generation accelerator for your travel"

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
- **AI captions:** Anthropic Claude via `@anthropic-ai/sdk`
- **Caching:** Redis-first with automatic in-memory fallback; controlled via `REDIS_ENABLED` env var
- **File upload:** `multer` v2.1.1
- **API docs:** OpenAPI 3.0.3 + Swagger UI Express v5.0.1
- **External video API:** `https://image2video.shumov.eu` — `/generate`, `/generate-video`, `/combine`

### Frontend
- Plain HTML5 / CSS3 / Vanilla JavaScript — **no framework, no build step**
- Responsive grid, viewport-based layout in `public/styles.css`
- All logic in `public/app.js`; state kept in a single `state` object
- `public/admin.html` — self-contained admin UI (no shared JS/CSS with main app)

### Infrastructure
- Docker multi-stage build (`Dockerfile`)
- `docker-compose.yml` for local full-stack
- SQLite default; SQL Server in production

---

## Directory Structure

```
src/
  auth/
    passport.ts              # Google OAuth strategy; checks isEnabled in deserializeUser
    session.ts               # express-session middleware
    guestCookie.ts           # HMAC sign/verify for guest cookie key
  cache/
    redisClient.ts           # Redis singleton + connection lifecycle
  config/
    env.ts                   # Zod-validated env config — single source of truth for all env vars
  db/
    client.ts                # Prisma client singleton
  middleware/
    requireAuth.ts           # Auth guard for /api/user/* routes (401 if not authenticated)
    requireAdmin.ts          # Admin guard for /admin/api/* routes (401 if not admin session)
    attachGuestUser.ts       # Resolves guest cookie → req.user; checks isEnabled + guest_access_enabled
  routes/
    mapRoutes.ts             # GET /api/map/render (public)
    getMapRoute.ts           # POST /api/getmap|getinfo|getroute|getroute-set (stateless public)
    authRoutes.ts            # /auth/* endpoints; guest POST checks guest_access_enabled setting
    userRoutes.ts            # /api/user/* — authenticated CRUD + video generation
    adminRoutes.ts           # /admin/* — admin login/logout, settings, user management
  services/
    mapTemplate.ts           # HTML templates for single-pin / two-point / multi-point maps
    mapRenderService.ts      # Puppeteer PNG rendering
    exifService.ts           # GPS extraction + validation
    imageService.ts          # auto-rotate / compress / strip EXIF
    locationInfoService.ts   # Nominatim + Wikipedia reverse geocode
    cacheService.ts          # Redis-first cache with memory fallback
    storageService.ts        # Filesystem I/O, SHA256 hashing, path resolution
    videoThumbnailService.ts # ffmpeg thumbnail extraction from video buffer
    claudeAiService.ts       # Claude AI caption generation + translation
  swagger/
    openapi.ts               # OpenAPI 3.0.3 spec document
  utils/
    validators.ts            # Zod schemas + HttpError class
  types/
    express.d.ts             # Express + express-session type augmentations
  server.ts                  # Express app setup, route registration, error handling
prisma/
  schema.sqlite.prisma       # Dev schema (SQLite)
  schema.sqlserver.prisma    # Prod schema (SQL Server) — must mirror sqlite schema
public/
  index.html                 # Main app shell
  app.js                     # All frontend logic (~55 KB vanilla JS)
  styles.css                 # All app styles
  admin.html                 # Self-contained admin panel (own HTML/CSS/JS)
storage/                     # Runtime filesystem assets — git-ignored
dist/                        # Compiled output — git-ignored
```

---

## Data Models (Prisma)

### Core relationships
```
User (1) ──► RouteSession (many)
RouteSession (1) ──► RouteImage (many) + RouteAsset (many)
RouteImage (1) ──► RouteAsset (many)
AppSetting (standalone key/value store)
All User/RouteSession/RouteImage/RouteAsset relations use cascade delete.
```

### User
| Field | Type | Notes |
|---|---|---|
| `id` | cuid | PK |
| `googleSub` | String (unique) | Google UID for OAuth users; `guest:<uuid>` for guests |
| `email` | String | |
| `displayName` | String | |
| `avatarUrl` | String? | |
| `isEnabled` | Boolean | default `true`; if `false`, user is blocked on next request |
| `createdAt` / `updatedAt` | DateTime | |

### RouteImage — key fields
- `orderIndex` — 0-based position in the route sequence; always contiguous
- `userNote` — nullable, per-item user annotation
- `aiSummary` — nullable, AI-generated or manually written captions
- `hasSourceVideo` — true when an `ORIGINAL_VIDEO` asset exists for the image slot
- `videoUrl` — presigned URL of the generated video clip (from external API, expires ~1 h)

### RouteAsset — `assetType` enum
`ORIGINAL_IMAGE | IMAGE_MAP | ROUTE_MAP | ORIGINAL_VIDEO | VIDEO_THUMBNAIL`

### AppSetting
| Field | Notes |
|---|---|
| `key` (PK) | Setting identifier, e.g. `guest_access_enabled` |
| `value` | String; always `"true"` or `"false"` for boolean settings |

**Known settings keys:** `guest_access_enabled` (default `"true"` when row is absent)

---

## API Conventions

### Auth model
| Layer | Who | How |
|---|---|---|
| Public | Anyone | No cookie needed |
| Authenticated | Google OAuth or Guest | `requireAuth` middleware → 401 if absent |
| Admin | Admin session only | `requireAdmin` middleware → 401 if `req.session.isAdmin !== true` |

Ownership is always enforced — users can only access their own data (403 otherwise).

### Error responses
```json
{ "error": "Human-readable message" }
```
Use `HttpError` from `src/utils/validators.ts` for all typed HTTP errors.

### File upload
- `multipart/form-data` via multer
- `images` field = file array (JPEG/PNG/video)
- `noteByIndex` field = JSON-stringified string array (notes per image, by upload order)

---

## User-Facing API Endpoints (`userRoutes.ts`)

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/user/routes` | List all routes for current user |
| `POST` | `/api/user/routes` | Create new route session |
| `GET` | `/api/user/routes/:routeId` | Fetch route with images + assets |
| `PATCH` | `/api/user/routes/:routeId` | Rename route |
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
| `POST` | `/api/user/routes/:routeId/images/:imageId/source-video` | Upload source video; auto-generates thumbnail |
| `GET` | `/api/user/routes/:routeId/images/:imageId/source-video` | Stream source video for playback |
| `POST` | `/api/user/routes/:routeId/images/:imageId/video-from-video` | Generate clip from source video |
| `POST` | `/api/user/routes/:routeId/combine-video` | Combine all clips into a reel |

## Admin API Endpoints (`adminRoutes.ts`)

All admin API endpoints (except login/logout/me) require `requireAdmin` middleware.

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/admin/login` | Verify credentials, set `req.session.isAdmin` (regenerates session) |
| `POST` | `/admin/logout` | Destroy admin session |
| `GET` | `/admin/me` | Check if current session is authenticated as admin |
| `GET` | `/admin/api/settings` | Get all app settings (with defaults for missing rows) |
| `PATCH` | `/admin/api/settings` | Upsert a setting (`key` must be in allowlist, `value` must be `"true"`/`"false"`) |
| `GET` | `/admin/api/users` | List all users with route count |
| `PATCH` | `/admin/api/users/:id` | Enable or disable a user (`{ isEnabled: bool }`) |
| `DELETE` | `/admin/api/users/:id` | Delete user + cascade DB + remove `storage/{sessionId}/` dirs |

Admin UI is served at `GET /admin` → `public/admin.html`.

---

## Auth Routes (`authRoutes.ts`)

| Method | Path | Notes |
|--------|------|-------|
| `GET` | `/auth/google` | Start Google OAuth flow |
| `GET` | `/auth/google/callback` | OAuth callback |
| `GET` | `/auth/me` | Returns `{ authenticated, guest, user }` |
| `POST` | `/auth/guest` | Create guest session (blocked if `guest_access_enabled === "false"`) |
| `POST` | `/auth/logout` | Destroy session + clear cookies |

---

## Key Patterns & Conventions

### TypeScript
- Strict mode — no implicit `any`, `strictNullChecks` enforced
- All environment variables accessed via `src/config/env.ts` — never `process.env` directly
- Use `HttpError` for all API errors with explicit HTTP status codes
- Express route handlers must be `async` and forward errors to `next()`
- `fetch`'s `Response` conflicts with Express's `Response` — use `globalThis.Response` and `globalThis.fetch` in routes
- `req.params["id"]` should be cast to `string` when passed to Prisma (TypeScript types `params` as `string | string[]`)

### Admin session
- Credentials stored in `.env` as `ADMIN_USERNAME` / `ADMIN_PASSWORD` (defaults: `admin` / `May2026`)
- `req.session.isAdmin = true` is set after login; `req.session.regenerate()` is called first to prevent fixation
- Session type is augmented via `declare module "express-session" { interface SessionData { isAdmin?: boolean } }` in `express.d.ts`
- Production warning is logged at startup when default credentials are still in use

### User enable/disable enforcement
- **Google users:** `passport.deserializeUser` returns `false` if `user.isEnabled === false` → session invalidated on next request
- **Guest users:** `attachGuestUser` clears cookie and skips attaching if `user.isEnabled === false`
- **Guest access toggle:** `attachGuestUser` checks `AppSetting { key: "guest_access_enabled" }` before attaching any guest; `POST /auth/guest` checks it before creating a new guest

### GPS handling
- `tryExtractGpsCoordinates` → returns `null` for missing/invalid GPS (use for upload, route-set, generate)
- `extractGpsCoordinates` → throws `HttpError(400)` (use only when GPS is strictly required)
- Route generation and `/api/getroute-set` skip images without GPS and require ≥2 GPS images

### Video generation (external API)
- Base URL: `env.VIDEO_GEN_API_URL` (e.g. `https://image2video.shumov.eu`)
- All calls go through `videoGenFetch()` wrapper in `userRoutes.ts` — logs request params + response status
- `/generate` — image → video clip; accepts `effect`, `captionPosition`, `captionStyle`, `fontSize`
- `/generate-video` — source video → video clip; same params as `/generate`
- `/combine` — combines clip URLs into a reel; returns `{ videoUrl }`
- Valid `effect`: `none | zoom-in | zoom-out | pan-left | pan-right | ken-burns | shake`
- Valid `captionPosition`: `top | center | bottom`
- Valid `captionStyle`: `word-by-word | karaoke`
- `fontSize`: integer 8–120, optional (omitted = API default)
- All params forwarded as `multipart/form-data` to external API
- `extractLogParams()` helper logs non-binary FormData fields for debugging

### Video thumbnail generation
- `videoThumbnailService.extractVideoThumbnail(buffer, mimeType)` extracts JPEG at ~1 s via ffmpeg-static
- Returns `Buffer | null` (null = graceful failure; frontend falls back to placeholder SVG)
- Stored as `VIDEO_THUMBNAIL` asset; served via `GET /api/user/assets/:assetId` with `image/jpeg` content-type
- Called automatically on `POST .../source-video` upload; `thumbnailUrl` returned in response

### User deletion (admin)
- Collect all `routeSession.id` values for the user first
- Delete DB user (cascade handles sessions, images, assets)
- Remove `storage/{sessionId}/` directories using `fs.rm(..., { recursive: true, force: true })`
- Any filesystem errors are reported in the response but do not roll back the DB delete

### Storage pattern
- All file I/O goes through `storageService`
- Files stored under `storage/{routeSessionId}/` with descriptive names
- DB `storagePath` values are relative to `storageRoot` (never absolute)
- `resolveStoragePath()` validates path stays within `storageRoot` (path traversal guard)

### Image pipeline order
1. Receive binary from multer
2. `imageService` → auto-rotate → compress → strip EXIF
3. `storageService` → write to filesystem + compute SHA256
4. Create `RouteAsset` DB record
5. `exifService` → extract GPS from **original** buffer (before processing)

### Auth middleware order (server.ts)
```
express.json() → session → passport.initialize → passport.session → attachGuestUser
```
`requireAuth` and `requireAdmin` are applied per-router, not globally.

### Cache pattern
```typescript
import { cacheService } from '../services/cacheService';
const cached = await cacheService.get(key);
await cacheService.set(key, value, ttlSeconds);
```

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | `file:./dev.db` | SQLite path or SQL Server connection string |
| `DATABASE_PROVIDER` | `sqlite` | `sqlite` or `sqlserver` |
| `SESSION_SECRET` | `change-me-dev-secret` | Long random string for session signing |
| `GOOGLE_CLIENT_ID` | — | Google OAuth app client ID |
| `GOOGLE_CLIENT_SECRET` | — | Google OAuth app client secret |
| `GOOGLE_CALLBACK_URL` | `http://localhost:3000/auth/google/callback` | OAuth redirect URL |
| `ADMIN_USERNAME` | `admin` | Admin panel username |
| `ADMIN_PASSWORD` | `May2026` | Admin panel password — **change in production** |
| `ANTHROPIC_API_KEY` | — | Claude AI key for caption generation |
| `ANTHROPIC_MODEL` | `claude-sonnet-4-6` | Claude model name |
| `VIDEO_GEN_API_URL` | — | Base URL of the external video generation API |
| `VIDEO_GEN_API_TOKEN` | — | Bearer token for video API (if required) |
| `VIDEO_MAX_SIZE_MB` | `200` | Max source video upload size in MB |
| `PORT` | `3000` | HTTP port |
| `REDIS_ENABLED` | `false` | `true` to enable Redis cache |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection string |
| `REDIS_PASSWORD` | — | Redis password |
| `IMAGE_MAX_SIZE_MB` | `2` | Max image upload size after compression |
| `IMAGE_COMPRESSION_QUALITY` | `80` | JPEG quality 1–100 |
| `IMAGE_STRIP_EXIF` | `true` | Strip EXIF on upload |
| `IMAGE_AUTO_ROTATE` | `true` | Auto-rotate based on EXIF orientation |
| `GUEST_COOKIE_SECRET` | `change-me-guest-secret` | HMAC key for guest cookie signing |
| `GUEST_SESSION_EXPIRY_DAYS` | `90` | Guest cookie max age |
| `NODE_ENV` | `development` | `development` or `production` |

---

## Frontend State Shape (`public/app.js`)

```javascript
state = {
  auth: { authenticated, guest, user: { id, email, displayName, avatarUrl } | null },
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
  savedRoutes: [{ id, title, createdAt, updatedAt }]
}
```

**`state.dirty`** is only set by drag-drop reordering when there are local-only (unpersisted) items. Deletions and reorders of persisted items are synced immediately and do NOT set `state.dirty`.

### Homepage visibility logic
- **Not logged in:** `#welcome-screen` is shown, `#edit-panel` is hidden
- **Logged in, no route selected:** `#edit-panel` is shown with "No active route" heading
- **Logged in, route selected:** route title shown, photo list and bottom panels active
- Toggled in `updateAuthUi()` via `elements.welcomeScreen` and `elements.editPanel` refs

The frontend is vanilla JS — do not introduce npm packages, bundlers, or frameworks into `public/`.

---

## Development Workflow

```bash
npm install
npm run prisma:db:push:sqlite   # apply schema to local dev.db
npm run dev                     # → http://localhost:3000

# Admin panel
open http://localhost:3000/admin
# Default credentials: admin / May2026

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
14. **Admin creds in env only** — no DB storage; admin cannot be locked out by user disabling. Log warning in production if defaults are still in use.
15. **Disabled users invalidated on next request** — no immediate session kill; `deserializeUser` / `attachGuestUser` check `isEnabled` on each request

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
- Do not add new `AppSetting` keys without adding them to the `ALLOWED_SETTINGS` allowlist in `adminRoutes.ts`
- Do not modify both Prisma schemas without keeping them in sync

