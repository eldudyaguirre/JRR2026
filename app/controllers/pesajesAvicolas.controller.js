const PDFDocument = require('pdfkit');
const SVGtoPDF = require('svg-to-pdfkit');
const fs = require('fs');
const pool = require('../database/postgres');
const { getSession } = require('../auth/session');

const RUC_CANDIDATOS = ['ruccedcli', 'ruc', 'rucced', 'ruc_ced', 'identificacion', 'cedula'];
const NOMBRE_CANDIDATOS = ['nomclient', 'nomcli', 'nombres', 'nombre', 'razonsocial', 'razon_social'];

function ident(valor) {
  return '"' + String(valor).replace(/"/g, '""') + '"';
}

function esAdministrativo(req) {
  const session = getSession(req);
  return session && String(session.segapp || '').trim().toUpperCase() === 'ADMINISTRATIVO';
}

function requiereAdministrativo(req, res) {
  if (!esAdministrativo(req)) {
    res.status(403).json({ error: 'Solo los usuarios ADMINISTRATIVO pueden procesar pesajes.' });
    return false;
  }
  req.session = getSession(req);
  return true;
}

async function metadatosClientes(client) {
  const tablas = await client.query(`
    SELECT table_schema, table_name
    FROM information_schema.tables
    WHERE table_type = 'BASE TABLE'
      AND lower(table_name) = 'clientes'
    ORDER BY CASE WHEN table_schema = 'public' THEN 0 ELSE 1 END
    LIMIT 1
  `);
  if (!tablas.rows.length) throw new Error('No existe la tabla clientes.');

  const { table_schema: esquema, table_name: tabla } = tablas.rows[0];
  const columnas = await client.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = $1 AND table_name = $2
    ORDER BY ordinal_position
  `, [esquema, tabla]);

  const disponibles = columnas.rows.map(r => r.column_name);
  const buscar = candidatos => disponibles.find(col => candidatos.includes(col.toLowerCase()));
  const colRuc = buscar(RUC_CANDIDATOS);
  const colNombre = buscar(NOMBRE_CANDIDATOS);

  if (!colRuc || !colNombre) {
    throw new Error('No se encontraron RUC/cédula y nombre en clientes.');
  }

  return { esquema, tabla, colRuc, colNombre };
}

async function clientes(req, res) {
  let client;
  try {
    client = pool.createDedicatedClient();
    await client.connect();

    const meta = await metadatosClientes(client);
    const q = String(req.query.q || '').trim();
    const valores = [];
    let where = '';

    if (q) {
      valores.push('%' + q + '%');
      where = `WHERE CAST(${ident(meta.colRuc)} AS text) ILIKE $1
                 OR CAST(${ident(meta.colNombre)} AS text) ILIKE $1`;
    }

    const result = await client.query(`
      SELECT
        CAST(${ident(meta.colRuc)} AS text) AS "ruccedcli",
        CAST(${ident(meta.colNombre)} AS text) AS "nombre"
      FROM ${ident(meta.esquema)}.${ident(meta.tabla)}
      ${where}
      ORDER BY ${ident(meta.colNombre)} ASC NULLS LAST
      LIMIT 1000
    `, valores);

    res.json({ clientes: result.rows });
  } catch (error) {
    console.error('[PESAJE AVI] Error clientes:', error);
    res.status(500).json({ error: 'Error consultando clientes.', detail: error.message });
  } finally {
    if (client) await client.end().catch(() => {});
  }
}

async function granjas(req, res) {
  let client;
  try {
    client = pool.createDedicatedClient();
    await client.connect();

    const result = await client.query(`
      SELECT codproy, proyecto
      FROM proyectos
      WHERE UPPER(TRIM(tiparea)) = 'AVICOLA'
        AND activo = TRUE
      ORDER BY proyecto
    `);

    res.json({ granjas: result.rows });
  } catch (error) {
    console.error('[PESAJE AVI] Error granjas:', error);
    res.status(500).json({ error: 'Error consultando granjas.', detail: error.message });
  } finally {
    if (client) await client.end().catch(() => {});
  }
}

async function listar(req, res) {
  let client;
  try {
    client = pool.createDedicatedClient();
    await client.connect();

    const meta = await metadatosClientes(client);

    const result = await client.query(`
      SELECT
        p.id,
        p.fecha,
        p.ruccedcli,
        COALESCE(CAST(c.${ident(meta.colNombre)} AS text), CAST(p.ruccedcli AS text)) AS cliente,
        p.codproy,
        COALESCE(pr.proyecto, p.codproy) AS granja,
        p.galpon,
        p.lote,
        p.nota_guia,
        p.observacion,
        p.cantidad_aves,
        p.peso_total,
        p.peso_promedio,
        p.estado,
        p.precio,
        p.valor_total,
        p.creadopor,
        p.fechacreacion,
        p.procesadopor,
        p.fechaproceso
      FROM pesajes_avicolas p
      LEFT JOIN proyectos pr ON pr.codproy = p.codproy
      LEFT JOIN clientes c
        ON CAST(c.${ident(meta.colRuc)} AS text) = CAST(p.ruccedcli AS text)
      ORDER BY p.fecha DESC, p.id DESC
      LIMIT 200
    `);

    res.json({ pesajes: result.rows });
  } catch (error) {
    console.error('[PESAJE AVI] Error historial:', error);
    res.status(500).json({ error: 'Error consultando pesajes.', detail: error.message });
  } finally {
    if (client) await client.end().catch(() => {});
  }
}

async function guardar(req, res) {
  const datos = req.body || {};
  const fecha = String(datos.fecha || '').trim();
  const ruccedcli = String(datos.ruccedcli || '').trim();
  const codproy = String(datos.codproy || '').trim();
  const galpon = String(datos.galpon || '').trim();
  const lote = String(datos.lote || '').trim();
  const nota_guia = String(datos.nota_guia || '').trim();
  const observacion = String(datos.observacion || '').trim();
  const pesos = Array.isArray(datos.pesos) ? datos.pesos : [];

  if (!fecha) return res.status(400).json({ error: 'La fecha es obligatoria.' });
  if (!ruccedcli) return res.status(400).json({ error: 'Seleccione un cliente.' });
  if (!codproy) return res.status(400).json({ error: 'Seleccione una granja.' });
  if (!pesos.length) return res.status(400).json({ error: 'Debe ingresar al menos un peso.' });

  const pesosNumericos = pesos.map(Number);
  if (pesosNumericos.some(peso => !Number.isFinite(peso) || peso <= 0)) {
    return res.status(400).json({ error: 'Todos los pesos deben ser mayores que cero.' });
  }

  const pesoTotal = pesosNumericos.reduce((suma, peso) => suma + peso, 0);
  const cantidadAves = pesosNumericos.length;
  const pesoPromedio = pesoTotal / cantidadAves;

  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');

    const cabecera = await client.query(`
      INSERT INTO pesajes_avicolas (
        fecha, ruccedcli, codproy, galpon, lote,
        nota_guia, observacion, cantidad_aves,
        peso_total, peso_promedio, estado, creadopor
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'INGRESADO',$11)
      RETURNING id, fecha, cantidad_aves, peso_total, peso_promedio, estado
    `, [
      fecha, ruccedcli, codproy, galpon || null, lote || null,
      nota_guia || null, observacion || null, cantidadAves,
      pesoTotal.toFixed(2), pesoPromedio.toFixed(2),
      req.session?.usuario || null
    ]);

    const pesajeId = cabecera.rows[0].id;

    for (let i = 0; i < pesosNumericos.length; i++) {
      await client.query(`
        INSERT INTO pesajes_avicolas_detalle (pesaje_id, numero_ave, peso)
        VALUES ($1, $2, $3)
      `, [pesajeId, i + 1, pesosNumericos[i].toFixed(2)]);
    }

    await client.query('COMMIT');
    res.status(201).json({ mensaje: 'Pesaje guardado correctamente.', pesaje: cabecera.rows[0] });
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    console.error('[PESAJE AVI] Error guardando:', error);
    res.status(500).json({ error: 'No se pudo guardar el pesaje.', detail: error.message });
  } finally {
    if (client) client.release();
  }
}

async function detalle(req, res) {
  let client;
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'ID de pesaje inválido.' });

    client = await pool.connect();

    const meta = await metadatosClientes(client);
    const cabecera = await client.query(`
      SELECT
        p.*,
        COALESCE(CAST(c.${ident(meta.colNombre)} AS text), CAST(p.ruccedcli AS text)) AS cliente,
        COALESCE(pr.proyecto, p.codproy) AS granja
      FROM pesajes_avicolas p
      LEFT JOIN proyectos pr ON pr.codproy = p.codproy
      LEFT JOIN clientes c
        ON CAST(c.${ident(meta.colRuc)} AS text) = CAST(p.ruccedcli AS text)
      WHERE p.id = $1
    `, [id]);

    if (!cabecera.rows.length) return res.status(404).json({ error: 'Pesaje no encontrado.' });

    const detalle = await client.query(`
      SELECT numero_ave, peso
      FROM pesajes_avicolas_detalle
      WHERE pesaje_id = $1
      ORDER BY numero_ave
    `, [id]);

    res.json({ pesaje: cabecera.rows[0], pesos: detalle.rows });
  } catch (error) {
    console.error('[PESAJE AVI] Error detalle:', error);
    res.status(500).json({ error: 'Error consultando el pesaje.', detail: error.message });
  } finally {
    if (client) client.release();
  }
}

async function procesar(req, res) {
  if (!requiereAdministrativo(req, res)) return;

  const id = Number(req.params.id);
  const precio = Number(req.body?.precio);

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'ID de pesaje inválido.' });
  }
  if (!Number.isFinite(precio) || precio <= 0) {
    return res.status(400).json({ error: 'Ingrese un precio mayor que cero.' });
  }

  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');

    const actual = await client.query(`
      SELECT id, peso_total, estado
      FROM pesajes_avicolas
      WHERE id = $1
      FOR UPDATE
    `, [id]);

    if (!actual.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Pesaje no encontrado.' });
    }

    if (actual.rows[0].estado !== 'INGRESADO') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'El pesaje ya fue procesado o no se encuentra en estado INGRESADO.' });
    }

    const pesoTotal = Number(actual.rows[0].peso_total);
    const valorTotal = pesoTotal * precio;

    const actualizado = await client.query(`
      UPDATE pesajes_avicolas
      SET estado = 'PROCESADO',
          precio = $2,
          valor_total = $3,
          procesadopor = $4,
          fechaproceso = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING id, estado, precio, valor_total, procesadopor, fechaproceso
    `, [id, precio.toFixed(4), valorTotal.toFixed(2), req.session?.usuario || null]);

    await client.query('COMMIT');
    res.json({ mensaje: 'Pesaje procesado correctamente.', pesaje: actualizado.rows[0] });
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    console.error('[PESAJE AVI] Error procesando:', error);
    res.status(500).json({ error: 'No se pudo procesar el pesaje.', detail: error.message });
  } finally {
    if (client) client.release();
  }
}

async function reporte(req, res) {
  let client;
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'ID de pesaje inválido.' });
    }

    client = await pool.connect();
    const meta = await metadatosClientes(client);

    const empresaResult = await client.query(`
      SELECT nombre_comercial, ruc, direccion, email, telefono
      FROM empresa
      LIMIT 1
    `);

    const result = await client.query(`
      SELECT
        p.*,
        COALESCE(CAST(c.${ident(meta.colNombre)} AS text), CAST(p.ruccedcli AS text)) AS cliente,
        COALESCE(pr.proyecto, p.codproy) AS granja
      FROM pesajes_avicolas p
      LEFT JOIN proyectos pr ON pr.codproy = p.codproy
      LEFT JOIN clientes c
        ON CAST(c.${ident(meta.colRuc)} AS text) = CAST(p.ruccedcli AS text)
      WHERE p.id = $1
    `, [id]);

    if (!result.rows.length) {
      return res.status(404).json({ error: 'Pesaje no encontrado.' });
    }

    const detalle = await client.query(`
      SELECT numero_ave, peso
      FROM pesajes_avicolas_detalle
      WHERE pesaje_id = $1
      ORDER BY numero_ave
    `, [id]);

    const empresa = empresaResult.rows[0] || {};
    const p = result.rows[0];
    const pesos = detalle.rows || [];

    const doc = new PDFDocument({
      size: 'A4',
      layout: 'landscape',
      margin: 0,
      info: {
        Title: 'Reporte de Pesaje Avícola #' + p.id,
        Author: empresa.nombre_comercial || 'Avícola y Porcina Luisin'
      }
    });

    const nombreArchivo = 'reporte-pesaje-' + p.id + '.pdf';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="' + nombreArchivo + '"');
    doc.pipe(res);

    const pageWidth = doc.page.width;
    const pageHeight = doc.page.height;
    const left = 29;
    const right = pageWidth - 29;
    const usableWidth = right - left;

    const azul = '#073674';
    const azulClaro = '#eef4fb';
    const gris = '#667085';
    const borde = '#d9dee7';
    const verde = '#198754';
    const amarillo = '#856404';

    const texto = (valor, defecto = '—') => {
      const t = valor === null || valor === undefined ? '' : String(valor).trim();
      return t || defecto;
    };

    const num = (valor, dec = 2) => Number(valor || 0).toLocaleString('es-EC', {
      minimumFractionDigits: dec,
      maximumFractionDigits: dec
    });

    const money = (valor, dec = 2) => '$ ' + num(valor, dec);

    const fechaEC = valor => {
      if (!valor) return '';
      const textoFecha = valor instanceof Date
        ? valor.toISOString().slice(0, 10)
        : String(valor).slice(0, 10);
      const partes = textoFecha.split('-');
      return partes.length === 3 ? partes[2] + '/' + partes[1] + '/' + partes[0] : textoFecha;
    };

    const fechaHoraEC = valor => {
      if (!valor) return '—';
      const d = new Date(valor);
      return Number.isNaN(d.getTime()) ? String(valor) : d.toLocaleString('es-EC');
    };

    // Línea superior del formato.
    doc.moveTo(0, 2).lineTo(pageWidth, 2)
      .lineWidth(1).strokeColor('#222222').stroke();

    // LOGO: el archivo del proyecto es SVG; PDFKit no inserta SVG directamente.
    const logoPath = require('path').join(__dirname, '../../public/img/logonuevov2.svg');
    try {
      const logoSvg = fs.readFileSync(logoPath, 'utf8');
      SVGtoPDF(doc, logoSvg, left + 3, 12, {
        width: 92,
        height: 92,
        preserveAspectRatio: 'xMidYMid meet'
      });
    } catch (logoError) {
      console.error('[PESAJE AVI] No se pudo cargar el logo SVG:', logoError.message);
    }

    // ENCABEZADO EMPRESA
    const empresaX = left + 112;

    doc.font('Helvetica-Bold').fontSize(17.5).fillColor(azul)
      .text(texto(empresa.nombre_comercial, 'AVICOLA & PORCINA LUISIN'), empresaX, 32, {
        width: 420,
        lineBreak: false
      });

    doc.font('Helvetica').fontSize(7.8).fillColor(gris)
      .text('REPORTE DE PESAJE AVÍCOLA', empresaX, 58, {
        width: 420,
        lineBreak: false
      });

    // DATOS DE EMPRESA A LA DERECHA
    const empresaRightX = right - 150;
    const empresaRightW = 150;

    function empresaLineaDerecha(label, valor, y) {
      doc.font('Helvetica-Bold').fontSize(6.7).fillColor(azul)
        .text(label, empresaRightX, y, {
          width: empresaRightW,
          align: 'right',
          lineBreak: false
        });
      if (valor !== null && valor !== undefined && String(valor).trim()) {
        doc.font('Helvetica').fontSize(6.7).fillColor('#303b4a')
          .text(String(valor).trim(), empresaRightX, y + 7, {
            width: empresaRightW,
            align: 'right',
            ellipsis: true,
            lineBreak: false
          });
      }
    }

    const empresaFilas = [
      ['RUC:', empresa.ruc],
      ['DIRECCIÓN:', empresa.direccion],
      ['TELÉFONO:', empresa.telefono],
      ['EMAIL:', empresa.email]
    ];
    empresaFilas.forEach(([label, valor], indiceFila) => {
      empresaLineaDerecha(label, valor, 24 + indiceFila * 19);
    });

    // TÍTULO DEL PESAJE
    doc.font('Helvetica-Bold').fontSize(20).fillColor('#303b4a')
      .text('PESAJE #' + String(p.id).padStart(10, '0'), left, 88, {
        width: usableWidth,
        align: 'center',
        lineBreak: false
      });

    doc.font('Helvetica-Bold').fontSize(8).fillColor(
      String(p.estado).toUpperCase() === 'PROCESADO' ? verde : amarillo
    ).text('ESTADO: ' + texto(p.estado), right - 140, 109, {
      width: 140,
      align: 'right',
      lineBreak: false
    });

    // DATOS PRINCIPALES: distribución igual al formato sugerido.
    const infoY = 129;
    const gap = 8;
    const infoAvailable = usableWidth - gap * 3;
    const infoWeights = [1.00, 1.32, 0.67, 1.00];
    const infoWeightTotal = infoWeights.reduce((a, b) => a + b, 0);
    const infoWidths = infoWeights.map(w => infoAvailable * w / infoWeightTotal);
    const infoH = 50;

    const bloques = [
      ['FECHA', fechaEC(p.fecha), 'GRANJA', texto(p.granja)],
      ['RUC / CÉDULA', texto(p.ruccedcli), 'CLIENTE', texto(p.cliente || p.ruccedcli)],
      ['CÓDIGO GRANJA', texto(p.codproy), 'GALPÓN', texto(p.galpon)],
      ['LOTE', texto(p.lote), 'NOTA / GUÍA', texto(p.nota_guia)]
    ];

    let infoX = left;
    for (let i = 0; i < 4; i++) {
      const x = infoX;
      const infoW = infoWidths[i];

      doc.roundedRect(x, infoY, infoW, infoH, 5)
        .fillColor(azulClaro).fill()
        .lineWidth(0.45).strokeColor(borde).stroke();

      doc.font('Helvetica-Bold').fontSize(6.3).fillColor(gris)
        .text(bloques[i][0], x + 8, infoY + 7, {
          width: infoW - 16,
          lineBreak: false
        });

      doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#303b4a')
        .text(bloques[i][1], x + 8, infoY + 18, {
          width: infoW - 16,
          ellipsis: true,
          lineBreak: false
        });

      doc.font('Helvetica-Bold').fontSize(6.3).fillColor(gris)
        .text(bloques[i][2], x + 8, infoY + 31, {
          width: infoW - 16,
          lineBreak: false
        });

      doc.font('Helvetica').fontSize(7.2).fillColor('#303b4a')
        .text(bloques[i][3], x + 8, infoY + 41, {
          width: infoW - 16,
          ellipsis: true,
          lineBreak: false
        });

      infoX += infoW + gap;
    }

    // RESUMEN: misma distribución visual del formato sugerido.
    const resumenY = 190;
    const tarjetaGap = 9;
    const escala = usableWidth / 828;
    const avesW = 74 * escala;
    const pesoW = 125 * escala;
    const promedioW = 112 * escala;
    const precioW = 136 * escala;
    const valorW = 200 * escala;
    const tarjetaH = 45;

    function tarjetaResumen(x, w, titulo, valor, valorColor, fondo, bordeColor) {
      doc.roundedRect(x, resumenY, w, tarjetaH, 5)
        .fillColor(fondo).fill()
        .lineWidth(0.45).strokeColor(bordeColor).stroke();

      doc.font('Helvetica-Bold').fontSize(6.4).fillColor(
        titulo === 'PRECIO POR KG' ? amarillo : gris
      ).text(titulo, x + 8, resumenY + 7, {
        width: w - 16,
        lineBreak: false
      });

      doc.font('Helvetica-Bold').fontSize(10.5).fillColor(valorColor)
        .text(valor, x + 8, resumenY + 20, {
          width: w - 16,
          ellipsis: true,
          lineBreak: false
        });
    }

    tarjetaResumen(left, avesW, 'AVES PESADAS', num(p.cantidad_aves, 0), azul, '#f8fafc', borde);

    const pesoX = left + avesW + tarjetaGap;
    tarjetaResumen(pesoX, pesoW, 'PESO TOTAL', num(p.peso_total) + ' kg', azul, '#f8fafc', borde);

    const promedioX = pesoX + pesoW + tarjetaGap;
    tarjetaResumen(promedioX, promedioW, 'PESO PROMEDIO', num(p.peso_promedio) + ' kg', azul, '#f8fafc', borde);

    const valorX = right - valorW;
    const precioX = valorX - tarjetaGap - precioW;

    tarjetaResumen(precioX, precioW, 'PRECIO POR KG',
      p.precio == null ? '—' : money(p.precio, 4),
      '#604a00', '#fffaf0', '#ead8ad');

    tarjetaResumen(valorX, valorW, 'VALOR TOTAL',
      p.valor_total == null ? '—' : money(p.valor_total),
      verde, '#f8fafc', borde);

    // REGISTRO Y PROCESAMIENTO
    doc.font('Helvetica').fontSize(6.6).fillColor(gris)
      .text(
        'Registrado por: ' + texto(p.creadopor) +
        ' | Creación: ' + fechaHoraEC(p.fechacreacion) +
        ' | Procesado por: ' + texto(p.procesadopor) +
        ' | Proceso: ' + fechaHoraEC(p.fechaproceso),
        right - 500, 248, {
          width: 500,
          align: 'right',
          lineBreak: false
        }
      );

    // DETALLE HORIZONTAL: 10 bloques por fila, exactamente como el formato sugerido.
    const paresPorFila = 10;
    const filaH = 14;
    const headerY = 274;
    const headerH = 22;
    const colW = usableWidth / (paresPorFila * 2);
    let indice = 0;

    function cabeceraDetalle(y) {
      doc.roundedRect(left, y, usableWidth, headerH, 5)
        .fillColor(azul).fill();

      for (let i = 0; i < paresPorFila; i++) {
        const x = left + i * colW * 2;

        doc.font('Helvetica-Bold').fontSize(5.7).fillColor('#ffffff')
          .text('#', x + 1, y + 7, {
            width: colW - 2,
            align: 'center',
            lineBreak: false
          });

        doc.text('PESO (kg)', x + colW + 1, y + 7, {
          width: colW - 2,
          align: 'center',
          lineBreak: false
        });
      }
    }

    function dibujarDetallePagina(inicioY) {
      const filasDisponibles = Math.max(1, Math.floor((pageHeight - inicioY - 20) / filaH));
      const restantes = pesos.length - indice;
      const filas = pesos.length === 0 ? 1 : Math.min(filasDisponibles, Math.ceil(restantes / paresPorFila));
      const inicioIndice = indice;

      for (let fila = 0; fila < filas; fila++) {
        for (let bloque = 0; bloque < paresPorFila; bloque++) {
          const itemIndex = inicioIndice + fila + bloque * filas;
          const x = left + bloque * colW * 2;
          const y = inicioY + headerH + fila * filaH;
          const item = pesos[itemIndex];

          doc.rect(x, y, colW, filaH)
            .fillColor((fila + bloque) % 2 === 0 ? '#ffffff' : '#f8fafc')
            .fill().lineWidth(0.25).strokeColor(borde).stroke();

          doc.rect(x + colW, y, colW, filaH)
            .fillColor((fila + bloque) % 2 === 0 ? '#ffffff' : '#f8fafc')
            .fill().lineWidth(0.25).strokeColor(borde).stroke();

          if (item) {
            doc.font('Helvetica').fontSize(5.8).fillColor('#475467')
              .text(String(item.numero_ave), x + 1, y + 3.5, {
                width: colW - 2,
                align: 'center',
                lineBreak: false
              });

            doc.font('Helvetica-Bold').fontSize(5.8).fillColor(azul)
              .text(num(item.peso), x + colW + 1, y + 3.5, {
                width: colW - 2,
                align: 'center',
                lineBreak: false
              });
          }
        }
      }

      if (pesos.length === 0) {
        doc.font('Helvetica').fontSize(8).fillColor(gris)
          .text('No hay pesos registrados.', left, inicioY + headerH + 10);
        return;
      }

      indice += filas * paresPorFila;
    }

    cabeceraDetalle(headerY);
    dibujarDetallePagina(headerY);

    while (indice < pesos.length) {
      doc.addPage();
      doc.moveTo(0, 2).lineTo(pageWidth, 2)
        .lineWidth(1).strokeColor('#222222').stroke();

      doc.font('Helvetica-Bold').fontSize(12).fillColor(azul)
        .text('DETALLE DE PESOS — PESAJE #' + String(p.id).padStart(10, '0'), left, 18, {
          width: usableWidth,
          align: 'center',
          lineBreak: false
        });

      cabeceraDetalle(43);
      dibujarDetallePagina(43);
    }

    doc.end();
  } catch (error) {
    console.error('[PESAJE AVI] Error reporte:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'No se pudo generar el reporte.', detail: error.message });
    }
  } finally {
    if (client) await client.end().catch(() => {});
  }
}
module.exports = { clientes, granjas, listar, guardar, detalle, procesar, reporte };
