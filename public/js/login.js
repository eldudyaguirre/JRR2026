const form=document.getElementById('loginForm');
const usuario=document.getElementById('usuario');
const clave=document.getElementById('clave');
const checkbox=document.getElementById('checkbox');
const submit=document.getElementById('submit');
const mensaje=document.getElementById('mensaje');

checkbox.addEventListener('change',()=>{clave.type=checkbox.checked?'text':'password'});

form.addEventListener('submit',async(event)=>{
  event.preventDefault();
  mensaje.className='';
  mensaje.textContent='Verificando...';
  submit.disabled=true;
  try{
    const response=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({usuario:usuario.value,clave:clave.value})});
    const data=await response.json();
    if(!response.ok) throw new Error(data.error||'Usuario o contraseña incorrectos');
    mensaje.className='success';
    mensaje.textContent='Acceso correcto...';
    window.location.href='/inicio';
  }catch(error){
    mensaje.textContent=error.message;
    submit.disabled=false;
  }
});
