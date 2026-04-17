import { createClient, RedisClientType } from "redis";
import { env } from "../config/env";

let redisClient: RedisClientType | null = null;
let isConnected = false;

export async function initRedis(): Promise<void> {
  if (!env.REDIS_ENABLED) {
    console.log("Redis caching disabled");
    return;
  }

  try {
    const options: any = {
      url: env.REDIS_URL,
      socket: {
        reconnectStrategy: (retries: number) => {
          if (retries > 10) {
            console.error("Max Redis reconnection attempts reached");
            return new Error("Redis reconnection failed");
          }
          return Math.min(retries * 50, 500);
        }
      }
    };

    if (env.REDIS_PASSWORD) {
      options.password = env.REDIS_PASSWORD;
    }

    redisClient = createClient(options);

    redisClient.on("error", (err) => {
      console.error("Redis error:", err);
      isConnected = false;
    });

    redisClient.on("connect", () => {
      console.log("Redis connected");
      isConnected = true;
    });

    redisClient.on("disconnect", () => {
      console.log("Redis disconnected");
      isConnected = false;
    });

    await redisClient.connect();
    isConnected = true;
  } catch (error) {
    console.error("Failed to initialize Redis:", error);
    redisClient = null;
    isConnected = false;
  }
}

export function getRedisClient(): RedisClientType | null {
  return redisClient;
}

export function isRedisConnected(): boolean {
  return isConnected && redisClient !== null;
}

export async function closeRedis(): Promise<void> {
  if (redisClient) {
    try {
      await redisClient.quit();
      isConnected = false;
      redisClient = null;
    } catch (error) {
      console.error("Error closing Redis connection:", error);
    }
  }
}
