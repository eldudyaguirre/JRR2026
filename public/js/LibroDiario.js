let movimientos = [];

function abrirMenu(){document.getElementById('sidebar')?.classList.add('open');document.getElementById('overlay')?.classList.add('show');document.body.style.overflow='hidden'}
function cerrarMenu(){document.getElementById('sidebar')?.classList.remove('open');document.getElementById('overlay')?.classList.remove('show');document.body.style.overflow=''}
function toggleSubmenu(button){
  const grupo=button.closest('.menu-group');if(!grupo)return;
  const abierto=grupo.classList.contains('open');
  document.querySelectorAll('.menu-group.open').forEach(g=>{g.classList.remove('open');g.querySelector('.menu-parent')?.setAttribute('aria-expanded','false')});
  if(!abierto){grupo.classList.add('open');button.setAttribute('aria-expanded','true')}
}
async function cargarUsuario(){
  try{
    const r=await fetch('/api/session');
    if(!r.ok){location.href='/login';return}
    const d=await r.json();
    document.getElementById('profile-name').textContent=d.usuario||'-';
    document.getElementById('profile-user').textContent=d.nombre||d.usuario||'-';
  }catch(_){location.href='/login'}
}
function dinero(v){const n=Number(v||0);return Number.isFinite(n)?n.toLocaleString('es-EC',{minimumFractionDigits:2,maximumFractionDigits:2}):'0.00'}
function fecha(v){if(!v)return '';const s=String(v).slice(0,10),p=s.split('-');return p.length===3?p[2]+'/'+p[1]+'/'+p[0]:s}
function escapar(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}

function pintar(){
  const cuerpo=document.getElementById('diario-body'),sinDatos=document.getElementById('sin-datos');
  if(!movimientos.length){
    cuerpo.innerHTML='';sinDatos.hidden=false;
    document.getElementById('total-debe').textContent='0.00';
    document.getElementById('total-haber').textContent='0.00';
    document.getElementById('contador').textContent='0 movimientos';return;
  }
  sinDatos.hidden=true;
  let debe=0,haber=0,lastAsiento='',lastFecha='';
  cuerpo.innerHTML=movimientos.map(r=>{
    const d=Number(r.debe)||0,h=Number(r.haber)||0;debe+=d;haber+=h;
    const f=fecha(r.fecha),a=String(r.numAsiento||'');
    const mostrarFecha=f!==lastFecha,nuevoAsiento=a!==lastAsiento||f!==lastFecha;
    lastFecha=f;lastAsiento=a;
    return '<tr class="'+(nuevoAsiento?'asiento-inicio':'')+'">'+
      '<td class="fecha">'+(mostrarFecha?escapar(f):'')+'</td>'+
      '<td class="codigo">'+escapar(r.codCuenta)+'</td>'+
      '<td class="detalle">'+(a&&nuevoAsiento?'<span class="asiento">- '+escapar(a)+' -</span>':'')+
      '<span>'+escapar(r.detalle)+'</span></td>'+
      '<td class="numero">'+(d?dinero(d):'')+'</td>'+
      '<td class="numero">'+(h?dinero(h):'')+'</td></tr>';
  }).join('');
  document.getElementById('total-debe').textContent=dinero(debe);
  document.getElementById('total-haber').textContent=dinero(haber);
  document.getElementById('contador').textContent=movimientos.length.toLocaleString('es-EC')+' movimientos';
}

async function cargar(){
  const inicio=document.getElementById('inicio').value,fin=document.getElementById('fin').value,limite=document.getElementById('limite').value;
  const estado=document.getElementById('estado');estado.textContent='Consultando Libro Diario...';estado.className='estado cargando';
  try{
    const r=await fetch('/api/librodiario?inicio='+encodeURIComponent(inicio)+'&fin='+encodeURIComponent(fin)+'&limite='+encodeURIComponent(limite)+'&_='+Date.now());
    const d=await r.json();if(!r.ok)throw new Error(d.detail||d.error||('HTTP '+r.status));
    movimientos=d.movimientos||[];
    document.getElementById('fuente').textContent=d.tabla?'Fuente: '+d.tabla:'';
    estado.textContent='Actualizado: '+new Date().toLocaleTimeString('es-EC',{hour:'2-digit',minute:'2-digit'});
    estado.className='estado ok';pintar();
  }catch(e){
    movimientos=[];pintar();estado.textContent='No se pudo cargar el Libro Diario: '+e.message;estado.className='estado error';document.getElementById('fuente').textContent='';
  }
}
function imprimir(){window.print()}
function exportarCSV(){
  if(!movimientos.length)return;
  const filas=[['Fecha','Código de Cuenta','Detalle','Debe','Haber']].concat(movimientos.map(r=>[fecha(r.fecha),r.codCuenta,r.detalle,r.debe,r.haber]));
  const csv=filas.map(f=>f.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(';')).join('\n');
  const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8;'}),a=document.createElement('a');
  a.href=URL.createObjectURL(blob);a.download='libro_diario.csv';a.click();URL.revokeObjectURL(a.href);
}
async function cerrarSesion(){try{await fetch('/api/logout',{method:'POST'})}finally{location.href='/login'}}

document.addEventListener('DOMContentLoaded',()=>{
  cargarUsuario();
  const hoy=new Date(),inicio=new Date(hoy.getFullYear(),hoy.getMonth(),1),fin=new Date(hoy.getFullYear(),hoy.getMonth()+1,0);
  const iso=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  document.getElementById('inicio').value=iso(inicio);document.getElementById('fin').value=iso(fin);
  document.getElementById('btn-consultar').addEventListener('click',cargar);
  document.getElementById('btn-csv').addEventListener('click',exportarCSV);cargar();
});
