# Cita Planner Reportes (frontend)

SPA React + Vite para **Cita planner reportes** (Hub Connect): login Supabase, selector de talleres y citas pendientes ChatBot.

La **API SQL Server** vive en el proyecto hermano **[CitaplannerServer](../CitaplannerServer)**.

## Arranque local

**Terminal 1 — API** (CitaplannerServer):

```bash
cd ../CitaplannerServer
npm install
cp .env.example .env.local   # MSSQL_PASSWORD
npm run dev
```

**Terminal 2 — Frontend** (esta carpeta):

```bash
npm install
cp .env.example .env
npm run dev
```

Atajo desde aquí: `npm run dev:api` arranca la API en la carpeta hermana.

App: http://localhost:5174 · API: http://localhost:3001/api/health

## Variables (.env)

Solo variables `VITE_*` (públicas en el build). Ver `.env.example`.

En **Vercel**, define al menos `VITE_HUB_WEB_ID`, Supabase y `VITE_SQL_API_URL` apuntando a CitaplannerServer desplegado.

## Build

```bash
npm run build
```

Output en `dist/` (desplegar en Vercel).
