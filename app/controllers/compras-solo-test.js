const pool = require('../database/postgres');

async function comprasSoloTest(req, res) {
  const inicioTotal = Date.now();
  let client;

  try {
    client = pool.createDedicatedClient();
    await client.connect();

    const inicioQuery = Date.now();

    // PRUEBA AISLADA: columnas reales de compras.
    const result = await client.query(`
      SELECT
        numfaccom,
        ruccedpro,
        feccompra,
        numautori
      FROM compras
      LIMIT 10
    `);

    const queryMs = Date.now() - inicioQuery;

    return res.json({
      ok: true,
      prueba: 'compras_4_columnas',
      total: result.rows.length,
      queryMs,
      tiempoMs: Date.now() - inicioTotal,
      compras: result.rows
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      prueba: 'compras_4_columnas',
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

module.exports = { comprasSoloTest };
