const pool = require('../database/postgres');

async function comprasLotesTest(req, res) {
  const inicioTotal = Date.now();
  let client;

  try {
    const inicio = req.query.inicio || '2026-08-31';
    const fin = req.query.fin || '2026-09-02';
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 20);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);

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
      ORDER BY c.feccompra DESC, c.numfaccom DESC
      LIMIT $3 OFFSET $4
    `, [inicio, fin, limit, offset]);
    const queryMs = Date.now() - inicioQuery;

    return res.json({
      ok: true,
      alternativa: 'consulta_por_lotes',
      inicio,
      fin,
      limit,
      offset,
      total: result.rows.length,
      queryMs,
      tiempoMs: Date.now() - inicioTotal,
      compras: result.rows
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      alternativa: 'consulta_por_lotes',
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

module.exports = { comprasLotesTest };
