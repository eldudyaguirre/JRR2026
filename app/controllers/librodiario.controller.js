const pool = require('../database/postgres');

function ident(nombre) {
  return '"' + String(nombre).replace(/"/g, '""') + '"';
}

function normalizar(nombre) {
  return String(nombre).toLowerCase().replace(/[ _-]/g, '');
}

function fechaValida(valor) {
  return /^\d{4}-\d{2}-\d{2}$/.test(valor) && !Number.isNaN(Date.parse(valor + 'T00:00:00Z'));
}

const aliases = {
  fecha: ['fecha','fecasiento','fechaasiento','fecmov','fechamov','feccontab','fechacontable','fecemi','fechaemision'],
  numAsiento: ['numasiento','numeroasiento','nroasiento','asiento','numdiario','numerodiario','numcomprobante'],
  codCuenta: ['codcuenta','codcta','cuenta','codigocta'],
  detalle: ['detalle','glosa','concepto','descripcion','descrip','detalleasiento'],
  debe: ['debe','debit','valordebe','debecontable','debeasiento'],
  haber: ['haber','credit','valorhaber','habercontable','haberasiento']
};

function buscarColumna(columnas, claves) {
  for (const clave of claves) {
    const normalizada = normalizar(clave);
    if (columnas.has(normalizada)) return columnas.get(normalizada);
  }
  return null;
}

async function detectarTabla(client) {
  const result = await client.query(
    "SELECT table_schema, table_name, column_name " +
    "FROM information_schema.columns " +
    "WHERE table_schema NOT IN ('pg_catalog','information_schema','pg_toast') " +
    "ORDER BY table_schema, table_name, ordinal_position"
  );

  const tablas = new Map();
  for (const row of result.rows) {
    const key = row.table_schema + '.' + row.table_name;
    if (!tablas.has(key)) {
      tablas.set(key, {schema: row.table_schema, table: row.table_name, columnas: new Map()});
    }
    tablas.get(key).columnas.set(normalizar(row.column_name), row.column_name);
  }

  const candidatos = [];
  for (const t of tablas.values()) {
    const m = {};
    for (const campo of Object.keys(aliases)) m[campo] = buscarColumna(t.columnas, aliases[campo]);

    const requeridos = ['fecha','codCuenta','detalle','debe','haber'];
    if (requeridos.filter(x => m[x]).length < 5) continue;

    let score = 50 + (m.numAsiento ? 4 : 0);
    const nombre = normalizar(t.table);
    if (nombre.includes('diario')) score += 20;
    if (nombre.includes('asiento')) score += 18;
    if (nombre.includes('movcont')) score += 15;
    if (nombre.includes('movim')) score += 8;

    candidatos.push({schema:t.schema, table:t.table, columnasMap:m, score});
  }

  candidatos.sort((a,b) => b.score - a.score);
  return candidatos[0] || null;
}

async function libroDiario(req, res) {
  const inicioConsulta = Date.now();
  let client;

  try {
    const ahora = new Date();
    const primerDia = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
    const ultimoDia = new Date(ahora.getFullYear(), ahora.getMonth() + 1, 0);

    const inicio = req.query.inicio || primerDia.toISOString().slice(0,10);
    const fin = req.query.fin || ultimoDia.toISOString().slice(0,10);
    const limite = Math.min(5000, Math.max(100, Number(req.query.limite) || 2000));

    if (!fechaValida(inicio) || !fechaValida(fin) || inicio > fin) {
      return res.status(400).json({error:'Rango de fechas inválido. Use YYYY-MM-DD.'});
    }

    client = pool.createDedicatedClient();
    await client.connect();
    await client.query('SET statement_timeout = 30000');

    const fuente = await detectarTabla(client);
    if (!fuente) {
      return res.status(404).json({
        error:'No se encontró una tabla compatible con el Libro Diario.',
        detalle:'Se requiere fecha, código de cuenta, detalle, debe y haber.'
      });
    }

    const t = ident(fuente.schema) + '.' + ident(fuente.table);
    const c = fuente.columnasMap;
    const numExpr = c.numAsiento ? ident(c.numAsiento) + '::text' : 'NULL::text';

    const sql =
      'SELECT ' +
      ident(c.fecha) + '::date AS "fecha", ' +
      numExpr + ' AS "numAsiento", ' +
      ident(c.codCuenta) + '::text AS "codCuenta", ' +
      ident(c.detalle) + '::text AS "detalle", ' +
      'COALESCE(' + ident(c.debe) + '::numeric, 0)::text AS "debe", ' +
      'COALESCE(' + ident(c.haber) + '::numeric, 0)::text AS "haber" ' +
      'FROM ' + t + ' ' +
      'WHERE ' + ident(c.fecha) + '::date >= $1::date ' +
      'AND ' + ident(c.fecha) + '::date <= $2::date ' +
      'ORDER BY ' + ident(c.fecha) + '::date, ' + numExpr + ', ' + ident(c.codCuenta) + '::text ' +
      'LIMIT $3';

    const result = await client.query(sql, [inicio, fin, limite]);

    return res.json({
      inicio, fin, limite, total:result.rows.length,
      tabla:fuente.schema + '.' + fuente.table,
      columnas:c, tiempoMs:Date.now() - inicioConsulta,
      movimientos:result.rows
    });
  } catch (error) {
    console.error('[LIBRODIARIO] Error:', error);
    return res.status(500).json({
      error:'Error consultando el Libro Diario.',
      detail:error.message, codigo:error.code,
      tiempoMs:Date.now() - inicioConsulta
    });
  } finally {
    if (client) {
      try { await client.end(); } catch (_) {}
    }
  }
}

module.exports = {libroDiario};
