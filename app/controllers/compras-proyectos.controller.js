const pool = require('../database/postgres');
const PDFDocument = require('pdfkit');

function fechaValida(valor) {
  return /^\d{4}-\d{2}-\d{2}$/.test(valor) && !Number.isNaN(Date.parse(`${valor}T00:00:00Z`));
}

function dineroPdf(v) {
  return Number(v || 0).toLocaleString('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fechaPdf(v) {
  if (!v) return '';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('es-EC');
}

async function obtenerDetalle(client, inicio, fin, area) {
  const sql = `
    SELECT * FROM (
      SELECT C.feccompra AS fecha, C.ruccedpro AS "rucCed", COALESCE(P.nomprovee,'PROVEEDOR ELIMINADO') AS nombre,
             C.numfaccom AS "numero", C.tipdocume AS "tipoDoc", COALESCE(C.totsiniva,0)::numeric AS "totSinIva",
             COALESCE(C.totconiva,0)::numeric AS "totConIva", COALESCE(C.valivacom,0)::numeric AS iva,
             COALESCE(C.totcompra,0)::numeric AS total, TRIM(C.proyecto) AS area, 'COMPRA' AS origen
      FROM compras C LEFT JOIN proveedores P ON P.ruccedpro=C.ruccedpro
      WHERE C.estproces <> 'ANULADA' AND C.feccompra >= $1 AND C.feccompra <= $2
      UNION ALL
      SELECT C.feccompra, C.ruccedpro, COALESCE(P.nomprovee,'PROVEEDOR ELIMINADO'), C.numfaccom, C.tipdocume,
             COALESCE(C.totsiniva,0)::numeric, COALESCE(C.totconiva,0)::numeric, COALESCE(C.valivacom,0)::numeric,
             COALESCE(C.totcompra,0)::numeric, TRIM(C.proyecto), 'NV'
      FROM comprasnv C LEFT JOIN proveedores P ON P.ruccedpro=C.ruccedpro
      WHERE C.estproces <> 'ANULADA' AND C.feccompra >= $1 AND C.feccompra <= $2
      UNION ALL
      SELECT C.feccompra, C.ruccedpro, COALESCE(D.desiteinv,'SIN REFERENCIA'), C.numfaccom, 'OD',
             COALESCE(C.subtotcom,0)::numeric, 0::numeric, 0::numeric, COALESCE(C.totcompra,0)::numeric,
             TRIM(C.proyecto), 'OD'
      FROM comprasod C LEFT JOIN detallecomprasod D ON D.numcompra=C.numcompra
      WHERE C.estproces <> 'ANULADA' AND C.feccompra >= $1 AND C.feccompra <= $2
    ) X
    WHERE NULLIF(TRIM(area),'') IS NOT NULL
      AND ($3 = '' OR LOWER(TRIM(area)) = LOWER($3))
    ORDER BY area, fecha, numero
  `;
  return (await client.query(sql, [inicio, fin, area])).rows;
}

async function resumenGastosPorProyecto(req, res) {
  const inicioConsulta = Date.now();
  let client;
  try {
    const ahora = new Date();
    const inicio = req.query.inicio || `${ahora.getFullYear()}-01-01`;
    const fin = req.query.fin || `${ahora.getFullYear()}-12-31`;
    if (!fechaValida(inicio) || !fechaValida(fin)) return res.status(400).json({ error: 'Fechas inválidas. Use YYYY-MM-DD.' });
    client = pool.createDedicatedClient();
    await client.connect();
    await client.query('SET statement_timeout = 30000');
    const sql = `
      SELECT proyecto, COUNT(*)::int AS movimientos, COALESCE(SUM(gasto), 0)::numeric AS gasto
      FROM (
        SELECT NULLIF(TRIM(C.proyecto), '') AS proyecto, COALESCE(C.totsiniva, 0) + COALESCE(C.totconiva, 0) AS gasto FROM compras C WHERE C.estproces <> 'ANULADA' AND C.feccompra >= DATE '${inicio}' AND C.feccompra <= DATE '${fin}'
        UNION ALL
        SELECT NULLIF(TRIM(C.proyecto), '') AS proyecto, COALESCE(C.totsiniva, 0) + COALESCE(C.totconiva, 0) AS gasto FROM comprasnv C WHERE C.estproces <> 'ANULADA' AND C.feccompra >= DATE '${inicio}' AND C.feccompra <= DATE '${fin}'
        UNION ALL
        SELECT NULLIF(TRIM(C.proyecto), '') AS proyecto, COALESCE(C.subtotcom, 0) AS gasto FROM comprasod C WHERE C.estproces <> 'ANULADA' AND C.feccompra >= DATE '${inicio}' AND C.feccompra <= DATE '${fin}'
      ) X WHERE proyecto IS NOT NULL GROUP BY proyecto ORDER BY gasto DESC, proyecto
    `;
    const result = await client.query(sql);
    return res.json({ inicio, fin, totalProyectos: result.rows.length, tiempoMs: Date.now() - inicioConsulta, proyectos: result.rows });
  } catch (error) {
    console.error('[COMPRAS-PROYECTOS] Error consultando gastos por proyecto:', error);
    return res.status(500).json({ error: 'Error consultando gastos por proyecto.', detail: error.message, codigo: error.code, tiempoMs: Date.now() - inicioConsulta });
  } finally {
    if (client) try { await client.end(); } catch (error) { console.error('[COMPRAS-PROYECTOS] Error cerrando cliente:', error.message); }
  }
}

async function resumenGastosPorVehiculo(req, res) {
  const inicioConsulta = Date.now();
  let client;
  try {
    const ahora = new Date();
    const inicio = req.query.inicio || `${ahora.getFullYear()}-01-01`;
    const fin = req.query.fin || `${ahora.getFullYear()}-12-31`;
    if (!fechaValida(inicio) || !fechaValida(fin)) return res.status(400).json({ error: 'Fechas inválidas. Use YYYY-MM-DD.' });

    client = pool.createDedicatedClient();
    await client.connect();
    await client.query('SET statement_timeout = 30000');

    const sql = `
      WITH gastos AS (
        SELECT NULLIF(TRIM(C.placa), '') AS placa,
               COUNT(*)::int AS movimientos,
               COALESCE(SUM(COALESCE(C.totsiniva,0) + COALESCE(C.totconiva,0)),0)::numeric AS gasto
        FROM compras C
        WHERE C.estproces <> 'ANULADA' AND C.feccompra >= $1 AND C.feccompra <= $2
        GROUP BY NULLIF(TRIM(C.placa), '')
        UNION ALL
        SELECT NULLIF(TRIM(C.placa), '') AS placa,
               COUNT(*)::int AS movimientos,
               COALESCE(SUM(COALESCE(C.totsiniva,0) + COALESCE(C.totconiva,0)),0)::numeric AS gasto
        FROM comprasnv C
        WHERE C.estproces <> 'ANULADA' AND C.feccompra >= $1 AND C.feccompra <= $2
        GROUP BY NULLIF(TRIM(C.placa), '')
        UNION ALL
        SELECT NULLIF(TRIM(C.placa), '') AS placa,
               COUNT(*)::int AS movimientos,
               COALESCE(SUM(COALESCE(C.subtotcom,0)),0)::numeric AS gasto
        FROM comprasod C
        WHERE C.estproces <> 'ANULADA' AND C.feccompra >= $1 AND C.feccompra <= $2
        GROUP BY NULLIF(TRIM(C.placa), '')
      ),
      resumen AS (
        SELECT placa, SUM(movimientos)::int AS movimientos, SUM(gasto)::numeric AS gasto
        FROM gastos
        WHERE placa IS NOT NULL
        GROUP BY placa
      )
      SELECT TRIM(V.placa) AS placa,
             COALESCE(R.movimientos,0)::int AS movimientos,
             COALESCE(R.gasto,0)::numeric AS gasto
      FROM vehiculos V
      LEFT JOIN resumen R ON LOWER(TRIM(V.placa)) = LOWER(R.placa)
      WHERE NULLIF(TRIM(V.placa),'') IS NOT NULL
      ORDER BY COALESCE(R.gasto,0) DESC, TRIM(V.placa)
    `;

    const result = await client.query(sql, [inicio, fin]);
    return res.json({ inicio, fin, totalVehiculos: result.rows.length, tiempoMs: Date.now() - inicioConsulta, vehiculos: result.rows });
  } catch (error) {
    console.error('[COMPRAS-VEHICULOS] Error consultando gastos por vehículo:', error);
    return res.status(500).json({ error: 'Error consultando gastos por vehículo.', detail: error.message, codigo: error.code, tiempoMs: Date.now() - inicioConsulta });
  } finally {
    if (client) try { await client.end(); } catch (error) { console.error('[COMPRAS-VEHICULOS] Error cerrando cliente:', error.message); }
  }
}

async function reporteDetallePorArea(req, res) {
  const inicioConsulta = Date.now();
  let client;
  try {
    const ahora = new Date();
    const inicio = req.query.inicio || `${ahora.getFullYear()}-01-01`;
    const fin = req.query.fin || `${ahora.getFullYear()}-12-31`;
    const area = String(req.query.area || '').trim();
    if (!fechaValida(inicio) || !fechaValida(fin)) return res.status(400).json({ error: 'Fechas inválidas. Use YYYY-MM-DD.' });
    client = pool.createDedicatedClient();
    await client.connect();
    await client.query('SET statement_timeout = 30000');
    const rows = await obtenerDetalle(client, inicio, fin, area);
    const totales = rows.reduce((a, r) => { a.sinIva += Number(r.totSinIva || 0); a.conIva += Number(r.totConIva || 0); a.iva += Number(r.iva || 0); a.total += Number(r.total || 0); return a; }, { sinIva: 0, conIva: 0, iva: 0, total: 0 });
    return res.json({ inicio, fin, area: area || 'TODAS', total: rows.length, totales, compras: rows });
  } catch (error) {
    console.error('[COMPRAS-REPORTE-AREA] Error consultando detalle:', error);
    return res.status(500).json({ error: 'Error consultando el reporte por áreas.', detail: error.message, codigo: error.code, tiempoMs: Date.now() - inicioConsulta });
  } finally {
    if (client) try { await client.end(); } catch (error) { console.error('[COMPRAS-REPORTE-AREA] Error cerrando cliente:', error.message); }
  }
}

async function exportarReporteAreaPdf(req, res) {
  const inicioConsulta = Date.now();
  let client;
  try {
    const ahora = new Date();
    const inicio = req.query.inicio || `${ahora.getFullYear()}-01-01`;
    const fin = req.query.fin || `${ahora.getFullYear()}-12-31`;
    const area = String(req.query.area || '').trim();
    if (!fechaValida(inicio) || !fechaValida(fin)) return res.status(400).json({ error: 'Fechas inválidas. Use YYYY-MM-DD.' });
    client = pool.createDedicatedClient();
    await client.connect();
    await client.query('SET statement_timeout = 30000');
    const rows = await obtenerDetalle(client, inicio, fin, area);
    if (!rows.length) return res.status(404).json({ error: 'No existen movimientos para exportar.' });

    const totales = rows.reduce((a, r) => { a.sinIva += Number(r.totSinIva || 0); a.conIva += Number(r.totConIva || 0); a.iva += Number(r.iva || 0); a.total += Number(r.total || 0); return a; }, { sinIva: 0, conIva: 0, iva: 0, total: 0 });
    const areaTexto = area || 'Todas las áreas';
    const nombreArchivo = `Reporte_por_Areas_${inicio}_${fin}.pdf`;
    res.status(200);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${nombreArchivo}"`);

    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margins: { top: 28, bottom: 28, left: 28, right: 28 }, bufferPages: true });
    doc.pipe(res);
    doc.info.Title = `Reporte por Áreas - ${areaTexto}`;
    doc.info.Subject = 'Detalle de compras, notas de venta y órdenes directas';

    const pageWidth = doc.page.width - 56;
    const pageRight = 28 + pageWidth;
    const widths = [48, 75, 185, 75, 55, 75, 75, 60, 75];
    const headers = ['Fecha','RUC/Cédula','Nombre','Número','Tipo','Sin IVA','Con IVA','IVA','Total'];
    const rowHeight = 17;
    const headerHeight = 22;
    let y = 30;

    function encabezado() {
      doc.fillColor('#073674').font('Helvetica-Bold').fontSize(17).text('Reporte por Áreas', 28, 28);
      doc.fillColor('#666666').font('Helvetica').fontSize(8.5).text('Detalle de compras, notas de venta y órdenes directas por área de trabajo.', 28, 48, { width: 470 });

      const anchoMeta = 190;
      const xMeta = pageRight - anchoMeta;
      doc.fillColor('#555555').font('Helvetica').fontSize(8.5);
      doc.text(`Área: ${areaTexto}`, xMeta, 28, { width: anchoMeta, align: 'right', ellipsis: true });
      doc.text(`Período: ${inicio} al ${fin}`, xMeta, 41, { width: anchoMeta, align: 'right' });
      doc.text(`Movimientos: ${rows.length}`, xMeta, 54, { width: anchoMeta, align: 'right' });

      doc.fillColor('#073674').font('Helvetica-Bold').fontSize(8.5);
      doc.text(`Total sin IVA: ${dineroPdf(totales.sinIva)}`, 28, 64);
      doc.text(`Total con IVA: ${dineroPdf(totales.conIva)}`, 170, 64);
      doc.text(`IVA: ${dineroPdf(totales.iva)}`, 315, 64);
      doc.text(`Total general: ${dineroPdf(totales.total)}`, 430, 64);
      y = 82;
      doc.fillColor('#09203C').rect(28, y, pageWidth, headerHeight).fill();
      let x = 28;
      doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(7.2);
      headers.forEach((h, i) => { doc.text(h, x + 3, y + 7, { width: widths[i] - 6, ellipsis: true }); x += widths[i]; });
      y += headerHeight;
    }

    function nuevaPagina() { doc.addPage(); encabezado(); }
    encabezado();
    rows.forEach((r, idx) => {
      if (y + rowHeight > doc.page.height - 45) nuevaPagina();
      if (idx % 2 === 1) { doc.fillColor('#F3F5F7').rect(28, y, pageWidth, rowHeight).fill(); }
      let x = 28;
      const vals = [fechaPdf(r.fecha), r.rucCed || '', r.nombre || '', r.numero || '', r.tipoDoc || '', dineroPdf(r.totSinIva), dineroPdf(r.totConIva), dineroPdf(r.iva), dineroPdf(r.total)];
      doc.fillColor('#222222').font('Helvetica').fontSize(6.8);
      vals.forEach((v, i) => { doc.text(String(v), x + 3, y + 5, { width: widths[i] - 6, ellipsis: true, align: i >= 5 ? 'right' : 'left' }); x += widths[i]; });
      doc.strokeColor('#D9DDE2').lineWidth(0.4).moveTo(28, y + rowHeight).lineTo(28 + pageWidth, y + rowHeight).stroke();
      y += rowHeight;
    });

    if (y + 24 > doc.page.height - 28) nuevaPagina();
    doc.fillColor('#E9EDF2').rect(28, y, pageWidth, 20).fill();
    doc.fillColor('#073674').font('Helvetica-Bold').fontSize(8).text('TOTAL', 31, y + 6);
    let xTotal = 28;
    const totalVals = ['', '', '', '', '', dineroPdf(totales.sinIva), dineroPdf(totales.conIva), dineroPdf(totales.iva), dineroPdf(totales.total)];
    totalVals.forEach((v, i) => { if (v) doc.text(v, xTotal + 3, y + 6, { width: widths[i] - 6, align: 'right' }); xTotal += widths[i]; });

    doc.fillColor('#777777').font('Helvetica').fontSize(7).text('Generado desde Avícola y Porcina Luisin', 28, doc.page.height - 24);
    doc.end();
  } catch (error) {
    console.error('[COMPRAS-REPORTE-AREA-PDF] Error generando PDF:', error);
    if (!res.headersSent) return res.status(500).json({ error: 'Error generando el archivo PDF.', detail: error.message, codigo: error.code, tiempoMs: Date.now() - inicioConsulta });
    return res.end();
  } finally {
    if (client) try { await client.end(); } catch (error) { console.error('[COMPRAS-REPORTE-AREA-PDF] Error cerrando cliente:', error.message); }
  }
}

module.exports = { resumenGastosPorProyecto, resumenGastosPorVehiculo, reporteDetallePorArea, exportarReporteAreaPdf };
