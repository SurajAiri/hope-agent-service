import Redis from "ioredis";

let _client: Redis | null = null;

/**
 * Shared ioredis singleton.
 * Call `getRedis()` from anywhere in the app — connection is created once
 * and reused across all requests.
 */
export function getRedis(): Redis {
  if (!_client) {
    const url = process.env.REDIS_URL;
    if (!url) {
      throw new Error(
        "Server misconfiguration: REDIS_URL environment variable is not set",
      );
    }
    _client = new Redis(url, {
      // Reconnect with exponential back-off (max 3 s between retries)
      retryStrategy: (times) => Math.min(times * 100, 3000),
      // Lazy connect so the process starts even if Redis is momentarily down
      lazyConnect: false,
      maxRetriesPerRequest: 3,
    });

    _client.on("error", (err) => {
      console.error("[Redis] connection error:", err.message);
    });

    _client.on("connect", () => {
      console.log("[Redis] connected");
    });
  }
  return _client;
}

/** Key prefix for organisation API-token cache entries. */
export const REDIS_API_KEY_PREFIX = "hope:apikey:";

/**
 * 7-day safety-net TTL (seconds).
 * Orphaned Redis keys self-evict after 7 days even if explicit revocation
 * (redis.del) is somehow missed. The inline expiry check in the value
 * remains the authority for whether a token is still valid.
 */
export const REDIS_API_KEY_TTL_SECONDS = 7 * 24 * 60 * 60; // 604 800 s
