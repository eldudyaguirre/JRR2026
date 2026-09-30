const pool = require('../database/postgres');

async function comprasJsonTest(req, res) {
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
      SELECT COALESCE(json_agg(t ORDER BY t.fecha DESC, t.numero DESC), '[]'::json) AS compras
      FROM (
        SELECT c.numfaccom AS numero, c.ruccedpro AS "rucCed", c.numautori AS autorizacion,
               c.feccompra AS fecha, COALESCE(c.totsiniva, 0)::text AS "subtotalSinIva",
               COALESCE(c.totconiva, 0)::text AS "subtotalConIva", COALESCE(c.valivacom, 0)::text AS iva,
               COALESCE(c.totcompra, 0)::text AS total
        FROM compras c
        WHERE c.feccompra >= $1::date AND c.feccompra < ($2::date + INTERVAL '1 day')
        UNION ALL
        SELECT c.numfaccom AS numero, c.ruccedpro AS "rucCed", c.numautori AS autorizacion,
               c.feccompra AS fecha, COALESCE(c.totsiniva, 0)::text AS "subtotalSinIva",
               COALESCE(c.totconiva, 0)::text AS "subtotalConIva", COALESCE(c.valivacom, 0)::text AS iva,
               COALESCE(c.totcompra, 0)::text AS total
        FROM comprasnv c
        WHERE c.feccompra >= $1::date AND c.feccompra < ($2::date + INTERVAL '1 day')
      ) t
    `, [inicio, fin]);

    const queryMs = Date.now() - inicioQuery;
    const compras = result.rows[0].compras || [];

    return res.json({
      ok: true,
      alternativa: 'json_aggregate',
      inicio,
      fin,
      total: compras.length,
      queryMs,
      tiempoMs: Date.now() - inicioTotal,
      compras
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      alternativa: 'json_aggregate',
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

module.exports = { comprasJsonTest };
