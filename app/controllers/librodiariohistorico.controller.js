const pool=require('../database/postgres');
const PDFDocument=require('pdfkit');

function ident(v){return '"'+String(v).replace(/"/g,'""')+'"';}
async function tablaHistorico(){
  const r=await pool.query(`SELECT table_schema,table_name FROM information_schema.tables
    WHERE table_type='BASE TABLE' AND table_schema NOT IN ('pg_catalog','information_schema')
    AND lower(table_name)='hisdetdiagen'
    ORDER BY CASE WHEN table_schema='public' THEN 0 ELSE 1 END LIMIT 1`);
  if(!r.rows.length) throw new Error('No se encontró la tabla HisDetDiaGen.');
  return r.rows[0];
}
async function periodo(){
  const r=await pool.query('SELECT actperiod FROM parametroscontables LIMIT 1');
  const d=r.rows[0]?.actperiod?new Date(r.rows[0].actperiod):new Date();
  return {anio:d.getFullYear(),mes:d.getMonth()+1};
}
async function listado(req,res){
  try{
    const act=await periodo();
    const anio=Number(req.query.anio||act.anio);
    const mes=Number(req.query.mes||act.mes);
    if(anio<1900||mes<1||mes>12)return res.status(400).json({error:'Período inválido.'});
    const t=await tablaHistorico();
    const sql=`SELECT * FROM ${ident(t.table_schema)}.${ident(t.table_name)}
      WHERE "año"::integer=$1 AND "mes"::integer=$2
      ORDER BY "año","mes","numasient","seqasient"`;
    const r=await pool.query(sql,[anio,mes]);
    res.json({anio,mes,rows:r.rows,tabla:t.table_schema+'.'+t.table_name});
  }catch(e){console.error('[DIARIO HISTORICO]',e);res.status(500).json({error:'No se pudo consultar el Diario Histórico.',detail:e.message});}
}
function money(v){const n=Number(v||0);return n? n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}):'';}
function dateText(v){if(!v)return '';const d=new Date(v);return Number.isNaN(d.getTime())?String(v):d.toLocaleDateString('es-EC',{day:'2-digit',month:'2-digit',year:'numeric'});}
async function pdf(req,res){
  try{
    const act=await periodo();
    const anio=Number(req.query.anio||act.anio);
    const mes=Number(req.query.mes||act.mes);
    const t=await tablaHistorico();

    const sql=`SELECT * FROM ${ident(t.table_schema)}.${ident(t.table_name)}
      WHERE "año"::integer=$1 AND "mes"::integer=$2
      ORDER BY "año","mes","numasient","seqasient"`;

    const rows=(await pool.query(sql,[anio,mes])).rows;

    if(!rows.length){
      return res.status(404).json({
        error:'No hay datos de movimientos registrados en el Diario en este período.'
      });
    }

    // El Diario General se imprime en A4 vertical.
    const doc=new PDFDocument({
      size:'A4',
      layout:'portrait',
      margin:0,
      bufferPages:true,
      info:{Title:'Diario General Histórico',Author:'JRR CIA.LTDA.'}
    });

    res.setHeader('Content-Type','application/pdf');
    res.setHeader('Content-Disposition','inline; filename="diario-general-historico.pdf"');
    doc.pipe(res);

    const left=30;
    const right=doc.page.width-30;
    const width=right-left;

    // Distribución vertical: FECHA | CODIGO | CUENTA / REFERENCIA | DEBE | HABER
    // La referencia recibe el espacio principal, como en el reporte original.
    const wFecha=70;
    const wCodigo=82;
    const wDebe=72;
    const wHaber=72;
    const wReferencia=width-wFecha-wCodigo-wDebe-wHaber;

    const xFecha=left;
    const xCodigo=xFecha+wFecha;
    const xReferencia=xCodigo+wCodigo;
    const xDebe=xReferencia+wReferencia;
    const xHaber=xDebe+wDebe;

    const headerY=78;
    const firstY=96;
    const bottom=doc.page.height-42;
    const lineHeight=9;
    const fontSize=7.2;

    let y=firstY;
    let page=1;

    function encabezado(){
      doc.font('Helvetica-Bold').fontSize(9)
        .text('JRR CIA.LTDA. - 0791842952001 - CONTABILIDAD',
          left,28,{width,lineBreak:false});

      doc.font('Helvetica-Bold').fontSize(16)
        .text('DIARIO GENERAL',
          left,48,{width,align:'center',lineBreak:false});

      doc.font('Helvetica-Bold').fontSize(8.5);
      doc.text('FECHA',xFecha,headerY,{width:wFecha,lineBreak:false});
      doc.text('CODIGO',xCodigo,headerY,{width:wCodigo,lineBreak:false});
      doc.text('CUENTA / REFERENCIA',xReferencia,headerY,
        {width:wReferencia,lineBreak:false});
      doc.text('DEBE',xDebe,headerY,
        {width:wDebe,align:'right',lineBreak:false});
      doc.text('HABER',xHaber,headerY,
        {width:wHaber,align:'right',lineBreak:false});

      doc.moveTo(left,headerY+14)
        .lineTo(right,headerY+14)
        .lineWidth(.6)
        .stroke();

      y=firstY;
    }

    function pie(){
      doc.font('Helvetica').fontSize(7)
        .text('Página '+page,left,doc.page.height-25,
          {width,lineBreak:false,align:'right'});
    }

    function nuevaPagina(){
      pie();
      doc.addPage();
      page++;
      encabezado();
    }

    encabezado();

    for(const r of rows){
      // Se conserva el contenido de la base sin trim, replace ni justificación.
      const fecha=String(r.fecha??'');
      const codigo=String(r.codcuenta??'');
      const referencia=String(r.detalle??'');

      doc.font('Helvetica').fontSize(fontSize);

      const refHeight=Math.max(
        lineHeight,
        doc.heightOfString(referencia,{
          width:wReferencia,
          font:'Helvetica',
          fontSize
        })
      );

      const rowHeight=refHeight+2;

      if(y+rowHeight>bottom){
        nuevaPagina();
      }

      doc.font('Helvetica').fontSize(fontSize);

      doc.text(fecha,xFecha,y,{width:wFecha,lineBreak:false});
      doc.text(codigo,xCodigo,y,{width:wCodigo,lineBreak:false});
      doc.text(referencia,xReferencia,y,{
        width:wReferencia,
        lineBreak:true
      });

      doc.text(money(r.debe),xDebe,y,{
        width:wDebe,
        align:'right',
        lineBreak:false
      });

      doc.text(money(r.haber),xHaber,y,{
        width:wHaber,
        align:'right',
        lineBreak:false
      });

      y+=rowHeight;
    }

    pie();
    doc.end();

  }catch(e){
    console.error('[DIARIO HISTORICO PDF]',e);
    if(!res.headersSent){
      res.status(500).json({
        error:'No se pudo generar el PDF.',
        detail:e.message
      });
    }else{
      res.end();
    }
  }
}
module.exports={listado,pdf,periodo};