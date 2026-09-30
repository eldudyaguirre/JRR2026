const express = require('express');
const controller = require('../controllers/system.controller');
const { requireSession } = require('../auth/session');

const router = express.Router();

router.get('/db', requireSession, controller.database);
router.get('/health', controller.health);

module.exports = router;
