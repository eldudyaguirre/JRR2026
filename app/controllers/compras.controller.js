const pool = require('../database/postgres');

function fechaValida(valor) {
  return /^\d{4}-\d{2}-\d{2}$/.test(valor) && !Number.isNaN(Date.parse(`${valor}T00:00:00Z`));
}

async function compras(req, res) {
  const inicioConsulta = Date.now();
  let client;
  try {
    const inicio = req.query.inicio || '2026-08-31';
    const fin = req.query.fin || '2026-09-02';

    if (!fechaValida(inicio) || !fechaValida(fin)) {
      return res.status(400).json({ error: 'Fechas inválidas. Use YYYY-MM-DD.' });
    }

    client = pool.createDedicatedClient();
    await client.connect();
    await client.query('SET statement_timeout = 30000');

    // Las fechas están validadas estrictamente antes de incorporarlas al SQL.
    // Se usan literales para evitar el comportamiento anómalo observado con
    // consultas parametrizadas desde Railway.
    const sql = `
      SELECT c.numfaccom AS "numero", c.ruccedpro AS "rucCed",
             COALESCE(p.nomprovee, '') AS "proveedor",
             'FAC' AS "tipoDoc",
             c.numautori AS "autorizacion", c.feccompra AS "fecha",
             COALESCE(c.totsiniva, 0)::text AS "subtotalSinIva",
             COALESCE(c.totconiva, 0)::text AS "subtotalConIva",
             COALESCE(c.valivacom, 0)::text AS "iva",
             COALESCE(c.totcompra, 0)::text AS "total"
      FROM compras c
      LEFT JOIN proveedores p ON p.ruccedpro = c.ruccedpro
      WHERE c.feccompra >= DATE '${inicio}' AND c.feccompra <= DATE '${fin}'
      UNION ALL
      SELECT c.numfaccom AS "numero", c.ruccedpro AS "rucCed",
             COALESCE(p.nomprovee, '') AS "proveedor",
             'NV' AS "tipoDoc",
             c.numautori AS "autorizacion", c.feccompra AS "fecha",
             COALESCE(c.totsiniva, 0)::text AS "subtotalSinIva",
             COALESCE(c.totconiva, 0)::text AS "subtotalConIva",
             COALESCE(c.valivacom, 0)::text AS "iva",
             COALESCE(c.totcompra, 0)::text AS "total"
      FROM comprasnv c
      LEFT JOIN proveedores p ON p.ruccedpro = c.ruccedpro
      WHERE c.feccompra >= DATE '${inicio}' AND c.feccompra <= DATE '${fin}'
      ORDER BY "fecha" DESC, "numero" DESC
    `;

    const result = await client.query(sql);

    return res.json({ inicio, fin, tiempoMs: Date.now() - inicioConsulta, total: result.rows.length, compras: result.rows });
  } catch (error) {
    console.error('[COMPRAS] Error consultando compras:', error);
    return res.status(500).json({ error: 'Error consultando compras.', detail: error.message, codigo: error.code, tiempoMs: Date.now() - inicioConsulta });
  } finally {
    if (client) {
      try { await client.end(); } catch (error) { console.error('[COMPRAS] Error cerrando cliente:', error.message); }
    }
  }
}

module.exports = { compras };
