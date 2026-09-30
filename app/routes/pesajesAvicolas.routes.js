const express = require('express');
const controller = require('../controllers/pesajesAvicolas.controller');
const { requireSegapp } = require('../auth/session');

const router = express.Router();

router.get('/pesajes-avicolas/clientes', requireSegapp('AVICOLA'), controller.clientes);
router.get('/pesajes-avicolas/granjas', requireSegapp('AVICOLA'), controller.granjas);
router.get('/pesajes-avicolas', requireSegapp('AVICOLA'), controller.listar);
router.get('/pesajes-avicolas/:id', requireSegapp('AVICOLA'), controller.detalle);
router.get('/pesajes-avicolas/:id/reporte', requireSegapp('AVICOLA'), controller.reporte);
router.post('/pesajes-avicolas', requireSegapp('AVICOLA'), controller.guardar);
router.put('/pesajes-avicolas/:id/procesar', requireSegapp('ADMINISTRATIVO'), controller.procesar);

module.exports = router;
