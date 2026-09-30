const express = require('express');
const controller = require('../controllers/ventas.controller');
const { requireSession } = require('../auth/session');

const router = express.Router();

router.get('/ventas', requireSession, controller.ventas);

module.exports = router;
