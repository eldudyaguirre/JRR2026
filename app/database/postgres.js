const { Pool, Client } = require('pg');

function getConnectionConfig() {
  const commonOptions = {
    statement_timeout: Number(process.env.DB_STATEMENT_TIMEOUT || 30000),
    connectionTimeoutMillis: Number(process.env.DB_CONNECTION_TIMEOUT || 5000),
    keepAlive: true,
    keepAliveInitialDelayMillis: 10000,
  };

  if (process.env.DATABASE_URL) {
    return {
      ...commonOptions,
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
    };
  }

  return {
    ...commonOptions,
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  };
}

function createPool() {
  return new Pool({
    ...getConnectionConfig(),
    // Hasta 20 conexiones PostgreSQL reutilizables para soportar la concurrencia esperada.
    max: Number(process.env.DB_POOL_MAX || 20),
    idleTimeoutMillis: Number(process.env.DB_IDLE_TIMEOUT || 10000),
  });
}

function createDedicatedClient() {
  return new Client(getConnectionConfig());
}

const pool = createPool();

pool.on('error', (error) => {
  console.error('PostgreSQL pool error:', error.message);
});

module.exports = pool;
module.exports.createDedicatedClient = createDedicatedClient;
