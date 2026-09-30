const pool = require('../database/postgres');
const PDFDocument = require('pdfkit');

const TABLA = '"public"."detdiariogeneral"';

async function obtenerDiario() {
  const sql = `
    SELECT
      COALESCE(fecha::text, '') AS fecha,
      COALESCE(codcuenta::text, '') AS codcuenta,
      COALESCE(detalle::text, '') AS detalle,
      COALESCE(debe::text, '') AS debe,
      COALESCE(haber::text, '') AS haber,
      COALESCE(numasient::text, '') AS numasient,
      COALESCE(seqasient::text, '') AS seqasient
    FROM ${TABLA}
    ORDER BY fecha, numasient, seqasient
  `;
  const result = await pool.query(sql);
  return result.rows;
}

function numero(valor) {
  const texto = String(valor ?? '').trim();
  if (!texto) return '';
  const n = Number(texto.replace(/,/g, ''));
  return Number.isFinite(n)
    ? n.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})
    : texto;
}

function fecha(valor) {
  if (!valor) return '';
  const d = new Date(valor);
  return Number.isNaN(d.getTime())
    ? String(valor).slice(0, 10)
    : d.toLocaleDateString('es-EC', {day:'2-digit', month:'2-digit', year:'numeric'});
}

function esReferencia(row) {
  return !String(row.codcuenta || '').trim();
}

function generarPDF(rows, res) {
  const doc = new PDFDocument({
    size: 'A4',
    margin: 38,
    info: {Title:'Diario General', Author:'JRR CIA.LTDA.', Subject:'Libro Diario de Contabilidad'}
  });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'inline; filename="diariogeneral.pdf"');
  doc.pipe(res);

  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const width = right - left;
  const xFecha = left;
  const xCuenta = left + 62;
  const xDebe = right - 125;
  const xHaber = right - 60;
  const cuentaWidth = xDebe - xCuenta - 8;
  const amountWidth = 60;

  function encabezado() {
    doc.font('Helvetica-Bold').fontSize(9.5)
      .text('JRR CIA.LTDA. - 0791842952001 - CONTABILIDAD', left, 28, {width});
    doc.font('Helvetica-Bold').fontSize(11)
      .text('DIARIO GENERAL', left, 43, {width, align:'center'});
    doc.font('Helvetica').fontSize(7.5);
    doc.text('FECHA', xFecha, 63, {width:55});
    doc.text('CODIGO', xCuenta, 63, {width:55});
    doc.text('CUENTA / REFERENCIA', xCuenta + 48, 63, {width:cuentaWidth - 48});
    doc.text('DEBE', xDebe, 63, {width:amountWidth, align:'right'});
    doc.text('HABER', xHaber, 63, {width:amountWidth, align:'right'});
    doc.moveTo(left, 75).lineTo(right, 75).lineWidth(0.5).stroke();
  }

  let pagina = 1;
  let y = 82;
  let ultimoAsiento = null;
  encabezado();

  function nuevaPagina() {
    doc.font('Helvetica').fontSize(7)
      .text('pag. ' + pagina, left, doc.page.height - 27, {width, align:'right'});
    doc.addPage();
    pagina++;
    encabezado();
    y = 82;
  }

  for (const row of rows) {
    const asiento = String(row.numasient || '').trim();
    const nuevo = asiento !== ultimoAsiento;
    const texto = String(row.detalle || '');

    if (nuevo) {
      if (y > doc.page.height - 75) nuevaPagina();
      doc.font('Helvetica').fontSize(7.5);
      doc.text(fecha(row.fecha), xFecha, y, {width:55});
      doc.text('- ' + asiento + ' -', xDebe - 15, y, {width:90, align:'center'});
      y += 12;
      ultimoAsiento = asiento;
    }

    if (esReferencia(row)) {
      const alto = doc.heightOfString(texto, {width:width - 20, font:'Helvetica', fontSize:7.5});
      if (y + alto > doc.page.height - 48) nuevaPagina();
      doc.font('Helvetica').fontSize(7.5)
        .text(texto, xCuenta - 3, y, {width:width - 10});
      y += Math.max(11, alto + 2);
    } else {
      const alto = doc.heightOfString(texto, {width:cuentaWidth, font:'Helvetica', fontSize:7.5});
      if (y + alto > doc.page.height - 48) nuevaPagina();
      doc.font('Helvetica').fontSize(7.5)
        .text(String(row.codcuenta || ''), xCuenta, y, {width:55})
        .text(texto, xCuenta + 48, y, {width:cuentaWidth - 48})
        .text(numero(row.debe), xDebe, y, {width:amountWidth, align:'right'})
        .text(numero(row.haber), xHaber, y, {width:amountWidth, align:'right'});
      y += Math.max(11, alto + 2);
    }
  }

  doc.font('Helvetica').fontSize(7)
    .text('pag. ' + pagina, left, doc.page.height - 27, {width, align:'right'});
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
    if (!res.headersSent) {
      res.status(500).json({error:'No se pudo generar el Diario General.', detail:error.message});
    } else {
      res.end();
    }
  }
}

module.exports = {listado, pdf};
