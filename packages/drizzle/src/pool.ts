import pg from "pg";

const { Pool } = pg;

export interface PoolLogger {
  error(msg: string): void;
}

export interface PoolOptions {
  /** Maximum number of clients in the pool. */
  max?: number;
  /** Minimum number of idle clients to maintain. */
  min?: number;
  /** Milliseconds a client can sit idle before being closed. */
  idleTimeoutMillis?: number;
  /** Milliseconds to wait for a connection before timing out. */
  connectionTimeoutMillis?: number;
  /** Initial delay in milliseconds for TCP keepalive. */
  keepAliveInitialDelayMillis?: number;
}

const DEFAULT_POOL_OPTIONS: Required<PoolOptions> = {
  max: 100,
  min: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  keepAliveInitialDelayMillis: 10_000,
};

/**
 * Append libpq keepalive parameters to a connection URL to prevent
 * network equipment from silently dropping idle connections.
 */
function appendKeepaliveParams(url: string): string {
  const params =
    "keepalives=1&keepalives_idle=300&keepalives_interval=10&keepalives_count=10";
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}${params}`;
}

/**
 * Creates a configured `pg.Pool` with keepalive, error handling,
 * and startup verification built in.
 */
export async function createPool(
  connectionString: string,
  options: PoolOptions = {},
  logger?: PoolLogger,
): Promise<pg.Pool> {
  const merged = { ...DEFAULT_POOL_OPTIONS, ...options };

  const pool = new Pool({
    connectionString: appendKeepaliveParams(connectionString),
    max: merged.max,
    min: merged.min,
    idleTimeoutMillis: merged.idleTimeoutMillis,
    connectionTimeoutMillis: merged.connectionTimeoutMillis,
    keepAlive: true,
    keepAliveInitialDelayMillis: merged.keepAliveInitialDelayMillis,
  });

  pool.on("connect", (client) => {
    const stream = (
      client as unknown as {
        connection?: {
          stream?: { setKeepAlive(enable: boolean, ms: number): void };
        };
      }
    ).connection?.stream;
    stream?.setKeepAlive(true, merged.keepAliveInitialDelayMillis);

    client.on("error", (err) => {
      if (logger) {
        logger.error("Database client error: " + err.message);
      }
    });
  });

  pool.on("error", (err) => {
    if (logger) {
      logger.error("Unexpected database pool error: " + err.message);
    }
  });

  try {
    await pool.query("SELECT 1");
  } catch (error) {
    try {
      await pool.end();
    } catch {
      // Ignore errors from pool.end() to avoid masking the original failure
    }
    throw error;
  }

  return pool;
}
