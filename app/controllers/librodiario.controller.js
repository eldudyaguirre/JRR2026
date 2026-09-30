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

  // El PDF reproduce la misma tabla que se muestra en pantalla.
  // Los valores se toman directamente de detdiariogeneral y no se
  // transforman, recortan, justifican ni agrupan.
  const left = 38;
  const right = doc.page.width - 38;
  const tableWidth = right - left;

  const columns = [
    { key: 'fecha',     title: 'Fecha',              width: 78,  align: 'left'  },
    { key: 'codcuenta', title: 'Código',             width: 92,  align: 'left'  },
    { key: 'detalle',   title: 'Cuenta / Referencia',width: 275, align: 'left'  },
    { key: 'debe',      title: 'Debe',               width: 75,  align: 'right' },
    { key: 'haber',     title: 'Haber',              width: 75,  align: 'right' }
  ];

  const scale = tableWidth / columns.reduce((sum, col) => sum + col.width, 0);
  columns.forEach(col => col.width *= scale);

  const headerHeight = 23;
  const rowHeight = 22;
  const top = 72;
  const bottom = doc.page.height - 38;
  const fontSize = 8;

  function xFor(index) {
    let x = left;
    for (let i = 0; i < index; i++) x += columns[i].width;
    return x;
  }

  function dibujarEncabezado() {
    doc.font('Helvetica-Bold').fontSize(9);
    doc.text('JRR CIA.LTDA. - 0791842952001 - CONTABILIDAD', left, 25, {
      width: tableWidth,
      align: 'left',
      lineBreak: false
    });

    doc.font('Helvetica-Bold').fontSize(11);
    doc.text('DIARIO GENERAL', left, 41, {
      width: tableWidth,
      align: 'center',
      lineBreak: false
    });

    let x = left;

    columns.forEach(col => {
      doc.save();
      doc.rect(x, top, col.width, headerHeight).clip();
      doc.font('Helvetica-Bold').fontSize(8);
      doc.text(col.title, x + 6, top + 7, {
        width: col.width - 12,
        align: col.align,
        lineBreak: false
      });
      doc.restore();

      doc.rect(x, top, col.width, headerHeight).lineWidth(0.5).stroke();
      x += col.width;
    });

    doc.moveTo(left, top + headerHeight)
      .lineTo(right, top + headerHeight)
      .lineWidth(0.5)
      .stroke();
  }

  function dibujarFila(row, y) {
    let x = left;

    columns.forEach(col => {
      // String() conserva exactamente el contenido recibido desde PostgreSQL:
      // no trim, no replace, no conversión de fecha ni de importes.
      const valor = row[col.key] == null ? '' : String(row[col.key]);

      doc.save();
      doc.rect(x, y, col.width, rowHeight).clip();
      doc.font('Helvetica').fontSize(fontSize);
      doc.text(valor, x + 6, y + 7, {
        width: col.width - 12,
        align: col.align,
        lineBreak: false
      });
      doc.restore();

      doc.rect(x, y, col.width, rowHeight).lineWidth(0.35).stroke();
      x += col.width;
    });
  }

  let y = top + headerHeight;
  let pagina = 1;

  dibujarEncabezado();

  for (const row of rows) {
    if (y + rowHeight > bottom) {
      doc.font('Helvetica').fontSize(7);
      doc.text('pag. ' + pagina, left, doc.page.height - 25, {
        width: tableWidth,
        align: 'right',
        lineBreak: false
      });

      doc.addPage();
      pagina++;
      dibujarEncabezado();
      y = top + headerHeight;
    }

    dibujarFila(row, y);
    y += rowHeight;
  }

  doc.font('Helvetica').fontSize(7);
  doc.text('pag. ' + pagina, left, doc.page.height - 25, {
    width: tableWidth,
    align: 'right',
    lineBreak: false
  });

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
