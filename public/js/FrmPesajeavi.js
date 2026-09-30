(() => {
  'use strict';

  const $ = selector => document.querySelector(selector);
  const pesos = [];
  let esAdmin = false;
  let pesajeModalId = null;

  const fecha = $('#fechaPesaje');
  const cliente = $('#clientePesaje');
  const granja = $('#granjaPesaje');
  const galpon = $('#galponPesaje');
  const lote = $('#lotePesaje');
  const nota = $('#notaGuiaPesaje');
  const observacion = $('#observacionPesaje');
  const pesoInput = $('#pesoAve');
  const listaPesos = $('#listaPesos');
  const historial = $('#historialPesajes');
  const modal = $('#modalPesaje');

  const fmt = (valor, decimales = 2) =>
    Number(valor || 0).toLocaleString('es-EC', {
      minimumFractionDigits: decimales,
      maximumFractionDigits: decimales
    });

  const moneda = valor =>
    '$ ' + Number(valor || 0).toLocaleString('es-EC', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });

  function hoyLocal() {
    const d = new Date();
    const offset = d.getTimezoneOffset();
    return new Date(d.getTime() - offset * 60000).toISOString().slice(0, 10);
  }

  function actualizarResumen() {
    const total = pesos.reduce((suma, peso) => suma + peso, 0);
    const promedio = pesos.length ? total / pesos.length : 0;
    $('#cantidadAves').textContent = pesos.length;
    $('#pesoTotal').textContent = fmt(total) + ' kg';
    $('#pesoPromedio').textContent = fmt(promedio) + ' kg';
  }

  function renderPesos() {
    if (!pesos.length) {
      listaPesos.innerHTML = '<div class="empty-note">No hay pesos registrados.</div>';
      actualizarResumen();
      return;
    }

    listaPesos.innerHTML = pesos.map((peso, index) => `
      <div class="weight-row">
        <strong>${index + 1}</strong>
        <span>${fmt(peso)}</span>
        <span class="unit">kg</span>
      </div>
    `).join('');

    actualizarResumen();
  }

  function agregarPeso() {
    const valor = Number(pesoInput.value);
    if (!Number.isFinite(valor) || valor <= 0) {
      alert('Ingrese un peso válido mayor que cero.');
      pesoInput.focus();
      return;
    }

    pesos.push(Number(valor.toFixed(2)));
    pesoInput.value = '';
    pesoInput.focus();
    renderPesos();
  }

  function limpiar() {
    pesos.length = 0;
    fecha.value = hoyLocal();
    cliente.value = '';
    granja.value = '';
    galpon.value = '';
    lote.value = '';
    nota.value = '';
    observacion.value = '';
    pesoInput.value = '';
    renderPesos();
  }

  async function obtenerSesion() {
    const response = await fetch('/api/session');
    if (!response.ok) return;
    const data = await response.json();
    esAdmin = String(data.segapp || '').trim().toUpperCase() === 'ADMINISTRATIVO';
  }

  async function cargarClientes() {
    const response = await fetch('/api/pesajes-avicolas/clientes');
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'No se pudieron cargar los clientes.');

    cliente.innerHTML = '<option value="">Seleccione cliente...</option>' +
      data.clientes.map(item =>
        `<option value="${escapeHtml(item.ruccedcli)}">${escapeHtml(item.nombre)} — ${escapeHtml(item.ruccedcli)}</option>`
      ).join('');
  }

  async function cargarGranjas() {
    const response = await fetch('/api/pesajes-avicolas/granjas');
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'No se pudieron cargar las granjas.');

    granja.innerHTML = '<option value="">Seleccione granja...</option>' +
      data.granjas.map(item =>
        `<option value="${escapeHtml(item.codproy)}">${escapeHtml(item.proyecto)} — ${escapeHtml(item.codproy)}</option>`
      ).join('');
  }

  async function cargarHistorial() {
    const response = await fetch('/api/pesajes-avicolas');
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'No se pudo cargar el historial.');

    if (!data.pesajes.length) {
      historial.innerHTML = '<tr><td colspan="9" class="muted" style="text-align:center;padding:25px">No hay pesajes registrados.</td></tr>';
      return;
    }

    historial.innerHTML = data.pesajes.map(item => {
      const estado = String(item.estado || '').toUpperCase();
      return `
        <tr>
          <td><strong>#${escapeHtml(item.id)}</strong></td>
          <td>${formatearFecha(item.fecha)}</td>
          <td>${escapeHtml(item.cliente)}</td>
          <td>${escapeHtml(item.granja)}</td>
          <td>${escapeHtml([item.galpon, item.lote].filter(Boolean).join(' / ') || '—')}</td>
          <td>${item.cantidad_aves}</td>
          <td>${fmt(item.peso_total)} kg</td>
          <td>${fmt(item.peso_promedio)} kg</td>
          <td><button type="button" class="status status-button ${estado === 'PROCESADO' ? 'status-pro' : 'status-ing'}" data-pesaje-id="${escapeHtml(item.id)}">${escapeHtml(estado)}</button></td>
        </tr>
      `;
    }).join('');

    historial.querySelectorAll('.status-button').forEach(btn => {
      btn.addEventListener('click', () => abrirPesaje(Number(btn.dataset.pesajeId)));
    });
  }

  function mostrarDetalle(p, pesosDetalle) {
    const detalle = [
      ['ID del pesaje', '#' + p.id],
      ['Fecha', formatearFecha(p.fecha)],
      ['Cliente', p.cliente || p.ruccedcli],
      ['RUC / Cédula', p.ruccedcli],
      ['Código de granja', p.codproy],
      ['Granja', p.granja],
      ['Galpón', p.galpon || '—'],
      ['Lote', p.lote || '—'],
      ['Nota / Guía', p.nota_guia || '—'],
      ['Observación', p.observacion || '—'],
      ['Registrado por', p.creadopor || '—'],
      ['Creación', formatearFechaHora(p.fechacreacion)],
      ['Estado', p.estado]
    ];

    $('#modalDetalle').innerHTML = detalle.map(([label, value]) => `
      <div class="detail-item"><label>${escapeHtml(label)}</label><strong>${escapeHtml(value)}</strong></div>
    `).join('');

    $('#modalCantidad').textContent = fmt(p.cantidad_aves, 0);
    $('#modalPesoTotal').textContent = fmt(p.peso_total) + ' kg';
    $('#modalPesoPromedio').textContent = fmt(p.peso_promedio) + ' kg';

    $('#modalPesosDetalle').innerHTML = `
      <div class="weights-head"><span>#</span><span>Peso registrado</span><span>Unidad</span></div>
      <div class="weights-list">
        ${pesosDetalle.length ? pesosDetalle.map(item => `
          <div class="weight-row"><strong>${escapeHtml(item.numero_ave)}</strong><span>${fmt(item.peso)}</span><span class="unit">kg</span></div>
        `).join('') : '<div class="empty-note">No hay detalle de pesos.</div>'}
      </div>
    `;

    const proceso = $('#modalProceso');
    const soloLectura = $('#modalSoloLectura');
    const guardarBtn = $('#btnGuardarCambiosPesaje');
    const precio = Number(p.precio || 0);
    const valorTotal = Number(p.valor_total || 0);

    if (esAdmin && String(p.estado).toUpperCase() === 'INGRESADO') {
      proceso.style.display = '';
      $('#modalPrecio').value = '';
      $('#modalValorTotal').textContent = '$ 0,00';
      soloLectura.innerHTML = '';
      guardarBtn.style.display = '';
    } else {
      proceso.style.display = 'none';
      guardarBtn.style.display = 'none';
      soloLectura.innerHTML = `
        <div class="detail-item"><label>Precio por kg</label><strong>${p.precio == null ? '—' : '$ ' + fmt(precio, 4)}</strong></div>
        <div class="detail-item"><label>Valor total</label><strong>${p.valor_total == null ? '—' : moneda(valorTotal)}</strong></div>
      `;
    }

    pesajeModalId = Number(p.id);
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  async function abrirPesaje(id) {
    try {
      const response = await fetch('/api/pesajes-avicolas/' + encodeURIComponent(id));
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo consultar el pesaje.');
      mostrarDetalle(data.pesaje, data.pesos || []);
    } catch (error) {
      console.error(error);
      alert(error.message);
    }
  }

  function cerrarModal() {
    modal.classList.remove('open');
    document.body.style.overflow = '';
    pesajeModalId = null;
  }

  function actualizarValorTotalModal() {
    const precio = Number($('#modalPrecio').value);
    const total = Number($('#modalPesoTotal').textContent.replace(/[^0-9,.-]/g, '').replace(/\./g, '').replace(',', '.')) || 0;
    $('#modalValorTotal').textContent = moneda(total * precio);
  }

  async function guardarCambios() {
    if (!pesajeModalId) return;

    const precio = Number($('#modalPrecio').value);
    if (!Number.isFinite(precio) || precio <= 0) {
      alert('Ingrese un precio por kg mayor que cero.');
      $('#modalPrecio').focus();
      return;
    }

    const boton = $('#btnGuardarCambiosPesaje');
    boton.disabled = true;
    boton.innerHTML = '<i class="fi fi-rr-refresh"></i> Guardando...';

    try {
      const response = await fetch('/api/pesajes-avicolas/' + pesajeModalId + '/procesar', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ precio })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudieron guardar los cambios.');

      alert('Pesaje procesado correctamente.');
      cerrarModal();
      await cargarHistorial();
    } catch (error) {
      console.error(error);
      alert(error.message);
    } finally {
      boton.disabled = false;
      boton.innerHTML = '<i class="fi fi-rr-check"></i> Guardar cambios';
    }
  }

  function exportarReporte() {
    if (!pesajeModalId) return;
    window.location.href = '/api/pesajes-avicolas/' + pesajeModalId + '/reporte';
  }

  async function guardar() {
    if (!cliente.value) return alert('Seleccione un cliente.');
    if (!granja.value) return alert('Seleccione una granja.');
    if (!pesos.length) return alert('Debe ingresar al menos un peso.');

    const boton = $('#btnGuardarPesaje');
    boton.disabled = true;
    boton.innerHTML = '<i class="fi fi-rr-refresh"></i> Guardando...';

    try {
      const response = await fetch('/api/pesajes-avicolas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fecha: fecha.value,
          ruccedcli: cliente.value,
          codproy: granja.value,
          galpon: galpon.value,
          lote: lote.value,
          nota_guia: nota.value,
          observacion: observacion.value,
          pesos
        })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo guardar el pesaje.');

      alert('Pesaje guardado correctamente con estado INGRESADO.');
      limpiar();
      await cargarHistorial();
    } catch (error) {
      console.error(error);
      alert(error.message);
    } finally {
      boton.disabled = false;
      boton.innerHTML = '<i class="fi fi-rr-check"></i> Guardar pesaje';
    }
  }

  function escapeHtml(valor) {
    return String(valor ?? '').replace(/[&<>"']/g, caracter => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    }[caracter]));
  }

  function formatearFecha(valor) {
    if (!valor) return '';
    const texto = String(valor).slice(0, 10);
    const [y, m, d] = texto.split('-');
    return y && m && d ? `${d}/${m}/${y}` : texto;
  }

  function formatearFechaHora(valor) {
    if (!valor) return '';
    const d = new Date(valor);
    if (Number.isNaN(d.getTime())) return String(valor);
    return d.toLocaleString('es-EC');
  }

  async function iniciar() {
    fecha.value = hoyLocal();
    renderPesos();

    try {
      await obtenerSesion();
      await Promise.all([cargarClientes(), cargarGranjas(), cargarHistorial()]);
    } catch (error) {
      console.error(error);
      alert(error.message);
    }
  }

  $('#btnAgregarPeso').addEventListener('click', agregarPeso);
  pesoInput.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      agregarPeso();
    }
  });
  $('#btnLimpiarPesaje').addEventListener('click', limpiar);
  $('#btnGuardarPesaje').addEventListener('click', guardar);
  $('#btnNuevoPesaje').addEventListener('click', () => {
    limpiar();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  $('#btnCerrarModal').addEventListener('click', cerrarModal);
  $('#btnGuardarCambiosPesaje').addEventListener('click', guardarCambios);
  $('#btnExportarPesaje').addEventListener('click', exportarReporte);
  $('#modalPrecio').addEventListener('input', actualizarValorTotalModal);
  modal.addEventListener('click', event => {
    if (event.target === modal) cerrarModal();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && modal.classList.contains('open')) cerrarModal();
  });

  iniciar();
})();
