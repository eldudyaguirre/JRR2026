const pool = require('../database/postgres');

function ident(nombre) {
  return '"' + String(nombre).replace(/"/g, '""') + '"';
}

function normalizar(nombre) {
  return String(nombre).toLowerCase().replace(/[ _-]/g, '');
}

async function cuePagar(req, res) {
  const inicioConsulta = Date.now();
  let client;
  try {
    client = pool.createDedicatedClient();
    await client.connect();
    await client.query('SET statement_timeout = 30000');

    // Detectamos el nombre real de la tabla porque PostgreSQL distingue
    // entre nombres con/sin comillas y puede conservar mayúsculas o espacios.
    const tablaResult = await client.query(`
      SELECT table_schema, table_name
      FROM information_schema.tables
      WHERE table_type = 'BASE TABLE'
        AND table_schema NOT IN ('pg_catalog', 'information_schema')
        AND regexp_replace(lower(table_name), '[ _-]', '', 'g') = 'cuentapagar'
      ORDER BY CASE WHEN table_schema = 'public' THEN 0 ELSE 1 END, table_schema, table_name
      LIMIT 1
    `);

    if (!tablaResult.rows.length) {
      throw new Error('No se encontró la tabla de Cuentas por Pagar.');
    }

    const { table_schema: esquema, table_name: tabla } = tablaResult.rows[0];

    const columnasResult = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = $1
        AND table_name = $2
    `, [esquema, tabla]);

    const columnas = new Map(
      columnasResult.rows.map(r => [normalizar(r.column_name), r.column_name])
    );

    const requeridas = {
      rucCedPro: 'ruccedpro',
      fecInicio: 'fecinicio',
      fecVencim: 'fecvencim',
      refCuePag: 'refcuepag',
      valPagPar: 'valpagpar',
      estPagCue: 'estpagcue'
    };

    const faltantes = Object.entries(requeridas)
      .filter(([, clave]) => !columnas.has(clave))
      .map(([nombre]) => nombre);

    if (faltantes.length) {
      throw new Error(
        `La tabla ${esquema}.${tabla} no contiene las columnas requeridas: ${faltantes.join(', ')}. ` +
        `Columnas encontradas: ${columnasResult.rows.map(r => r.column_name).join(', ')}`
      );
    }

    const c = clave => ident(columnas.get(requeridas[clave]));
    const tablaSQL = `${ident(esquema)}.${ident(tabla)}`;

    const sql = `
      SELECT
        cp.${c('rucCedPro')} AS "rucCedPro",
        COALESCE(p.nomprovee, cp.${c('rucCedPro')}::text, '') AS "nomProvee",
        cp.${c('fecInicio')} AS "fecInicio",
        cp.${c('fecVencim')} AS "fecVencim",
        cp.${c('refCuePag')} AS "refCuePag",
        COALESCE(cp.${c('valPagPar')}, 0)::text AS "valPagPar"
      FROM ${tablaSQL} cp
      LEFT JOIN proveedores p ON p.ruccedpro = cp.${c('rucCedPro')}
      WHERE UPPER(TRIM(cp.${c('estPagCue')}::text)) = 'PENDIENTE'
      ORDER BY COALESCE(p.nomprovee, cp.${c('rucCedPro')}::text), cp.${c('fecInicio')}, cp.${c('refCuePag')}
    `;

    console.log(`[CUEPAGAR] Tabla detectada: ${esquema}.${tabla}`);
    console.log(`[CUEPAGAR] SQL: ${sql}`);

    const result = await client.query(sql);
    const grupos = [];
    let actual = null;

    for (const row of result.rows) {
      if (!actual || actual.rucCedPro !== row.rucCedPro) {
        actual = {
          rucCedPro: row.rucCedPro,
          nomProvee: row.nomProvee || '',
          detalles: [],
          saldoTotal: 0
        };
        grupos.push(actual);
      }

      const valor = Number(row.valPagPar) || 0;
      actual.detalles.push({
        fecInicio: row.fecInicio,
        fecVencim: row.fecVencim,
        refCuePag: row.refCuePag,
        valPagPar: row.valPagPar
      });
      actual.saldoTotal += valor;
    }

    const totalGeneral = grupos.reduce((suma, proveedor) => suma + proveedor.saldoTotal, 0);

    return res.json({
      tiempoMs: Date.now() - inicioConsulta,
      tabla: `${esquema}.${tabla}`,
      totalProveedores: grupos.length,
      totalRegistros: grupos.reduce((suma, proveedor) => suma + proveedor.detalles.length, 0),
      totalGeneral,
      proveedores: grupos
    });
  } catch (error) {
    console.error('[CUEPAGAR] Error consultando cuentas por pagar:', error);
    return res.status(500).json({
      error: 'Error consultando cuentas por pagar.',
      detail: error.message,
      codigo: error.code,
      tiempoMs: Date.now() - inicioConsulta
    });
  } finally {
    if (client) {
      try { await client.end(); } catch (error) { console.error('[CUEPAGAR] Error cerrando cliente:', error.message); }
    }
  }
}

module.exports = { cuePagar };
