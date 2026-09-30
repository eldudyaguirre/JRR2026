let actual={anio:new Date().getFullYear(),mes:new Date().getMonth()+1};
function esc(v){return String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function llenarCombos(){
 const m=document.getElementById('mes'),a=document.getElementById('anio');
 const nombres=['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
 m.innerHTML=nombres.map((n,i)=>'<option value="'+(i+1)+'">'+String(i+1).padStart(2,'0')+' - '+n+'</option>').join('');
 a.innerHTML=Array.from({length:5},(_,i)=>'<option value="'+(actual.anio-i)+'">'+(actual.anio-i)+'</option>').join('');
 m.value=String(actual.mes);a.value=String(actual.anio);
}
async function cargarPeriodo(){
 llenarCombos();
 try{const r=await fetch('/api/librodiariohistorico/periodo?_='+Date.now(),{cache:'no-store'});if(r.ok){const d=await r.json();actual.anio=Number(d.anio)||actual.anio;actual.mes=Number(d.mes)||actual.mes;}}catch(e){}
 llenarCombos();consultar();
}
async function consultar(){
 const mes=document.getElementById('mes').value,anio=document.getElementById('anio').value;
 const body=document.getElementById('diario-body'),estado=document.getElementById('estado'),contador=document.getElementById('contador');
 body.innerHTML='';estado.textContent='Consultando...';
 try{
  const r=await fetch('/api/librodiariohistorico?anio='+encodeURIComponent(anio)+'&mes='+encodeURIComponent(mes),{cache:'no-store'});
  const d=await r.json();if(!r.ok)throw new Error(d.detail||d.error||'No se pudo consultar.');
  contador.textContent=d.rows.length+' movimientos';
  if(!d.rows.length){estado.textContent='No hay datos de movimientos registrados en el Diario en este período.';return;}
  body.innerHTML=d.rows.map(x=>'<tr><td>'+esc(x.fecha)+'</td><td>'+esc(x.codcuenta)+'</td><td>'+esc(x.detalle)+'</td><td class="num">'+esc(x.debe)+'</td><td class="num">'+esc(x.haber)+'</td></tr>').join('');
  estado.textContent='Período '+String(d.mes).padStart(2,'0')+'/'+d.anio;
 }catch(e){contador.textContent='';estado.textContent=e.message;}
}
function pdf(){const a=document.getElementById('anio').value,m=document.getElementById('mes').value;window.open('/api/librodiariohistorico/pdf?anio='+encodeURIComponent(a)+'&mes='+encodeURIComponent(m),'_blank');}
document.addEventListener('DOMContentLoaded',()=>{document.getElementById('btn-consultar').onclick=consultar;document.getElementById('btn-pdf').onclick=pdf;cargarPeriodo();});