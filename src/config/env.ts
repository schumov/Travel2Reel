import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  SESSION_SECRET: z.string().min(16).default("change-me-dev-secret"),
  GOOGLE_CLIENT_ID: z.string().default(""),
  GOOGLE_CLIENT_SECRET: z.string().default(""),
  GOOGLE_CALLBACK_URL: z.string().url().default("http://localhost:3000/auth/google/callback"),
  DATABASE_PROVIDER: z.enum(["sqlite", "sqlserver"]).default("sqlite"),
  DATABASE_URL: z.string().default("file:./dev.db"),
  ANTHROPIC_API_KEY: z.string().default(""),
  ANTHROPIC_MODEL: z.string().default("claude-sonnet-4-6"),
  
  // Redis Caching
  REDIS_ENABLED: z.enum(["true", "false"]).transform(v => v === "true").default(false),
  REDIS_URL: z.string().url().default("redis://localhost:6379"),
  REDIS_PASSWORD: z.string().default(""),
  
  // Image Processing
  IMAGE_MAX_SIZE_MB: z.coerce.number().int().positive().default(2),
  IMAGE_COMPRESSION_QUALITY: z.coerce.number().int().min(1).max(100).default(80),
  IMAGE_STRIP_EXIF: z.enum(["true", "false"]).transform(v => v === "true").default(true),
  IMAGE_AUTO_ROTATE: z.enum(["true", "false"]).transform(v => v === "true").default(true),
  
  // Guest User
  GUEST_COOKIE_SECRET: z.string().min(16).default("change-me-guest-secret"),
  GUEST_SESSION_EXPIRY_DAYS: z.coerce.number().int().positive().default(90),
  GUEST_INACTIVITY_EXPIRY_DAYS: z.coerce.number().int().positive().default(30),

  // OpenStreetMap request identity
  OSM_REFERER: z.string().min(1).default("https://example.com"),
  OSM_USER_AGENT: z.string().min(1).default("MapRouteAPI/1.0 (https://example.com; contact@example.com)"),

  // Video generation
  VIDEO_GEN_API_URL: z.string().default(""),
  VIDEO_GEN_API_TOKEN: z.string().default(""),
  VIDEO_MAX_SIZE_MB: z.coerce.number().int().positive().default(200)
});

export type AppEnv = z.infer<typeof envSchema>;

export const env: AppEnv = envSchema.parse(process.env);

export const isGoogleAuthConfigured =
  env.GOOGLE_CLIENT_ID.length > 0 && env.GOOGLE_CLIENT_SECRET.length > 0;

export const isClaudeAiConfigured = env.ANTHROPIC_API_KEY.length > 0;

export const isVideoGenConfigured = env.VIDEO_GEN_API_URL.length > 0;

export const isRedisEnabled = env.REDIS_ENABLED;
