# AL2026 Sync Worker

Worker de Windows para mantener una copia de PostgreSQL local en PostgreSQL de Railway.

## Flujo

`PostgreSQL local -> worker -> PostgreSQL Railway -> API web`

La base LOCAL es la fuente maestra. Railway contiene una copia para que la aplicacion web consulte los datos sin depender de Tailscale.

## Tablas administrativas iniciales

- `clientes`
- `proveedores`
- `cuentascobrar`
- `cuentapagar`
- `ventas`
- `compras`
- `comprasnv`
- `trabajadores`

## Sincronizacion incremental

El worker ya no borra y vuelve a insertar toda la tabla en cada ciclo.

En cada revision:

1. Lee la fotografia consistente de la base LOCAL.
2. Obtiene la clave primaria de cada tabla.
3. Calcula una huella SHA-256 del contenido de cada fila.
4. Inserta las filas nuevas.
5. Actualiza solamente las filas modificadas.
6. Elimina de Railway las filas que ya no existen en LOCAL.
7. Confirma todos los cambios de Railway en una sola transaccion.

Por eso, aunque el worker revise las tablas periodicamente, solamente se transfieren a Railway las filas que realmente cambiaron.

> Importante: el modo incremental requiere que cada tabla sincronizada tenga una `PRIMARY KEY`. El worker no modifica automaticamente la estructura de la base LOCAL. Si una tabla no tiene clave primaria, ese ciclo mostrara el error y hara rollback en Railway.

## Configuracion

Definir estas variables en el servidor local:

```text
LOCAL_DATABASE_URL=postgresql://...
RAILWAY_DATABASE_URL=postgresql://...
RAILWAY_DATABASE_SSL=true
SYNC_TABLES=clientes,proveedores,cuentascobrar,cuentapagar,ventas,compras,comprasnv,trabajadores
SYNC_INTERVAL_MS=10000
SYNC_BATCH_SIZE=200
```

`RAILWAY_DATABASE_URL` debe ser la conexion publica/TCP de PostgreSQL de Railway cuando el worker se ejecuta fuera de Railway.

## Ejecucion

Desde la raiz del proyecto:

```text
npm install
npm run sync
```

El worker mostrara algo parecido a:

```text
[SYNC] Tablas: clientes, proveedores, cuentascobrar, cuentapagar, ventas, compras, comprasnv, trabajadores
[SYNC] Intervalo: 10000 ms
[SYNC] Lote: 200 filas
[SYNC] OK en 420 ms :: clientes=1200 filas, 0 cambios, 0 eliminadas | cuentascobrar=850 filas, 2 cambios, 1 eliminada
```

## Operacion recomendada

Primero probar el worker manualmente desde una consola de Windows. Cuando los mensajes `[SYNC] OK` sean estables, se puede instalar `sync-worker/start.js` como servicio de Windows para que se inicie automaticamente con el servidor.

No guardar las claves reales en GitHub. Usar un `.env` local en el servidor y mantenerlo fuera del repositorio.
