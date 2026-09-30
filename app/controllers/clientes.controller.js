const pool = require('../database/postgres');

const CANDIDATOS_RUC = ['ruccedcli', 'ruc', 'rucced', 'ruc_ced', 'identificacion', 'cedula'];
const CANDIDATOS_NOMBRE = ['nomclient', 'nomcli', 'nombres', 'nombre', 'razonsocial', 'razon_social'];
const CAMPOS_OCULTOS = new Set([
  'tipocli', 'procli', 'estado', 'antpersonal', 'antperson', 'limcredit', 'salantici', 'salnotcre',
  'fecultpag', 'numdiacre', 'codcuecon', 'porretfuebie', 'porretivabie', 'porretfueser',
  'porretivaser', 'salvencid1', 'salvencid2', 'salvencid3', 'salvencid4', 'codcueant', 'codcuencr'
]);
function ident(valor) { return '"' + String(valor).replace(/"/g, '""') + '"'; }
async function obtenerMetadatos(client) {
  const tablas = await client.query(`SELECT table_schema, table_name FROM information_schema.tables WHERE table_type = 'BASE TABLE' AND lower(table_name) = 'clientes' ORDER BY CASE WHEN table_schema = 'public' THEN 0 ELSE 1 END LIMIT 1`);
  if (!tablas.rows.length) throw new Error('No existe la tabla clientes.');
  const { table_schema: esquema, table_name: tabla } = tablas.rows[0];
  const columnas = await client.query(`SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 ORDER BY ordinal_position`, [esquema, tabla]);
  const disponibles = columnas.rows.map(r => r.column_name), buscar = candidatos => disponibles.find(col => candidatos.includes(col.toLowerCase()));
  const colRuc = buscar(CANDIDATOS_RUC), colNombre = buscar(CANDIDATOS_NOMBRE), colSaldo = disponibles.find(col => col.toLowerCase() === 'salcuenta');
  if (!colRuc || !colNombre) throw new Error(`No se encontraron las columnas necesarias en clientes. RUC: ${colRuc || 'no encontrada'}, nombres: ${colNombre || 'no encontrada'}.`);
  return { esquema, tabla, disponibles, colRuc, colNombre, colSaldo };
}
async function obtenerMetadatosCuentasCobrar(client) {
  const tablaResult = await client.query(`SELECT table_schema, table_name FROM information_schema.tables WHERE table_type = 'BASE TABLE' AND table_schema NOT IN ('pg_catalog', 'information_schema') AND regexp_replace(lower(table_name), '[ _-]', '', 'g') = 'cuentascobrar' ORDER BY CASE WHEN table_schema = 'public' THEN 0 ELSE 1 END, table_schema, table_name LIMIT 1`);
  if (!tablaResult.rows.length) return null;
  const { table_schema: esquema, table_name: tabla } = tablaResult.rows[0];
  const columnasResult = await client.query(`SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2`, [esquema, tabla]);
  const columnas = new Map(columnasResult.rows.map(r => [String(r.column_name).toLowerCase(), r.column_name]));
  const requeridas = ['fecinicio','fecvencim','numfactur','valpagpar','estpagcue','refcuecob','ruccedcli'];
  if (requeridas.some(campo => !columnas.has(campo))) return null;
  const c = clave => ident(columnas.get(clave));
  return { esquema, tabla, c, tablaSQL: `${ident(esquema)}.${ident(tabla)}` };
}
async function obtenerFacturasPendientes(client, metaClientes, ruc) {
  const metaCobrar = await obtenerMetadatosCuentasCobrar(client); if (!metaCobrar) return [];
  const { c, tablaSQL } = metaCobrar;
  const result = await client.query(`SELECT cp.${c('fecinicio')} AS "fecInicio", cp.${c('fecvencim')} AS "fecVencim", cp.${c('numfactur')} AS "numFactur", cp.${c('valpagpar')} AS "valPagPar", cp.${c('refcuecob')} AS "refCueCob" FROM ${tablaSQL} cp WHERE CAST(cp.${c('ruccedcli')} AS text) = $1 AND UPPER(TRIM(cp.${c('estpagcue')}::text)) = 'PENDIENTE' ORDER BY cp.${c('fecvencim')}, cp.${c('fecinicio')}, cp.${c('numfactur')}`, [ruc]);
  return result.rows;
}
async function clientes(req, res) {
  let client; try { client=pool.createDedicatedClient(); await client.connect(); await client.query('SET statement_timeout = 30000'); const meta=await obtenerMetadatos(client), q=String(req.query.q||'').trim(), limite=Math.min(Math.max(Number(req.query.limite)||500,1),2000); const filtros=[], valores=[]; if(q){valores.push(`%${q}%`);const p=`$${valores.length}`;filtros.push(`(CAST(${ident(meta.colRuc)} AS text) ILIKE ${p} OR CAST(${ident(meta.colNombre)} AS text) ILIKE ${p})`);} const result=await client.query(`SELECT CAST(${ident(meta.colRuc)} AS text) AS "ruc", CAST(${ident(meta.colNombre)} AS text) AS "nombres" FROM ${ident(meta.esquema)}.${ident(meta.tabla)} ${filtros.length?`WHERE ${filtros.join(' AND ')}`:''} ORDER BY ${ident(meta.colNombre)} ASC NULLS LAST LIMIT ${limite}`,valores); return res.json({total:result.rows.length,clientes:result.rows}); } catch(error){console.error('[CLIENTES] Error consultando clientes:',error);return res.status(500).json({error:'Error consultando clientes.',detail:error.message});} finally{if(client){try{await client.end();}catch(error){console.error('[CLIENTES] Error cerrando cliente:',error.message);}}}
}
async function clienteDetalle(req,res){
  let client; try { const ruc=String(req.params.ruc||'').trim(); if(!ruc)return res.status(400).json({error:'RUC/Cédula requerido.'}); client=pool.createDedicatedClient(); await client.connect(); await client.query('SET statement_timeout = 30000'); const meta=await obtenerMetadatos(client), columnasVisibles=meta.disponibles.filter(campo=>!CAMPOS_OCULTOS.has(campo.toLowerCase())), columnas=columnasVisibles.map(ident).join(', '); const result=await client.query(`SELECT ${columnas} FROM ${ident(meta.esquema)}.${ident(meta.tabla)} WHERE CAST(${ident(meta.colRuc)} AS text) = $1 LIMIT 1`,[ruc]); if(!result.rows.length)return res.status(404).json({error:'Cliente no encontrado.'}); const cliente=result.rows[0], facturasPendientes=await obtenerFacturasPendientes(client,meta,ruc); let saldoCuenta=meta.colSaldo?Number(cliente[meta.colSaldo]):NaN; if(!Number.isFinite(saldoCuenta))saldoCuenta=facturasPendientes.reduce((suma,factura)=>suma+(Number(factura.valPagPar)||0),0); return res.json({cliente,columnas:columnasVisibles,saldoCuenta,facturasPendientes,totalFacturasPendientes:facturasPendientes.length}); } catch(error){console.error('[CLIENTES] Error consultando detalle:',error);return res.status(500).json({error:'Error consultando detalle del cliente.',detail:error.message});} finally{if(client){try{await client.end();}catch(error){console.error('[CLIENTES] Error cerrando cliente:',error.message);}}}
}
module.exports={clientes,clienteDetalle};
