# AL2026

Aplicación web de Avícola y Porcina Luisin.

## Arquitectura

El proyecto utiliza **Node.js + Express** como API y **PostgreSQL** como base de datos. El frontend permanece separado en HTML, CSS y JavaScript dentro de `public`.

```text
AL2026/
├── app/
│   ├── auth/
│   │   └── session.js
│   ├── controllers/
│   │   ├── auth.controller.js
│   │   └── system.controller.js
│   ├── database/
│   │   └── postgres.js
│   └── routes/
│       ├── auth.routes.js
│       └── system.routes.js
├── public/
│   ├── html/
│   ├── css/
│   ├── js/
│   └── img/
├── server.js
└── package.json
```

## API actual

- `POST /api/login` — autentica un usuario.
- `GET /api/session` — devuelve la sesión activa.
- `POST /api/logout` — cierra la sesión.
- `GET /api/db` — prueba la conexión a PostgreSQL. Requiere sesión.
- `GET /api/health` — verifica API y base de datos.
- `GET /health` — ruta de compatibilidad para el estado del servicio.

## Frontend

- `/` — redirige al login.
- `/html/login.html` — inicio de sesión.
- `/html/frmmenprinci.html` — menú principal.

Las rutas `/login.html` y `/frmmenprinci.html` se mantienen como compatibilidad y redirigen a las nuevas ubicaciones.

## Variables de entorno

Se puede usar `DATABASE_URL` o las variables individuales `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER` y `DB_PASSWORD`.

Para Railway + Railtail, la conexión puede configurarse mediante el dominio privado de Railtail.
