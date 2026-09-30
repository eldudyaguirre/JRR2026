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
      WHERE "año"::text=$1 AND "mes"::text=$2
      ORDER BY "año","mes","numasient","seqasient"`;
    const r=await pool.query(sql,[String(anio),String(mes).padStart(2,'0')]);
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
      WHERE "año"::text=$1 AND "mes"::text=$2
      ORDER BY "año","mes","numasient","seqasient"`;
    const rows=(await pool.query(sql,[String(anio),String(mes).padStart(2,'0')])).rows;
    if(!rows.length)return res.status(404).json({error:'No hay datos de movimientos registrados en el Diario en este período.'});
    const doc=new PDFDocument({size:'A4',margin:0,bufferPages:true,info:{Title:'Diario General Histórico',Author:'JRR CIA.LTDA.'}});
    res.setHeader('Content-Type','application/pdf');res.setHeader('Content-Disposition','inline; filename="diario-general-historico.pdf"');doc.pipe(res);
    const left=30,right=doc.page.width-30,width=right-left;
    const xFecha=left,xCodigo=105,xRef=205,xDebe=470,xHaber=545,refW=xDebe-xRef-10,numW=62;
    let y=94,page=1;
    function head(){
      doc.font('Helvetica-Bold').fontSize(9).text('JRR CIA.LTDA. - 0791842952001 - CONTABILIDAD',left,28,{lineBreak:false});
      doc.font('Helvetica-Bold').fontSize(15).text('DIARIO GENERAL',left,48,{width,align:'center',lineBreak:false});
      doc.font('Helvetica-Bold').fontSize(8.5).text('FECHA',xFecha,76,{lineBreak:false});
      doc.text('CODIGO',xCodigo,76,{lineBreak:false});
      doc.text('CUENTA / REFERENCIA',xRef,76,{lineBreak:false});
      doc.text('DEBE',xDebe,76,{width:numW,align:'right',lineBreak:false});
      doc.text('HABER',xHaber,76,{width:numW,align:'right',lineBreak:false});
      doc.moveTo(left,89).lineTo(right,89).lineWidth(.6).stroke(); y=99;
    }
    function foot(){doc.font('Helvetica').fontSize(7).text('Página '+page,left,doc.page.height-25,{width,align:'right',lineBreak:false});}
    function next(){foot();doc.addPage();page++;head();}
    head();doc.font('Helvetica').fontSize(7);
    for(const r of rows){
      const ref=String(r.detalle??'');
      const h=Math.max(11,doc.heightOfString(ref,{width:refW,font:'Helvetica',fontSize:7})+2);
      if(y+h>doc.page.height-42)next();
      doc.text(dateText(r.fecha),xFecha,y,{width:65,lineBreak:false});
      doc.text(String(r.CodCuenta??''),xCodigo,y,{width:90,lineBreak:false});
      doc.text(ref,xRef,y,{width:refW,lineBreak:true});
      doc.text(money(r.Debe),xDebe,y,{width:numW,align:'right',lineBreak:false});
      doc.text(money(r.Haber),xHaber,y,{width:numW,align:'right',lineBreak:false});
      y+=h;
    }
    foot();doc.end();
  }catch(e){console.error('[DIARIO HISTORICO PDF]',e);if(!res.headersSent)res.status(500).json({error:'No se pudo generar el PDF.',detail:e.message});else res.end();}
}
module.exports={listado,pdf,periodo};