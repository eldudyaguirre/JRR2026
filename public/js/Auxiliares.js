let actual={anio:new Date().getFullYear(),mes:new Date().getMonth()+1};

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=v=>Number(v||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
const fecha=v=>v?new Date(v).toLocaleDateString('es-EC',{day:'2-digit',month:'2-digit',year:'numeric'}):'';

function enlazarEventos(){
  const btnCuentas=document.getElementById('btn-cuentas');
  const btnConsultar=document.getElementById('btn-consultar');
  if(btnCuentas) btnCuentas.addEventListener('click',e=>{e.preventDefault();abrirCuentas();});
  if(btnConsultar) btnConsultar.addEventListener('click',e=>{e.preventDefault();consultar();});
  const input=document.getElementById('codcuenta');
  if(input) input.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();consultar();}});
}

async function cargarPeriodo(){
  try{
    const r=await fetch('/api/auxiliares/periodo?_='+Date.now());
    if(r.ok){
      const d=await r.json();
      if(Number(d.anio)) actual.anio=Number(d.anio);
      if(Number(d.mes)) actual.mes=Number(d.mes);
    }
  }catch(e){console.warn('[AUX] No se pudo obtener período:',e.message);}
  const mes=document.getElementById('mes');
  const anio=document.getElementById('anio');
  mes.innerHTML=Array.from({length:12},(_,i)=>'<option value="'+(i+1)+'">'+String(i+1).padStart(2,'0')+'</option>').join('');
  anio.innerHTML=Array.from({length:5},(_,i)=>'<option value="'+(actual.anio-i)+'">'+(actual.anio-i)+'</option>').join('');
  mes.value=String(actual.mes);
  anio.value=String(actual.anio);
}

function abrirCuentas(){
  const estado=document.getElementById('estado');
  estado.textContent='Cargando plan de cuentas...';
  fetch('/api/auxiliares/cuentas?_='+Date.now()).then(async r=>{ const d=await r.json();
    if(!r.ok) throw new Error(d.detail||d.error||'No se pudo cargar el plan de cuentas.');
    const cuentas=d.cuentas||[];
    if(!cuentas.length){estado.textContent='No existen cuentas disponibles.';return;}
    const box=document.createElement('div');
    box.className='cuentas-modal';
    box.innerHTML='<div class="cuentas-box"><div class="cuentas-head"><strong>Plan de Cuentas</strong><button type="button" id="cerrar-cuentas">×</button></div><div class="cuentas-body"><table class="cuentas-table"><tbody>'+cuentas.map((x,i)=>'<tr data-i="'+i+'"><td>'+esc(x.codcuenta)+'</td><td>'+esc(x.nomcuenta)+'</td></tr>').join('')+'</tbody></table></div></div>';
    document.body.appendChild(box);
    box.classList.add('show');
    box.addEventListener('click',e=>{
      if(e.target===box||e.target.id==='cerrar-cuentas'){box.remove();return;}
      const tr=e.target.closest('tr[data-i]');
      if(!tr)return;
      const x=cuentas[Number(tr.dataset.i)];
      document.getElementById('codcuenta').value=x.codcuenta||'';
      document.getElementById('nomcuenta').value=x.nomcuenta||'';
      box.remove();
      document.getElementById('codcuenta').focus();
      estado.textContent='Cuenta seleccionada. Presione Consultar.';
    });
    estado.textContent='Seleccione una cuenta.';
  }).catch(e=>{ console.error('[AUX CUENTAS]',e); estado.textContent=e.message; alert(e.message); });
}

async function consultar(){
  const cod=document.getElementById('codcuenta').value.trim();
  if(!cod){alert('Debe especificar una cuenta para consultar el auxiliar.');document.getElementById('codcuenta').focus();return;}
  const estado=document.getElementById('estado');
  estado.textContent='Consultando...';
  try{
    const r=await fetch('/api/auxiliares?codcuenta='+encodeURIComponent(cod)+'&mes='+encodeURIComponent(document.getElementById('mes').value)+'&anio='+encodeURIComponent(document.getElementById('anio').value)+'&_='+Date.now());
    const d=await r.json();
    if(!r.ok) throw new Error(d.detail||d.error||'No se pudo consultar el auxiliar.');
    document.getElementById('nomcuenta').value=d.cuenta.nomcuenta||'';
    document.getElementById('saldo-inicial').textContent=money(d.saldoInicial);
    document.getElementById('total-debe').textContent=money(d.totalDebe);
    document.getElementById('total-haber').textContent=money(d.totalHaber);
    document.getElementById('saldo-final').textContent=money(d.saldoFinal);
    document.getElementById('aux-body').innerHTML=d.movimientos.length?d.movimientos.map(x=>'<tr><td>'+esc(fecha(x.fecmovimi))+'</td><td>'+esc(x.numasient)+'</td><td>'+esc(x.referencia)+'</td><td>'+esc(x.valmovdeb||'')+'</td><td>'+esc(x.valmovhab||'')+'</td><td>'+esc(x.valsalpar||'')+'</td></tr>').join(''):'<tr><td colspan="6" class="vacio">No hay movimientos registrados para esta cuenta en este período.</td></tr>';
    estado.textContent='Información actualizada';
  }catch(e){
    console.error('[AUX CONSULTA]',e);
    estado.textContent=e.message;
    document.getElementById('aux-body').innerHTML='<tr><td colspan="6" class="vacio">'+esc(e.message)+'</td></tr>';
  }
}

document.addEventListener('DOMContentLoaded',async()=>{
  enlazarEventos();
  await cargarPeriodo();
});