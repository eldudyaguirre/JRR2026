const pool = require('../database/postgres');

function ident(nombre) {
  return '"' + String(nombre).replace(/"/g, '""') + '"';
}

async function resumenTrabajadores(req, res) {
  let client;
  try {
    client = pool.createDedicatedClient();
    await client.connect();
    const tabla = await client.query(`
      SELECT table_schema, table_name
      FROM information_schema.tables
      WHERE table_type = 'BASE TABLE'
        AND table_schema NOT IN ('pg_catalog','information_schema')
        AND lower(table_name) = 'trabajadores'
      ORDER BY CASE WHEN table_schema='public' THEN 0 ELSE 1 END
      LIMIT 1
    `);
    if (!tabla.rows.length) throw new Error('No se encontró la tabla trabajadores.');
    const { table_schema: esquema, table_name: nombre } = tabla.rows[0];
    const result = await client.query(`SELECT COUNT(*)::int AS total FROM ${ident(esquema)}.${ident(nombre)}`);
    return res.json({ tabla: `${esquema}.${nombre}`, total: result.rows[0].total });
  } catch (error) {
    console.error('[TRABAJADORES] Error:', error);
    return res.status(500).json({ error: 'Error consultando trabajadores.', detail: error.message });
  } finally {
    if (client) {
      try { await client.end(); } catch (_) {}
    }
  }
}

module.exports = { resumenTrabajadores };
