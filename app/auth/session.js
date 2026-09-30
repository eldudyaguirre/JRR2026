const crypto = require('crypto');

const COOKIE_NAME = 'al2026_session';
const MAX_AGE = 28800;

// La sesión se guarda en una cookie firmada para que funcione correctamente
// aunque Railway atienda las peticiones desde distintas instancias del servicio.
const SECRET = process.env.SESSION_SECRET || process.env.DATABASE_URL || 'AL2026-session-secret-change-me';

function getToken(req) {
  const cookie = req.headers.cookie || '';
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`));
  return match ? match[1] : null;
}

function firma(valor) {
  return crypto.createHmac('sha256', SECRET).update(valor).digest('base64url');
}

function crearToken(session) {
  const payload = Buffer.from(JSON.stringify(session)).toString('base64url');
  return `${payload}.${firma(payload)}`;
}

function getSession(req) {
  const token = getToken(req);
  if (!token) return null;

  const partes = token.split('.');
  if (partes.length !== 2) return null;

  const [payload, firmaToken] = partes;
  const firmaEsperada = firma(payload);
  const a = Buffer.from(firmaToken);
  const b = Buffer.from(firmaEsperada);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!session.createdAt || Date.now() - session.createdAt > MAX_AGE * 1000) return null;
    return session;
  } catch (_) {
    return null;
  }
}

function normalizarSegapp(valor) {
  const segapp = String(valor || '').trim().toUpperCase();
  if (segapp === 'PORCINO') return 'PORCINA';
  return segapp;
}

function createSession(user) {
  return crearToken({
    usuario: user.usrname,
    nombre: user.nomusuari,
    s0100: user.s0100,
    segapp: normalizarSegapp(user.segapp),
    createdAt: Date.now(),
  });
}

function setSessionCookie(res, token) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=${token}; HttpOnly${secure}; SameSite=Lax; Path=/; Max-Age=${MAX_AGE}`);
}

function clearSession(_req, res) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; HttpOnly${secure}; SameSite=Lax; Path=/; Max-Age=0`);
}

function requireSession(req, res, next) {
  const session = getSession(req);
  if (!session) return res.status(401).json({ error: 'No autenticado.' });
  req.session = session;
  next();
}

function requireSegapp(modulo) {
  const permitido = normalizarSegapp(modulo);
  return (req, res, next) => {
    const session = getSession(req);
    if (!session) return res.status(401).json({ error: 'No autenticado.' });
    const segapp = normalizarSegapp(session.segapp);
    if (segapp !== 'ADMINISTRATIVO' && segapp !== permitido) {
      return res.status(403).json({ error: 'No tiene permisos para este módulo.' });
    }
    req.session = session;
    next();
  };
}

module.exports = {
  getSession,
  createSession,
  setSessionCookie,
  clearSession,
  requireSession,
  requireSegapp,
};
