const express = require('express');
const controller = require('../controllers/cuecobrar.controller');
const { requireSession } = require('../auth/session');

const router = express.Router();

router.get('/cuecobrar', requireSession, controller.cueCobrar);

module.exports = router;
