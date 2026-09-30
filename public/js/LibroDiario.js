let movimientos=[];

function escapar(v){
  return String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function pintar(){
  const body=document.getElementById('diario-body');

  if(!movimientos.length){
    body.innerHTML='<tr><td colspan="5" class="vacio">No existen movimientos registrados en el Diario General.</td></tr>';
    document.getElementById('contador').textContent='0 movimientos';
    return;
  }

  body.innerHTML=movimientos.map(r=>{
    return '<tr>'+
      '<td class="fecha">'+escapar(r.fecha)+'</td>'+
      '<td class="codigo">'+escapar(r.codcuenta)+'</td>'+
      '<td class="cuenta">'+escapar(r.detalle)+'</td>'+
      '<td class="monto">'+escapar(r.debe)+'</td>'+
      '<td class="monto">'+escapar(r.haber)+'</td>'+
    '</tr>';
  }).join('');

  document.getElementById('contador').textContent=
    movimientos.length.toLocaleString('es-EC')+' registros';
}

async function cargar(){
  const estado=document.getElementById('estado');
  estado.textContent='Consultando detdiariogeneral...';

  try{
    const r=await fetch('/api/librodiario?_='+Date.now());
    const d=await r.json();

    if(!r.ok) throw new Error(d.detail||d.error||('HTTP '+r.status));

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
