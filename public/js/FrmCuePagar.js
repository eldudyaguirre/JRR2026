let reporteActual=null;

function abrirMenu(){document.getElementById('sidebar').classList.add('open');document.getElementById('overlay').classList.add('show');document.body.style.overflow='hidden'}
function cerrarMenu(){document.getElementById('sidebar').classList.remove('open');document.getElementById('overlay').classList.remove('show');document.body.style.overflow=''}
function toggleSubmenu(button){const grupo=button.closest('.menu-group');const estabaAbierto=grupo.classList.contains('open');document.querySelectorAll('.menu-group.open').forEach(item=>{item.classList.remove('open');const parent=item.querySelector('.menu-parent');if(parent)parent.setAttribute('aria-expanded','false')});if(!estabaAbierto){grupo.classList.add('open');button.setAttribute('aria-expanded','true')}}
async function cargarUsuario(){try{const r=await fetch('/api/session');if(!r.ok){location.href='/login';return}const d=await r.json();document.getElementById('profile-name').textContent=d.usuario||'-';document.getElementById('profile-user').textContent=d.nombre||d.usuario||'-'}catch(e){location.href='/login'}}
function texto(valor){return valor===null||valor===undefined||valor===''?'-':String(valor)}
function dinero(valor){const n=Number(valor||0);return Number.isFinite(n)?n.toLocaleString('es-EC',{minimumFractionDigits:2,maximumFractionDigits:2}):'0.00'}
function fecha(valor){if(!valor)return '-';const t=String(valor);const m=t.match(/^(\d{4})-(\d{2})-(\d{2})/);return m?`${m[3]}/${m[2]}/${m[1]}`:t.slice(0,10)}
function escapar(valor){return texto(valor).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function pintarReporte(d){
  reporteActual=d;
  const count=document.getElementById('count');
  if(count)count.textContent=`${d.totalProveedores||0} proveedor(es) · ${d.totalRegistros||0} cuenta(s)`;
  const cuerpo=document.getElementById('reporte-body');
  let html='';
  (d.proveedores||[]).forEach(p=>{
    html+=`<tr class="proveedor"><td colspan="4">${escapar(p.nomProvee)}</td></tr>`;
    (p.detalles||[]).forEach(r=>{
      html+=`<tr class="detalle"><td>${fecha(r.fecInicio)}</td><td>${fecha(r.fecVencim)}</td><td>${escapar(r.refCuePag)}</td><td class="valor">${dinero(r.valPagPar)}</td></tr>`;
    });
    html+=`<tr class="saldo"><td colspan="3">S A L D O&nbsp;&nbsp;T O T A L:</td><td class="valor">${dinero(p.saldoTotal)}</td></tr>`;
  });
  if(!html)html='<tr><td colspan="4" class="empty">No hay cuentas por pagar con estado PENDIENTE.</td></tr>';
  cuerpo.innerHTML=html;
  document.getElementById('total-general').textContent=dinero(d.totalGeneral);
}
async function cargarCuePagar(){
  const cuerpo=document.getElementById('reporte-body');
  cuerpo.innerHTML='<tr><td colspan="4" class="loading">Consultando cuentas por pagar...</td></tr>';
  try{
    const r=await fetch(`/api/cuepagar?_=${Date.now()}`);
    const respuesta=await r.text();
    let d={};
    try{d=JSON.parse(respuesta)}catch(_){throw new Error(`El servidor respondió con HTTP ${r.status} sin JSON válido.`)}
    if(!r.ok)throw new Error(d.detail?`${d.error||'Error consultando cuentas por pagar.'} ${d.detail}`:(d.error||`Error HTTP ${r.status}`));
    pintarReporte(d);
  }catch(e){
    reporteActual=null;
    cuerpo.innerHTML=`<tr><td colspan="4" class="error">${escapar(e.message||'No se pudieron consultar las cuentas por pagar.')}</td></tr>`;
    const count=document.getElementById('count');if(count)count.textContent='Error';
  }
}
function filasPDF(){
  const filas=[];
  (reporteActual?.proveedores||[]).forEach(p=>{
    filas.push([{content:p.nomProvee||'',colSpan:4,styles:{fontStyle:'bold',halign:'left',fillColor:[245,245,245]}}]);
    (p.detalles||[]).forEach(r=>filas.push([fecha(r.fecInicio),fecha(r.fecVencim),texto(r.refCuePag),dinero(r.valPagPar)]));
    filas.push([{content:'S A L D O  T O T A L:',colSpan:3,styles:{fontStyle:'bold',halign:'right'}},{content:dinero(p.saldoTotal),styles:{fontStyle:'bold',halign:'right'}}]);
  });
  return filas;
}
function exportarPDF(){
  if(!reporteActual){alert('Primero debe cargar las cuentas por pagar.');return}
  if(!reporteActual.proveedores?.length){alert('No hay cuentas por pagar pendientes.');return}
  if(!window.jspdf||!window.jspdf.jsPDF){alert('No se pudo cargar el generador de PDF.');return}
  const {jsPDF}=window.jspdf;
  const doc=new jsPDF({orientation:'portrait',unit:'mm',format:'a4'});
  doc.setFont('helvetica','normal');doc.setFontSize(14);doc.text('Complete Accounting System',105,9,{align:'center'});
  doc.setFont('helvetica','bold');doc.setFontSize(20);doc.text('Reporte de Cuentas por Pagar',105,18,{align:'center'});
  doc.autoTable({startY:27,head:[['Fecha Emisión','Fecha Vencim.','Referencia','Valor']],body:filasPDF(),theme:'grid',styles:{font:'helvetica',fontSize:7,cellPadding:1.3,lineColor:[100,100,100],lineWidth:.15,textColor:[20,20,20],overflow:'linebreak',valign:'middle'},headStyles:{fontStyle:'bold',fontSize:8,halign:'left',fillColor:[245,245,245],textColor:[20,20,20]},columnStyles:{0:{cellWidth:29,halign:'left'},1:{cellWidth:29,halign:'left'},2:{cellWidth:112,halign:'left'},3:{cellWidth:20,halign:'right'}},margin:{left:5,right:5,top:27,bottom:10},didDrawPage:()=>{const page=doc.internal.getNumberOfPages();doc.setFont('helvetica','normal');doc.setFontSize(7);doc.text(`pag. ${page}`,205,289,{align:'right'})}});
  doc.save('RepCuePag.pdf');
}
function imprimir(){window.print()}
async function cerrarSesion(){try{await fetch('/api/logout',{method:'POST'})}finally{location.href='/login'}}
document.addEventListener('DOMContentLoaded',()=>{cargarUsuario();cargarCuePagar()});
