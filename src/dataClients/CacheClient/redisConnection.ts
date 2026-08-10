export const redisUseTls = process.env.REDIS_TLS === "true";

export const connection = {
  host: process.env.REDIS_HOST || "127.0.0.1",
  port: Number(process.env.REDIS_PORT) || 6379,
  ...(redisUseTls ? { tls: {} } : {})
};
