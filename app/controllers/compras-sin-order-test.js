const pool = require('../database/postgres');

async function comprasSinOrderTest(req, res) {
  const inicioTotal = Date.now();
  let client;

  try {
    const inicio = req.query.inicio || '2026-08-31';
    const fin = req.query.fin || '2026-09-02';

    client = pool.createDedicatedClient();
    await client.connect();
    await client.query('SET statement_timeout = 15000');

    const inicioQuery = Date.now();
    const result = await client.query(`
      SELECT c.numfaccom AS "numero",
             c.ruccedpro AS "rucCed",
             c.numautori AS "autorizacion",
             c.feccompra AS "fecha",
             COALESCE(c.totsiniva, 0)::text AS "subtotalSinIva",
             COALESCE(c.totconiva, 0)::text AS "subtotalConIva",
             COALESCE(c.valivacom, 0)::text AS "iva",
             COALESCE(c.totcompra, 0)::text AS "total"
      FROM compras c
      WHERE c.feccompra >= $1::date
        AND c.feccompra <= $2::date
      LIMIT 10
    `, [inicio, fin]);
    const queryMs = Date.now() - inicioQuery;

    return res.json({
      ok: true,
      alternativa: 'sin_order_by',
      inicio,
      fin,
      total: result.rows.length,
      queryMs,
      tiempoMs: Date.now() - inicioTotal,
      compras: result.rows
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      alternativa: 'sin_order_by',
      error: error.message,
      codigo: error.code,
      tiempoMs: Date.now() - inicioTotal
    });
  } finally {
    if (client) {
      try { await client.end(); } catch (_) {}
    }
  }
}

module.exports = { comprasSinOrderTest };
