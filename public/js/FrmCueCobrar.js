let reporteActual=null;
let datosOriginales=null;
let filtroEdad='TODOS';

function abrirMenu(){document.getElementById('sidebar').classList.add('open');document.getElementById('overlay').classList.add('show');document.body.style.overflow='hidden'}
function cerrarMenu(){document.getElementById('sidebar').classList.remove('open');document.getElementById('overlay').classList.remove('show');document.body.style.overflow=''}
function toggleSubmenu(button){const grupo=button.closest('.menu-group');const estabaAbierto=grupo.classList.contains('open');document.querySelectorAll('.menu-group.open').forEach(item=>{item.classList.remove('open');const parent=item.querySelector('.menu-parent');if(parent)parent.setAttribute('aria-expanded','false')});if(!estabaAbierto){grupo.classList.add('open');button.setAttribute('aria-expanded','true')}}
async function cargarUsuario(){try{const r=await fetch('/api/session');if(!r.ok){location.href='/login';return}const d=await r.json();document.getElementById('profile-name').textContent=d.usuario||'-';document.getElementById('profile-user').textContent=d.nombre||d.usuario||'-'}catch(e){location.href='/login'}}
function texto(valor){return valor===null||valor===undefined||valor===''?'-':String(valor)}
function dinero(valor){const n=Number(valor||0);return Number.isFinite(n)?n.toLocaleString('es-EC',{minimumFractionDigits:2,maximumFractionDigits:2}):'0.00'}
function fecha(valor){if(!valor)return '-';const t=String(valor);const m=t.match(/^(\d{4})-(\d{2})-(\d{2})/);return m?`${m[3]}/${m[2]}/${m[1]}`:t.slice(0,10)}
function escapar(valor){return texto(valor).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function fechaLocalISO(){const ahora=new Date();return `${ahora.getFullYear()}-${String(ahora.getMonth()+1).padStart(2,'0')}-${String(ahora.getDate()).padStart(2,'0')}`}
function diasVencido(valor){
  if(!valor)return 0;
  const m=String(valor).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if(!m)return 0;
  const venc=new Date(Number(m[1]),Number(m[2])-1,Number(m[3]));
  const h=fechaLocalISO().split('-').map(Number);const hoy=new Date(h[0],h[1]-1,h[2]);
  return Math.floor((hoy-venc)/86400000);
}
function perteneceFiltro(row){
  const dias=diasVencido(row.fecVencim);
  switch(filtroEdad){
    case '1-30': return dias>=1 && dias<=30;
    case '30-45': return dias>30 && dias<=45;
    case '45-60': return dias>45 && dias<=60;
    case '60+': return dias>60;
    default: return true;
  }
}
function construirDatosFiltrados(){
  if(!datosOriginales)return null;
  const grupos=[];
  (datosOriginales.clientes||[]).forEach(cliente=>{
    const detalles=(cliente.detalles||[]).filter(perteneceFiltro);
    if(!detalles.length)return;
    grupos.push({rucCedCli:cliente.rucCedCli,nomClient:cliente.nomClient||'',detalles,saldoTotal:detalles.reduce((s,r)=>s+(Number(r.valPagPar)||0),0)});
  });
  return {...datosOriginales,clientes:grupos,totalClientes:grupos.length,totalRegistros:grupos.reduce((s,g)=>s+g.detalles.length,0),totalGeneral:grupos.reduce((s,g)=>s+g.saldoTotal,0)};
}
function pintarReporte(d){
  reporteActual=d;
  const count=document.getElementById('count');
  if(count)count.textContent=`${d.totalClientes||0} cliente(s) · ${d.totalRegistros||0} cuenta(s)`;
  const cuerpo=document.getElementById('reporte-body');let html='';
  (d.clientes||[]).forEach(p=>{
    html+=`<tr class="cliente"><td colspan="5">Cliente: ${escapar(p.nomClient||p.rucCedCli)}</td></tr>`;
    (p.detalles||[]).forEach(r=>{html+=`<tr class="detalle"><td>${fecha(r.fecInicio)}</td><td>${fecha(r.fecVencim)}</td><td>${escapar(r.numFactur)}</td><td>${escapar(r.refCueCob)}</td><td class="valor">${dinero(r.valPagPar)}</td></tr>`});
    html+=`<tr class="saldo"><td colspan="4">S A L D O&nbsp;&nbsp;T O T A L:</td><td class="valor">${dinero(p.saldoTotal)}</td></tr>`;
  });
  if(!html)html='<tr><td colspan="5" class="empty">No hay cuentas por cobrar para este filtro.</td></tr>';
  cuerpo.innerHTML=html;document.getElementById('total-general').textContent=dinero(d.totalGeneral);
  const etiqueta=document.getElementById('filtro-actual');if(etiqueta)etiqueta.textContent=document.getElementById('filtro-edad')?.selectedOptions[0]?.text||'TODOS';
}
function aplicarFiltroEdad(){filtroEdad=document.getElementById('filtro-edad').value;pintarReporte(construirDatosFiltrados())}
async function cargarCueCobrar(){
  const cuerpo=document.getElementById('reporte-body');cuerpo.innerHTML='<tr><td colspan="5" class="loading">Consultando cuentas por cobrar...</td></tr>';
  try{
    const r=await fetch(`/api/cuecobrar?_=${Date.now()}`);const respuesta=await r.text();let d={};
    try{d=JSON.parse(respuesta)}catch(_){throw new Error(`El servidor respondió con HTTP ${r.status} sin JSON válido.`)}
    if(!r.ok)throw new Error(d.detail?`${d.error||'Error consultando cuentas por cobrar.'} ${d.detail}`:(d.error||`Error HTTP ${r.status}`));
    datosOriginales=d;filtroEdad='TODOS';document.getElementById('filtro-edad').value='TODOS';pintarReporte(d);
  }catch(e){reporteActual=null;datosOriginales=null;cuerpo.innerHTML=`<tr><td colspan="5" class="error">${escapar(e.message||'No se pudieron consultar las cuentas por cobrar.')}</td></tr>`}
}
function filasPDF(){
  const filas=[];(reporteActual?.clientes||[]).forEach(p=>{filas.push([{content:`Cliente: ${p.nomClient||p.rucCedCli||''}`,colSpan:5,styles:{fontStyle:'bold',halign:'left',fillColor:[245,245,245]}}]);(p.detalles||[]).forEach(r=>filas.push([fecha(r.fecInicio),fecha(r.fecVencim),texto(r.numFactur),texto(r.refCueCob),dinero(r.valPagPar)]));filas.push([{content:'S A L D O  T O T A L:',colSpan:4,styles:{fontStyle:'bold',halign:'right'}},{content:dinero(p.saldoTotal),styles:{fontStyle:'bold',halign:'right'}}])});return filas;
}
function exportarPDF(){
  if(!reporteActual){alert('Primero debe cargar las cuentas por cobrar.');return}if(!reporteActual.clientes?.length){alert('No hay cuentas por cobrar para el filtro seleccionado.');return}if(!window.jspdf||!window.jspdf.jsPDF){alert('No se pudo cargar el generador de PDF.');return}
  const {jsPDF}=window.jspdf;const doc=new jsPDF({orientation:'portrait',unit:'mm',format:'a4'});doc.setFont('helvetica','normal');doc.setFontSize(14);doc.text('Complete Accounting System',105,9,{align:'center'});doc.setFont('helvetica','bold');doc.setFontSize(20);doc.text('Reporte de Cuentas por Cobrar',105,18,{align:'center'});doc.setFont('helvetica','normal');doc.setFontSize(9);doc.text(`Filtro: ${document.getElementById('filtro-edad')?.selectedOptions[0]?.text||'TODOS'}`,105,23,{align:'center'});
  doc.autoTable({startY:28,head:[['Fecha Emisión','Fecha Vencim.','Factura','Referencia','Valor']],body:filasPDF(),theme:'grid',styles:{font:'helvetica',fontSize:7,cellPadding:1.3,lineColor:[100,100,100],lineWidth:.15,textColor:[20,20,20],overflow:'linebreak',valign:'middle'},headStyles:{fontStyle:'bold',fontSize:8,halign:'left',fillColor:[245,245,245],textColor:[20,20,20]},columnStyles:{0:{cellWidth:27,halign:'left'},1:{cellWidth:27,halign:'left'},2:{cellWidth:40,halign:'left'},3:{cellWidth:76,halign:'left'},4:{cellWidth:20,halign:'right'}},margin:{left:5,right:5,top:28,bottom:10},didDrawPage:()=>{const page=doc.internal.getNumberOfPages();doc.setFont('helvetica','normal');doc.setFontSize(7);doc.text(`pag. ${page}`,205,289,{align:'right'})}});doc.save('RepCueCob.pdf');
}
function imprimir(){window.print()}
async function cerrarSesion(){try{await fetch('/api/logout',{method:'POST'})}finally{location.href='/login'}}
document.addEventListener('DOMContentLoaded',()=>{cargarUsuario();cargarCueCobrar()});
