require('dotenv').config();
const express = require('express');
const authRoutes = require('./app/routes/auth.routes');
const systemRoutes = require('./app/routes/system.routes');
const comprasRoutes = require('./app/routes/compras.routes');
const ventasRoutes = require('./app/routes/ventas.routes');
const cuePagarRoutes = require('./app/routes/cuepagar.routes');
const cueCobrarRoutes = require('./app/routes/cuecobrar.routes');
const balGeneralRoutes = require('./app/routes/balgeneral.routes');
const balResulRoutes = require('./app/routes/balresul.routes');
const trabajadoresRoutes = require('./app/routes/trabajadores.routes');
const clientesRoutes = require('./app/routes/clientes.routes');
const proveedoresRoutes = require('./app/routes/proveedores.routes');
const pesajesAvicolasRoutes = require('./app/routes/pesajesAvicolas.routes');
const systemController = require('./app/controllers/system.controller');
const { getSession, requireSegapp } = require('./app/auth/session');
const pool = require('./app/database/postgres');
const fs = require('fs');
const path = require('path');
const app = express();
const port = Number(process.env.PORT || 3000);
app.use(express.json());

const loginPath=path.join(__dirname,'public','html','login.html');
const menuSourcePath=path.join(__dirname,'public','html','frmmenprinci.html');
app.get('/',(_req,res)=>res.sendFile(loginPath));
app.get('/login',(_req,res)=>res.sendFile(loginPath));
app.get('/login.html',(_req,res)=>res.redirect('/login'));
app.get('/frmmenprinci.html',(_req,res)=>res.redirect('/html/frmmenprinci.html'));
app.get('/FrmCueCobrar.html',(_req,res)=>res.redirect('/html/FrmCueCobrar.html'));
app.get('/FrmBalGeneral.html',(_req,res)=>res.redirect('/html/FrmBalGeneral.html'));
app.get('/FrmBalResul.html',(_req,res)=>res.redirect('/html/FrmBalResul.html'));
app.get('/ResumenAdm.html',(_req,res)=>res.redirect('/html/ResumenAdm.html'));
app.get('/Clientes.html',(_req,res)=>res.redirect('/html/Clientes.html'));
app.get('/Proveedores.html',(_req,res)=>res.redirect('/html/Proveedores.html'));

// Servir explícitamente el JS del Reporte por Placas con cabeceras sin caché.
app.get('/js/FrmRepPla.js',(_req,res)=>{const filePath=path.join(__dirname,'public','js','FrmRepPla.js');if(!fs.existsSync(filePath))return res.status(404).send('FrmRepPla.js no encontrado');res.set('Cache-Control','no-store, no-cache, must-revalidate, proxy-revalidate');res.set('Pragma','no-cache');res.set('Expires','0');res.type('application/javascript').sendFile(filePath);});

const menuLinkMap = {
  '/html/frmmenprinci.html': '/inicio',
  '#resumen-avicola': '/resumen-avicola',
  '#resumen-porcina': '/resumen-porcina',
  '#resumen-fabrica': '/resumen-fabrica',

  '#granja1': '/resumen-avicola#granja1',
  '#granja2': '/resumen-avicola#granja2',
  '#pesaje-avicola': '/resumen-avicola#pesaje-avicola',
  '/html/FrmPesajeavi.html': '/pesajeavicola',
  '#reportes-avicola': '/resumen-avicola#reportes-avicola',
  '#parametros-avicola': '/resumen-avicola#parametros-avicola',

  '#granja1-porcina': '/resumen-porcina#granja1-porcina',
  '#granja2-porcina': '/resumen-porcina#granja2-porcina',
  '#pesaje-porcina': '/resumen-porcina#pesaje-porcina',
  '#reportes-porcina': '/resumen-porcina#reportes-porcina',
  '#parametros-porcina': '/resumen-porcina#parametros-porcina',

  '#inventario': '/resumen-fabrica#inventario-fabrica',
  '#items': '/resumen-fabrica#items-fabrica',
  '#produccion': '/resumen-fabrica#produccion-fabrica',
  '#ordenes-compra': '/resumen-fabrica#ordenes-compra-fabrica',

  '#inventario-fabrica': '/resumen-fabrica#inventario-fabrica',
  '#items-fabrica': '/resumen-fabrica#items-fabrica',
  '#produccion-fabrica': '/resumen-fabrica#produccion-fabrica',
  '#ordenes-compra-fabrica': '/resumen-fabrica#ordenes-compra-fabrica',

  '#trabajadores': '/resumen-administrativo#trabajadores',
  '#roles': '/resumen-administrativo#roles',
  '#configuracion': '/resumen-administrativo#configuracion',

  '/html/Clientes.html': '/clientes',
  '/html/Proveedores.html': '/proveedores',
  '/html/FrmCompras.html': '/compras',
  '/html/FrmVentas.html': '/ventas',
  '/html/FrmCuePagar.html': '/cuentas-por-pagar',
  '/html/FrmCueCobrar.html': '/cuentas-por-cobrar',
  '/html/FrmBalGeneral.html': '/balance-general',
  '/html/FrmBalResul.html': '/balance-resultados',
  '/html/ResumenAdm.html': '/resumen-administrativo',
  '/html/ResumenAvi.html': '/resumen-avicola',
  '/html/ResumenPor.html': '/resumen-porcina',
  '/html/ResumenFab.html': '/resumen-fabrica'
};
function normalizarSegapp(valor){const segapp=String(valor||'').trim().toUpperCase();if(segapp==='PORCINO') return 'PORCINA';return segapp;}
function extraerNav(origen){const inicio=origen.indexOf('<nav');const fin=origen.indexOf('</nav>',inicio);if(inicio<0||fin<0) throw new Error('No se encontró el menú original en frmmenprinci.html');return origen.slice(inicio,fin+6);}
function reemplazarEnlaces(nav){for(const [origenLink,destino] of Object.entries(menuLinkMap)) nav=nav.split(`href="${origenLink}"`).join(`href="${destino}"`);return nav;}
function extraerBloqueLi(html,inicio){let profundidad=0;for(let pos=inicio;pos<html.length;){const apertura=html.indexOf('<li',pos);const cierre=html.indexOf('</li>',pos);if(cierre<0)return html.slice(inicio);if(apertura>=0&&apertura<cierre){profundidad++;pos=apertura+3;}else{profundidad--;pos=cierre+5;if(profundidad===0)return html.slice(inicio,pos);}}return html.slice(inicio);}
function filtrarMenuPorSegapp(nav,segapp){const modulo=normalizarSegapp(segapp);if(modulo==='ADMINISTRATIVO')return nav;const grupos=[];const re=/<li[^>]*class="[^"]*menu-group[^"]*"[^>]*data-segapp="([^"]+)"[^>]*>/gi;let m;while((m=re.exec(nav))!==null){const bloque=extraerBloqueLi(nav,m.index);grupos.push({inicio:m.index,fin:m.index+bloque.length,segapp:normalizarSegapp(m[1])});}for(let i=grupos.length-1;i>=0;i--)if(grupos[i].segapp!==modulo)nav=nav.slice(0,grupos[i].inicio)+nav.slice(grupos[i].fin);const configRe=/<li[^>]*data-segapp="ADMINISTRATIVO"[^>]*>.*?<\/li>/gi;nav=nav.replace(configRe,'');return nav;}

function agregarReportesAdministrativos(nav, segapp) {
  if (normalizarSegapp(segapp) !== 'ADMINISTRATIVO') return nav;

  const roles = /<li><a href="#roles">Rol de Pagos<\/a><\/li>/;

  if (!nav.includes('/reporte-areas')) {
    nav = nav.replace(
      roles,
      match =>
        `${match}<li class="submenu-separator"></li><li><a href="/reporte-areas">Reporte por Áreas</a></li>`
    );
  }

  if (!nav.includes('/html/FrmRepPla.html')) {
    nav = nav.replace(
      /(<li><a href="\/reporte-areas">Reporte por Áreas<\/a><\/li>)/,
      match =>
        `${match}<li><a href="/reporte-placas">Reporte por Placas</a></li>`
    );
  }

  return nav;
}

function obtenerMenuOriginal(segapp){const origen=fs.readFileSync(menuSourcePath,'utf8');let nav=extraerNav(origen);nav=filtrarMenuPorSegapp(nav,segapp);nav=agregarReportesAdministrativos(nav,segapp);return reemplazarEnlaces(nav);}

function obtenerModulosPorRuta() {
  const origen = fs.readFileSync(menuSourcePath, 'utf8');
  const nav = extraerNav(origen);
  const resultado = {};

  const re = /<li[^>]*class="[^"]*menu-group[^"]*"[^>]*data-segapp="([^"]+)"[^>]*>/gi;

  let m;

  while ((m = re.exec(nav)) !== null) {
    const modulo = normalizarSegapp(m[1]);
    const bloque = extraerBloqueLi(nav, m.index);

    const hrefs = [...bloque.matchAll(/href="([^"]+)"/gi)]
      .map(x => x[1]);

    for (const href of hrefs) {
      const destino = menuLinkMap[href] || href;
      const ruta = destino.split('#')[0].toLowerCase();

      if (ruta) {
        resultado[ruta] = modulo;
      }
    }
  }

  // Rutas internas que todavía existen para compatibilidad
  resultado['/html/frmmenprinci.html'] = 'PUBLICO';
  resultado['/html/frmreparea.html'] = 'ADMINISTRATIVO';
  resultado['/html/frmreppla.html'] = 'ADMINISTRATIVO';

  // Rutas limpias
  resultado['/clientes'] = 'ADMINISTRATIVO';
  resultado['/proveedores'] = 'ADMINISTRATIVO';
  resultado['/compras'] = 'ADMINISTRATIVO';
  resultado['/ventas'] = 'ADMINISTRATIVO';
  resultado['/cuentas-por-pagar'] = 'ADMINISTRATIVO';
  resultado['/cuentas-por-cobrar'] = 'ADMINISTRATIVO';
  resultado['/balance-general'] = 'ADMINISTRATIVO';
  resultado['/balance-resultados'] = 'ADMINISTRATIVO';
  resultado['/resumen-administrativo'] = 'ADMINISTRATIVO';
  resultado['/resumen-avicola'] = 'AVICOLA';
  resultado['/pesajeavicola'] = 'AVICOLA';
  resultado['/resumen-porcina'] = 'PORCINA';
  resultado['/resumen-fabrica'] = 'FABRICA';
  resultado['/reporte-areas'] = 'ADMINISTRATIVO';
  resultado['/reporte-placas'] = 'ADMINISTRATIVO';
  return resultado;
}

function moduloPermitido(req){const session=getSession(req);if(!session)return null;const segapp=normalizarSegapp(session.segapp);if(segapp==='ADMINISTRATIVO')return true;const ruta=`/html/${req.params.archivo}.html`.toLowerCase();const modulos=obtenerModulosPorRuta();const requerido=modulos[ruta];return requerido==='PUBLICO'||requerido===segapp;}

const rutasLimpias = {
  '/inicio': '/html/frmmenprinci.html',
  '/clientes': '/html/Clientes.html',
  '/proveedores': '/html/Proveedores.html',
  '/compras': '/html/FrmCompras.html',
  '/ventas': '/html/FrmVentas.html',
  '/cuentas-por-pagar': '/html/FrmCuePagar.html',
  '/cuentas-por-cobrar': '/html/FrmCueCobrar.html',
  '/balance-general': '/html/FrmBalGeneral.html',
  '/balance-resultados': '/html/FrmBalResul.html',
  '/resumen-administrativo': '/html/ResumenAdm.html',
  '/resumen-avicola': '/html/ResumenAvi.html',
  '/pesajeavicola': '/html/FrmPesajeavi.html',
  '/resumen-porcina': '/html/ResumenPor.html',
  '/resumen-fabrica': '/html/ResumenFab.html',
  '/reporte-areas': '/html/FrmRepArea.html',
  '/reporte-placas': '/html/FrmRepPla.html'
};

app.use((req, _res, next) => {
  const destino = rutasLimpias[req.path.toLowerCase()];
  if (destino) {
    req.url = destino + (req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '');
  }
  next();
});
app.get('/html/:archivo.html',(req,res,next)=>{const archivo=req.params.archivo;const filePath=path.join(__dirname,'public','html',`${archivo}.html`);if(!fs.existsSync(filePath))return next();if(archivo.toLowerCase()==='login')return res.redirect('/login');const session=getSession(req);if(!session)return res.redirect('/html/login.html');if(!moduloPermitido(req))return res.status(403).send('<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Acceso denegado</title><style>body{font-family:Arial,sans-serif;background:#09203C;color:white;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center}div{max-width:520px;padding:30px}a{color:#fff;font-weight:bold}</style></head><body><div><h1>Acceso denegado</h1><p>Su usuario no tiene permisos para acceder a este módulo.</p><a href="/inicio">Volver al menú principal</a></div></body></html>');try{let html=fs.readFileSync(filePath,'utf8');const menuOriginal=obtenerMenuOriginal(session.segapp);if(archivo!=='frmmenprinci'){const inicio=html.indexOf('<nav');const fin=html.indexOf('</nav>',inicio);if(inicio>=0&&fin>=0)html=html.slice(0,inicio)+menuOriginal+html.slice(fin+6);}else{const inicio=html.indexOf('<nav');const fin=html.indexOf('</nav>',inicio);if(inicio>=0&&fin>=0)html=html.slice(0,inicio)+menuOriginal+html.slice(fin+6);}for(const [origenLink,destino] of Object.entries(menuLinkMap))html=html.split(`href="${origenLink}"`).join(`href="${destino}"`);if(!html.includes('href="/html/FrmBalResul.html"')&&session.segapp==='ADMINISTRATIVO'){const balanceGeneralLi=/<li><a href="\/html\/FrmBalGeneral\.html"[^>]*>Balance General<\/a><\/li>/;html=html.replace(balanceGeneralLi,match=>`${match}<li><a href="/html/FrmBalResul.html">Balance de Resultados</a></li>`);}html=html.replace(/\s*<link[^>]+href=["'][^"']*\/css\/frmmenprinci\.css[^"']*["'][^>]*>/gi,'');html=html.replace(/\s*<script[^>]+src=["'][^"']*\/js\/frmmenprinci\.js[^"']*["']><\/script>/gi,'');html=html.replace('</head>','<link rel="stylesheet" href="/css/frmmenprinci.css?v=20260908">\n</head>');html=html.replace('</body>','<script src="/js/frmmenprinci.js?v=20260908"></script>\n</body>');if(archivo.toLowerCase()==='frmreppla'){const jsPath=path.join(__dirname,'public','js','FrmRepPla.js');if(fs.existsSync(jsPath)){const js=fs.readFileSync(jsPath,'utf8');html=html.replace(/<script[^>]+src=["'][^"']*\/js\/FrmRepPla\.js[^"']*["']><\/script>/i,`<script>${js}</script>`);}}res.type('html').send(html);}catch(error){next(error);}});
app.use('/api',authRoutes);app.use('/api',systemRoutes);app.use('/api',requireSegapp('ADMINISTRATIVO'),comprasRoutes);app.use('/api',requireSegapp('ADMINISTRATIVO'),ventasRoutes);app.use('/api',requireSegapp('ADMINISTRATIVO'),cuePagarRoutes);app.use('/api',requireSegapp('ADMINISTRATIVO'),cueCobrarRoutes);app.use('/api',requireSegapp('ADMINISTRATIVO'),balGeneralRoutes);app.use('/api',requireSegapp('ADMINISTRATIVO'),balResulRoutes);app.use('/api',requireSegapp('ADMINISTRATIVO'),trabajadoresRoutes);app.use('/api',requireSegapp('ADMINISTRATIVO'),clientesRoutes);app.use('/api',requireSegapp('ADMINISTRATIVO'),proveedoresRoutes);
app.use('/api', pesajesAvicolasRoutes);
app.get('/health',systemController.health);app.use(express.static('public'));app.listen(port,'0.0.0.0',()=>console.log(`AL2026 API listening on port ${port}`));process.on('SIGTERM',async()=>{await pool.end();process.exit(0);});
