const express = require('express');
const controller = require('../controllers/cuepagar.controller');
const { requireSession } = require('../auth/session');

const router = express.Router();

router.get('/cuepagar', requireSession, controller.cuePagar);

module.exports = router;
