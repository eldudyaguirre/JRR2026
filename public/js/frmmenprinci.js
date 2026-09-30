(function(){
  window.abrirMenu=window.abrirMenu||function(){
    const sidebar=document.getElementById('sidebar');
    const overlay=document.getElementById('overlay');
    if(sidebar) sidebar.classList.add('open');
    if(overlay) overlay.classList.add('show');
    document.body.style.overflow='hidden';
  };
  window.cerrarMenu=window.cerrarMenu||function(){
    const sidebar=document.getElementById('sidebar');
    const overlay=document.getElementById('overlay');
    if(sidebar) sidebar.classList.remove('open');
    if(overlay) overlay.classList.remove('show');
    document.body.style.overflow='';
  };
  window.toggleSubmenu=window.toggleSubmenu||function(button){
    const grupo=button&&button.closest('.menu-group');
    if(!grupo)return;
    const abierto=grupo.classList.contains('open');
    if(abierto){grupo.classList.remove('open');button.setAttribute('aria-expanded','false');return;}
    const nivel=grupo.parentElement;
    nivel.querySelectorAll(':scope > .menu-group.open').forEach(item=>{
      if(item!==grupo){item.classList.remove('open');const p=item.querySelector(':scope > .menu-parent');if(p)p.setAttribute('aria-expanded','false');}
    });
    grupo.classList.add('open');button.setAttribute('aria-expanded','true');
  };
  function marcarMenuActivo(){
    const nav=document.querySelector('nav[aria-label="Menú principal"]')||document.querySelector('nav');
    if(!nav)return;
    const actualPath=window.location.pathname.replace(/\/$/,'').toLowerCase();
    const actualHash=window.location.hash.toLowerCase();
    const enlaces=[...nav.querySelectorAll('a[href]')];
    enlaces.forEach(a=>{a.classList.remove('active');a.removeAttribute('aria-current');});
    let activo=enlaces.find(a=>{try{const u=new URL(a.href,window.location.origin);return u.pathname.replace(/\/$/,'').toLowerCase()===actualPath&&u.hash.toLowerCase()===actualHash&&u.hash!=='';}catch(_){return false;}});
    if(!activo&&actualHash)activo=enlaces.find(a=>(a.getAttribute('href')||'').trim().toLowerCase()===actualHash);
    if(!activo)activo=enlaces.find(a=>{try{const u=new URL(a.href,window.location.origin);return u.pathname.replace(/\/$/,'').toLowerCase()===actualPath&&u.hash==='';}catch(_){return false;}});
    if(!activo&&(actualPath==='/inicio'||actualPath==='/frmmenprinci.html'))activo=enlaces.find(a=>a.getAttribute('href')==='/inicio');
    if(!activo)return;
    activo.classList.add('active');activo.setAttribute('aria-current','page');
    const grupo=activo.closest('.menu-group');
    if(grupo){grupo.classList.add('open');const p=grupo.querySelector(':scope > .menu-parent');if(p)p.setAttribute('aria-expanded','true');const padre=grupo.parentElement?.closest('.menu-group');if(padre){padre.classList.add('open');const pp=padre.querySelector(':scope > .menu-parent');if(pp)pp.setAttribute('aria-expanded','true');}}
  }
  function instalarMenuMovilGlobal(){
    const path=window.location.pathname.replace(/\/$/,'').toLowerCase();
    if(path==='/inicio'||path==='/frmmenprinci.html')return;
    const sidebar=document.getElementById('sidebar');
    const topbar=document.querySelector('.topbar');
    if(!sidebar||!topbar)return;
    const mediaMovil=window.matchMedia('(max-width:900px)');
    const mediaTactil=window.matchMedia('(pointer:coarse)');
    const actualizarModo=()=>{
      const esMovil=mediaMovil.matches||mediaTactil.matches;
      let boton=document.getElementById('mobile-menu-float');
      if(!esMovil){if(boton)boton.remove();return;}
      if(!boton){
        boton=document.createElement('button');
        boton.id='mobile-menu-float';boton.type='button';boton.className='mobile-menu-float';
        boton.setAttribute('aria-label','Abrir menú');boton.innerHTML='<i class="fi fi-rr-menu-burger"></i>';
        boton.addEventListener('click',window.abrirMenu);topbar.insertBefore(boton,topbar.firstChild);
      }
      const actualizarScroll=()=>boton.classList.toggle('scrolled',window.scrollY>64);
      actualizarScroll();
      if(!boton.dataset.scrollBound){window.addEventListener('scroll',actualizarScroll,{passive:true});boton.dataset.scrollBound='1';}
    };
    let style=document.getElementById('mobile-menu-float-style');
    if(!style){
      style=document.createElement('style');style.id='mobile-menu-float-style';
      style.textContent='.mobile-menu-float{display:none!important}@media(max-width:900px),(pointer:coarse){.mobile-menu-float{display:grid!important;position:absolute;top:50%;left:12px;transform:translateY(-50%);z-index:10;width:46px;height:46px;padding:0;border:0;border-radius:12px;background:#09203C;color:#fff;font-size:22px;place-items:center;cursor:pointer}.mobile-menu-float.scrolled{position:fixed;top:12px;left:12px;transform:none;z-index:80;box-shadow:0 4px 14px rgba(0,0,0,.25)}.topbar-title{padding-left:58px}}';
      document.head.appendChild(style);
    }
    actualizarModo();
    mediaMovil.addEventListener?.('change',actualizarModo);
    mediaTactil.addEventListener?.('change',actualizarModo);
  }
  window.cargarMenuUsuario=async function(){
    try{const response=await fetch('/api/session');if(!response.ok){window.location.href='/login';return;}const data=await response.json();const usuario=data.usuario||'';const nombre=data.nombre||usuario||'-';const profileName=document.getElementById('profile-name');const profileUser=document.getElementById('profile-user');const nombreElement=document.getElementById('nombre');const apiValue=document.getElementById('api-value');const dbValue=document.getElementById('db-value');if(profileName)profileName.textContent=usuario;if(profileUser)profileUser.textContent=nombre;if(nombreElement)nombreElement.textContent=nombre;if(apiValue)apiValue.textContent='OK';if(dbValue)dbValue.textContent='OK';}catch(_){window.location.href='/login';}
  };
  if(typeof window.cerrarSesion!=='function')window.cerrarSesion=async function(){try{await fetch('/api/logout',{method:'POST'});}finally{window.location.href='/login';}};
  document.addEventListener('DOMContentLoaded',()=>{if(document.getElementById('profile-name')&&!document.querySelector('[data-page-dashboard]'))window.cargarMenuUsuario();marcarMenuActivo();instalarMenuMovilGlobal();});
})();
