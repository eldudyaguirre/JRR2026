const pool = require('../database/postgres');

async function comprasDosConsultasTest(req, res) {
  const inicioTotal = Date.now();
  let client;

  try {
    const inicio = req.query.inicio || '2026-08-31';
    const fin = req.query.fin || '2026-09-02';

    client = pool.createDedicatedClient();
    await client.connect();
    await client.query('SET statement_timeout = 15000');

    // CONSULTA 1: compras, SIN JOIN con proveedores
    const inicioCompras = Date.now();
    const comprasResult = await client.query(`
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
    `, [inicio, fin]);
    const comprasMs = Date.now() - inicioCompras;

    // CONSULTA 2: proveedores, usando solamente los RUC que realmente necesitamos
    const rucs = [...new Set(
      comprasResult.rows.map(row => row.rucCed).filter(Boolean)
    )];

    const inicioProveedores = Date.now();
    let proveedoresResult = { rows: [] };

    if (rucs.length > 0) {
      proveedoresResult = await client.query(`
        SELECT p.ruccedpro AS "rucCed",
               p.nomprovee AS "proveedor"
        FROM proveedores p
        WHERE p.ruccedpro = ANY($1::text[])
      `, [rucs]);
    }
    const proveedoresMs = Date.now() - inicioProveedores;

    const proveedores = new Map(
      proveedoresResult.rows.map(row => [row.rucCed, row.proveedor])
    );

    const compras = comprasResult.rows.map(row => ({
      ...row,
      proveedor: proveedores.get(row.rucCed) || ''
    }));

    return res.json({
      ok: true,
      alternativa: 'dos_consultas_sin_join',
      inicio,
      fin,
      total: compras.length,
      rucsUnicos: rucs.length,
      proveedoresEncontrados: proveedoresResult.rows.length,
      comprasMs,
      proveedoresMs,
      tiempoMs: Date.now() - inicioTotal,
      compras
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      alternativa: 'dos_consultas_sin_join',
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

module.exports = { comprasDosConsultasTest };
