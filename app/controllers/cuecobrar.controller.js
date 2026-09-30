const pool = require('../database/postgres');

function ident(nombre) {
  return '"' + String(nombre).replace(/"/g, '""') + '"';
}

function normalizar(nombre) {
  return String(nombre).toLowerCase().replace(/[ _-]/g, '');
}

async function cueCobrar(req, res) {
  const inicioConsulta = Date.now();
  let client;
  try {
    client = pool.createDedicatedClient();
    await client.connect();
    await client.query('SET statement_timeout = 30000');

    const tablaResult = await client.query(`
      SELECT table_schema, table_name
      FROM information_schema.tables
      WHERE table_type = 'BASE TABLE'
        AND table_schema NOT IN ('pg_catalog', 'information_schema')
        AND regexp_replace(lower(table_name), '[ _-]', '', 'g') = 'cuentascobrar'
      ORDER BY CASE WHEN table_schema = 'public' THEN 0 ELSE 1 END, table_schema, table_name
      LIMIT 1
    `);

    if (!tablaResult.rows.length) {
      throw new Error('No se encontró la tabla de Cuentas por Cobrar.');
    }

    const { table_schema: esquema, table_name: tabla } = tablaResult.rows[0];
    const columnasResult = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = $1 AND table_name = $2
    `, [esquema, tabla]);

    const columnas = new Map(columnasResult.rows.map(r => [normalizar(r.column_name), r.column_name]));
    const requeridas = {
      numCueCob: 'numcuecob',
      fecInicio: 'fecinicio',
      fecVencim: 'fecvencim',
      numFactur: 'numfactur',
      valPagPar: 'valpagpar',
      estPagCue: 'estpagcue',
      refCueCob: 'refcuecob',
      rucCedCli: 'ruccedcli',
      tipDocume: 'tipdocume'
    };

    const faltantes = Object.entries(requeridas)
      .filter(([, clave]) => !columnas.has(clave))
      .map(([nombre]) => nombre);

    if (faltantes.length) {
      throw new Error(`La tabla ${esquema}.${tabla} no contiene las columnas requeridas: ${faltantes.join(', ')}. Columnas encontradas: ${columnasResult.rows.map(r => r.column_name).join(', ')}`);
    }

    const c = clave => ident(columnas.get(requeridas[clave]));
    const tablaSQL = `${ident(esquema)}.${ident(tabla)}`;

    const sql = `
      SELECT
        cp.${c('rucCedCli')} AS "rucCedCli",
        COALESCE(cl.nomclient, cp.${c('rucCedCli')}::text, '') AS "nomClient",
        cp.${c('fecInicio')} AS "fecInicio",
        cp.${c('fecVencim')} AS "fecVencim",
        cp.${c('numFactur')} AS "numFactur",
        cp.${c('valPagPar')} AS "valPagPar",
        cp.${c('refCueCob')} AS "refCueCob",
        cp.${c('tipDocume')} AS "tipDocume"
      FROM ${tablaSQL} cp
      LEFT JOIN clientes cl ON cl.ruccedcli = cp.${c('rucCedCli')}
      WHERE UPPER(TRIM(cp.${c('estPagCue')}::text)) = 'PENDIENTE'
      ORDER BY COALESCE(cl.nomclient, cp.${c('rucCedCli')}::text), cp.${c('fecInicio')}, cp.${c('numFactur')}
    `;

    console.log(`[CUECOBRAR] Tabla detectada: ${esquema}.${tabla}`);
    const result = await client.query(sql);
    const grupos = [];
    let actual = null;

    for (const row of result.rows) {
      if (!actual || String(actual.rucCedCli) !== String(row.rucCedCli)) {
        actual = {
          rucCedCli: row.rucCedCli,
          nomClient: row.nomClient || '',
          detalles: [],
          saldoTotal: 0
        };
        grupos.push(actual);
      }

      const valor = Number(row.valPagPar) || 0;
      actual.detalles.push({
        fecInicio: row.fecInicio,
        fecVencim: row.fecVencim,
        numFactur: row.numFactur,
        valPagPar: row.valPagPar,
        refCueCob: row.refCueCob,
        tipDocume: row.tipDocume
      });
      actual.saldoTotal += valor;
    }

    const totalGeneral = grupos.reduce((suma, cliente) => suma + cliente.saldoTotal, 0);

    return res.json({
      tiempoMs: Date.now() - inicioConsulta,
      tabla: `${esquema}.${tabla}`,
      totalClientes: grupos.length,
      totalRegistros: grupos.reduce((suma, cliente) => suma + cliente.detalles.length, 0),
      totalGeneral,
      clientes: grupos
    });
  } catch (error) {
    console.error('[CUECOBRAR] Error consultando cuentas por cobrar:', error);
    return res.status(500).json({
      error: 'Error consultando cuentas por cobrar.',
      detail: error.message,
      codigo: error.code,
      tiempoMs: Date.now() - inicioConsulta
    });
  } finally {
    if (client) {
      try { await client.end(); } catch (error) { console.error('[CUECOBRAR] Error cerrando cliente:', error.message); }
    }
  }
}

module.exports = { cueCobrar };
