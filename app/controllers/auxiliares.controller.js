const pool=require('../database/postgres');
const PDFDocument=require('pdfkit');

async function periodo(){
  const r=await pool.query('SELECT actperiod FROM parametroscontables LIMIT 1');
  const d=r.rows[0]?.actperiod?new Date(r.rows[0].actperiod):new Date();
  return{anio:d.getFullYear(),mes:d.getMonth()+1};
}

async function cargarAuxiliar(cod,anio,mes){
  const act=await periodo();
  const p=await pool.query('SELECT codcuenta,nomcuenta,tipcuenta,saliniper FROM plancuentas WHERE codcuenta::text=$1 LIMIT 1',[cod]);
  if(!p.rows.length)throw Object.assign(new Error('Código no registrado en el plan de cuentas.'),{status:404});
  const cuenta=p.rows[0];
  if(String(cuenta.tipcuenta||'').toUpperCase()==='G')throw Object.assign(new Error('No se puede seleccionar una cuenta de grupo. Seleccione otra por favor.'),{status:400});
  let rows=[],saldoInicial=0;
  const actual=anio===act.anio&&mes===act.mes;
  if(actual){
    const r=await pool.query("SELECT fecmovimi,numasient,referencia,valmovdeb,valmovhab,valsalpar,seqasient FROM mayorgeneral WHERE codcuenta::text=$1 ORDER BY CAST(NULLIF(trim(numasient::text),'') AS INTEGER),seqasient",[cod]);
    rows=r.rows;saldoInicial=Number(cuenta.saliniper||0);
  }else{
    const r=await pool.query('SELECT fecmovimi,numasient,referencia,valmovdeb,valmovhab,valsalpar,seqasient FROM hismaygeneral WHERE codcuenta::text=$1 AND año::text=$2 AND mes::text=$3 ORDER BY CAST(NULLIF(trim(numasient::text),\'\') AS INTEGER),año,mes,seqasient',[cod,String(anio),String(mes)]);
    rows=r.rows;
    const s=await pool.query('SELECT saliniper FROM hissaldos WHERE año::text=$1 AND mes::text=$2 AND codcuenta::text=$3 LIMIT 1',[String(anio),String(mes),cod]);
    if(!s.rows.length)throw Object.assign(new Error('No se encuentran datos para esta cuenta en el período especificado.'),{status:404});
    saldoInicial=Number(s.rows[0].saliniper||0);
  }
  let debe=0,haber=0;
  rows.forEach(x=>{debe+=Number(x.valmovdeb||0);haber+=Number(x.valmovhab||0)});
  const saldoFinal=cod[0]==='1'||cod[0]==='5'?saldoInicial+debe-haber:saldoInicial-debe+haber;
  return{cuenta,anio,mes,esActual:actual,saldoInicial,totalDebe:debe,totalHaber:haber,saldoFinal,movimientos:rows};
}

async function cuentas(req,res){
  try{
    const r=await pool.query("SELECT codcuenta,nomcuenta,tipcuenta,saliniper FROM plancuentas WHERE COALESCE(tipcuenta::text,'') <> 'G' ORDER BY codcuenta");
    res.json({cuentas:r.rows});
  }catch(e){console.error('[AUX CUENTAS]',e);res.status(500).json({error:'No se pudo cargar el plan de cuentas.',detail:e.message});}
}

async function obtener(req,res){
  try{
    const cod=String(req.query.codcuenta||'').trim();
    if(!cod)return res.status(400).json({error:'Debe especificar una cuenta.'});
    const act=await periodo();
    const anio=Number(req.query.anio||act.anio),mes=Number(req.query.mes||act.mes);
    res.json(await cargarAuxiliar(cod,anio,mes));
  }catch(e){console.error('[AUX]',e);res.status(e.status||500).json({error:'No se pudo consultar el auxiliar.',detail:e.message});}
}

function money(v){return Number(v||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});}
function dateText(v){if(!v)return '';const d=new Date(v);return Number.isNaN(d.getTime())?String(v):d.toLocaleDateString('es-EC',{day:'2-digit',month:'2-digit',year:'numeric'});}

function generarPDF(data,res){
  const doc=new PDFDocument({
    size:'A4',
    layout:'landscape',
    margin:0,
    bufferPages:true,
    info:{Title:'Auxiliar Contable',Author:'JRR CIA.LTDA.'}
  });

  res.setHeader('Content-Type','application/pdf');
  res.setHeader('Content-Disposition','inline; filename="auxiliar-contable.pdf"');
  doc.pipe(res);

  const left=30;
  const right=doc.page.width-30;
  const width=right-left;

  // Columnas separadas para evitar que las referencias invadan los valores.
  const wFecha=68;
  const wAsiento=52;
  const wDebe=78;
  const wHaber=78;
  const wSaldo=82;
  const wRef=width-wFecha-wAsiento-wDebe-wHaber-wSaldo;

  const xFecha=left;
  const xAsiento=xFecha+wFecha;
  const xRef=xAsiento+wAsiento;
  const xDebe=xRef+wRef;
  const xHaber=xDebe+wDebe;
  const xSaldo=xHaber+wHaber;

  const headerY=78;
  const firstY=95;
  const bottom=doc.page.height-42;
  const lineHeight=11;
  const fontSize=7.5;
  let y=firstY;
  let page=1;

  function encabezado(){
    doc.font('Helvetica-Bold').fontSize(10)
      .text('JRR CIA.LTDA. - 0791842952001 - CONTABILIDAD',left,25,{width,lineBreak:false});

    doc.font('Helvetica-Bold').fontSize(12)
      .text('AUXILIAR CONTABLE',left,43,{width,align:'center',lineBreak:false});

    doc.font('Helvetica-Bold').fontSize(8.5).text('CUENTA:',left,61,{lineBreak:false});
    doc.font('Helvetica').text(String(data.cuenta.codcuenta||''),left+42,61,{lineBreak:false});

    doc.font('Helvetica-Bold').text('NOMBRE:',left+190,61,{lineBreak:false});
    doc.font('Helvetica').text(String(data.cuenta.nomcuenta||''),left+235,61,{width:width-360,lineBreak:false});

    doc.font('Helvetica-Bold').text('PERÍODO:',right-125,61,{width:58,lineBreak:false});
    doc.font('Helvetica').text(String(data.mes).padStart(2,'0')+'/'+data.anio,right-62,61,{width:62,align:'right',lineBreak:false});

    doc.font('Helvetica-Bold').fontSize(8);
    doc.text('FECHA',xFecha,headerY,{width:wFecha,lineBreak:false});
    doc.text('ASIENTO',xAsiento,headerY,{width:wAsiento,lineBreak:false});
    doc.text('REFERENCIA',xRef,headerY,{width:wRef,lineBreak:false});
    doc.text('DEBE',xDebe,headerY,{width:wDebe,align:'right',lineBreak:false});
    doc.text('HABER',xHaber,headerY,{width:wHaber,align:'right',lineBreak:false});
    doc.text('SALDO',xSaldo,headerY,{width:wSaldo,align:'right',lineBreak:false});

    doc.moveTo(left,headerY+13).lineTo(right,headerY+13).lineWidth(.6).stroke();
  }

  function pie(){
    doc.font('Helvetica').fontSize(7)
      .text('pag. '+page,left,doc.page.height-25,{width,align:'right',lineBreak:false});
  }

  function nuevaPagina(){
    pie();
    doc.addPage();
    page++;
    encabezado();
    y=firstY;
  }

  encabezado();

  // Saldo inicial.
  doc.font('Helvetica-Bold').fontSize(fontSize)
    .text('SALDO INICIAL',xRef,y,{width:wRef,lineBreak:false});
  doc.font('Helvetica').fontSize(fontSize)
    .text(money(data.saldoInicial),xSaldo,y,{width:wSaldo,align:'right',lineBreak:false});
  y+=lineHeight+5;

  for(const r of data.movimientos){
    const referencia=String(r.referencia??'');
    const refHeight=Math.max(
      lineHeight,
      doc.heightOfString(referencia,{width:wRef,font:'Helvetica',fontSize})
    );
    const rowHeight=refHeight+3;

    if(y+rowHeight>bottom) nuevaPagina();

    doc.font('Helvetica').fontSize(fontSize);

    doc.text(dateText(r.fecmovimi),xFecha,y,{width:wFecha,lineBreak:false});
    doc.text(String(r.numasient??''),xAsiento,y,{width:wAsiento,lineBreak:false});

    // La referencia se ajusta dentro de su propia columna.
    doc.text(referencia,xRef,y,{width:wRef,lineBreak:true});

    doc.text(money(r.valmovdeb),xDebe,y,{width:wDebe,align:'right',lineBreak:false});
    doc.text(money(r.valmovhab),xHaber,y,{width:wHaber,align:'right',lineBreak:false});
    doc.text(r.valsalpar==null?'':money(r.valsalpar),xSaldo,y,{width:wSaldo,align:'right',lineBreak:false});

    y+=rowHeight;
  }

  if(y+lineHeight*3>bottom) nuevaPagina();

  doc.moveTo(left,y+2).lineTo(right,y+2).lineWidth(.6).stroke();
  y+=9;

  doc.font('Helvetica-Bold').fontSize(fontSize)
    .text('TOTALES',xRef,y,{width:wRef,lineBreak:false})
    .text(money(data.totalDebe),xDebe,y,{width:wDebe,align:'right',lineBreak:false})
    .text(money(data.totalHaber),xHaber,y,{width:wHaber,align:'right',lineBreak:false})
    .text(money(data.saldoFinal),xSaldo,y,{width:wSaldo,align:'right',lineBreak:false});

  pie();
  doc.end();
}

async function pdf(req,res){
  try{
    const cod=String(req.query.codcuenta||'').trim();
    if(!cod)return res.status(400).json({error:'Debe especificar una cuenta.'});
    const act=await periodo();
    const anio=Number(req.query.anio||act.anio),mes=Number(req.query.mes||act.mes);
    const data=await cargarAuxiliar(cod,anio,mes);
    generarPDF(data,res);
  }catch(e){console.error('[AUX PDF]',e);if(!res.headersSent)res.status(e.status||500).json({error:'No se pudo generar el PDF del auxiliar.',detail:e.message});else res.end();}
}

module.exports={cuentas,obtener,periodo,pdf};