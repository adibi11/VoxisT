import Redis from "ioredis";
import { ILogger, logger } from "../../logging/logger";
import { connection, redisUseTls } from "./redisConnection";
export { connection } from "./redisConnection";

export const redisClient = new Redis(connection);
const redisLogger = logger.child({ component: "RedisClient" });

redisClient.on("connect", () => {
  redisLogger.info("redis.connecting", getConnectionLogData());
});

redisClient.on("ready", () => {
  redisLogger.info("redis.ready", getConnectionLogData());
});

redisClient.on("error", (error) => {
  redisLogger.error("redis.error", { ...getConnectionLogData(), error });
});

export async function verifyRedisConnection(loggerInstance: ILogger = redisLogger): Promise<void> {
  const startedAt = Date.now();
  const timeoutMs = Number(process.env.REDIS_VERIFY_TIMEOUT_MS) || 10000;
  loggerInstance.info("redis.connection.verify.requested", { ...getConnectionLogData(), timeoutMs });

  const response = await withTimeout(redisClient.ping(), timeoutMs);

  loggerInstance.info("redis.connection.verify.succeeded", {
    ...getConnectionLogData(),
    response,
    durationMs: Date.now() - startedAt
  });
}

function getConnectionLogData(): Record<string, unknown> {
  return {
    host: connection.host,
    port: connection.port,
    tls: redisUseTls
  };
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Redis verification timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    promise
      .then((value) => {
        clearTimeout(timeout);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timeout);
        reject(error);
      });
  });
}
