let filasReporte=[];let vehiculos=[];
function dinero(v){const n=Number(v||0);return Number.isFinite(n)?n.toLocaleString('es-EC',{minimumFractionDigits:2,maximumFractionDigits:2}):'0.00'}
function fecha(v){if(!v)return '';const d=new Date(v);return Number.isNaN(d.getTime())?'':d.toLocaleDateString('es-EC')}
function escapar(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function pintarResumen(t){document.getElementById('total-registros').textContent=Number(t.total||0).toLocaleString('es-EC');document.getElementById('sum-siniva').textContent=dinero(t.totales?.sinIva);document.getElementById('sum-coniva').textContent=dinero(t.totales?.conIva);document.getElementById('sum-iva').textContent=dinero(t.totales?.iva);document.getElementById('sum-total').textContent=dinero(t.totales?.total)}
function pintarTabla(rows){const body=document.getElementById('reporte-body');if(!rows.length){body.innerHTML='<tr><td colspan="12" class="no-data">No existen movimientos para los filtros seleccionados.</td></tr>';return}body.innerHTML=rows.map(r=>`<tr><td>${fecha(r.fecha)}</td><td class="placa">${escapar(r.placa||'')}</td><td>${escapar(r.rucCed||'')}</td><td>${escapar(r.nombre||'')}</td><td>${escapar(r.numero||'')}</td><td>${escapar(r.tipoDoc||'')}</td><td class="num">${dinero(r.totSinIva)}</td><td class="num">${dinero(r.totConIva)}</td><td class="num">${dinero(r.iva)}</td><td class="num">${dinero(r.total)}</td><td class="area">${escapar(r.area||'')}</td><td class="origen">${escapar(r.origen||'')}</td></tr>`).join('')+`<tr class="total-row"><td colspan="6">TOTAL</td><td class="num">${dinero(rows.reduce((s,r)=>s+Number(r.totSinIva||0),0))}</td><td class="num">${dinero(rows.reduce((s,r)=>s+Number(r.totConIva||0),0))}</td><td class="num">${dinero(rows.reduce((s,r)=>s+Number(r.iva||0),0))}</td><td class="num">${dinero(rows.reduce((s,r)=>s+Number(r.total||0),0))}</td><td colspan="2"></td></tr>`}
async function cargarPlacas(){
  const select=document.getElementById('placa'),estado=document.getElementById('estado');
  const y=new Date().getFullYear();
  document.getElementById('inicio').value=`${y}-01-01`;
  document.getElementById('fin').value=`${y}-12-31`;
  estado.textContent='Cargando placas...';
  try{
    const r=await fetch(`/api/compras/placas?_=${Date.now()}`);
    const text=await r.text();
    let d={};try{d=JSON.parse(text)}catch(_){throw new Error(`HTTP ${r.status}: respuesta no válida`)}
    if(!r.ok)throw new Error(d.detail||d.error||`HTTP ${r.status}`);
    vehiculos=Array.isArray(d.vehiculos)?d.vehiculos:[];
    select.innerHTML='<option value="">Todas las placas</option>';
    for(const v of vehiculos){const placa=String(v.placa||'').trim();if(!placa)continue;const o=document.createElement('option');o.value=placa;o.textContent=placa;select.appendChild(o)}
    estado.textContent=`${vehiculos.length.toLocaleString('es-EC')} placa(s) cargada(s)`;
    await cargarReporte();
  }catch(e){console.error('[REPORTE-PLACAS] Error cargando placas:',e);estado.textContent=`Error: ${e.message}`;document.getElementById('reporte-body').innerHTML=`<tr><td colspan="12" class="error">${escapar(e.message)}</td></tr>`}
}
async function cargarReporte(){
  const inicio=document.getElementById('inicio').value,fin=document.getElementById('fin').value,placa=document.getElementById('placa').value,estado=document.getElementById('estado');
  if(!inicio||!fin){estado.textContent='Seleccione las fechas';return}
  estado.textContent='Consultando...';document.getElementById('reporte-body').innerHTML='<tr><td colspan="12" class="loading">Consultando movimientos...</td></tr>';
  try{
    const params=new URLSearchParams({inicio,fin,placa});
    const r=await fetch(`/api/compras/reporte-placa?${params.toString()}&_=${Date.now()}`);
    const text=await r.text();let d={};try{d=JSON.parse(text)}catch(_){throw new Error(`HTTP ${r.status}: respuesta no válida`)}
    if(!r.ok)throw new Error(d.error||d.detail||`HTTP ${r.status}`);
    filasReporte=d.compras||[];pintarResumen(d);pintarTabla(filasReporte);
    document.getElementById('periodo').textContent=`${inicio} al ${fin}`;document.getElementById('reporte-titulo').textContent=placa||'Todas las placas';
    const v=vehiculos.find(x=>String(x.placa||'').toLowerCase()===placa.toLowerCase());document.getElementById('vehiculo-detalle').textContent=placa?(v?String(v.placa):placa):'Todas las placas';
    estado.textContent=`${filasReporte.length.toLocaleString('es-EC')} movimiento(s)`;
  }catch(e){console.error('[REPORTE-PLACAS] Error consultando reporte:',e);estado.textContent=`Error: ${e.message}`;document.getElementById('reporte-body').innerHTML=`<tr><td colspan="12" class="error">${escapar(e.message)}</td></tr>`}
}
function exportarCSV(){if(!filasReporte.length)return;const cab=['Fecha','Placa','RUC/Cédula','Nombre / Detalle','Número','Tipo documento','Tot. sin IVA','Tot. con IVA','IVA','Total','Área','Origen'];const lines=[cab,...filasReporte.map(r=>[fecha(r.fecha),r.placa||'',r.rucCed||'',r.nombre||'',r.numero||'',r.tipoDoc||'',dinero(r.totSinIva),dinero(r.totConIva),dinero(r.iva),dinero(r.total),r.area||'',r.origen||''])].map(a=>a.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(';'));const blob=new Blob(['\ufeff'+lines.join('\n')],{type:'text/csv;charset=utf-8;'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`Reporte_por_Placas_${document.getElementById('inicio').value}_${document.getElementById('fin').value}.csv`;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url)}
async function exportarPDF(){const inicio=document.getElementById('inicio').value,fin=document.getElementById('fin').value,placa=document.getElementById('placa').value,btn=document.getElementById('btn-pdf');if(!inicio||!fin||!filasReporte.length)return;const texto=btn.innerHTML;btn.disabled=true;btn.innerHTML='<i class="fi fi-rr-spinner"></i> Generando...';try{const p=new URLSearchParams({inicio,fin,placa});const r=await fetch(`/api/compras/reporte-placa/pdf?${p.toString()}&_=${Date.now()}`);if(!r.ok){let d={};try{d=await r.json()}catch(_){}throw new Error(d.error||'No se pudo generar el PDF.')}const blob=await r.blob(),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`Reporte_por_Placas_${inicio}_${fin}.pdf`;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url)}catch(e){alert(e.message)}finally{btn.disabled=false;btn.innerHTML=texto}}
document.addEventListener('DOMContentLoaded',async()=>{document.getElementById('btn-consultar').addEventListener('click',cargarReporte);document.getElementById('btn-csv').addEventListener('click',exportarCSV);document.getElementById('btn-pdf').addEventListener('click',exportarPDF);await cargarPlacas()});