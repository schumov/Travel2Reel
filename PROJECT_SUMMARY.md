# Travel2Reel – Project Summary

**Last Updated:** April 17, 2026  
**Project Status:** MVP + Persistence / AI Captions / Video Generation / Combined Reel / Video Thumbnail / Guest Access / Image Management Complete  
**Build Status:** ✅ Green (TypeScript, Prisma migrations synced)

---

## 1. PROJECT OVERVIEW

**Purpose:** Full-stack web application for managing travel photo/video routes, generating AI-powered captions per item, producing individual video clips, and combining them into a shareable route reel.

**Key Capabilities:**
- Upload photos or videos (with or without GPS) into named route sessions
- Extract GPS coordinates from image EXIF data
- Render per-image location maps and multi-point route visualizations as PNG
- AI-generated captions per item (Claude AI) with translation support
- Generate short video clips from images or source videos via external API
- Combine clips into a complete route reel; persisted URL restored on next load
- Video thumbnail auto-generated from uploaded video files via ffmpeg
- ▶ Play source video directly from the Edit Media overlay
- User authentication via Google OAuth and guest sessions
- Per-image GPS location picker (Leaflet map embedded in edit overlay)
- Inline note editor and caption editor per image/video item
- Server-synced image deletion (with confirmation) and drag-drop reorder
- Structured logging of all calls to the external video generation API
- Docker deployment ready; dual-DB (SQLite dev / SQL Server prod)

---

## 2. TECHNOLOGY STACK

### Backend
- **Runtime:** Node.js (v20)
- **Framework:** Express.js v5.2.1
- **Language:** TypeScript 6.0.2 (strict mode)
- **ORM:** Prisma v6.19.3 (dual-schema support: SQLite + SQL Server)
- **Authentication:** Passport.js + passport-google-oauth20
- **Sessions:** express-session with cookie-based auth
- **AI:** Anthropic Claude API (caption generation + translation)

### Map Rendering
- **Tile Source:** OpenStreetMap (via Leaflet)
- **HTML Rendering Library:** Leaflet v1.9.4
- **PNG Conversion:** Puppeteer v24.4.0 (headless browser screenshot)

### Image & Video Processing
- **EXIF Parsing:** exifr v7.1.3
- **File Upload:** multer v2.1.1
- **Image Pipeline:** sharp v0.34.5 (auto-rotation, compression, EXIF strip)
- **Video Thumbnails:** ffmpeg-static (bundled binary) + fluent-ffmpeg (frame extraction at ~1 s)
- **Geocoding:** Reverse geocode API (Nominatim) + Wikipedia API

### Video Generation (External API)
- **Base URL:** `https://image2video.shumov.eu`
- **Endpoints:** `/generate` (image→clip), `/generate-video` (video→clip), `/combine` (clips→reel)
- **Params:** `effect`, `captionPosition`, `captionStyle`, `fontSize` (all forwarded as multipart/form-data)
- **Logging:** All requests logged via `videoGenFetch()` wrapper with params + status/elapsed

### Data & Caching
- **Database:** SQLite (dev, default) or SQL Server (configurable)
- **Caching:** Redis (optional) with automatic in-memory fallback
- **File Storage:** Filesystem (`storage/` directory) with SHA256 hashing

### API Documentation
- **Spec Format:** OpenAPI 3.0.3
- **UI:** Swagger UI Express v5.0.1

### Frontend
- **Markup:** HTML5
- **Styling:** CSS3 (viewport-based, responsive grid)
- **Logic:** Vanilla JavaScript (no frameworks, no build step)
- **State:** Client-side `state` object + LocalStorage for auth awareness

### Dev Tools & Build
- **Build:** TypeScript Compiler (tsc)
- **Dev Server:** ts-node-dev with watch mode
- **Validation:** Zod v4.3.6 for runtime schema validation
- **Dependency Management:** npm 10+

### Infrastructure
- **Containerization:** Docker (multi-stage build)
- **Environment:** .env file with Zod-validated schema

---

## 3. ARCHITECTURE

### Directory Structure

```
map/
├── src/
│   ├── auth/
│   │   ├── passport.ts          # Google OAuth strategy config
│   │   ├── session.ts           # express-session middleware setup
│   │   └── guestCookie.ts       # Guest cookie signing + verification
│   ├── config/
│   │   └── env.ts               # Zod-validated environment config
│   ├── db/
│   │   └── client.ts            # Prisma client singleton
│   ├── middleware/
│   │   ├── requireAuth.ts       # Authentication guard for protected routes
│   │   └── attachGuestUser.ts   # Attach guest user from signed cookie
│   ├── cache/
│   │   └── redisClient.ts       # Redis client singleton + connection lifecycle
│   ├── routes/
│   │   ├── mapRoutes.ts         # GET /api/map/render (public single pin)
│   │   ├── getMapRoute.ts       # POST /api/getmap, /api/getinfo, /api/getroute, /api/getroute-set
│   │   ├── authRoutes.ts        # /auth/google, /auth/google/callback, /auth/me, /auth/logout, /auth/guest
│   │   └── userRoutes.ts        # /api/user/* (authenticated CRUD + video generation + AI captions)
│   ├── services/
│   │   ├── mapTemplate.ts       # HTML templates for single pin, two-point route, multi-point route
│   │   ├── mapRenderService.ts  # Puppeteer-based PNG rendering
│   │   ├── exifService.ts       # GPS extraction + validation
│   │   ├── imageService.ts      # Image processing (rotate/compress/strip EXIF)
│   │   ├── locationInfoService.ts # Reverse geocode + Wikipedia summary
│   │   ├── cacheService.ts      # Redis-first cache with memory fallback
│   │   ├── storageService.ts    # File I/O, path resolution, SHA256 hashing
│   │   ├── videoThumbnailService.ts # ffmpeg-static thumbnail extraction from video buffer
│   │   └── claudeAiService.ts   # Caption generation + translation via Claude API
│   ├── swagger/
│   │   └── openapi.ts           # OpenAPI 3.0.3 document
│   ├── utils/
│   │   └── validators.ts        # Zod schemas for request validation
│   └── server.ts                # Express app setup, route registration, error handling
├── prisma/
│   ├── schema.sqlite.prisma     # Prisma schema for SQLite (dev)
│   ├── schema.sqlserver.prisma  # Prisma schema for SQL Server (prod)
│   └── dev.db                   # SQLite database (git-ignored)
├── public/
│   ├── index.html               # Single-page app root
│   ├── app.js                   # All frontend logic (~55 KB vanilla JS)
│   └── styles.css               # Responsive grid, panels, modals, video controls
├── storage/                     # Filesystem assets (images, maps, video thumbs) — git-ignored
├── dist/                        # Compiled TypeScript — git-ignored
├── docker-compose.yml
├── Dockerfile
└── package.json
```

### Request Flow

**Public Endpoints (No Auth):**
1. User → GET `/` → Serve `public/index.html`
2. Frontend JS loads → Checks `/auth/me` → Shows Google login + Guest login if unauthenticated
3. User → POST `/api/getmap` (binary image) → EXIF extraction → Single map PNG response
4. User → POST `/api/getroute-set` (multipart images) → Ordered route PNG response

**Authenticated Endpoints (Google OAuth or Guest Cookie):**
1. User clicks "Login with Google" → Redirected to GET `/auth/google` → Passport redirects to Google
2. Google redirects → GET `/auth/google/callback` → Passport verifies code → Session cookie set
3. Frontend JS polls `/auth/me` → Returns user profile + authenticated/guest state
4. User uploads images → POST `/api/user/routes/:routeId/images` (multipart + noteByIndex JSON)
5. Backend:
   - Extracts EXIF GPS per image
   - Stores original image in `storage/` with SHA256 hash
   - Creates `RouteImage` DB record (including userNote)
   - Generates thumbnail map (transient, cached)
6. Frontend displays grid with images, maps, location info, note inputs
7. User edits notes → PATCH `/api/user/routes/:routeId/images/:imageId/note` → DB persists
8. User generates route → POST  `/api/user/routes/:routeId/generate` → Route PNG saved to `storage/`
9. User downloads or restores route → GET endpoints for assets + list endpoint

---

## 4. DATA MODEL (PRISMA)

### User
```prisma
model User {
  id          String  @id @default(cuid())
  googleSub   String  @unique // Google subject OR guest:<uuid>
  email       String
  displayName String
  avatarUrl   String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  routeSessions RouteSession[]
}
```

### RouteSession
```prisma
model RouteSession {
  id          String @id @default(cuid())
  userId      String
  title       String
  status      RouteSessionStatus @default(ACTIVE)  // ACTIVE | COMPLETED
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  completedAt DateTime?
  user        User @relation(fields: [userId], references: [id], onDelete: Cascade)
  images      RouteImage[]
  assets      RouteAsset[]
  @@index([userId, createdAt])
}
```

### RouteImage
```prisma
model RouteImage {
  id               String @id @default(cuid())
  routeSessionId   String
  orderIndex       Int                    // Position in route sequence (0-based, always contiguous)
  originalFilename String
  mimeType         String
  capturedAt       DateTime?              // From EXIF DateTimeOriginal
  gpsLat           Float?
  gpsLng           Float?
  exifJson         String?
  locationInfoJson String?
  userNote         String?                // Per-image user annotation
  aiSummary        String?                // Captions (written or AI-generated)
  isVideoItem      Boolean @default(false) // Primary media is a video (no image)
  hasSourceVideo   Boolean @default(false) // ORIGINAL_VIDEO asset exists
  videoUrl         String?                // Generated clip URL (presigned, external)
  createdAt        DateTime @default(now())
  routeSession     RouteSession @relation(...)
  assets           RouteAsset[]
}
```

### RouteSession
```prisma
model RouteSession {
  id               String @id @default(cuid())
  userId           String
  title            String
  status           RouteSessionStatus @default(ACTIVE)
  combinedVideoUrl String?              // URL of the combined reel (persisted)
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt
  ...
}
```

### RouteAsset
```prisma
enum RouteAssetType {
  ORIGINAL_IMAGE    // Processed uploaded image (auto-rotated, compressed)
  IMAGE_MAP         // Per-image location map PNG
  ROUTE_MAP         // Full route overview PNG
  ORIGINAL_VIDEO    // Uploaded source video file
  VIDEO_THUMBNAIL   // JPEG thumbnail extracted from video via ffmpeg
}
```

**Relationships:**
- 1 User → Many RouteSessions (cascade delete)
- 1 RouteSession → Many RouteImages (cascade delete)
- 1 RouteSession → Many RouteAssets (cascade delete)
- 1 RouteImage → Many RouteAssets (cascade delete)

---

## 5. API ENDPOINTS

### Health & Status
- `GET /health` → `{ status: "ok" }`

### Frontend
- `GET /` → Serve `index.html`

### API Documentation
- `GET /api/openapi.json` → OpenAPI 3.0.3 document
- `GET /api/docs` → Swagger UI (interactive API explorer)

### Public Map Endpoints (No Auth)
- **GET /api/map/render**
  - Query params: `lat` (required), `lng` (required), `zoom` (1-19, default 13), `width` (256-2000, default 800), `height` (256-2000, default 600)
  - Response: PNG image (200) or error (400/500)

- **GET /api/map/cache/health**
  - Returns active cache backend
  - Response: `{ status: "ok", backend: "redis" | "memory" }`

- **POST /api/getmap**
  - Body: binary image (JPEG/PNG)
  - Extracts GPS EXIF → renders single-pin map
  - Response: PNG image (200) or `{ error: "..." }` (400)

- **POST /api/getinfo**
  - Body: binary image (JPEG/PNG)
  - Extracts GPS EXIF → reverse geocodes + Wikipedia lookup
  - Response: `{ gps, displayName, city, country, wikiTitle, wikiExtract, wikiUrl }` (200) or error (400)

- **POST /api/getroute**
  - Body: multipart form `startImage`, `endImage` (binary)
  - Extracts GPS from both → renders route line between points with markers
  - Response: PNG image (200) or error (400)

- **POST /api/getroute-set**
  - Body: multipart form `images` (binary array in order)
  - Extracts GPS from all images; **skips images without GPS** (requires ≥2 GPS images)
  - Renders connected route with numbered markers
  - Response: PNG image (200) or error (400)

### Authentication Endpoints
- **GET /auth/google**
  - Initiates Google OAuth2 authorization code flow
  - Redirects to Google consent screen

- **GET /auth/google/callback**
  - Google redirects here with authorization code
  - Passport validates → creates session → redirects to frontend

- **GET /auth/me**
  - Returns current session: `{ authenticated: bool, guest: bool, user: { id, email, displayName, avatarUrl } | null }`
  - No auth required (returns minimal data if not authenticated)

- **POST /auth/guest**
  - Creates guest user session and sets signed HTTP-only cookie key
  - Response: `{ authenticated: true, guest: true, user: { ... } }`

- **POST /auth/logout**
  - Destroys session
  - Response: `{ success: true }`

### Authenticated User Endpoints (Requires Session Cookie or Guest Cookie)

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/user/routes` | List all routes for current user |
| `POST` | `/api/user/routes` | Create new route session |
| `GET` | `/api/user/routes/:routeId` | Fetch route with images + assets |
| `DELETE` | `/api/user/routes/:routeId` | Delete route + all assets |
| `POST` | `/api/user/routes/:routeId/images` | Upload images/videos |
| `DELETE` | `/api/user/routes/:routeId/images/:imageId` | Delete image + re-index |
| `PATCH` | `/api/user/routes/:routeId/images/:imageId/note` | Save user note |
| `PATCH` | `/api/user/routes/:routeId/images/:imageId/location` | Set GPS + regenerate map |
| `PATCH` | `/api/user/routes/:routeId/reorder` | Persist full image order |
| `POST` | `/api/user/routes/:routeId/generate` | Generate route PNG |
| `GET` | `/api/user/routes/:routeId/route-map` | Download latest route PNG |
| `GET` | `/api/user/assets/:assetId` | Download any asset |
| `POST` | `/api/user/routes/:routeId/images/:imageId/summary` | Generate AI captions |
| `PATCH` | `/api/user/routes/:routeId/images/:imageId/summary` | Save captions |
| `POST` | `/api/user/routes/:routeId/images/:imageId/translate` | Translate captions |
| `POST` | `/api/user/routes/:routeId/images/:imageId/video` | Generate video clip from image |
| `POST` | `/api/user/routes/:routeId/images/:imageId/source-video` | Upload source video |
| `GET` | `/api/user/routes/:routeId/images/:imageId/source-video` | Stream source video for playback |
| `POST` | `/api/user/routes/:routeId/images/:imageId/video-from-video` | Generate clip from source video |
| `POST` | `/api/user/routes/:routeId/combine-video` | Combine all clips into a reel |

---

## 6. SETUP & BUILD

### Prerequisites
- Node.js 20+
- npm 10+
- Google OAuth2 credentials (Client ID + Client Secret)
- SQLite (default, npm-managed) or SQL Server connection string

### Installation

```bash
git clone <repo>
cd map
npm install
```

This automatically runs `prisma generate --schema prisma/schema.sqlite.prisma`.

### Environment Configuration

Create `.env` file in project root:

```env
DATABASE_URL="file:./dev.db"
PORT=3000
SESSION_SECRET="your-random-session-secret-here"
GOOGLE_CLIENT_ID="your-google-client-id"
GOOGLE_CLIENT_SECRET="your-google-client-secret"
GOOGLE_CALLBACK_URL="http://localhost:3000/auth/google/callback"
```

### Database Setup

For SQLite (default):
```bash
npm run prisma:db:push:sqlite
```

For SQL Server:
```bash
npm run prisma:db:push:sqlserver
```

### Running

**Development (with watch & hot reload):**
```bash
npm run dev
```
Server listens on `http://localhost:3000`

**Production build:**
```bash
npm run build
npm start
```

### Docker

**Build image:**
```bash
docker build -t map-api .
```

**Run container:**
```bash
docker run -p 3000:3000 \
  -e DATABASE_URL="file:./dev.db" \
  -e PORT=3000 \
  -e SESSION_SECRET="..." \
  -e GOOGLE_CLIENT_ID="..." \
  -e GOOGLE_CLIENT_SECRET="..." \
  -e GOOGLE_CALLBACK_URL="http://yourhost:3000/auth/google/callback" \
  map-api
```

For persistent database (Docker volume):
```bash
docker volume create map-db
docker run -p 3000:3000 \
  -v map-db:/app/prisma \
  ... map-api
```

---

## 7. FEATURES

### Implemented ✅

1. **Single-Pin Map Rendering** — GET `/api/map/render` with lat/lng/zoom/dimensions; Puppeteer PNG; cached
2. **EXIF GPS Extraction** — exifr; validation; date/time capture
3. **Multi-Point Route Visualization** — polyline with numbered markers
4. **Location Intelligence** — Nominatim reverse geocode + Wikipedia; cached
5. **User Authentication** — Google OAuth2; guest sessions with signed cookie; logout
6. **Redis Caching** — Redis-first with automatic in-memory fallback
7. **Image Processing** — auto-rotation, compression, EXIF strip via sharp
8. **Route Session Persistence** — per-user CRUD; ordering; cascade deletion
9. **Per-Image Metadata** — EXIF timestamp, GPS, user notes, AI captions
10. **API Documentation** — OpenAPI 3.0.3 + Swagger UI at `/api/docs`
11. **Frontend UI** — responsive grid; drag-drop upload and reorder; edit overlay; session management
12. **GPS-Optional Upload** — images without EXIF GPS accepted; location picker for manual GPS
13. **In-App Location Picker** — Leaflet map in edit overlay; backend reverse geocodes + regenerates map
14. **Server-Synced Deletion** — confirmation dialog; immediate DELETE call; re-indexes remaining
15. **Server-Synced Reordering** — drag-drop immediately calls PATCH reorder; no separate Save step
16. **AI Caption Generation** — Claude AI generates captions from user note + location info; saved to DB
17. **Caption Translation** — Claude AI translates caption to German/Spanish/Bulgarian
18. **Video Clip Generation** — external API `/generate` (image→clip) and `/generate-video` (video→clip)
    - Options: effect, captionPosition (top/center/bottom), captionStyle (word-by-word/karaoke), fontSize (8–120)
    - All options forwarded as multipart/form-data; structured logging of every API call
19. **Source Video Upload** — `POST .../source-video`; stored as `ORIGINAL_VIDEO` asset
20. **Video Thumbnail Generation** — ffmpeg-static extracts JPEG frame at ~1 s; stored as `VIDEO_THUMBNAIL`; shown in edit overlay and photo list
21. **Source Video Playback** — `GET .../source-video` streams video; "▶ Play source video" link in edit overlay
22. **Combined Reel** — `/combine` merges all clips into a route reel; URL persisted to `RouteSession.combinedVideoUrl`; restored on route load
23. **Click-to-Load Routes** — clicking route row in sidebar loads it (no separate Load button)
24. **Delete Confirmation Dialog** — custom promise-based modal for route deletion; no browser alert
25. **Structured API Logging** — `videoGenFetch()` logs all calls to image2video.shumov.eu; `extractLogParams()` skips binary fields

### Planned / Future Enhancements

1. **Advanced Route Optimization** (shortest path, elevation profile)
2. **Multi-User Collaboration** (route sharing, permissions)
3. **Mobile-Optimized UI** (media queries refinement)
4. **Unit & Integration Tests** (Jest, Supertest)
5. **Rate Limiting & Quotas** (per-user upload limits)
6. **Audit Logging** (who changed what, when)
7. **Webhook Notifications** (route completed, etc.)
8. **GPX Export** (standard GPS track format)

---

## 8. FRONTEND ARCHITECTURE (public/app.js + HTML)

### Key State Object (`state`)
```javascript
state = {
  auth: { authenticated, guest, user: { id, email, displayName, avatarUrl } | null, loading },
  activeRouteSessionId: string | null,
  dirty: bool,              // true only when local-only (unpersisted) items exist
  combineVideoUrl: string,  // URL of the combined reel; persisted + restored on load
  combineVideoStatus: string,
  items: [{
    id: string,                    // Local random ID
    serverImageId: string | null,  // DB RouteImage.id after upload
    file: File | null,
    localFingerprint: string,
    originalFilename: string,
    byteSize: number,
    mimeType: string,
    thumbUrl: string | null,       // blob URL; video items: VIDEO_THUMBNAIL or placeholder
    timestamp: number,
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
    videoUrl: string,              // generated clip URL (presigned, expires ~1 h)
    videoLoading: bool,
    videoStatus: string,
    videoFromVideoLoading: bool,
    hasSourceVideo: bool,
    sourceVideoFilename: string,
    sourceVideoUploading: bool,
    sourceVideoStatus: string,
    persisted: bool | null,        // null=pending, true=uploaded, false=failed
    hasGps: bool | null,
    message: string,
    messageType: "ok" | "warn"
  }],
  routeSessions: [{ id, title, createdAt, updatedAt }]
}
```

**`state.dirty`** is only set by drag-drop reordering when there are local-only items. Deletions and reorders of persisted items are synced immediately and do NOT set `state.dirty`.

The frontend is **vanilla JS** — do not introduce npm packages, bundlers, or frameworks into `public/`.

### Key Functions

**Initialization:**
- `initApp()` → Fetches auth state, loads saved routes, sets up event listeners

**Authentication:**
- `refreshAuth()` → GET `/auth/me` → updates state.auth incl. guest flag
- `logout()` → POST `/auth/logout` → clears session
- Guest login button handler → POST `/auth/guest` → starts signed guest session

**Upload & Processing:**
- `handleFileDrop(files)` → Adds files to state.items, generates thumbnails, extracts EXIF
- `persistFilesToActiveSession(files)` → POST `/api/user/routes/:routeId/images` with noteByIndex JSON
- `markItemsByUploadResult(payload, files)` → Maps uploaded image server IDs + notes back to local items

**Note Persistence:**
- `saveNoteForItem(itemId)` → PATCH `/api/user/routes/:routeId/images/:imageId/note`
- Note input change listener → Updates item.userNote + marks as unsaved
- Global "Save changes" button saves ALL unsaved notes for persisted items + uploads pending new images

**Image Deletion:**
- `removeItem(itemId)` → Async; shows `window.confirm()` dialog; on confirm calls DELETE endpoint
- On server error: aborts without modifying local state
- No separate "Save" step needed

**Image Reordering:**
- `reorderItems(fromId, toId)` → Async; splices local array; immediately calls `PATCH .../reorder`
- If not authenticated/no session: shows "local only" status
- No separate "Save" step needed

**Location Picker (edit overlay):**
- `initLocationPicker(lat, lng)` → Creates Leaflet map, click handler places/moves marker
- `destroyLocationPicker()` → Removes map; called on overlay close, browser back, or new photo open
- Save location → PATCH `.../location` → updates `item.hasGps`, `item.locationInfo`, refreshes map

**Route Generation:**
- `generateRoute()` → POST `/api/user/routes/:routeId/generate` → Saves PNG map
- `downloadRoute(routeId)` → Downloads route PNG binary

**Session Management:**
- `createRoute(title)` → POST `/api/user/routes` → New route session
- `restoreRoute(routeId)` → GET `/api/user/routes/:routeId` → Fetches all images + assets
- `deleteRoute(routeId)` → DELETE `/api/user/routes/:routeId` → Removes session

**Rendering:**
- `renderCards()` → Rebuilds DOM from state.items (grid, thumbnails, status, note inputs)
- `renderUploadPanel()` → Shows/hides based on auth + route selection
- `renderSavedRoutes()` → Lists available sessions for restore

### Event Listeners
- Drop zone (drag-drop image upload)
- File input submit button
- Reorder cards (drag-drop → server sync)
- Login/Logout buttons
- "Generate Route", "Download", "Create New" buttons
- **Note input change + Save button**
- **"📍 Pick location" button + Leaflet map click (location picker)**
- "Restore Route", "Delete Route" buttons

---

## 9. KEY FILES & MODIFICATIONS

### Core Backend Files

| File | Purpose | Recent Changes |
|------|---------|-----------------|
| `src/server.ts` | Express app setup | **Added Redis lifecycle init/shutdown + guest attach middleware** |
| `src/routes/mapRoutes.ts` | Public map routes | **Switched to async Redis/memory cache + added `/api/map/cache/health`** |
| `src/routes/getMapRoute.ts` | Public stateless endpoints | **`/api/getroute-set` skips non-GPS images (requires ≥2); uses `tryExtractGpsCoordinates`** |
| `src/routes/authRoutes.ts` | OAuth + session routes | **Added `POST /auth/guest`; extended `/auth/me` with `guest`; logout clears guest cookie** |
| `src/routes/userRoutes.ts` | Authenticated CRUD routes | **Image upload processes files before storage; generate skips non-GPS; added DELETE image, PATCH location, PATCH reorder endpoints** |
| `src/services/mapTemplate.ts` | HTML map templates | Stable |
| `src/services/mapRenderService.ts` | Puppeteer rendering | Stable |
| `src/services/exifService.ts` | EXIF extraction | Stable (`tryExtractGpsCoordinates` returns null for missing GPS; `extractGpsCoordinates` throws 400) |
| `src/services/imageService.ts` | Image processing | **New: auto-rotate, compression, EXIF stripping utilities** |
| `src/services/locationInfoService.ts` | Geocoding | Stable |
| `src/services/cacheService.ts` | Cache abstraction | **Redis-first cache with in-memory fallback** |
| `src/cache/redisClient.ts` | Redis client | **New: connection management + health state** |
| `src/auth/guestCookie.ts` | Guest cookie signing | **New: HMAC sign/verify for guest key** |
| `src/middleware/attachGuestUser.ts` | Guest request attach | **New: resolves guest cookie into request user context** |
| `src/services/storageService.ts` | Filesystem I/O | Stable |
| `src/swagger/openapi.ts` | OpenAPI spec | **Added `/auth/guest`, `/api/map/cache/health`, and guest field on `/auth/me`** |
| `prisma/schema.sqlite.prisma` | SQLite schema | **Added `userNote String?` to RouteImage** |
| `prisma/schema.sqlserver.prisma` | SQL Server schema | **Added `userNote String?` to RouteImage** |

### Frontend Files

| File | Purpose | Recent Changes |
|------|---------|-----------------|
| `public/index.html` | HTML structure | **Added guest login button; added Leaflet 1.9.4 CDN; added location picker panel in edit overlay** |
| `public/styles.css` | Styling | **Added `.note-*` classes; added `.location-picker`, `.location-picker-map`, `.location-picker-actions` classes** |
| `public/app.js` | Main logic | **Added guest auth; save button saves notes + new uploads; `removeItem` async with confirm + server DELETE; `reorderItems` async with server PATCH; `initLocationPicker`/`destroyLocationPicker`; picker event listeners** |

---

## 10. VALIDATION & ERROR HANDLING

### Request Validation (Zod Schemas)
Located in `src/utils/validators.ts`:
- `RenderParamsSchema` → lat/lng/zoom/width/height boundaries
- Custom error class `HttpError` for standardized responses

### Database Constraints
- Foreign key cascades (delete route → delete images/assets)
- Unique constraint on `User.googleSub`
- Indexed queries for performance (`userId, createdAt`, `routeSessionId, orderIndex`)

### API Error Responses
```json
{
  "error": "Authentication required" | "Invalid GPS data" | "File too large" | etc.
}
```

### EXIF Validation
- GPS coordinates must be valid lat/lng pairs
- Missing EXIF GPS returns 400 with error message
- Captures timestamp if available (fallbacks to current time)

### File Upload Constraints
- Multipart upload via multer (size limits enforced at formidable level)
- Only JPEG/PNG supported (MIME type checks)
- Partial success response (207) if some images fail

---

## 11. SECURITY

### Authentication
- Google OAuth2 (verified tokens)
- Session-based auth (encrypted session cookies via express-session)
- Guest auth via signed HTTP-only cookie key
- Protected routes with `requireAuth` middleware

### Authorization
- Ownership checks: User can only access/modify own route sessions + images
- Cascade deletes prevent orphaned data

### Input Validation
- Zod schemas validate all query/body params
- GPS coordinates validated for geographic bounds
- File uploads scanned for MIME type mismatches

### Data Privacy
- User notes stored in plaintext (recommended: encryption at rest in production)
- EXIF data stripped from stored originals (implemented)
- Session secrets stored in .env (not in code)

### Rate Limiting
- Currently: None (recommended: add express-rate-limit)
- Future: Per-user quotas for uploads, API calls

---

## 12. KNOWN LIMITATIONS & TODOs

### Current Limitations

1. **Redis Optional by Config**
  - Defaults to memory backend unless `REDIS_ENABLED=true`
  - Full distributed caching requires running Redis in deployment

2. **File Storage**
   - Filesystem-based (not cloud-native)
   - Production: Migrate to S3/Azure Blob Storage
   - Backup/replication not configured

3. **User Notes**
   - Stored as plaintext
   - Not encrypted at rest
   - No audit trail of changes

4. **Performance**
   - Puppeteer rendering synchronous (blocks other requests)
   - Consider: Worker queue (Bull/RabbitMQ)
  - Image processing is inline in request path (can add async worker for heavy throughput)

5. **Testing**
   - No unit/integration tests configured
   - Manual E2E testing only

6. **Frontend**
   - Vanilla JS (scales poorly beyond current feature set)
   - No build process (no bundling, no tree-shaking)
   - Browser compatibility: Modern browsers only (ES6+)

7. **Location Picker**
   - Leaflet map tiles require internet connectivity (OSM CDN)
   - Picked location is not validated against image timestamp/context

### Recommended Next Steps

- [ ] Add Jest unit tests (services, validators)
- [ ] Implement E2E tests (Cypress or Playwright)
- [ ] Enable Redis in production environment (`REDIS_ENABLED=true`)
- [ ] Add async image processing queue for higher upload throughput
- [ ] Implement rate limiting (express-rate-limit)
- [ ] Migrate file storage to S3/Azure
- [ ] Add request/response logging (Winston)
- [ ] Implement error tracking (Sentry)
- [ ] Add CI/CD pipeline (GitHub Actions)
- [ ] Encrypt user notes + add access logs
- [ ] Refactor frontend with framework (React/Vue) or modern tooling
- [ ] Add mobile-responsive refinements
- [ ] Implement GPX export endpoint
- [ ] Support multi-user route sharing

---

## 13. DEPLOYMENT

### Local Development
```bash
npm install
npm run prisma:db:push:sqlite
npm run dev
# Open http://localhost:3000
```

### Production Build
```bash
npm run build
npm start
```
(Node process manager recommended: PM2, systemd, etc.)

### Docker
```bash
docker build -t map-api:latest .
docker run -p 3000:3000 \
  -e DATABASE_URL="file:./dev.db" \
  -e SESSION_SECRET="$(openssl rand -hex 32)" \
  -e GOOGLE_CLIENT_ID="your-id" \
  -e GOOGLE_CLIENT_SECRET="your-secret" \
  map-api:latest
```

### Docker Compose
```bash
docker-compose up -d
```
(See `docker-compose.yml` for local multi-container setup if needed)

### Environment Variables (Production)
```env
DATABASE_URL="Server=yoursqlserver;Database=map_prod;User Id=sa;Password=..."
PORT=3000
SESSION_SECRET="<long random string>"
GOOGLE_CLIENT_ID="<your production Google app ID>"
GOOGLE_CLIENT_SECRET="<your production secret>"
GOOGLE_CALLBACK_URL="https://yourdomain.com/auth/google/callback"
NODE_ENV="production"
```

---

## 14. TESTING CHECKLIST (Manual)

### API Layer
- [ ] GET `/health` → 200 OK
- [ ] GET `/api/map/cache/health` → 200 with backend = memory|redis
- [ ] GET `/api/openapi.json` → Valid OpenAPI spec
- [ ] GET `/api/docs` → Swagger UI loads
- [ ] POST `/api/getmap` with valid EXIF image → PNG response
- [ ] POST `/api/getmap` with no GPS → 400 error
- [ ] GET `/auth/me` unauthenticated → `{ authenticated: false, user: null }`
- [ ] GET `/auth/google` → 302 redirect to Google
- [ ] POST `/auth/guest` → `{ authenticated: true, guest: true, user: ... }`
- [ ] POST `/auth/logout` → Session destroyed

### Authenticated Routes
- [ ] Create route session → 201 with ID
- [ ] List user routes → 200 with array
- [ ] Upload images with noteByIndex → 201/207 with uploaded metadata
- [ ] Upload images WITHOUT GPS → 201 (GPS-optional, no error)
- [ ] PATCH note for image → 200 with updated userNote
- [ ] DELETE image → 200, files removed, remaining images re-indexed
- [ ] PATCH image location (lat/lng) → 200, new map generated, geocode updated
- [ ] PATCH reorder (full imageIds array) → 200, orderIndex updated
- [ ] Generate route from images (some without GPS) → 200 PNG (skips non-GPS images)
- [ ] Restore route → Images + notes + GPS status restored
- [ ] Delete route → Session removed, files cleaned up

### Frontend
- [ ] Page loads with login UI (unauthenticated)
- [ ] Google login redirects → redirects back → shows upload UI
- [ ] Drag-drop images → Grid renders with thumbnails
- [ ] Map loads per image (skipped gracefully if no GPS)
- [ ] Location info loads (if GPS present)
- [ ] Note input visible per card
- [ ] Typing note → "Unsaved changes" status
- [ ] Global "Save changes" → uploads pending + saves all unsaved notes
- [ ] Drag-drop reorder → order synced to server immediately (no Save needed)
- [ ] Delete image → confirm dialog → server DELETE → card removed
- [ ] Edit overlay: "📍 Pick location" visible for images without GPS
- [ ] Clicking location picker map → marker placed → Save → map updated in-place
- [ ] Generate route → PNG preview + download link
- [ ] Logout → Session cleared, login UI returns

### Docker
- [ ] Build image: `docker build -t map-api .` → Success
- [ ] Run container with env vars → Port 3000 accessible
- [ ] Container can write to persistent volume → Database persists

---

## 15. CONTACT & REFERENCES

- **Repository:** (Add your repo URL)
- **Tech Docs:**
  - [Prisma](https://www.prisma.io/docs/)
  - [Express](https://expressjs.com/)
  - [Passport](http://www.passportjs.org/)
  - [Puppeteer](https://pptr.dev/)
  - [exifr](https://mutiny.cz/exifr/)
  - [Leaflet](https://leafletjs.com/)
  - [OpenAPI 3.0.3](https://spec.openapis.org/oas/v3.0.3)

- **API Integrations:**
  - Google OAuth2: https://developers.google.com/identity/protocols/oauth2
  - Nominatim (OSM Reverse Geocode): https://nominatim.org/
  - Wikipedia API: https://www.mediawiki.org/wiki/API

---

**Document Version:** 1.1  
**Last Reviewed:** April 14, 2026  
**Status:** Production Ready (MVP + Notes + AI Summary + Guest + Redis/Image Processing + GPS-Optional + Location Picker + Server-Synced Delete/Reorder)
