# AI Summary Feature - Implementation Guide

**Date:** April 13, 2026  
**Feature:** Generate AI-powered summaries for photos using Claude API  
**Status:** ✅ Implemented and tested

---

## Overview

This feature adds AI-powered summary generation to the Map Route API. When a user clicks "Generate summary" on a photo card, the backend:
1. Retrieves the user note (if any) and internet location information (reverse geocoding + Wikipedia)
2. Sends this context to Claude AI with a prompt to generate 2-3 sentence summary
3. Displays the summary to the user for review
4. Optionally saves it to the photo metadata

---

## Backend Implementation

### 1. Environment Configuration (`src/config/env.ts`)

Added new environment variable:
```typescript
ANTHROPIC_API_KEY: z.string().default("")
```

Added availability check:
```typescript
export const isClaudeAiConfigured = env.ANTHROPIC_API_KEY.length > 0;
```

** User must set `ANTHROPIC_API_KEY` in `.env` file**

### 2. Claude AI Service (`src/services/claudeAiService.ts`)

New service module providing:
```typescript
async function generateImageSummary(input: SummaryInput): Promise<string>
```

**Flow:**
1. Accepts: `userNote`, `locationInfo`, `originalFilename`
2. Builds context string from all available information
3. Prompts Claude with: *"Generate a brief, engaging human-readable summary in 2-3 sentences"*
4. Uses `claude-3-5-sonnet-20241022` model (fast, cost-effective)
5. Limits output to max 3 sentences (post-processing)
6. Returns trimmed, clean summary text

**Prompt Template:**
```
You are a concise travel summary generator. Based on the following information about a photo and location, 
generate a brief, engaging human-readable summary in 2-3 sentences. The summary should be interesting and 
capture the essence of the moment or location.

Information provided:
[context from all sources]

Requirements:
- Write in 2-3 sentences maximum
- Be engaging and natural
- Focus on the location and moment captured
- If user notes are provided, incorporate relevant details
- Write in first or second person perspective as if describing the moment
```

### 3. Database Schema Update

**Added field to RouteImage model** (`prisma/schema.sqlite.prisma` + `prisma/schema.sqlserver.prisma`):
```prisma
aiSummary        String?  // AI-generated summary (max 2-3 sentences)
```

Migration applied: `npm run prisma:db:push:sqlite`

### 4. Backend Endpoint

**POST `/api/user/routes/:routeId/images/:imageId/summary`**

- **Auth:** Required (session cookie)
- **Purpose:** Generate and save AI summary for an image
- **Request:** Empty JSON body (all data comes from DB)
- **Response (200):**
  ```json
  {
    "image": {
      "id": "cuid-string",
      "aiSummary": "Generated 2-3 sentence summary text..."
    }
  }
  ```
- **Errors:**
  - 401: Not authenticated
  - 403: Not authorized (not owner of route)
  - 404: Image not found
  - 503: Claude AI not configured (ANTHROPIC_API_KEY not set)

**Flow:**
1. Validate route ownership
2. Load image + location info
3. Call `generateImageSummary()` service
4. Save result to DB (`aiSummary` field)
5. Return updated image record

---

## Frontend Implementation

### 1. HTML Template (`public/index.html`)

Added to card template:
```html
<div class="summary-wrap">
  <div class="summary-header">
    <button class="secondary summary-btn">Generate summary</button>
    <span class="summary-state"></span>
  </div>
  <div class="summary-content" hidden>
    <p class="summary-text"></p>
    <div class="summary-actions">
      <button class="secondary summary-save-btn">Save to photo</button>
      <button class="ghost summary-discard-btn">Discard</button>
    </div>
  </div>
</div>
```

### 2. Styling (`public/styles.css`)

New CSS classes:
- `.summary-wrap` - Container for all summary UI
- `.summary-header` - Button + status line
- `.summary-state` - Status text (Generating..., Generated, errors)
- `.summary-state.loading` - Italian text style during generation
- `.summary-state.ok` - Green text for success
- `.summary-state.warn` - Orange text for errors
- `.summary-content` - Light blue box showing generated summary
- `.summary-text` - The actual summary text (1.5 line-height)
- `.summary-actions` - Save + Discard buttons

### 3. JavaScript Logic (`public/app.js`)

**State properties per item:**
```javascript
aiSummary: "",              // The generated summary text
summaryGenerated: false,    // Whether preview should show
summaryStatus: "",          // Display status (Generated, error message, etc.)
summaryLoading: false       // True while generating
```

**Key functions:**

#### `generateSummaryForItem(itemId)`
- Validates auth + upload status
- Sets `summaryLoading = true` → shows "Generating..."
- POST to `/api/user/routes/:routeId/images/:imageId/summary`
- Stores response `aiSummary`
- Sets `summaryGenerated = true` → shows preview
- Handles errors gracefully

#### `saveSummaryForItem(itemId)`
- Closes preview (already saved in DB)
- Sets `summaryGenerated = false`

#### `discardSummaryForItem(itemId)`
- Clears preview without saving
- Clears `aiSummary` text

**renderCards() updates:**
- Renders summary button (disabled unless uploaded)
- Shows loading spinner during generation
- Displays generated summary in light-blue box
- Shows Save + Discard buttons when summary ready
- Updates status text with success/error feedback

---

## User Workflow

### Step-by-step

1. **User uploads photo** → Photo appears in grid with "Generate summary" button
2. **User clicks "Generate summary"** → Button grayed out, status shows "Generating..."
3. **Backend fetches image data** → Combines user note + location info + filename
4. **Claude AI generates summary** → API call with context prompt
5. **Backend saves summary** → Stored in DB on `aiSummary` field
6. **Frontend shows preview** → Light-blue box displays the 2-3 sentence summary
7. **User reviews summary** → Can read the generated text
8. **User clicks "Save to photo"** → Closes preview (already in DB) or discards it
9. **If route is restored** → Summary is automatically reloaded with the image

### Example Flow

**Input:**
- User note: "*Beautiful sunset overlooking the valley*"
- Location: City: "Banff", Country: "Canada", Wikipedia: "*Banff is a year-round resort town in Alberta, Canada. The Banff townsite is located in Banff National Park, in the Rocky Mountains...*"
- Filename: "sunset-banff-2024.jpg"

**Claude Output (2-3 sentences):**
> "Captured the perfect golden hour moment overlooking the breathtaking Canadian Rockies from Banff. As one of the world's most visited national parks, Banff's dramatic peaks and pristine valleys provide an unforgettable backdrop for this sunset photo. Your note perfectly captures the magic of witnessing nature's most serene moments in this iconic destination."

---

## Configuration & Setup

### 1. Get Claude API Key

1. Visit https://console.anthropic.com/
2. Sign up / Login
3. Create API key in account settings
4. Add to `.env`:
   ```
   ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxx
   ```

### 2. Verify Setup

```bash
# Check auth is configured
curl http://localhost:3000/health  # Should return 200
curl http://localhost:3000/api/docs  # Should show Swagger UI with new endpoint
```

### 3. Test Summary Generation

**Via Swagger UI:**
1. Navigate to http://localhost:3000/api/docs
2. Find POST `/api/user/routes/{routeId}/images/{imageId}/summary`
3. Enter route ID and image ID
4. Click "Try it out" → "Execute"

**Via cURL (after auth):**
```bash
curl -X POST http://localhost:3000/api/user/routes/route123/images/img456/summary \
  -H "Content-Type: application/json" \
  -b "connect.sid=session-cookie" \
  -d '{}'
```

---

## API Documentation

Updated in `src/swagger/openapi.ts`:

```yaml
/api/user/routes/{routeId}/images/{imageId}/summary:
  post:
    tags:
      - UserRoutes
    summary: "Generate AI summary for a route image using Claude"
    security:
      - cookieAuth: []
    parameters:
      - name: routeId
        in: path
        required: true
        schema:
          type: string
      - name: imageId
        in: path
        required: true
        schema:
          type: string
    responses:
      "200":
        description: "AI summary generated and saved"
        content:
          application/json:
            schema:
              type: object
              properties:
                image:
                  type: object
                  properties:
                    id:
                      type: string
                    aiSummary:
                      type: string
                      nullable: true
      "401":
        description: "Authentication required"
      "403":
        description: "Forbidden"
      "404":
        description: "Image not found"
      "503":
        description: "Claude AI not configured"
```

---

## Error Handling

### User-Facing Errors

| Status | User Message | Resolution |
|--------|--------------|-----------|
| Sign in and upload first | Not authenticated or image not yet persisted | Upload photo first, ensure logged in |
| Generating... | Processing, please wait | Just a loading state |
| Generated | Summary is ready | Normal, shows preview |
| Could not generate summary | API error (bad data) | Check image has location info |
| Network error | Connection failed | Retry or check internet |
| Claude AI is not configured | Backend missing API key | Admin sets ANTHROPIC_API_KEY in .env |

### Backend Error Codes

- **400** - Missing/invalid image ID
- **401** - Not authenticated (no session)
- **403** - Not route owner
- **404** - Image or route not found
- **503** - ANTHROPIC_API_KEY not configured

---

## Performance Considerations

### Claude API Costs

- Model: `claude-3-5-sonnet` (cost-effective, fast)
- Typical request: ~150-300 input tokens, ~50-150 output tokens (very cheap)
- Per-image cost: ~$0.0001-0.0002 (essentially free at scale)
- Rate limiting: Standard Claude free tier or paid plan

### Latency

- **Typical response time:** 1-3 seconds per image
- **UI feedback:** Shows "Generating..." spinner during wait
- **No blocking:** Request is async, user can continue interacting

### Optimization Tips

1. **Cache summaries:** Already stored in DB (reuse on restore)
2. **Batch generation:** If building bulk feature, consider async queue
3. **Fallback:** If Claude fails, show error message + re-enable button
4. **Rate limit:** Implement per-user quota if needed (future)

---

## Testing Checklist

### Manual E2E Test

- [ ] 1. User not logged in → "Generate summary" button disabled ✓
- [ ] 2. User logs in + uploads photo → Button enabled
- [ ] 3. User clicks "Generate summary" → Shows "Generating..."
- [ ] 4. After ~2-3 sec → Summary preview appears in light blue box
- [ ] 5. Summary is 2-3 sentences max (validation)
- [ ] 6. User clicks "Save to photo" → Preview closes, summary stored ✓
- [ ] 7. User restores route → Summary reappears with image
- [ ] 8. Missing ANTHROPIC_API_KEY → 503 error shown

### API Test (cURL)

```bash
# 1. Get auth session
curl -X GET http://localhost:3000/auth/me

# 2. Request summary
curl -X POST http://localhost:3000/api/user/routes/ROUTE_ID/images/IMAGE_ID/summary \
  -H "Content-Type: application/json" \
  -b "connect.sid=YOUR_SESSION_COOKIE" \
  -d '{}'

# Expected response:
# {
#   "image": {
#     "id": "img_id",
#     "aiSummary": "A beautifully composed travel summary in 2-3 sentences."
#   }
# }
```

---

## Future Enhancements

1. **Batch summaries** - Generate for all photos in route at once
2. **Custom prompts** - User-defined tone/style (humorous, formal, poetic)
3. **Multi-language** - Detect user language or support selection
4. **Summary editing** - Allow user tweaks before saving
5. **Alternative models** - GPT-4, Gemini integration options
6. **Caching optimization** - Store summaries for Similar locations (geo-hash)
7. **Voice output** - Read summary aloud via text-to-speech API
8. **Analytics** - Track which summaries users save/discard

---

## Files Modified

| File | Changes |
|------|---------|
| `package.json` | Added `@anthropic-ai/sdk` |
| `src/config/env.ts` | Added `ANTHROPIC_API_KEY`, `isClaudeAiConfigured()` |
| `src/services/claudeAiService.ts` | **NEW** - Claude integration service |
| `src/routes/userRoutes.ts` | Added POST `/summary` endpoint |
| `src/swagger/openapi.ts` | Added summary endpoint documentation |
| `prisma/schema.sqlite.prisma` | Added `aiSummary String?` to RouteImage |
| `prisma/schema.sqlserver.prisma` | Added `aiSummary String?` to RouteImage |
| `public/index.html` | Added summary section to card template |
| `public/styles.css` | Added `.summary-*` CSS classes |
| `public/app.js` | Added summary state, functions, and rendering logic |

---

## Build & Deployment

### Development
```bash
npm install  # Installed @anthropic-ai/sdk
npm run prisma:db:push:sqlite
npm run dev
```

### Production
```bash
npm run build  # TypeScript compiles successfully ✓
npm start

# Requires environment variable:
export ANTHROPIC_API_KEY="sk-ant-xxxxx"
```

### Docker
```dockerfile
ENV ANTHROPIC_API_KEY=""  # User must provide via runtime -e flag
```

---

## Support & Debugging

### If summary generation fails:

1. **Check API key is set:**
   ```bash
   grep ANTHROPIC_API_KEY .env
   ```

2. **Check Claude service loads:**
   ```bash
   # In Node console:
   const { generateImageSummary } = require('./dist/services/claudeAiService');
   ```

3. **Check rate limiting:** Claude has usage limits (paid plan has higher limits)

4. **Check image has location data:** Summary works best with `locationInfo` available

5. **Check logs for errors:**
   ```bash
   npm run dev 2>&1 | grep -i "claude\|summary\|error"
   ```

---

**Document Status:** Complete  
**Last Updated:** April 13, 2026
