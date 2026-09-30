const pool = require('../database/postgres');

function fechaValida(valor) {
  return /^\d{4}-\d{2}-\d{2}$/.test(valor) && !Number.isNaN(Date.parse(`${valor}T00:00:00Z`));
}

async function ventas(req, res) {
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

    const sql = `
      SELECT
        f.nomcli AS "cliente",
        f.ruccedcli AS "rucCed",
        f.fecfactur AS "fecha",
        f.numfactur AS "factura",
        f.autorizacion AS "autorizacion",
        COALESCE(f.totsiniva, 0)::text AS "subtotalSinIva",
        COALESCE(f.totconiva, 0)::text AS "subtotalConIva",
        COALESCE(f.valivafac, 0)::text AS "iva",
        COALESCE(f.totfactur, 0)::text AS "total",
        COALESCE(f.valretiva, 0)::text AS "retIva",
        COALESCE(f.valretrenta, 0)::text AS "retRenta",
        f.numretencion AS "numRetencion"
      FROM facturas f
      WHERE f.fecfactur >= DATE '${inicio}'
        AND f.fecfactur <= DATE '${fin}'
        AND f.estprofac = 'PROCESADA'
      ORDER BY f.fecfactur DESC, f.numfactur DESC
    `;

    const result = await client.query(sql);

    return res.json({
      inicio,
      fin,
      tiempoMs: Date.now() - inicioConsulta,
      total: result.rows.length,
      ventas: result.rows
    });
  } catch (error) {
    console.error('[VENTAS] Error consultando facturas:', error);
    return res.status(500).json({
      error: 'Error consultando ventas.',
      detail: error.message,
      codigo: error.code,
      tiempoMs: Date.now() - inicioConsulta
    });
  } finally {
    if (client) {
      try { await client.end(); } catch (error) { console.error('[VENTAS] Error cerrando cliente:', error.message); }
    }
  }
}

module.exports = { ventas };
