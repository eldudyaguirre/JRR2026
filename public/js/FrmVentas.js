let ventasActuales=[];

function abrirMenu(){document.getElementById('sidebar').classList.add('open');document.getElementById('overlay').classList.add('show');document.body.style.overflow='hidden'}
function cerrarMenu(){document.getElementById('sidebar').classList.remove('open');document.getElementById('overlay').classList.remove('show');document.body.style.overflow=''}
function toggleSubmenu(button){const grupo=button.closest('.menu-group');const estabaAbierto=grupo.classList.contains('open');document.querySelectorAll('.menu-group.open').forEach(item=>{item.classList.remove('open');const parent=item.querySelector('.menu-parent');if(parent)parent.setAttribute('aria-expanded','false')});if(!estabaAbierto){grupo.classList.add('open');button.setAttribute('aria-expanded','true')}}
async function cargarUsuario(){try{const r=await fetch('/api/session');if(!r.ok){location.href='/login.html';return}const d=await r.json();document.getElementById('profile-name').textContent=d.usuario||'-';document.getElementById('profile-user').textContent=d.nombre||d.usuario||'-'}catch(e){location.href='/login.html'}}
function formatoFecha(valor){if(!valor)return '-';const texto=String(valor);const match=texto.match(/^(\d{4})-(\d{2})-(\d{2})/);if(match)return `${match[3]}/${match[2]}/${match[1]}`;const d=new Date(valor);if(Number.isNaN(d.getTime()))return texto.slice(0,10);return d.toLocaleDateString('es-EC')}
function dinero(valor){if(valor===null||valor===undefined||valor==='')return '-';const n=Number(valor);return Number.isFinite(n)?n.toLocaleString('es-EC',{minimumFractionDigits:2,maximumFractionDigits:2}):String(valor)}
function texto(valor){return valor===null||valor===undefined||valor===''?'-':String(valor)}
function actualizarResumen(){const suma=(campo)=>ventasActuales.reduce((acumulado,r)=>acumulado+(Number(r[campo])||0),0);document.getElementById('resumen-subtotal-sin-iva').textContent=`$${dinero(suma('subtotalSinIva'))}`;document.getElementById('resumen-subtotal-con-iva').textContent=`$${dinero(suma('subtotalConIva'))}`;document.getElementById('resumen-iva').textContent=`$${dinero(suma('iva'))}`;document.getElementById('resumen-total').textContent=`$${dinero(suma('total'))}`}
function limpiarResumen(){document.getElementById('resumen-subtotal-sin-iva').textContent='$0.00';document.getElementById('resumen-subtotal-con-iva').textContent='$0.00';document.getElementById('resumen-iva').textContent='$0.00';document.getElementById('resumen-total').textContent='$0.00'}
function numeroRetencion(valor){return valor===null||valor===undefined||valor===''?'SIN RETENCION':String(valor)}
function pintarFilas(rows){ventasActuales=rows||[];const tbody=document.getElementById('ventas-body');if(!ventasActuales.length){tbody.innerHTML='<tr><td colspan="12" class="empty">No existen ventas para el rango seleccionado.</td></tr>';limpiarResumen();return}tbody.innerHTML=ventasActuales.map(r=>`<tr><td>${texto(r.cliente)}</td><td>${texto(r.rucCed)}</td><td>${formatoFecha(r.fecha)}</td><td>${texto(r.factura)}</td><td>${texto(r.autorizacion)}</td><td class="number">${dinero(r.subtotalSinIva)}</td><td class="number">${dinero(r.subtotalConIva)}</td><td class="number">${dinero(r.iva)}</td><td class="number">${dinero(r.total)}</td><td class="number">${dinero(r.retIva)}</td><td class="number">${dinero(r.retRenta)}</td><td>${numeroRetencion(r.numRetencion)}</td></tr>`).join('');actualizarResumen()}
async function cargarVentas(){const inicio=document.getElementById('fecha-inicio').value;const fin=document.getElementById('fecha-fin').value;const tbody=document.getElementById('ventas-body');tbody.innerHTML='<tr><td colspan="12" class="loading">Consultando ventas...</td></tr>';const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),35000);try{const r=await fetch(`/api/ventas?inicio=${encodeURIComponent(inicio)}&fin=${encodeURIComponent(fin)}&_=${Date.now()}`,{signal:controller.signal});const textoRespuesta=await r.text();let d={};try{d=JSON.parse(textoRespuesta)}catch(_){throw new Error(`El servidor respondió con HTTP ${r.status} sin JSON válido.`)}if(!r.ok)throw new Error(d.error||d.detail||`Error HTTP ${r.status}`);pintarFilas(d.ventas||[]);document.getElementById('count').textContent=`${d.total||0} registro(s)`}catch(e){ventasActuales=[];limpiarResumen();const mensaje=e.name==='AbortError'?'La consulta excedió los 35 segundos. Verifica la conexión con PostgreSQL.':(e.message||'No se pudieron consultar las ventas.');tbody.innerHTML=`<tr><td colspan="12" class="error">${texto(mensaje)}</td></tr>`;document.getElementById('count').textContent='Error'}finally{clearTimeout(timer)}}
function fechasIniciales(){const hoy=new Date();const y=hoy.getFullYear();const m=String(hoy.getMonth()+1).padStart(2,'0');const d=String(hoy.getDate()).padStart(2,'0');document.getElementById('fecha-inicio').value=`${y}-${m}-01`;document.getElementById('fecha-fin').value=`${y}-${m}-${d}`}
function exportarPDF(){
  if(!ventasActuales.length){alert('Primero debe consultar las ventas que desea exportar.');return}
  if(!window.jspdf||!window.jspdf.jsPDF){alert('No se pudo cargar el generador de PDF. Verifique la conexión a Internet y vuelva a intentarlo.');return}
  const {jsPDF}=window.jspdf;
  const doc=new jsPDF({orientation:'portrait',unit:'mm',format:'a4'});
  const inicio=document.getElementById('fecha-inicio').value;
  const fin=document.getElementById('fecha-fin').value;
  const fechaTexto=(valor)=>{if(!valor)return '-';const p=String(valor).split('-');return p.length===3?`${p[2]}/${p[1]}/${p[0]}`:valor};
  const money=(valor)=>{const n=Number(valor||0);return n.toLocaleString('es-EC',{minimumFractionDigits:2,maximumFractionDigits:2});};
  doc.setFont('helvetica','bold');
  doc.setFontSize(11);
  doc.text('DECLARACION MENSUAL DE IVA',105,10,{align:'center'});
  doc.setFontSize(13);
  doc.text('VENTAS',105,16,{align:'center'});
  doc.setFontSize(10);
  doc.text(`PERIODO DEL ${fechaTexto(inicio)} AL ${fechaTexto(fin)}`,105,22,{align:'center'});
  doc.text('ROMERO APOLO LUIS HILDER',105,28,{align:'center'});
  doc.text('RUC.0701005514001',105,34,{align:'center'});
  const body=ventasActuales.map((r,i)=>[
    String(i+1),texto(r.cliente),texto(r.rucCed),formatoFecha(r.fecha),texto(r.factura),texto(r.autorizacion),money(r.subtotalSinIva),money(r.subtotalConIva),money(r.iva),money(r.total),money(r.retIva),money(r.retRenta),numeroRetencion(r.numRetencion)
  ]);
  const suma=(campo)=>ventasActuales.reduce((acumulado,r)=>acumulado+(Number(r[campo])||0),0);
  const totalSubtotalSinIva=suma('subtotalSinIva');
  const totalSubtotalConIva=suma('subtotalConIva');
  const totalIva=suma('iva');
  const totalGeneral=suma('total');
  const totalRetIva=suma('retIva');
  const totalRetRenta=suma('retRenta');
  doc.autoTable({
    startY:39,
    head:[['N°','CLIENTE','RUC','FECHA','FACTURA','NUM AUT.','BASES SIN IVA','BASES CON IVA','IVA','TOTAL','RET IVA','RET RENTA','NUMERO RETENCION']],
    body,
    foot:[['','','','','','SUMATORIAS',money(totalSubtotalSinIva),money(totalSubtotalConIva),money(totalIva),money(totalGeneral),money(totalRetIva),money(totalRetRenta),'']],
    showFoot:'lastPage',
    theme:'grid',
    styles:{font:'helvetica',fontSize:5.0,cellPadding:0.7,lineColor:[100,100,100],lineWidth:0.15,textColor:[20,20,20],overflow:'linebreak',valign:'middle'},
    headStyles:{fontStyle:'bold',fontSize:5.0,halign:'center',fillColor:[245,245,245],textColor:[20,20,20]},
    footStyles:{fontStyle:'bold',fontSize:5.0,halign:'right',fillColor:[245,245,245],textColor:[20,20,20]},
    columnStyles:{0:{cellWidth:5,halign:'center'},1:{cellWidth:31},2:{cellWidth:12},3:{cellWidth:13,halign:'center'},4:{cellWidth:18},5:{cellWidth:25},6:{cellWidth:13,halign:'right'},7:{cellWidth:13,halign:'right'},8:{cellWidth:10,halign:'right'},9:{cellWidth:12,halign:'right'},10:{cellWidth:10,halign:'right'},11:{cellWidth:11,halign:'right'},12:{cellWidth:18}},
    margin:{left:8,right:8,top:8,bottom:8},
    didDrawPage:()=>{const page=doc.internal.getNumberOfPages();doc.setFont('helvetica','normal');doc.setFontSize(7);doc.text(`pag. ${page}`,202,289,{align:'right'})}
  });
  const nombre=`ventas_${inicio||'inicio'}_${fin||'fin'}.pdf`;
  doc.save(nombre);
}
async function cerrarSesion(){try{await fetch('/api/logout',{method:'POST'})}finally{location.href='/login.html'}}
document.addEventListener('DOMContentLoaded',()=>{fechasIniciales();cargarUsuario();cargarVentas()});
