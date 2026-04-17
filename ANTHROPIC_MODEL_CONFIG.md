# Anthropic Model Configuration Guide

**Date:** April 13, 2026  
**Change:** Made Anthropic Claude model configurable via environment variable

---

## Configuration

### Environment Variable

```env
ANTHROPIC_MODEL=claude-3-5-sonnet-20241022
```

**Location:** Set in `.env` file (project root)

**Default:** `claude-3-5-sonnet-20241022` (Claude 3.5 Sonnet - latest, cost-effective)

---

## Available Models

### Recommended Options

| Model | ID | Speed | Cost | Use Case |
|-------|-----|-------|------|----------|
| **Claude 3.5 Sonnet** | `claude-3-5-sonnet-20241022` | ⚡⚡⚡ Fast | 💰 Low | Default - best balance |
| Claude 3 Opus | `claude-3-opus-20250219` | ⚡ Slower | 💰💰💰 High | Complex analysis |
| Claude 3 Haiku | `claude-3-haiku-20250307` | ⚡⚡⚡⚡ Fastest | 💰 Lowest | Budget-friendly |

### Model Selection by Use Case

**For this feature (travel summaries):**
- **Best:** Claude 3.5 Sonnet (default) - Good balance of quality and speed
- **Budget:** Claude 3 Haiku - Very fast, adequate for summaries
- **Premium:** Claude 3 Opus - Higher quality narratives

### How to Change

**Edit `.env` file:**

```env
# Default (recommended for production)
ANTHROPIC_MODEL=claude-3-5-sonnet-20241022

# Budget-friendly
ANTHROPIC_MODEL=claude-3-haiku-20250307

# Premium quality
ANTHROPIC_MODEL=claude-3-opus-20250219
```

**Then restart server:**

```bash
npm run dev
# or
npm start
```

---

## Implementation Details

### Where It's Configured

1. **`src/config/env.ts`** - Environment schema
   ```typescript
   ANTHROPIC_MODEL: z.string().default("claude-3-5-sonnet-20241022")
   ```

2. **`src/services/claudeAiService.ts`** - Used in API calls
   ```typescript
   const message = await client.messages.create({
     model: env.ANTHROPIC_MODEL,  // Reads from config
     max_tokens: 1024,
     messages: [...]
   });
   ```

### Runtime Selection

The model is loaded **once at startup** from the environment. To change models:

1. Update `.env` file
2. Restart the Node process

No code changes required.

---

## Testing Different Models

### Quick Test via API

```bash
# Get current configured model from logs
npm run dev 2>&1 | grep -i anthropic

# Or make a request (requires auth + image):
curl -X POST http://localhost:3000/api/user/routes/ROUTE_ID/images/IMAGE_ID/summary \
  -H "Content-Type: application/json" \
  -b "connect.sid=session_cookie" \
  -d '{}'
```

### Cost Comparison

Based on typical summary generation (~200 input tokens, ~75 output tokens):

| Model | Input Cost | Output Cost | Total |
|-------|-----------|------------|--------|
| Haiku | $0.000080 | $0.000240 | **$0.00032** |
| Sonnet 3.5 | $0.000300 | $0.001500 | **$0.00180** |
| Opus | $0.003000 | $0.015000 | **$0.01800** |

**Recommendation:** Use Sonnet 3.5 (default) - 5-10x cheaper than Opus, 5x more capable than Haiku.

---

## Migration from Hardcoded Model

### What Changed

**Before:**
```typescript
// Hardcoded in claudeAiService.ts
model: "claude-3-5-sonnet-20241022"
```

**After:**
```typescript
// Configurable via environment
model: env.ANTHROPIC_MODEL  // Defaults to "claude-3-5-sonnet-20241022"
```

### Benefits

1. **No code changes** to switch models
2. **Environment-specific** (dev vs. staging vs. production)
3. **Cost optimization** - use cheaper models where appropriate
4. **Experiment easily** - test models without redeployment
5. **Future-proof** - new Claude models supported immediately

---

## Docker Deployment

### Setting Model in Docker

**Via environment flag:**
```bash
docker run -p 3000:3000 \
  -e ANTHROPIC_API_KEY="sk-ant-..." \
  -e ANTHROPIC_MODEL="claude-3-opus-20250219" \
  map-api
```

**Via .env file:**
```bash
docker run -p 3000:3000 \
  --env-file .env.prod \
  map-api
```

**In docker-compose.yml:**
```yaml
services:
  api:
    environment:
      ANTHROPIC_MODEL: "claude-3-5-sonnet-20241022"
      ANTHROPIC_API_KEY: "${ANTHROPIC_API_KEY}"
```

---

## Troubleshooting

### "Invalid model" Error

If you get an error like `Invalid model: ...`:

1. **Check model name spelling** - Anthropic model IDs are exact
2. **Verify API tier** - Free tier may have limited model access
3. **Check API key permissions** - Ensure key has access to the model

### "Rate limited" on Expensive Models

If using Opus and hitting rate limits:

1. **Downgrade to Sonnet** in `.env`
2. **Upgrade API plan** at console.anthropic.com
3. **Add caching** - reuse summaries for similar locations

### Performance is Slow

If generation takes >5 seconds:

1. **Switch to Haiku** for faster responses
2. **Increase `max_tokens`** may help (currently 1024)
3. **Check network latency** - API call time logs

---

## Future Model Updates

As Anthropic releases new models, simply update:

```env
# When a new Sonnet 4 releases
ANTHROPIC_MODEL=claude-4-sonnet-20XX0101
```

No application code changes needed.

---

## Configuration Verification

### Verify Your Configuration

Add this to `src/server.ts` before listening (optional):

```typescript
console.log(`Using Anthropic model: ${env.ANTHROPIC_MODEL}`);
```

Then check logs on startup:

```bash
npm run dev 2>&1 | grep "Using Anthropic"
# Output: Using Anthropic model: claude-3-5-sonnet-20241022
```

---

## Summary

| Aspect | Details |
|--------|---------|
| **Default Model** | claude-3-5-sonnet-20241022 |
| **Config Location** | `.env` file (ANTHROPIC_MODEL) |
| **Implementation** | `src/config/env.ts` + `src/services/claudeAiService.ts` |
| **Change Detection** | Requires server restart |
| **Cost Optimization** | Use Haiku for budget, Sonnet for balance, Opus for quality |

**No breaking changes** - existing deployments work without modification (uses default).
