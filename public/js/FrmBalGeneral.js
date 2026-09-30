let balanceActual = null;

function abrirMenu(){document.getElementById('sidebar').classList.add('open');document.getElementById('overlay').classList.add('show');document.body.style.overflow='hidden'}
function cerrarMenu(){document.getElementById('sidebar').classList.remove('open');document.getElementById('overlay').classList.remove('show');document.body.style.overflow=''}
function toggleSubmenu(button){const grupo=button.closest('.menu-group');const abierto=grupo.classList.contains('open');document.querySelectorAll('.menu-group.open').forEach(g=>{g.classList.remove('open');const b=g.querySelector('.menu-parent');if(b)b.setAttribute('aria-expanded','false')});if(!abierto){grupo.classList.add('open');button.setAttribute('aria-expanded','true')}}
async function cargarUsuario(){try{const r=await fetch('/api/session');if(!r.ok){location.href='/login';return}const d=await r.json();document.getElementById('profile-name').textContent=d.usuario||'-';document.getElementById('profile-user').textContent=d.nombre||d.usuario||'-'}catch(e){location.href='/login'}}
function dinero(v){const n=Number(v||0);return Number.isFinite(n)?n.toLocaleString('es-EC',{minimumFractionDigits:2,maximumFractionDigits:2}):'0.00'}
function escapar(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function inicializarFiltros(){
  const mes=document.getElementById('mes');const anio=document.getElementById('anio');
  for(let i=1;i<=12;i++){const o=document.createElement('option');o.value=String(i).padStart(2,'0');o.textContent=String(i).padStart(2,'0');mes.appendChild(o)}
  const actual=new Date().getFullYear();for(let i=0;i<5;i++){const y=actual-i;const o=document.createElement('option');o.value=y;o.textContent=y;anio.appendChild(o)}
  mes.value=String(new Date().getMonth()+1).padStart(2,'0');anio.value=actual;
  ['nivel','mes','anio'].forEach(id=>document.getElementById(id).addEventListener('change',cargarBalance));
}
function pintarLista(id, rows){
  const el=document.getElementById(id);let html='';
  for(const r of rows||[]){
    const nivel=Math.max(0,Number(r.nivel)||0);const raiz=String(r.codCuenta||'').length===1;
    html+=`<div class="account-row ${raiz?'root-account':''}" style="--indent:${nivel}"><span class="account-name">${escapar(r.nomCuenta)}</span><span class="account-value">${dinero(r.salFinPer)}</span></div>`;
  }
  el.innerHTML=html||'<div class="no-data">Sin cuentas con saldo.</div>';
}
function pintarBalance(d){
  balanceActual=d;
  document.getElementById('periodo').textContent=`PERIODO FISCAL: ${d.mes}/${d.anio}     ${d.nivel}`;
  pintarLista('activo',d.activo);pintarLista('pasivo',d.pasivo);pintarLista('patrimonio',d.patrimonio);
  document.getElementById('total-activo').textContent=dinero(d.totalActivo);document.getElementById('total-pasivo').textContent=dinero(d.totalPasivo);document.getElementById('total-patrimonio').textContent=dinero(d.totalPatrimonio);document.getElementById('total-activo-2').textContent=dinero(d.totalActivo);document.getElementById('total-pas-pat').textContent=dinero(d.totalPasivoPatrimonio);document.getElementById('resultado').textContent=dinero(d.resultadoEjercicio);
  document.getElementById('btn-print').disabled=false;document.getElementById('btn-pdf').disabled=false;
}
async function cargarBalance(){
  const params=new URLSearchParams({mes:document.getElementById('mes').value,anio:document.getElementById('anio').value,nivel:document.getElementById('nivel').value});
  document.getElementById('btn-print').disabled=true;document.getElementById('btn-pdf').disabled=true;
  ['activo','pasivo','patrimonio'].forEach(id=>document.getElementById(id).innerHTML='<div class="loading">Consultando...</div>');
  try{const r=await fetch(`/api/balgeneral?${params.toString()}&_=${Date.now()}`);const text=await r.text();let d={};try{d=JSON.parse(text)}catch(_){throw new Error(`HTTP ${r.status}: respuesta no válida`)}if(!r.ok)throw new Error(d.detail?`${d.error||'Error'} ${d.detail}`:(d.error||`HTTP ${r.status}`));pintarBalance(d)}catch(e){balanceActual=null;const msg=`<div class="error">${escapar(e.message)}</div>`;['activo','pasivo','patrimonio'].forEach(id=>document.getElementById(id).innerHTML=msg)}
}
function filasPDF(){
  const filas=[];const agregar=(titulo,rows,total)=>{filas.push({tipo:'seccion',texto:titulo});for(const r of rows||[])filas.push({tipo:'cuenta',texto:r.nomCuenta||'',valor:dinero(r.salFinPer),nivel:Number(r.nivel)||0,raiz:String(r.codCuenta||'').length===1});filas.push({tipo:'total',texto:`TOTAL ${titulo}:`,valor:dinero(total)})};
  agregar('ACTIVO',balanceActual.activo,balanceActual.totalActivo);agregar('PASIVO',balanceActual.pasivo,balanceActual.totalPasivo);agregar('PATRIMONIO',balanceActual.patrimonio,balanceActual.totalPatrimonio);return filas;
}
function encabezadoPDF(doc,pagina){
  // Cabecera con separación suficiente para evitar que PERIODO, CUENTAS y las líneas se monten.
  doc.setFont('helvetica','normal');
  doc.setFontSize(8);
  doc.text('Complete Accounting System - CONTABILIDAD',5,8);

  doc.setFont('helvetica','bold');
  doc.setFontSize(18);
  doc.text('BALANCE GENERAL',105,17,{align:'center'});

  // Período en su propia línea.
  doc.setFontSize(8);
  doc.text(`PERIODO FISCAL: ${balanceActual.mes}/${balanceActual.anio}     ${balanceActual.nivel}`,5,25);

  // Línea separadora debajo del período.
  doc.setLineWidth(0.35);
  doc.line(5,29,205,29);

  // Encabezados de columnas claramente separados de la línea anterior.
  doc.setFontSize(9);
  doc.text('CUENTAS',8,35);
  doc.text('VALORES',160,35);

  // Segunda línea separadora, debajo de los encabezados.
  doc.setLineWidth(0.25);
  doc.line(5,37,205,37);

  doc.setFont('helvetica','normal');
  doc.setFontSize(7);
  doc.text(`pag. ${pagina}`,205,289,{align:'right'});
}
function nuevaPaginaPDF(doc,pagina){doc.addPage();encabezadoPDF(doc,pagina);return 43}
function exportarPDF(){
  if(!balanceActual)return;
  if(!window.jspdf?.jsPDF){alert('No se pudo cargar el generador de PDF.');return}
  const {jsPDF}=window.jspdf;const doc=new jsPDF({orientation:'portrait',unit:'mm',format:'a4'});let pagina=1;let y=43;encabezadoPDF(doc,pagina);
  const filas=filasPDF();
  for(const f of filas){
    const alto=f.tipo==='cuenta'?4:f.tipo==='total'?6:5;
    if(y>279){pagina++;y=nuevaPaginaPDF(doc,pagina)}
    if(f.tipo==='seccion'){doc.setFont('helvetica','bold');doc.setFontSize(8);doc.text(f.texto,8,y);}
    else if(f.tipo==='cuenta'){doc.setFont('helvetica',f.raiz?'bold':'normal');doc.setFontSize(8);const indent=Math.min(45,(f.nivel||0)*3);doc.text(f.texto,8+indent,y,{maxWidth:145});doc.text(f.valor,198,y,{align:'right'});}
    else{doc.setFont('helvetica','bold');doc.setFontSize(9);doc.text(f.texto,145,y,{align:'right'});doc.text(f.valor,198,y,{align:'right'});}
    y+=alto;
  }
  if(y>268){pagina++;y=nuevaPaginaPDF(doc,pagina)}
  y+=5;doc.setFont('helvetica','bold');doc.setFontSize(9);doc.text(`TOTAL ACTIVO:  ${dinero(balanceActual.totalActivo)}     TOTAL PASIVO + PATRIMONIO:  ${dinero(balanceActual.totalPasivoPatrimonio)}`,105,y,{align:'center'});y+=7;doc.text(`RESULTADO DEL EJERCICIO:  ${dinero(balanceActual.resultadoEjercicio)}`,105,y,{align:'center'});doc.save(`BalanceGeneral_${balanceActual.mes}_${balanceActual.anio}.pdf`);
}
function imprimir(){window.print()}
async function cerrarSesion(){try{await fetch('/api/logout',{method:'POST'})}finally{location.href='/login'}}
document.addEventListener('DOMContentLoaded',()=>{cargarUsuario();inicializarFiltros();cargarBalance()});
