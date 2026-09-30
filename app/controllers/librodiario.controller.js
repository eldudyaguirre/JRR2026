const pool = require('../database/postgres');
const PDFDocument = require('pdfkit');

const TABLA = '"public"."detdiariogeneral"';

async function obtenerDiario() {
  const sql = 'SELECT * FROM detdiariogeneral ORDER BY numasient, seqasient';
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
    margin: 0,
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

  // Formato basado en el Diario General de referencia:
  // FECHA | CODIGO | CUENTA / REFERENCIA | DEBE | HABER
  const pageLeft = 38;
  const pageRight = doc.page.width - 38;
  const pageWidth = pageRight - pageLeft;

  const xFecha = pageLeft;
  const xCodigo = xFecha + 62;
  const xDetalle = xCodigo + 58;
  const xDebe = pageRight - 112;
  const xHaber = pageRight - 56;

  const wFecha = xCodigo - xFecha - 5;
  const wCodigo = xDetalle - xCodigo - 5;
  const wDetalle = xDebe - xDetalle - 8;
  const wMonto = 52;

  const top = 27;
  const headerLine = 76;
  const bottom = doc.page.height - 42;

  function encabezado() {
    doc.font('Helvetica-Bold').fontSize(9.5);
    doc.text(
      'JRR CIA.LTDA. - 0791842952001 - CONTABILIDAD',
      pageLeft,
      top,
      { width: pageWidth, align: 'left', lineBreak: false }
    );

    doc.font('Helvetica-Bold').fontSize(11);
    doc.text(
      'DIARIO GENERAL',
      pageLeft,
      42,
      { width: pageWidth, align: 'center', lineBreak: false }
    );

    doc.font('Helvetica').fontSize(7.5);
    doc.text('FECHA', xFecha, 63, { width: wFecha, lineBreak: false });
    doc.text('CODIGO', xCodigo, 63, { width: wCodigo, lineBreak: false });
    doc.text('CUENTA / REFERENCIA', xDetalle, 63, {
      width: wDetalle,
      lineBreak: false
    });
    doc.text('DEBE', xDebe, 63, {
      width: wMonto,
      align: 'right',
      lineBreak: false
    });
    doc.text('HABER', xHaber, 63, {
      width: wMonto,
      align: 'right',
      lineBreak: false
    });

    doc.moveTo(pageLeft, headerLine)
      .lineTo(pageRight, headerLine)
      .lineWidth(0.5)
      .stroke();
  }

  function piePagina() {
    const paginas = doc.bufferedPageRange();
    for (let i = 0; i < paginas.count; i++) {
      doc.switchToPage(i);
      doc.font('Helvetica').fontSize(7);
      doc.text(
        'pag. ' + (i + 1) + ' de ' + paginas.count,
        pageLeft,
        doc.page.height - 27,
        { width: pageWidth, align: 'right', lineBreak: false }
      );
    }
  }

  function altoTexto(texto, ancho, size = 7.5) {
    return doc.heightOfString(String(texto ?? ''), {
      width: ancho,
      font: 'Helvetica',
      fontSize: size
    });
  }

  let y = 82;
  let ultimoAsiento = null;

  encabezado();

  function nuevaPagina() {
    doc.addPage();
    y = 82;
    encabezado();
  }

  for (const row of rows) {
    // No se alteran los campos de texto para construir el contenido.
    const asiento = String(row.numasient ?? '');
    const codigo = String(row.codcuenta ?? '');
    const detalle = String(row.detalle ?? '');
    const referencia = codigo === '';

    // En el formato original, la referencia SA va primero con la fecha,
    // luego aparece el número de asiento y después sus cuentas.
    if (referencia) {
      const alto = Math.max(11, altoTexto(detalle, pageWidth - 10));

      if (y + alto > bottom) nuevaPagina();

      doc.font('Helvetica').fontSize(7.5);
      doc.text(String(fecha(row.fecha) || ''), xFecha, y, {
        width: wFecha,
        lineBreak: false
      });
      doc.text(detalle, xDetalle - 3, y, {
        width: pageRight - xDetalle + 3,
        lineBreak: false
      });

      y += Math.max(11, alto + 2);
      continue;
    }

    // El número de asiento aparece una sola vez antes de sus cuentas.
    if (asiento !== ultimoAsiento) {
      if (y + 21 > bottom) nuevaPagina();

      doc.font('Helvetica').fontSize(7.5);
      doc.text('- ' + asiento + ' -', xDetalle, y, {
        width: wDetalle,
        align: 'center',
        lineBreak: false
      });

      y += 13;
      ultimoAsiento = asiento;
    }

    const alto = Math.max(11, altoTexto(detalle, wDetalle - 48));

    if (y + alto > bottom) nuevaPagina();

    doc.font('Helvetica').fontSize(7.5);

    doc.text(codigo, xCodigo, y, {
      width: wCodigo,
      lineBreak: false
    });

    doc.text(detalle, xDetalle, y, {
      width: wDetalle,
      lineBreak: false
    });

    doc.text(numero(row.debe), xDebe, y, {
      width: wMonto,
      align: 'right',
      lineBreak: false
    });

    doc.text(numero(row.haber), xHaber, y, {
      width: wMonto,
      align: 'right',
      lineBreak: false
    });

    y += alto + 2;
  }

  piePagina();
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
