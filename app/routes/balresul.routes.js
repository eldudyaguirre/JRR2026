const express = require('express');
const controller = require('../controllers/balresul.controller');
const { requireSession } = require('../auth/session');

const router = express.Router();
router.get('/balresul', requireSession, controller.balanceResultados);

module.exports = router;
