---
goal: "Implement Redis Caching, Image Processing Pipeline, and Guest User Persistence"
version: "1.0"
date_created: "2026-04-13"
last_updated: "2026-04-13"
owner: "Development Team"
status: "Planned"
tags: ["feature", "infrastructure", "production-readiness", "performance"]
---

# Implementation Plan: Redis Caching, Image Processing, and Guest User Persistence

![Status: Planned](https://img.shields.io/badge/status-Planned-blue)

## Introduction

This implementation plan addresses three major production-readiness and performance enhancements for the Map Route API:
1. **Redis Caching** - Replace in-memory cache with Redis for distributed, persistent caching
2. **Image Processing** - Implement auto-rotation, compression, and EXIF stripping before storage
3. **Guest User Persistence** - Enable unauthenticated users to persist route data via signed cookies

These features will improve scalability, reduce storage costs, and improve user experience for casual users.

---

## 1. Requirements & Constraints

### Functional Requirements
- **REQ-001**: Redis cache must store identical data structures as current in-memory cache (lat/lng/zoom combinations)
- **REQ-002**: Image processing must auto-rotate based on EXIF orientation, compress to max 2MB, and strip all EXIF/metadata
- **REQ-003**: Guest users must be identifiable by a signed cookie containing a unique guest UUID
- **REQ-004**: Guest route data must expire after 30 days of inactivity or 90 days total
- **REQ-005**: Guest routes must be separate from authenticated user routes in database schema
- **REQ-006**: All three features must be backward compatible with existing authenticated user workflows

### Technical Constraints
- **CON-001**: Redis must be optional (fall back to in-memory cache if unavailable) for development environments
- **CON-002**: Image processing must run synchronously without blocking API responses (consider worker queue pattern)
- **CON-003**: Guest user routes must not interfere with Prisma schema for authenticated users
- **CON-004**: Session secrets and Redis connection strings must be environment-configurable
- **CON-005**: No external image processing services (must use local Sharp/ImageMagick)

### Security Constraints
- **SEC-001**: Guest cookie must be cryptographically signed to prevent tampering
- **SEC-002**: Guest routes must not be accessible to other guests or users without valid token
- **SEC-003**: Guest data must be PII-compliant (no collection of user info)
- **SEC-004**: Redis connection must use AUTH if available (production: Redis password via env)
- **SEC-005**: Uploaded images must be scanned for malicious EXIF payloads before processing

### Performance Constraints
- **PERF-001**: Cache hit rate target: >80% for repeated map renders
- **PERF-002**: Image compression must complete within 5 seconds per image (1920x1440 JPEG)
- **PERF-003**: Redis latency target: <50ms p99 for cache operations
- **PERF-004**: Guest user data population should not impact authenticated route performance

### Guidelines
- **GUD-001**: Follow Prisma best practices for schema migrations (generate, review, apply)
- **GUD-002**: Use TypeScript strict mode for all new code
- **GUD-003**: Document all new environment variables in .env.example
- **GUD-004**: Maintain existing error handling patterns (HttpError class, standardized responses)
- **GUD-005**: Update OpenAPI documentation for new guest endpoints

---

## 2. Implementation Steps

### Phase 1: Setup & Dependencies (Parallel-Ready)

**GOAL-P1**: Prepare development environment with all required packages and updated configuration schemas.

| Task | Description | File(s) | Completed | Date |
|------|-------------|---------|-----------|------|
| TASK-P1-001 | Add Redis and image processing npm packages | `package.json` | | |
| TASK-P1-002 | Update .env.example with new env vars | `.env.example` | | |
| TASK-P1-003 | Extend env.ts Zod schema validation | `src/config/env.ts` | | |
| TASK-P1-004 | Create Redis client singleton | `src/cache/redisClient.ts` | | |
| TASK-P1-005 | Create image processor service | `src/services/imageService.ts` | | |

**Packages to Install:**
```bash
npm install redis sharp dotenv
npm install --save-dev @types/sharp
```

**Environment Variables (.env.example additions):**
```env
# Redis
REDIS_URL="redis://localhost:6379"
REDIS_PASSWORD=""
CACHE_ENABLED="true"

# Image Processing
IMAGE_MAX_SIZE_MB=2
IMAGE_COMPRESSION_QUALITY=80
IMAGE_STRIP_EXIF="true"

# Guest User
GUEST_SESSION_EXPIRY_DAYS=90
GUEST_INACTIVITY_EXPIRY_DAYS=30
GUEST_COOKIE_SECRET="your-guest-cookie-secret"
```

**Validation Criteria:**
- ✅ All npm packages install without conflicts
- ✅ TypeScript compilation succeeds after package install
- ✅ New env vars optional (defaults present for backward compatibility)

---

### Phase 2: Redis Caching Layer (Parallel with other phases)

**GOAL-P2**: Create abstracted caching layer that supports both Redis and in-memory fallback.

| Task | Description | File(s) | Completed | Date |
|------|-------------|---------|-----------|------|
| TASK-P2-001 | Create Redis client singleton with connection pooling | `src/cache/redisClient.ts` | | |
| TASK-P2-002 | Create abstract cache service interface | `src/cache/cacheService.ts` | | |
| TASK-P2-003 | Implement Redis cache backend | `src/cache/redisCacheBackend.ts` | | |
| TASK-P2-004 | Implement in-memory fallback | `src/cache/memoryBackend.ts` | | |
| TASK-P2-005 | Replace cacheService.ts imports in all routes | `src/routes/*.ts`, `src/services/*.ts` | | |
| TASK-P2-006 | Add cache health check endpoint | `src/routes/mapRoutes.ts` | | |
| TASK-P2-007 | Update OpenAPI docs for cache endpoint | `src/swagger/openapi.ts` | | |

**Redis Client Implementation Details:**
- Location: `src/cache/redisClient.ts`
- Abstract both `get()`, `set()`, `delete()`, `clear()`methods
- Error handling: Log and fall back to in-memory if Redis unavailable
- TTL support: All cached items must have configurable TTL
- Key prefixes: `map:`, `route:` for categorization

**Cache Backend Switching Logic:**
```typescript
// In cacheService initialization
const cache = env.CACHE_ENABLED && redisAvailable 
  ? new RedisCacheBackend(env.REDIS_URL)
  : new MemoryCacheBackend()
```

**Validation Criteria:**
- ✅ `src/services/cacheService.ts` successfully replaced with new backend abstraction
- ✅ Existing cache calls (map rendering) work without code changes
- ✅ Redis falls back to memory gracefully if unavailable
- ✅ Cache keys are consistently formatted with prefixes
- ✅ Health check endpoint returns `{ cache: "redis|memory", status: "ok" }`

---

### Phase 3: Image Processing Pipeline

**GOAL-P3**: Implement image auto-rotation, compression, and EXIF stripping before storage.

| Task | Description | File(s) | Completed | Date |
|------|-------------|---------|-----------|------|
| TASK-P3-001 | Create image processor service with Sharp | `src/services/imageService.ts` | | |
| TASK-P3-002 | Integrate image processing into POST /api/user/routes/:routeId/images | `src/routes/userRoutes.ts` | | |
| TASK-P3-003 | Add image processing in getmap endpoint (public) | `src/routes/getMapRoute.ts` | | |
| TASK-P3-004 | Add image size validation before upload | `src/utils/validators.ts` | | |
| TASK-P3-005 | Update storage service to handle processed images | `src/services/storageService.ts` | | |
| TASK-P3-006 | Add image processing config to env.ts | `src/config/env.ts` | | |
| TASK-P3-007 | Document image processing in OpenAPI | `src/swagger/openapi.ts` | | |

**Image Processor Service Implementation (`src/services/imageService.ts`):**

```typescript
interface ImageProcessingOptions {
  maxWidth?: number;
  maxHeight?: number;
  maxSize?: number; // MB
  quality?: number; // 1-100
  stripExif?: boolean;
  autoRotate?: boolean;
}

async function processImage(
  inputBuffer: Buffer,
  options: ImageProcessingOptions
): Promise<{ buffer: Buffer; metadata: any }>

// Main processing steps:
// 1. Parse input with Sharp (auto-detects format)
// 2. Auto-rotate based on EXIF orientation
// 3. Resize if exceeds max dimensions (preserve aspect ratio)
// 4. Compress to quality level
// 5. Convert to JPEG (if necessary) for consistency
// 6. Remove all EXIF/metadata
// 7. Return processed buffer + metadata (dimensions, size)
```

**Integration Points:**
- **userRoutes.ts**: After file upload but before storage (`POST /api/user/routes/:routeId/images`)
  - Line ~380: Add `imageService.processImage()` call
  - Store processed buffer instead of original
  - Keep original filename in metadata

- **getMapRoute.ts**: For public `POST /api/getmap` endpoint
  - Line ~50: Add image processing before EXIF extraction
  - Ensure consistency with authenticated flow

**Validation Criteria:**
- ✅ Images auto-rotated correctly based on EXIF orientation data
- ✅ Images compressed to max 2MB (configurable)
- ✅ All EXIF data stripped from output (verified with exifr)
- ✅ Original image quality acceptable after compression (visual inspection)
- ✅ Processing completes within 5 seconds for typical images
- ✅ Error handling for corrupted/unsupported formats

---

### Phase 4: Guest User Database Schema

**GOAL-P4**: Extend Prisma schema to support guest users with separate data model and TTL tracking.

| Task | Description | File(s) | Completed | Date |
|------|-------------|---------|-----------|------|
| TASK-P4-001 | Create GuestUser model in Prisma schema | `prisma/schema.sqlite.prisma`, `.sqlserver.prisma` | | |
| TASK-P4-002 | Create GuestRouteSession model | `prisma/schema.sqlite.prisma`, `.sqlserver.prisma` | | |
| TASK-P4-003 | Create GuestRouteImage model | `prisma/schema.sqlite.prisma`, `.sqlserver.prisma` | | |
| TASK-P4-004 | Add database indexes for guest data queries | `prisma/schema*.prisma` | | |
| TASK-P4-005 | Create and apply Prisma migration | `prisma/migrations/` | | |
| TASK-P4-006 | Create guest data cleanup job (future: scheduled task) | `src/jobs/guestDataCleanup.ts` | | |

**Guest Models in Prisma:**

```prisma
// Add to both schema.sqlite.prisma and schema.sqlserver.prisma

model GuestUser {
  id          String @id @default(cuid())
  guestToken  String @unique  // UUID - from signed cookie
  createdAt   DateTime @default(now())
  lastActivity DateTime @updatedAt
  routeSessions GuestRouteSession[]
  
  // TTL tracking for automatic cleanup
  expiresAt   DateTime  // 90 days from creation
  
  @@index([guestToken])
  @@index([expiresAt])
}

model GuestRouteSession {
  id          String @id @default(cuid())
  guestUserId String
  guestUser   GuestUser @relation(fields: [guestUserId], references: [id], onDelete: Cascade)
  
  title       String
  status      RouteSessionStatus @default(ACTIVE)  // ACTIVE | COMPLETED
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  
  images      GuestRouteImage[]
  assets      GuestRouteAsset[]
  
  @@index([guestUserId, createdAt])
}

model GuestRouteImage {
  id               String @id @default(cuid())
  routeSessionId   String
  orderIndex       Int
  originalFilename String
  mimeType         String
  
  capturedAt       DateTime?
  gpsLat           Float?
  gpsLng           Float?
  exifJson         String?
  locationInfoJson String?
  userNote         String?
  aiSummary        String?
  
  createdAt        DateTime @default(now())
  
  routeSession     GuestRouteSession @relation(fields: [routeSessionId], references: [id], onDelete: Cascade)
  assets           GuestRouteAsset[]
  
  @@index([routeSessionId, orderIndex])
}

model GuestRouteAsset {
  id               String @id @default(cuid())
  routeSessionId   String
  routeImageId     String?
  
  assetType        RouteAssetType  // ORIGINAL_IMAGE | IMAGE_MAP | ROUTE_MAP
  storagePath      String
  byteSize         Int
  sha256           String
  createdAt        DateTime @default(now())
  
  routeSession     GuestRouteSession @relation(fields: [routeSessionId], references: [id], onDelete: Cascade)
  routeImage       GuestRouteImage? @relation(fields: [routeImageId], references: [id], onDelete: Cascade)
  
  @@index([routeSessionId, assetType])
}
```

**Migration Process:**
```bash
npx prisma migrate dev --name "add-guest-models"
```

**Validation Criteria:**
- ✅ Prisma schema validates without errors
- ✅ Migration generates successfully
- ✅ New tables created with proper indexes
- ✅ Cascade deletes work correctly (test delete GuestUser)
- ✅ TypeScript types generated (`@prisma/client`)

---

### Phase 5: Guest User Authentication & Middleware

**GOAL-P5**: Implement guest user identification via signed cookies and create middleware for guest session tracking.

| Task | Description | File(s) | Completed | Date |
|------|-------------|---------|-----------|------|
| TASK-P5-001 | Create guest identification middleware | `src/middleware/guestAuth.ts` | | |
| TASK-P5-002 | Create guest cookie signing utility | `src/auth/guestCookie.ts` | | |
| TASK-P5-003 | Create GET /auth/guest endpoint (mint guest token) | `src/routes/authRoutes.ts` | | |
| TASK-P5-004 | Attach guest middleware to Express app | `src/server.ts` | | |
| TASK-P5-005 | Update TypeScript request types for guest user | `src/types/index.ts` (if exists) | | |
| TASK-P5-006 | Update OpenAPI docs for guest auth endpoints | `src/swagger/openapi.ts` | | |

**Guest Cookie Implementation (`src/auth/guestCookie.ts`):**

```typescript
import crypto from 'crypto';

export class GuestCookieManager {
  private secret: string;
  
  constructor(secret: string) {
    this.secret = secret;
  }
  
  // Generate signed guest token
  generateToken(): string {
    const uuid = crypto.randomUUID();
    const timestamp = Date.now();
    const data = `${uuid}|${timestamp}`;
    const signature = crypto.createHmac('sha256', this.secret)
      .update(data)
      .digest('hex');
    return `${data}:${signature}`;
  }
  
  // Verify token signature
  verifyToken(token: string): { uuid: string, timestamp: number } | null {
    const [data, signature] = token.split(':');
    if (!data || !signature) return null;
    
    const computed = crypto.createHmac('sha256', this.secret)
      .update(data)
      .digest('hex');
    
    if (computed !== signature) return null; // Tampering detected
    
    const [uuid, timestamp] = data.split('|');
    return { uuid, timestamp: parseInt(timestamp, 10) };
  }
}
```

**Guest Middleware (`src/middleware/guestAuth.ts`):**

```typescript
// Middleware that runs AFTER passport.js session check
// If no authenticated user, check for guest cookie
// Attach guest user (or null) to req.guestUser
export async function guestAuthMiddleware(req, res, next) {
  if (req.user) {
    // Already authenticated
    return next();
  }
  
  const guestToken = req.cookies?.guest_token;
  if (!guestToken) {
    req.guestUser = null;
    return next();
  }
  
  const verified = guestCookieManager.verifyToken(guestToken);
  if (!verified) {
    // Token tampering - clear it
    res.clearCookie('guest_token');
    req.guestUser = null;
    return next();
  }
  
  // Load guest user from database
  try {
    const guestUser = await prisma.guestUser.findUnique({
      where: { guestToken: verified.uuid }
    });
    
    if (!guestUser || new Date() > guestUser.expiresAt) {
      // Guest expired
      res.clearCookie('guest_token');
      req.guestUser = null;
    } else {
      req.guestUser = guestUser;
      // Update lastActivity
      await prisma.guestUser.update({
        where: { id: guestUser.id },
        data: { lastActivity: new Date() }
      });
    }
  } catch (error) {
    console.error('Guest auth error:', error);
    req.guestUser = null;
  }
  
  next();
}
```

**Guest Auth Endpoints:**

``POST /auth/guest`** (Create guest session)
- No authentication required
- Response: `{ guestToken: string, expiresAt: ISO8601DateTime }`
- Sets HTTP-only signed cookie: `guest_token`

**GET /auth/guest/me`** (Get current guest)
- Optional auth (returns guest or authenticated user)
- Response: `{ guest: GuestUser | null, user: AuthUser | null }`

**Request Type Extension:**

```typescript
// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      user?: User;           // From Passport (authenticated)
      guestUser?: GuestUser; // From guest middleware
    }
  }
}
```

**Validation Criteria:**
- ✅ Guest token generated with valid cryptographic signature
- ✅ Tampered tokens detected and rejected
- ✅ Expired guest sessions removed from cookie
- ✅ guest_token cookie is HTTP-only and secure (in production)
- ✅ `POST /auth/guest` returns valid token
- ✅ Guest users load from database with TTL checks

---

### Phase 6: Guest User API Routes

**GOAL-P6**: Implement guest-scoped CRUD endpoints mirroring authenticated user routes.

| Task | Description | File(s) | Completed | Date |
|------|-------------|---------|-----------|------|
| TASK-P6-001 | Create guest routes handler file | `src/routes/guestRoutes.ts` | | |
| TASK-P6-002 | Create GET /api/guest/routes endpoint | `src/routes/guestRoutes.ts` | | |
| TASK-P6-003 | Create POST /api/guest/routes endpoint | `src/routes/guestRoutes.ts` | | |
| TASK-P6-004 | Create GET /api/guest/routes/:routeId endpoint | `src/routes/guestRoutes.ts` | | |
| TASK-P6-005 | Create DELETE /api/guest/routes/:routeId endpoint | `src/routes/guestRoutes.ts` | | |
| TASK-P6-006 | Create POST /api/guest/routes/:routeId/images endpoint | `src/routes/guestRoutes.ts` | | |
| TASK-P6-007 | Create PATCH endpoints for notes, summaries (mirror user routes) | `src/routes/guestRoutes.ts` | | |
| TASK-P6-008 | Register guest route handlers in server.ts | `src/server.ts` | | |
| TASK-P6-009 | Update OpenAPI docs for all guest endpoints | `src/swagger/openapi.ts` | | |

**Guest Routes Handler Structure (`src/routes/guestRoutes.ts`):**

```typescript
import { Router, Request, Response, NextFunction } from 'express';

const guestRouter = Router();

// Require guest authentication (no fallback to user auth)
function requireGuest(req: Request, res: Response, next: NextFunction) {
  if (!req.guestUser) {
    return res.status(401).json({ error: 'Guest session required' });
  }
  next();
}

// GET /api/guest/routes - List guest routes
guestRouter.get('/routes', requireGuest, async (req, res, next) => {
  try {
    const routes = await prisma.guestRouteSession.findMany({
      where: { guestUserId: req.guestUser!.id },
      orderBy: { createdAt: 'desc' },
      include: { images: { select: { id: true, orderIndex: true } } }
    });
    res.json({ routeSessions: routes });
  } catch (error) {
    next(error);
  }
});

// POST /api/guest/routes - Create guest route
guestRouter.post('/routes', requireGuest, async (req, res, next) => {
  try {
    const { title } = req.body;
    const route = await prisma.guestRouteSession.create({
      data: {
        guestUserId: req.guestUser!.id,
        title: title || 'Untitled Route'
      }
    });
    res.status(201).json({ routeSession: route });
  } catch (error) {
    next(error);
  }
});

// GET /api/guest/routes/:routeId - Fetch specific route with images
guestRouter.get('/routes/:routeId', requireGuest, async (req, res, next) => {
  try {
    const route = await loadOwnedGuestRouteSession(req.guestUser!.id, req.params.routeId);
    res.json({ routeSession: route });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/guest/routes/:routeId
guestRouter.delete('/routes/:routeId', requireGuest, async (req, res, next) => {
  try {
    await loadOwnedGuestRouteSession(req.guestUser!.id, req.params.routeId); // Verify ownership
    await prisma.guestRouteSession.delete({ where: { id: req.params.routeId } });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// POST /api/guest/routes/:routeId/images - Upload images
// POST /api/guest/routes/:routeId/generate - Generate route map
// PATCH /api/guest/routes/:routeId/images/:imageId/note - Update note
// PATCH /api/guest/routes/:routeId/images/:imageId/summary - Update summary
// [Same implementation pattern as userRoutes, but using Guest* models]

export default guestRouter;
```

**Helper Function (`src/routes/guestRoutes.ts`):**

```typescript
async function loadOwnedGuestRouteSession(guestUserId: string, routeId: string) {
  const route = await prisma.guestRouteSession.findFirst({
    where: {
      id: routeId,
      guestUserId: guestUserId
    },
    include: {
      images: { orderBy: { orderIndex: 'asc' } },
      assets: true
    }
  });
  
  if (!route) {
    throw new HttpError(404, 'Route not found');
  }
  
  return route;
}
```

**Validation Criteria:**
- ✅ All guest endpoints require guest session (401 if missing)
- ✅ Guest users cannot access other guests' routes (404)
- ✅ Image upload works with same processing pipeline as authenticated users
- ✅ Notes and summaries work identically
- ✅ Route generation produces valid PNG for guest routes

---

### Phase 7: Frontend Integration for Guest Mode

**GOAL-P7**: Add frontend UI for guest mode login and adapt existing workflows for guest users.

| Task | Description | File(s) | Completed | Date |
|------|-------------|---------|-----------|------|
| TASK-P7-001 | Add "Continue as Guest" button to auth section | `public/index.html` | | |
| TASK-P7-002 | Add guest session management to app.js | `public/app.js` | | |
| TASK-P7-003 | Update checkAuth() to handle guest users | `public/app.js` | | |
| TASK-P7-004 | Update API calls to use /api/guest/ routes when guest mode | `public/app.js` | | |
| TASK-P7-005 | Add guest UI distinct branding (badge, warning about expiry) | `public/index.html`, `public/styles.css` | | |
| TASK-P7-006 | Add guest logout/mode switch | `public/index.html` | | |
| TASK-P7-007 | Update OpenAPI docs for guest role | `src/swagger/openapi.ts` | | |

**Frontend Changes Summary:**

```javascript
// In state object, add guest tracking
state.auth = {
  authenticated: false,
  user: null,
  guestUser: null,  // NEW
  mode: 'guest' | 'authenticated' | 'unauthenticated'  // NEW
}

// In checkAuth(), add guest check
if (response.data.guestUser) {
  state.auth.guestUser = response.data.guestUser;
  state.auth.mode = 'guest';
}

// In API calls, route based on mode
const apiBase = state.auth.mode === 'guest' ? '/api/guest' : '/api/user';
const response = await fetch(`${apiBase}/routes/${routeId}/images`, ...);
```

**HTML Changes:**
- Add "Continue as Guest" button (below/beside Google login)
- Add guest mode indicator badge (e.g., "📴 Guest Mode - expires in X days")
- Add warning about data expiry

**Validation Criteria:**
- ✅ "Continue as Guest" button successfully creates guest session
- ✅ Frontend correctly routes all API calls to `/api/guest/` endpoints
- ✅ Guest badge displays correctly
- ✅ All workflows (upload, notes, generate) work identically for guests
- ✅ Guest logout works (clears cookie + returns to login page)

---

### Phase 8: Testing & Validation

**GOAL-P8**: Comprehensive testing across all three features to ensure correctness and security.

| Task | Description | File(s) | Completed | Date |
|------|-------------|---------|-----------|------|
| TASK-P8-001 | Test Redis connection and fallback | Manual test / logs | | |
| TASK-P8-002 | Test cache hit rate on map renders | Manual test / metrics | | |
| TASK-P8-003 | Test image auto-rotation with test EXIF files | Manual test | | |
| TASK-P8-004 | Test image compression within 5s limit | Manual test / timing | | |
| TASK-P8-005 | Test EXIF stripping (verify no metadata remains) | Manual test / exifr parse | | |
| TASK-P8-006 | Test guest token generation and verification | Manual test | | |
| TASK-P8-007 | Test guest token tampering detection | Manual test | | |
| TASK-P8-008 | Test guest session expiry cleanup | Manual test / DB query | | |
| TASK-P8-009 | Test guest route CRUD operations | Manual test | | |
| TASK-P8-010 | Test guest cannot access other guests' routes | Manual test | | |
| TASK-P8-011 | Test guest image upload with processing | Manual test | | |
| TASK-P8-012 | Test guest route generation | Manual test | | |
| TASK-P8-013 | Test frontend guest mode workflows | Manual E2E test | | |
| TASK-P8-014 | Test migration on fresh database | Manual test | | |
| TASK-P8-015 | Load testing: Redis cache under concurrent access | Load test | | |

**Test Scenarios:**

**Redis Caching:**
- Generate same map 10x with Redis enabled → check cache hits
- Disable Redis, generate map → verify memory fallback works
- Redis connection timeout → verify graceful fallback to memory

**Image Processing:**
- Upload JPEG with EXIF orientation=8 (270° rotation) → verify auto-rotated correctly
- Upload 5MB image → verify compressed to <2MB
- Upload image → exifr.parse() output → verify no EXIF tags
- Measure processing time on 1920x1440 JPEG → verify <5s

**Guest User:**
- Create guest token → manually tamper cookie → verify rejected
- Create guest, wait 90 days (simulated) → verify auto-cleanup
- Create guest1, create guest2 → guest1 cannot list guest2's routes
- Guest upload, generate route, download → verify workflow complete
- Frontend: Click "Continue as Guest" → upload image → generate → download

**Validation Criteria:**
- ✅ All redis cache operations work
- ✅ Images auto-rotate, compress, strip EXIF correctly
- ✅ Guest tokens cryptographically secure
- ✅ Guest data isolated between users
- ✅ Frontend guest workflows function identically to authenticated
- ✅ No performance degradation from new features

---

### Phase 9: Documentation & Deployment

**GOAL-P9**: Update project documentation and prepare for production deployment.

| Task | Description | File(s) | Completed | Date |
|------|-------------|---------|-----------|------|
| TASK-P9-001 | Update PROJECT_SUMMARY.md with new features | `PROJECT_SUMMARY.md` | | |
| TASK-P9-002 | Update README.md with Redis setup instructions | `README.md` | | |
| TASK-P9-003 | Add image processing section to README | `README.md` | | |
| TASK-P9-004 | Document guest user API in README | `README.md` | | |
| TASK-P9-005 | Create Docker config for Redis sidecar | `docker-compose.yml` | | |
| TASK-P9-006 | Update Dockerfile ENV defaults | `Dockerfile` | | |
| TASK-P9-007 | Add Redis health check to startup | `src/server.ts` | | |
| TASK-P9-008 | Create migration guide (existing users to Redis) | `MIGRATION.md` (new) | | |
| TASK-P9-009 | Create guest user feature documentation | `GUEST_USERS.md` (new) | | |
| TASK-P9-010 | Verify build and startup with new env vars | Manual test | | |

**Documentation Additions:**

**In PROJECT_SUMMARY.md:**
- Add Redis section to Technology Stack
- Add Sharp/ImageMagick to Image Processing section
- Add Guest User data model to Data Model section
- Add guest endpoints to API Endpoints
- Update Features section marking as Implemented

**New FILES:**
- `GUEST_USERS.md` - Complete guest user feature guide with API examples
- `MIGRATION.md` - Guide for migrating existing deployments to Redis

**Validation Criteria:**
- ✅ All documentation updated and consistent
- ✅ README includes Redis setup steps
- ✅ Docker-compose includes Redis service
- ✅ Build succeeds with all env vars optional
- ✅ Startup logs show Redis connection status and guest models loaded

---

## 3. Alternatives Considered

- **ALT-001**: Using Memcached instead of Redis
  - Rejected: Redis offers more features (pub/sub, persistence options), better TypeScript support, superior ecosystem
  
- **ALT-002**: Storing guest data in temporary files instead of database
  - Rejected: Would complicate cleanup, lack of concurrent access safety, no queryability
  
- **ALT-003**: Using AWS Lambda for image processing (serverless)
  - Rejected: Out-of-scope, adds cloud vendor lock-in, increases ops complexity for local development
  
- **ALT-004**: Implementing image processing as background worker job
  - Rejected: Initial implementation should be synchronous for MVP; can be refactored to async later
  
- **ALT-005**: Guest data stored in session instead of database
  - Rejected: Sessions volatile, data lost on server restart, no cross-instance sharing, cannot query
  
- **ALT-006**: Using JWT for guest tokens instead of signed cookies
  - Rejected: Cookie-based approach simpler for frontend (automatic HTTP-only handling), sufficient for guest use case

---

## 4. Dependencies

- **DEP-001**: Redis server (local or remote) - Version 6.0+
- **DEP-002**: Node.js - Version 20+ (already required)
- **DEP-003**: npm packages: `redis@4.x`, `sharp@0.32+`, `dotenv@16+`
- **DEP-004**: ImageMagick optional (for fallback if Sharp unavailable)
- **DEP-005**: Prisma ORM - Version 6.19+ (already in use)
- **DEP-006**: @types/sharp for TypeScript support
- **DEP-007**: No external image processing APIs (all local processing)

---

## 5. Files Affected

### New Files (To Create)
- `src/cache/redisClient.ts` - Redis connection management
- `src/cache/cacheService.ts` - Abstract cache interface
- `src/cache/redisCacheBackend.ts` - Redis implementation
- `src/cache/memoryBackend.ts` - In-memory fallback
- `src/services/imageService.ts` - Image processing with Sharp
- `src/auth/guestCookie.ts` - Guest token signing/verification
- `src/middleware/guestAuth.ts` - Guest authentication middleware
- `src/routes/guestRoutes.ts` - Guest API endpoints
- `prisma/migrations/[timestamp]_add_guest_models/migration.sql` - Prisma migration
- `GUEST_USERS.md` - Guest user feature documentation
- `MIGRATION.md` - Migration guide for existing deployments

### Modified Files
- `src/config/env.ts` - Add Redis and image processing env vars
- `src/server.ts` - Register guest routes, attach guest middleware
- `src/routes/userRoutes.ts` - Integrate image processing in POST images
- `src/routes/mapRoutes.ts` - Add cache health check endpoint
- `src/routes/getMapRoute.ts` - Integrate image processing
- `src/utils/validators.ts` - Add image size validation schemas
- `src/services/cacheService.ts` - Replace with new abstraction (or refactor existing)
- `src/services/storageService.ts` - Update to handle processed images
- `src/swagger/openapi.ts` - Document guest endpoints + image processing
- `src/routes/authRoutes.ts` - Add POST /auth/guest endpoint
- `prisma/schema.sqlite.prisma` - Add Guest* models
- `prisma/schema.sqlserver.prisma` - Add Guest* models
- `public/index.html` - Add guest login button, mode indicator
- `public/app.js` - Add guest mode handling, API routing
- `public/styles.css` - Add guest mode styling
- `package.json` - Add redis, sharp, @types/sharp
- `.env.example` - Add new env var templates
- `PROJECT_SUMMARY.md` - Update features, tech stack, data model
- `README.md` - Add Redis, image processing, guest user setup
- `docker-compose.yml` - Add Redis service
- `Dockerfile` - Update env defaults

---

## 6. Testing

### Unit Tests (Recommended Future)
- **TEST-001**: `test/cache.test.ts` - Redis backend get/set/delete/clear
- **TEST-002**: `test/cache.fallback.test.ts` - Memory fallback behavior
- **TEST-003**: `test/imageService.test.ts` - Image rotation, compression, EXIF removal
- **TEST-004**: `test/guestCookie.test.ts` - Token generation, verification, tampering detection
- **TEST-005**: `test/guestAuth.middleware.test.ts` - Guest middleware cookie verification, TTL checks

### Integration Tests (Recommended Future)
- **TEST-006**: `test/guest-routes.integration.ts` - Full guest CRUD workflow
- **TEST-007**: `test/guest-isolation.integration.ts` - Guest data isolation
- **TEST-008**: `test/image-processing.integration.ts` - Upload with processing pipeline

### Manual Testing Checklist
- [See Phase 8: Testing & Validation section above]

---

## 7. Risks & Assumptions

### Risks

- **RISK-001**: Redis availability in production could cause requests to block if connection pool exhausted
  - Mitigation: Implement connection pooling with timeouts, automatic fallback to memory
  
- **RISK-002**: Image processing performance under concurrent load could exceed 5s threshold
  - Mitigation: Implement request queuing / worker pattern in Phase 2 if bottleneck confirmed
  
- **RISK-003**: EXIF stripping may inadvertently remove legitimate metadata (e.g., copyright)
  - Mitigation: Document in feature notes, store EXIF separately if needed later
  
- **RISK-004**: Large number of expired guest records could degrade database query performance
  - Mitigation: Implement automatic cleanup job, add database indexes for TTL queries
  
- **RISK-005**: Guest cookie tampering not immediately detected on older sessions
  - Mitigation: Verify signature on every request, implement token rotation if needed
  
- **RISK-006**: Guest users may not understand data expiry, leading to support tickets
  - Mitigation: Show prominent expiry warning in UI, include in feature marketing

### Assumptions

- **ASSUMPTION-001**: Redis deployment available (local dev, managed service for production)
- **ASSUMPTION-002**: Sharp library will be performant enough for target image sizes (<5s)
- **ASSUMPTION-003**: Existing authenticated user workflows do not depend on in-memory cache structure
- **ASSUMPTION-004**: Guest user table churn acceptable (cleanup can be async/scheduled)
- **ASSUMPTION-005**: Frontend team capable of adapting to /api/guest endpoint routing
- **ASSUMPTION-006**: Security model (guest isolation) sufficient for MVP (no per-route permissions needed)
- **ASSUMPTION-007**: Database can handle Guest* tables alongside existing User* tables (Prisma cascades work)

---

## 8. Related Specifications / Further Reading

- [Redis Documentation](https://redis.io/docs/)
- [Sharp Image Processing Library](https://sharp.pixelplumbing.com/)
- [Prisma Database Schema](https://www.prisma.io/docs/concepts/components/prisma-schema)
- [Express.js Middleware](https://expressjs.com/en/guide/using-middleware.html)
- [OpenAPI 3.0.3 Specification](https://spec.openapis.org/oas/v3.0.3)
- [EXIF Data Security](https://www.bleepingcomputer.com/news/security/exif-data-leaks-sensitive-information-in-photos/)
- [Signed Cookies Best Practices](https://expressjs.com/en/api/req.html#req.signedCookies)

---

**Plan Created:** 2026-04-13  
**Version:** 1.0  
**Next Review:** After Phase 1 completion
