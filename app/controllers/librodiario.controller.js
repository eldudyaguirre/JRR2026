const pool = require('../database/postgres');
const PDFDocument = require('pdfkit');

const TABLA = '"public"."detdiariogeneral"';

async function obtenerDiario() {
  const sql = \`
    SELECT
      fecha::date AS fecha,
      COALESCE(codcuenta::text, '') AS codcuenta,
      COALESCE(detalle::text, '') AS detalle,
      COALESCE(debe::numeric, 0) AS debe,
      COALESCE(haber::numeric, 0) AS haber,
      COALESCE(numasient::text, '') AS numasient,
      COALESCE(seqasient::text, '') AS seqasient
    FROM \${TABLA}
    ORDER BY
      NULLIF(numasient::text, '')::numeric NULLS LAST,
      NULLIF(seqasient::text, '')::numeric NULLS LAST,
      fecha
  \`;
  const result = await pool.query(sql);
  return result.rows;
}

function numero(valor) {
  const n = Number(valor || 0);
  return n ? n.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2}) : '';
}

function fecha(valor) {
  if (!valor) return '';
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return String(valor).slice(0,10);
  return d.toLocaleDateString('es-EC', {day:'2-digit', month:'2-digit', year:'numeric'});
}

function esReferencia(row) {
  return !String(row.codcuenta || '').trim();
}

function generarPDF(rows, res) {
  const doc = new PDFDocument({
    size: 'A4',
    margin: 38,
    bufferPages: true,
    info: {
      Title: 'Diario General',
      Author: 'JRR CIA.LTDA.',
      Subject: 'Libro Diario de Contabilidad'
    }
  });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'inline; filename="diariogeneral.pdf"');
  doc.pipe(res);

  const pageWidth = doc.page.width;
  const left = doc.page.margins.left;
  const right = pageWidth - doc.page.margins.right;
  const width = right - left;

  const xFecha = left;
  const xCuenta = left + 62;
  const xDebe = right - 125;
  const xHaber = right - 60;
  const cuentaWidth = xDebe - xCuenta - 8;
  const amountWidth = 60;

  function encabezado(pageNumber) {
    doc.font('Helvetica-Bold').fontSize(9.5);
    doc.text('JRR CIA.LTDA. - 0791842952001 - CONTABILIDAD', left, 28, {width, align:'left'});
    doc.font('Helvetica-Bold').fontSize(11);
    doc.text('DIARIO GENERAL', left, 43, {width, align:'center'});
    doc.font('Helvetica').fontSize(7.5);
    doc.text('FECHA', xFecha, 63, {width:55, align:'left'});
    doc.text('CODIGO', xCuenta, 63, {width:55, align:'left'});
    doc.text('CUENTA / REFERENCIA', xCuenta + 48, 63, {width:cuentaWidth - 48, align:'left'});
    doc.text('DEBE', xDebe, 63, {width:amountWidth, align:'right'});
    doc.text('HABER', xHaber, 63, {width:amountWidth, align:'right'});
    doc.moveTo(left, 75).lineTo(right, 75).lineWidth(0.5).stroke();
    doc.font('Helvetica').fontSize(7.5);
  }

  function pie(pageNumber) {
    doc.font('Helvetica').fontSize(7);
    doc.text('pag. ' + pageNumber, left, doc.page.height - 27, {width, align:'right'});
  }

  let pagina = 1;
  encabezado(pagina);
  let y = 82;
  let ultimoAsiento = null;

  function nuevaPagina() {
    pie(pagina);
    doc.addPage();
    pagina += 1;
    encabezado(pagina);
    y = 82;
  }

  for (const row of rows) {
    const asiento = String(row.numasient || '');
    const nuevo = asiento !== ultimoAsiento;
    const texto = String(row.detalle || '');
    const referencia = esReferencia(row);

    if (nuevo && y > doc.page.height - 75) nuevaPagina();

    if (nuevo) {
      doc.font('Helvetica').fontSize(7.5);
      doc.text(fecha(row.fecha), xFecha, y, {width:55});
      doc.text('- ' + asiento + ' -', xDebe - 15, y, {width:90, align:'center'});
      y += 12;
      ultimoAsiento = asiento;
    }

    if (referencia) {
      const alto = doc.heightOfString(texto, {width:width - 20, font:'Helvetica', fontSize:7.5});
      if (y + alto > doc.page.height - 48) nuevaPagina();
      doc.font('Helvetica').fontSize(7.5);
      doc.text(texto, xCuenta - 3, y, {width:width - 10, align:'left'});
      y += Math.max(11, alto + 2);
    } else {
      const alto = doc.heightOfString(texto, {width:cuentaWidth, font:'Helvetica', fontSize:7.5});
      if (y + alto > doc.page.height - 48) nuevaPagina();

      doc.font('Helvetica').fontSize(7.5);
      doc.text(String(row.codcuenta || ''), xCuenta, y, {width:55, align:'left'});
      doc.text(texto, xCuenta + 48, y, {width:cuentaWidth - 48, align:'left'});
      doc.text(numero(row.debe), xDebe, y, {width:amountWidth, align:'right'});
      doc.text(numero(row.haber), xHaber, y, {width:amountWidth, align:'right'});
      y += Math.max(11, alto + 2);
    }
  }

  pie(pagina);
  doc.end();
}

async function listado(req, res) {
  try {
    const rows = await obtenerDiario();
    res.json({tabla:'detdiariogeneral', total:rows.length, movimientos:rows});
  } catch (error) {
    console.error('[LIBRODIARIO] Error:', error);
    res.status(500).json({error:'No se pudo consultar detdiariogeneral.', detail:error.message});
  }
}

async function pdf(req, res) {
  try {
    const rows = await obtenerDiario();
    generarPDF(rows, res);
  } catch (error) {
    console.error('[LIBRODIARIO PDF] Error:', error);
    if (!res.headersSent) res.status(500).json({error:'No se pudo generar el Diario General.', detail:error.message});
    else res.end();
  }
}

module.exports = {listado, pdf};
