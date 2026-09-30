let movimientos=[];

function escapar(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function dinero(v){const n=Number(v||0);return n? n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}):''}
function fecha(v){if(!v)return '';const d=new Date(v);return Number.isNaN(d.getTime())?String(v).slice(0,10):d.toLocaleDateString('es-EC',{day:'2-digit',month:'2-digit',year:'numeric'})}

function pintar(){
  const body=document.getElementById('diario-body');
  if(!movimientos.length){
    body.innerHTML='<tr><td colspan="5" class="vacio">No existen movimientos registrados en el Diario General.</td></tr>';
    document.getElementById('contador').textContent='0 movimientos';
    return;
  }
  let ultimo='';
  let html='';
  for(const r of movimientos){
    const asiento=String(r.numasient||'');
    if(asiento!==ultimo){
      html+='<tr class="asiento-row"><td colspan="4"><span class="asiento-badge">Asiento '+escapar(asiento)+'</span></td></tr>';
      ultimo=asiento;
    }
    const referencia=!String(r.codcuenta||'').trim();
    html+='<tr>'+
      '<td class="fecha">'+(asiento!==ultimo ? (r.fecha?fecha(r.fecha):'') : '')+'</td>'+
      '<td class="'+(referencia?'referencia':'codigo')+'">'+escapar(r.codcuenta||'')+'</td>'+
      '<td class="'+(referencia?'referencia':'cuenta')+'">'+escapar(r.detalle||'')+'</td>'+
      '<td class="monto">'+dinero(r.debe)+'</td>'+
      '<td class="monto">'+dinero(r.haber)+'</td>'+
      '</tr>';
  }
  body.innerHTML=html;
  document.getElementById('contador').textContent=movimientos.length.toLocaleString('es-EC')+' registros';
}

async function cargar(){
  const estado=document.getElementById('estado');
  estado.textContent='Consultando detdiariogeneral...';
  try{
    const r=await fetch('/api/librodiario?_='+Date.now());
    const d=await r.json();
    if(!r.ok)throw new Error(d.detail||d.error||('HTTP '+r.status));
    movimientos=d.movimientos||[];
    pintar();
    estado.textContent='Información actualizada';
    document.getElementById('fuente').textContent='Fuente: '+d.tabla;
  }catch(e){
    movimientos=[];
    pintar();
    estado.textContent='Error al consultar el Diario General';
    document.getElementById('fuente').textContent=e.message;
  }
}

function generarPDF(){
  window.open('/api/librodiario/pdf','_blank');
}

document.addEventListener('DOMContentLoaded',()=>{
  cargar();
  document.getElementById('btn-pdf').addEventListener('click',generarPDF);
});
