const express = require('express');
const controller = require('../controllers/clientes.controller');
const { requireSession } = require('../auth/session');

const router = express.Router();

router.get('/clientes', requireSession, controller.clientes);
router.get('/clientes/:ruc', requireSession, controller.clienteDetalle);

module.exports = router;
