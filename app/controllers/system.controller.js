const pool = require('../database/postgres');

async function database(req, res) {
  try {
    const result = await pool.query(
      'SELECT version(), current_database(), current_user, now() AS server_time'
    );
    const row = result.rows[0];

    return res.json({
      connected: true,
      database: row.current_database,
      user: row.current_user,
      serverTime: row.server_time,
      version: row.version,
    });
  } catch (error) {
    console.error('Database connection error:', error.message);
    return res.status(500).json({ connected: false, error: error.message });
  }
}

async function health(req, res) {
  try {
    await pool.query('SELECT 1');
    return res.json({ api: 'ok', database: 'ok' });
  } catch (error) {
    return res.status(503).json({ api: 'ok', database: 'error' });
  }
}

module.exports = { database, health };
