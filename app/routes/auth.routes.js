const express = require('express');
const controller = require('../controllers/auth.controller');

const router = express.Router();

router.post('/login', controller.login);
router.get('/session', controller.session);
router.post('/logout', controller.logout);

module.exports = router;
