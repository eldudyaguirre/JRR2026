const express = require('express');
const controller = require('../controllers/trabajadores.controller');
const router = express.Router();

router.get('/trabajadores/resumen', controller.resumenTrabajadores);

module.exports = router;
