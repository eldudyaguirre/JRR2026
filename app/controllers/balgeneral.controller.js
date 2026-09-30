const pool = require('../database/postgres');

function ident(nombre) {
  return '"' + String(nombre).replace(/"/g, '""') + '"';
}

function normalizar(nombre) {
  return String(nombre).toLowerCase().replace(/[ _-]/g, '');
}

async function encontrarTabla(client, nombreNormalizado) {
  const result = await client.query(`
    SELECT table_schema, table_name
    FROM information_schema.tables
    WHERE table_type = 'BASE TABLE'
      AND table_schema NOT IN ('pg_catalog', 'information_schema')
      AND regexp_replace(lower(table_name), '[ _-]', '', 'g') = $1
    ORDER BY CASE WHEN table_schema = 'public' THEN 0 ELSE 1 END, table_schema, table_name
    LIMIT 1
  `, [nombreNormalizado]);
  return result.rows[0] || null;
}

async function columnasTabla(client, tabla) {
  const result = await client.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = $1 AND table_name = $2
  `, [tabla.table_schema, tabla.table_name]);
  return new Map(result.rows.map(r => [normalizar(r.column_name), r.column_name]));
}

async function leerCuentas(client, tabla, limite, mes, anio, historica) {
  const columnas = await columnasTabla(client, tabla);
  const requeridas = ['codcuenta', 'nomcuenta', 'salfinper'];
  if (historica) requeridas.push('mes', 'año');

  const faltantes = requeridas.filter(k => !columnas.has(k));
  if (faltantes.length) {
    throw new Error(`La tabla ${tabla.table_schema}.${tabla.table_name} no contiene: ${faltantes.join(', ')}. Columnas encontradas: ${Array.from(columnas.values()).join(', ')}`);
  }

  const c = k => ident(columnas.get(k));
  const tablaSQL = `${ident(tabla.table_schema)}.${ident(tabla.table_name)}`;
  const filtros = [
    `length(trim(cp.${c('codcuenta')}::text)) <= $1`,
    `cast(substring(trim(cp.${c('codcuenta')}::text),1,1) as integer) <= 3`,
    `COALESCE(cp.${c('salfinper')},0) <> 0`
  ];
  const params = [limite];

  if (historica) {
    params.push(String(mes).padStart(2, '0'), String(anio));
    filtros.push(`lpad(trim(cp.${c('mes')}::text),2,'0') = $${params.length - 1}`);
    filtros.push(`trim(cp.${c('año')}::text) = $${params.length}`);
  }

  const result = await client.query(`
    SELECT
      trim(cp.${c('codcuenta')}::text) AS "codCuenta",
      cp.${c('nomcuenta')} AS "nomCuenta",
      COALESCE(cp.${c('salfinper')},0)::numeric AS "salFinPer"
    FROM ${tablaSQL} cp
    WHERE ${filtros.join(' AND ')}
    ORDER BY trim(cp.${c('codcuenta')}::text)
  `, params);

  return result.rows;
}

function clasificar(rows) {
  const activo = [];
  const pasivo = [];
  const patrimonio = [];

  for (const row of rows) {
    const cuenta = {
      codCuenta: row.codCuenta,
      nomCuenta: row.nomCuenta || '',
      salFinPer: Number(row.salFinPer) || 0,
      nivel: Math.max(0, Math.ceil(String(row.codCuenta).length / 2) - 1)
    };
    const tipo = String(row.codCuenta).charAt(0);
    if (tipo === '1') activo.push(cuenta);
    else if (tipo === '2') pasivo.push(cuenta);
    else if (tipo === '3') patrimonio.push(cuenta);
  }

  const total = lista => lista.filter(x => String(x.codCuenta).length === 1).reduce((s, x) => s + x.salFinPer, 0);
  const totalActivo = total(activo);
  const totalPasivo = total(pasivo);
  const totalPatrimonio = total(patrimonio);
  const totalPasivoPatrimonio = totalPasivo + totalPatrimonio;
  const resultadoEjercicio = totalActivo - totalPasivoPatrimonio;

  return {
    activo, pasivo, patrimonio,
    totalActivo, totalPasivo, totalPatrimonio,
    totalPasivoPatrimonio, resultadoEjercicio
  };
}

async function balanceGeneral(req, res) {
  const mes = Math.min(12, Math.max(1, Number(req.query.mes) || new Date().getMonth() + 1));
  const anio = Number(req.query.anio) || new Date().getFullYear();
  const nivelTexto = String(req.query.nivel || 'Nivel 6');
  const nivel = Math.min(6, Math.max(1, Number(nivelTexto.replace(/\D/g, '')) || 6));
  const limite = nivel === 1 ? 1 : nivel === 2 ? 2 : nivel === 3 ? 4 : nivel === 4 ? 6 : nivel === 5 ? 8 : 10;

  let client;
  try {
    client = pool.createDedicatedClient();
    await client.connect();
    await client.query('SET statement_timeout = 30000');

    const plan = await encontrarTabla(client, 'plancuentas');
    const historica = await encontrarTabla(client, 'hissaldos');
    if (!plan) throw new Error('No se encontró la tabla PlanCuentas.');
    if (!historica) throw new Error('No se encontró la tabla HisSaldos.');

    // El período actual usa PlanCuentas; los períodos anteriores usan HisSaldos.
    const ahora = new Date();
    const esActual = mes === ahora.getMonth() + 1 && anio === ahora.getFullYear();
    const tabla = esActual ? plan : historica;
    const rows = await leerCuentas(client, tabla, limite, mes, anio, !esActual);
    const data = clasificar(rows);

    return res.json({
      mes: String(mes).padStart(2, '0'),
      anio: String(anio),
      nivel: `Nivel ${nivel}`,
      limite,
      tabla: `${tabla.table_schema}.${tabla.table_name}`,
      esActual,
      ...data
    });
  } catch (error) {
    console.error('[BALGENERAL] Error:', error);
    return res.status(500).json({ error: 'Error consultando Balance General.', detail: error.message, codigo: error.code });
  } finally {
    if (client) {
      try { await client.end(); } catch (_) {}
    }
  }
}

module.exports = { balanceGeneral };
