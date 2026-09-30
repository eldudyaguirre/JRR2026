const express=require('express');
const controller=require('../controllers/proveedores.controller');
const {requireSession}=require('../auth/session');
const router=express.Router();
router.get('/proveedores',requireSession,controller.proveedores);
router.get('/proveedores/:ruc',requireSession,controller.proveedorDetalle);
module.exports=router;
