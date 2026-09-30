function pintarVehiculos(vehiculos) {
  const contenedor = document.getElementById('vehiculos-grid');
  if (!contenedor) return;

  if (!Array.isArray(vehiculos) || vehiculos.length === 0) {
    contenedor.innerHTML = '<div class="muted vehiculos-vacio">No existen vehículos registrados en la empresa.</div>';
    return;
  }

  contenedor.innerHTML = vehiculos.map((v) => {
    const placa = escapar(v.placa || 'SIN PLACA');
    const gasto = dinero(v.gasto);
    const movimientos = Number(v.movimientos || 0);
    return `<article class="vehiculo-card">
      <div class="vehiculo-icon"><i class="fi fi-rr-car-side"></i></div>
      <div class="vehiculo-info">
        <div class="vehiculo-label">Vehículo</div>
        <h3 title="${placa}">${placa}</h3>
        <div class="vehiculo-gasto">${gasto}</div>
        <div class="vehiculo-note">${movimientos.toLocaleString('es-EC')} movimiento(s)</div>
      </div>
    </article>`;
  }).join('');
}

async function cargarGastosPorVehiculo() {
  const contenedor = document.getElementById('vehiculos-grid');
  const periodo = document.getElementById('vehiculos-periodo');
  if (!contenedor) return;

  try {
    const ahora = new Date();
    const inicio = `${ahora.getFullYear()}-01-01`;
    const fin = `${ahora.getFullYear()}-12-31`;
    const r = await fetch(`/api/compras/vehiculos?inicio=${inicio}&fin=${fin}&_=${Date.now()}`);
    const text = await r.text();
    let data = {};
    try { data = JSON.parse(text); } catch (_) { throw new Error(`HTTP ${r.status}: respuesta no válida`); }
    if (!r.ok) throw new Error(data.detail || data.error || `HTTP ${r.status}`);

    if (periodo) periodo.textContent = `${inicio.slice(0, 4)} · ${data.totalVehiculos || 0} vehículo(s)`;
    pintarVehiculos(data.vehiculos || []);
  } catch (e) {
    console.error('[DASHBOARD] Error cargando gastos por vehículo:', e);
    contenedor.innerHTML = '<div class="muted vehiculos-vacio">No se pudo cargar el resumen por vehículos.</div>';
  }
}

document.addEventListener('DOMContentLoaded', cargarGastosPorVehiculo);
