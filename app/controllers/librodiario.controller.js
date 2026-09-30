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

  // Presentación tipo Diario General original:
  // sin cuadrícula, sin bordes por fila y conservando los datos
  // recibidos de detdiariogeneral.
  const left = 38;
  const right = doc.page.width - 38;
  const width = right - left;

  const xFecha = left;
  const xCodigo = left + 62;
  const xDetalle = left + 132;
  const xDebe = right - 112;
  const xHaber = right - 56;

  const wFecha = 58;
  const wCodigo = 62;
  const wDetalle = xDebe - xDetalle - 8;
  const wMonto = 52;

  const headerY = 78;
  const firstRowY = 93;
  const bottom = doc.page.height - 40;
  const lineHeight = 13;
  const fontSize = 8;

  function encabezado() {
    doc.font('Helvetica-Bold').fontSize(9.5);
    doc.text(
      'JRR CIA.LTDA. - 0791842952001 - CONTABILIDAD',
      left,
      25,
      { width, align: 'left', lineBreak: false }
    );

    doc.font('Helvetica-Bold').fontSize(11);
    doc.text(
      'DIARIO GENERAL',
      left,
      43,
      { width, align: 'center', lineBreak: false }
    );

    doc.font('Helvetica-Bold').fontSize(8);
    doc.text('FECHA', xFecha, headerY, {width:wFecha, lineBreak:false});
    doc.text('CODIGO', xCodigo, headerY, {width:wCodigo, lineBreak:false});
    doc.text('CUENTA / REFERENCIA', xDetalle, headerY, {
      width:wDetalle, lineBreak:false
    });
    doc.text('DEBE', xDebe, headerY, {
      width:wMonto, align:'right', lineBreak:false
    });
    doc.text('HABER', xHaber, headerY, {
      width:wMonto, align:'right', lineBreak:false
    });

    doc.moveTo(left, headerY + 13)
      .lineTo(right, headerY + 13)
      .lineWidth(0.6)
      .stroke();
  }

  function piePagina(pagina) {
    doc.font('Helvetica').fontSize(7);
    doc.text(
      'pag. ' + pagina,
      left,
      doc.page.height - 25,
      {width, align:'right', lineBreak:false}
    );
  }

  function valor(row, campo) {
    return row[campo] == null ? '' : String(row[campo]);
  }

  function altoDetalle(texto) {
    return Math.max(
      lineHeight,
      doc.heightOfString(texto, {
        width:wDetalle,
        font:'Helvetica',
        fontSize
      })
    );
  }

  let y = firstRowY;
  let pagina = 1;

  encabezado();

  for (const row of rows) {
    const fecha = valor(row, 'fecha');
    const codigo = valor(row, 'codcuenta');
    const detalle = valor(row, 'detalle');
    const debe = valor(row, 'debe');
    const haber = valor(row, 'haber');

    const alto = altoDetalle(detalle);

    if (y + alto > bottom) {
      piePagina(pagina);
      doc.addPage();
      pagina++;
      encabezado();
      y = firstRowY;
    }

    doc.font('Helvetica').fontSize(fontSize);

    // Sin bordes, sin justificación del contenido y sin transformar
    // los valores provenientes de PostgreSQL.
    doc.text(fecha, xFecha, y, {
      width:wFecha,
      align:'left',
      lineBreak:false
    });

    doc.text(codigo, xCodigo, y, {
      width:wCodigo,
      align:'left',
      lineBreak:false
    });

    doc.text(detalle, xDetalle, y, {
      width:wDetalle,
      align:'left',
      lineBreak:false
    });

    doc.text(debe, xDebe, y, {
      width:wMonto,
      align:'right',
      lineBreak:false
    });

    doc.text(haber, xHaber, y, {
      width:wMonto,
      align:'right',
      lineBreak:false
    });

    y += alto + 1;
  }

  piePagina(pagina);
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
