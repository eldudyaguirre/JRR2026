const pool = require('../database/postgres');

const CAMPOS_OCULTOS = new Set([
  'tipopro', 'tipprov', 'tipidprov', 'tpidprov', 'areprovee', 'numserfac', 'codcuefuebie', 'codcueivabie',
  'codcuefueser', 'codcueivaser', 'infespeci', 'numautori', 'feccaduci', 'chependie',
  'creadopor', 'creadoen', 'estado', 'antpersonal', 'antperson', 'limcredit', 'salantici', 'salnotcre',
  'fecultpag', 'numdiacre', 'codcuecon', 'porretfuebie', 'porretivabie', 'porretfueser',
  'porretivaser', 'salvencid1', 'salvencid2', 'salvencid3', 'salvencid4', 'codcueant', 'codcuencr'
]);

const CANDIDATOS_RUC = ['ruccedpro', 'ruc', 'rucced', 'ruc_ced', 'identificacion', 'cedula'];
const CANDIDATOS_NOMBRE = ['nomprovee', 'nomprove', 'nomprov', 'nompro', 'nomproveedor', 'nombres', 'nombre', 'razonsocial', 'razon_social'];

function ident(valor) {
  return '"' + String(valor).replace(/"/g, '""') + '"';
}

async function obtenerMetadatos(client) {
  const tablas = await client.query(`
    SELECT table_schema, table_name
    FROM information_schema.tables
    WHERE table_type = 'BASE TABLE'
      AND lower(table_name) = 'proveedores'
    ORDER BY CASE WHEN table_schema = 'public' THEN 0 ELSE 1 END
    LIMIT 1
  `);

  if (!tablas.rows.length) {
    throw new Error('No existe la tabla proveedores en la base de datos conectada.');
  }

  const { table_schema: esquema, table_name: tabla } = tablas.rows[0];
  const columnasResult = await client.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = $1 AND table_name = $2
    ORDER BY ordinal_position
  `, [esquema, tabla]);

  const disponibles = columnasResult.rows.map(r => r.column_name);
  const buscar = candidatos => disponibles.find(col => candidatos.includes(col.toLowerCase()));
  const colRuc = buscar(CANDIDATOS_RUC);
  const colNombre = buscar(CANDIDATOS_NOMBRE);
  const colSaldo = disponibles.find(col => col.toLowerCase() === 'salcuenta');

  if (!colRuc || !colNombre) {
    throw new Error(
      `No se encontraron las columnas necesarias en proveedores. RUC: ${colRuc || 'no encontrada'}, nombres: ${colNombre || 'no encontrada'}.`
    );
  }

  return { esquema, tabla, disponibles, colRuc, colNombre, colSaldo };
}

async function obtenerMetadatosCuentasPagar(client) {
  const tablaResult = await client.query(`
    SELECT table_schema, table_name
    FROM information_schema.tables
    WHERE table_type = 'BASE TABLE'
      AND table_schema NOT IN ('pg_catalog', 'information_schema')
      AND regexp_replace(lower(table_name), '[ _-]', '', 'g') = 'cuentapagar'
    ORDER BY CASE WHEN table_schema = 'public' THEN 0 ELSE 1 END, table_schema, table_name
    LIMIT 1
  `);

  if (!tablaResult.rows.length) return null;

  const { table_schema: esquema, table_name: tabla } = tablaResult.rows[0];
  const columnas = new Map(
    (await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = $1 AND table_name = $2
    `, [esquema, tabla])).rows.map(r => [String(r.column_name).toLowerCase(), r.column_name])
  );

  const requeridas = ['fecinicio', 'fecvencim', 'numfaccom', 'valpagpar', 'estpagcue', 'ruccedpro'];
  if (requeridas.some(campo => !columnas.has(campo))) return null;

  const ref = columnas.get('refcuepagar') || columnas.get('refcuepag') || null;
  return {
    tablaSQL: `${ident(esquema)}.${ident(tabla)}`,
    c: clave => columnas.get(clave),
    ref
  };
}

async function obtenerFacturasPendientes(client, ruc) {
  const meta = await obtenerMetadatosCuentasPagar(client);
  if (!meta) return [];

  const referencia = meta.ref ? `cp.${ident(meta.ref)}` : `''`;
  const result = await client.query(`
    SELECT
      cp.${ident(meta.c('fecinicio'))} AS "fecInicio",
      cp.${ident(meta.c('fecvencim'))} AS "fecVencim",
      cp.${ident(meta.c('numfaccom'))} AS "numFactur",
      cp.${ident(meta.c('valpagpar'))} AS "valPagPar",
      ${referencia} AS "refCuePag"
    FROM ${meta.tablaSQL} cp
    WHERE CAST(cp.${ident(meta.c('ruccedpro'))} AS text) = $1
      AND UPPER(TRIM(cp.${ident(meta.c('estpagcue'))}::text)) = 'PENDIENTE'
    ORDER BY cp.${ident(meta.c('fecvencim'))}, cp.${ident(meta.c('fecinicio'))}, cp.${ident(meta.c('numfaccom'))}
  `, [ruc]);

  return result.rows;
}

async function proveedores(req, res) {
  let client;
  try {
    client = pool.createDedicatedClient();
    await client.connect();
    await client.query('SET statement_timeout = 30000');

    const meta = await obtenerMetadatos(client);
    const q = String(req.query.q || '').trim();
    const limite = Math.min(Math.max(Number(req.query.limite) || 500, 1), 2000);
    const valores = [];
    let filtro = '';

    if (q) {
      valores.push(`%${q}%`);
      const p = `$${valores.length}`;
      filtro = `WHERE CAST(${ident(meta.colRuc)} AS text) ILIKE ${p} OR CAST(${ident(meta.colNombre)} AS text) ILIKE ${p}`;
    }

    const result = await client.query(`
      SELECT
        CAST(${ident(meta.colRuc)} AS text) AS "ruc",
        CAST(${ident(meta.colNombre)} AS text) AS "nombres"
      FROM ${ident(meta.esquema)}.${ident(meta.tabla)}
      ${filtro}
      ORDER BY ${ident(meta.colNombre)} ASC NULLS LAST
      LIMIT ${limite}
    `, valores);

    return res.json({ total: result.rows.length, proveedores: result.rows });
  } catch (error) {
    console.error('[PROVEEDORES] Error consultando proveedores:', error);
    return res.status(500).json({
      error: 'Error consultando proveedores.',
      detail: error.message
    });
  } finally {
    if (client) {
      try { await client.end(); } catch (error) {
        console.error('[PROVEEDORES] Error cerrando cliente:', error.message);
      }
    }
  }
}

async function proveedorDetalle(req, res) {
  let client;
  try {
    const ruc = String(req.params.ruc || '').trim();
    if (!ruc) return res.status(400).json({ error: 'RUC/Cédula requerido.' });

    client = pool.createDedicatedClient();
    await client.connect();
    await client.query('SET statement_timeout = 30000');

    const meta = await obtenerMetadatos(client);
    const columnasVisibles = meta.disponibles.filter(campo =>
      !CAMPOS_OCULTOS.has(campo.toLowerCase()) && campo.toLowerCase() !== 'salcuenta'
    );

    const result = await client.query(`
      SELECT ${columnasVisibles.map(ident).join(', ')}
      FROM ${ident(meta.esquema)}.${ident(meta.tabla)}
      WHERE CAST(${ident(meta.colRuc)} AS text) = $1
      LIMIT 1
    `, [ruc]);

    if (!result.rows.length) return res.status(404).json({ error: 'Proveedor no encontrado.' });

    const proveedor = result.rows[0];
    const facturasPendientes = await obtenerFacturasPendientes(client, ruc);
    let saldoCuenta = meta.colSaldo ? Number((await client.query(`
      SELECT ${ident(meta.colSaldo)}
      FROM ${ident(meta.esquema)}.${ident(meta.tabla)}
      WHERE CAST(${ident(meta.colRuc)} AS text) = $1
      LIMIT 1
    `, [ruc])).rows[0]?.[meta.colSaldo]) : NaN;

    if (!Number.isFinite(saldoCuenta)) {
      saldoCuenta = facturasPendientes.reduce((suma, factura) => suma + (Number(factura.valPagPar) || 0), 0);
    }

    return res.json({
      proveedor,
      columnas: columnasVisibles,
      saldoCuenta,
      facturasPendientes,
      totalFacturasPendientes: facturasPendientes.length
    });
  } catch (error) {
    console.error('[PROVEEDORES] Error consultando detalle:', error);
    return res.status(500).json({
      error: 'Error consultando detalle del proveedor.',
      detail: error.message
    });
  } finally {
    if (client) {
      try { await client.end(); } catch (error) {
        console.error('[PROVEEDORES] Error cerrando cliente:', error.message);
      }
    }
  }
}

module.exports = { proveedores, proveedorDetalle };
