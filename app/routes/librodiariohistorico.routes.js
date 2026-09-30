const express=require('express');
const controller=require('../controllers/librodiariohistorico.controller');
const {requireSession}=require('../auth/session');
const router=express.Router();
router.get('/librodiariohistorico',requireSession,controller.listado);
router.get('/librodiariohistorico/pdf',requireSession,controller.pdf);
module.exports=router;