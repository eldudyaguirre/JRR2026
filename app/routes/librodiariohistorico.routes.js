const express=require('express');
const controller=require('../controllers/librodiariohistorico.controller');
const {requireSession}=require('../auth/session');
const router=express.Router();
router.get('/librodiariohistorico',requireSession,controller.listado);
router.get('/librodiariohistorico/pdf',requireSession,controller.pdf);
router.get('/librodiariohistorico/periodo',requireSession,async(_req,res)=>res.json(await controller.periodo()));
module.exports=router;