const express = require('express');
const controller = require('../controllers/librodiario.controller');
const { requireSession } = require('../auth/session');

const router = express.Router();

router.get('/librodiario', requireSession, controller.listado);
router.get('/librodiario/pdf', requireSession, controller.pdf);

module.exports = router;
