const { Pool } = require('pg');
const crypto = require('crypto');

function parseTables(value) {
  if (!value) return [];
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

// Configuración por dirección.
// Si se usa el modo antiguo SYNC_TABLES, se mantiene LOCAL -> RAILWAY.
const LOCAL_TO_RAILWAY = parseTables(process.env.SYNC_LOCAL_TO_RAILWAY || process.env.SYNC_TABLES);
const RAILWAY_TO_LOCAL = parseTables(process.env.SYNC_RAILWAY_TO_LOCAL);

const INTERVAL_MS = Math.max(1000, Number(process.env.SYNC_INTERVAL_MS || 10000));
const BATCH_SIZE = Math.max(1, Number(process.env.SYNC_BATCH_SIZE || 200));

if (!process.env.LOCAL_DATABASE_URL || !process.env.RAILWAY_DATABASE_URL) {
  console.error('Faltan LOCAL_DATABASE_URL y/o RAILWAY_DATABASE_URL.');
  process.exit(1);
}

if (!LOCAL_TO_RAILWAY.length && !RAILWAY_TO_LOCAL.length) {
  console.error('No hay tablas configuradas. Use SYNC_LOCAL_TO_RAILWAY y/o SYNC_RAILWAY_TO_LOCAL.');
  process.exit(1);
}

const localPool = new Pool({
  connectionString: process.env.LOCAL_DATABASE_URL,
  connectionTimeoutMillis: 5000,
  keepAlive: true,
});

const railwayPool = new Pool({
  connectionString: process.env.RAILWAY_DATABASE_URL,
  ssl: process.env.RAILWAY_DATABASE_SSL === 'true'
    ? { rejectUnauthorized: false }
    : undefined,
  connectionTimeoutMillis: 10000,
  keepAlive: true,
});

function quoteIdentifier(value) {
  if (!/^[\p{L}_][\p{L}\p{N}_$]*$/u.test(value)) {
    throw new Error(`Identificador inválido: ${value}`);
  }
  return `"${value.replace(/"/g, '""')}"`;
}

function normalizeValue(value) {
  if (value instanceof Date) return value.toISOString();
  if (Buffer.isBuffer(value)) return value.toString('base64');
  return value;
}

function rowHash(row, columns) {
  const payload = columns.map((column) => [
    column.column_name,
    normalizeValue(row[column.column_name]),
  ]);
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

function primaryKeyToken(row, primaryKey) {
  return JSON.stringify(primaryKey.map((column) => normalizeValue(row[column])));
}

async function getTableSchema(client, table) {
  const columnsResult = await client.query(`
    SELECT
      a.attname AS column_name,
      format_type(a.atttypid, a.atttypmod) AS data_type,
      a.attnotnull AS not_null
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = $1
      AND c.relkind IN ('r', 'p')
      AND a.attnum > 0
      AND NOT a.attisdropped
    ORDER BY a.attnum
  `, [table]);

  if (!columnsResult.rows.length) {
    throw new Error(`La tabla public.${table} no existe.`);
  }

  const primaryKeyResult = await client.query(`
    SELECT a.attname
    FROM pg_index i
    CROSS JOIN LATERAL unnest(i.indkey) WITH ORDINALITY AS k(attnum, ord)
    JOIN pg_attribute a
      ON a.attrelid = i.indrelid
     AND a.attnum = k.attnum
    JOIN pg_class c ON c.oid = i.indrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = $1
      AND i.indisprimary
    ORDER BY k.ord
  `, [table]);

  return {
    columns: columnsResult.rows,
    primaryKey: primaryKeyResult.rows.map((row) => row.attname),
  };
}

async function getTargetColumns(client, table) {
  const result = await client.query(`
    SELECT
      a.attname AS column_name,
      format_type(a.atttypid, a.atttypmod) AS data_type,
      a.attnotnull AS not_null
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = $1
      AND c.relkind IN ('r', 'p')
      AND a.attnum > 0
      AND NOT a.attisdropped
    ORDER BY a.attnum
  `, [table]);

  return result.rows;
}

async function ensureTargetTable(client, table, schema) {
  const tableSql = quoteIdentifier(table);
  const columnSql = schema.columns
    .map((column) => `${quoteIdentifier(column.column_name)} ${column.data_type}`)
    .join(',\n');

  await client.query(`CREATE TABLE IF NOT EXISTS ${tableSql} (${columnSql})`);

  let targetColumns = await getTargetColumns(client, table);
  const targetByName = new Map(targetColumns.map((column) => [column.column_name, column]));

  // Agrega columnas nuevas que existan en el origen y falten en el destino.
  // Se agregan inicialmente como NULL para permitir que las filas existentes
  // reciban sus valores durante el UPSERT. Las restricciones NOT NULL del
  // origen se aplican después de sincronizar los datos.
  for (const sourceColumn of schema.columns) {
    const targetColumn = targetByName.get(sourceColumn.column_name);

    if (!targetColumn) {
      await client.query(
        `ALTER TABLE ${tableSql} ADD COLUMN ${quoteIdentifier(sourceColumn.column_name)} ${sourceColumn.data_type}`
      );
      console.log(`[SYNC] Columna nueva en ${table}: ${sourceColumn.column_name} ${sourceColumn.data_type}`);
      continue;
    }

    if (targetColumn.data_type !== sourceColumn.data_type) {
      throw new Error(
        `La columna ${sourceColumn.column_name} de public.${table} tiene tipo diferente en el destino: ` +
        `${targetColumn.data_type} != ${sourceColumn.data_type}.`
      );
    }
  }

  targetColumns = await getTargetColumns(client, table);
  const targetNames = new Set(targetColumns.map((column) => column.column_name));
  const missingColumns = schema.columns.filter((column) => !targetNames.has(column.column_name));

  if (missingColumns.length) {
    throw new Error(`No fue posible crear todas las columnas nuevas de public.${table}.`);
  }

  if (!schema.primaryKey.length) {
    throw new Error(`La tabla public.${table} no tiene clave primaria. El modo incremental requiere PRIMARY KEY.`);
  }

  const primaryKeyExists = await client.query(`
    SELECT 1
    FROM pg_index i
    JOIN pg_class t ON t.oid = i.indrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = $1
      AND i.indisprimary
  `, [table]);

  if (!primaryKeyExists.rowCount) {
    const constraintName = `pk_sync_${table}`;
    await client.query(
      `ALTER TABLE ${tableSql} ADD CONSTRAINT ${quoteIdentifier(constraintName)} PRIMARY KEY (${schema.primaryKey.map(quoteIdentifier).join(', ')})`
    );
  }
}

async function applySourceNotNullConstraints(client, table, schema) {
  const tableSql = quoteIdentifier(table);

  for (const column of schema.columns) {
    if (!column.not_null || schema.primaryKey.includes(column.column_name)) continue;

    const targetColumns = await getTargetColumns(client, table);
    const targetColumn = targetColumns.find((item) => item.column_name === column.column_name);

    if (targetColumn && !targetColumn.not_null) {
      await client.query(
        `ALTER TABLE ${tableSql} ALTER COLUMN ${quoteIdentifier(column.column_name)} SET NOT NULL`
      );
    }
  }
}

async function loadRows(client, table) {
  const result = await client.query(`SELECT * FROM ${quoteIdentifier(table)}`);
  return result.rows;
}

async function upsertBatch(client, table, schema, rows) {
  if (!rows.length) return;

  const tableSql = quoteIdentifier(table);
  const columnSql = schema.columns.map((column) => quoteIdentifier(column.column_name)).join(', ');
  const conflictSql = schema.primaryKey.map(quoteIdentifier).join(', ');
  const updateColumns = schema.columns
    .filter((column) => !schema.primaryKey.includes(column.column_name))
    .map((column) => `${quoteIdentifier(column.column_name)} = EXCLUDED.${quoteIdentifier(column.column_name)}`)
    .join(', ');

  const values = [];
  const tuples = rows.map((row, rowIndex) => {
    const placeholders = schema.columns.map((column, columnIndex) => {
      values.push(row[column.column_name]);
      return `$${rowIndex * schema.columns.length + columnIndex + 1}`;
    });
    return `(${placeholders.join(', ')})`;
  }).join(', ');

  const action = updateColumns
    ? `DO UPDATE SET ${updateColumns}`
    : 'DO NOTHING';

  await client.query(
    `INSERT INTO ${tableSql} (${columnSql}) VALUES ${tuples} ON CONFLICT (${conflictSql}) ${action}`,
    values
  );
}

async function deleteMissingRows(client, table, schema, sourceKeys) {
  const targetRows = await loadRows(client, table);
  let deleted = 0;

  for (const row of targetRows) {
    const token = primaryKeyToken(row, schema.primaryKey);
    if (sourceKeys.has(token)) continue;

    const where = schema.primaryKey
      .map((column, index) => `${quoteIdentifier(column)} IS NOT DISTINCT FROM $${index + 1}`)
      .join(' AND ');
    const values = schema.primaryKey.map((column) => row[column]);
    const result = await client.query(`DELETE FROM ${quoteIdentifier(table)} WHERE ${where}`, values);
    deleted += result.rowCount;
  }

  return deleted;
}

async function syncDirection(source, target, table, direction) {
  const sourceSchema = await getTableSchema(source, table);
  await ensureTargetTable(target, table, sourceSchema);

  const sourceRows = await loadRows(source, table);
  const sourceKeys = new Set(sourceRows.map((row) => primaryKeyToken(row, sourceSchema.primaryKey)));
  const targetRows = await loadRows(target, table);
  const targetHashes = new Map(
    targetRows.map((row) => [
      primaryKeyToken(row, sourceSchema.primaryKey),
      rowHash(row, sourceSchema.columns),
    ])
  );

  const changedRows = sourceRows.filter((row) => {
    const key = primaryKeyToken(row, sourceSchema.primaryKey);
    return targetHashes.get(key) !== rowHash(row, sourceSchema.columns);
  });

  for (let offset = 0; offset < changedRows.length; offset += BATCH_SIZE) {
    await upsertBatch(
      target,
      table,
      sourceSchema,
      changedRows.slice(offset, offset + BATCH_SIZE)
    );
  }

  const deleted = await deleteMissingRows(target, table, sourceSchema, sourceKeys);

  // Después de que las filas del origen ya fueron copiadas y las filas
  // sobrantes eliminadas, podemos aplicar NOT NULL de forma segura.
  await applySourceNotNullConstraints(target, table, sourceSchema);

  return {
    direction,
    table,
    rows: sourceRows.length,
    changed: changedRows.length,
    deleted,
  };
}

async function syncOnce() {
  const started = Date.now();
  const local = await localPool.connect();
  const railway = await railwayPool.connect();

  try {
    // Cada dirección usa una transacción independiente. Así una tabla con
    // problemas no deja cambios parciales dentro de su propia dirección.
    const results = [];

    if (LOCAL_TO_RAILWAY.length) {
      await local.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
      await railway.query('BEGIN');

      try {
        for (const table of LOCAL_TO_RAILWAY) {
          results.push(await syncDirection(local, railway, table, 'LOCAL→RAILWAY'));
        }
        await railway.query('COMMIT');
        await local.query('COMMIT');
      } catch (error) {
        try { await local.query('ROLLBACK'); } catch (_) {}
        try { await railway.query('ROLLBACK'); } catch (_) {}
        throw new Error(`LOCAL→RAILWAY: ${error.message}`);
      }
    }

    if (RAILWAY_TO_LOCAL.length) {
      await railway.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
      await local.query('BEGIN');

      try {
        for (const table of RAILWAY_TO_LOCAL) {
          results.push(await syncDirection(railway, local, table, 'RAILWAY→LOCAL'));
        }
        await local.query('COMMIT');
        await railway.query('COMMIT');
      } catch (error) {
        try { await railway.query('ROLLBACK'); } catch (_) {}
        try { await local.query('ROLLBACK'); } catch (_) {}
        throw new Error(`RAILWAY→LOCAL: ${error.message}`);
      }
    }

    const summary = results
      .map((item) => `${item.direction} ${item.table}=${item.rows} filas, ${item.changed} cambios, ${item.deleted} eliminadas`)
      .join(' | ');

    console.log(`[SYNC] OK en ${Date.now() - started} ms :: ${summary}`);
  } catch (error) {
    console.error(`[SYNC] ERROR después de ${Date.now() - started} ms: ${error.message}`);
  } finally {
    local.release();
    railway.release();
  }
}

let running = false;

async function tick() {
  if (running) return;
  running = true;
  try {
    await syncOnce();
  } finally {
    running = false;
  }
}

console.log(`[SYNC] LOCAL→RAILWAY: ${LOCAL_TO_RAILWAY.length ? LOCAL_TO_RAILWAY.join(', ') : 'ninguna'}`);
console.log(`[SYNC] RAILWAY→LOCAL: ${RAILWAY_TO_LOCAL.length ? RAILWAY_TO_LOCAL.join(', ') : 'ninguna'}`);
console.log(`[SYNC] Intervalo: ${INTERVAL_MS} ms`);
console.log(`[SYNC] Lote: ${BATCH_SIZE} filas`);

tick();
setInterval(tick, INTERVAL_MS);

async function shutdown(signal) {
  console.log(`[SYNC] Cerrando por ${signal}...`);
  await Promise.allSettled([localPool.end(), railwayPool.end()]);
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
