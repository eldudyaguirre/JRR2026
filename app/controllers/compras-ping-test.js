async function comprasPingTest(req, res) {
  return res.json({
    ok: true,
    mensaje: 'API responde correctamente',
    tiempoMs: 0
  });
}

module.exports = { comprasPingTest };
