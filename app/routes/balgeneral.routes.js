const express = require('express');
const controller = require('../controllers/balgeneral.controller');
const { requireSession } = require('../auth/session');

const router = express.Router();
router.get('/balgeneral', requireSession, controller.balanceGeneral);

module.exports = router;
