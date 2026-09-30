const pool = require('../database/postgres');
const {
  getSession,
  createSession,
  setSessionCookie,
  clearSession,
} = require('../auth/session');

async function login(req, res) {
  const usuario = String(req.body?.usuario || '').trim();
  const clave = String(req.body?.clave || '');

  if (!usuario || !clave) {
    return res.status(400).json({ error: 'Ingrese usuario y contraseña.' });
  }

  try {
    const result = await pool.query(
      `SELECT usrname, nomusuari, s0100, segapp
       FROM seguridad
       WHERE usrname = $1 AND conusuari = $2
       LIMIT 1`,
      [usuario, clave]
    );

    if (result.rowCount === 0) {
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
    }

    const user = result.rows[0];
    const token = createSession(user);
    setSessionCookie(res, token);

    return res.json({
      ok: true,
      usuario: user.usrname,
      nombre: user.nomusuari,
      segapp: String(user.segapp || '').trim().toUpperCase(),
    });
  } catch (error) {
    console.error('Login error:', error.message);
    return res.status(500).json({ error: 'No fue posible validar el usuario.' });
  }
}

function session(req, res) {
  const current = getSession(req);
  if (!current) return res.status(401).json({ authenticated: false });

  return res.json({
    authenticated: true,
    usuario: current.usuario,
    nombre: current.nombre,
    s0100: current.s0100,
    segapp: current.segapp,
  });
}

function logout(req, res) {
  clearSession(req, res);
  return res.json({ ok: true });
}

module.exports = { login, session, logout };
