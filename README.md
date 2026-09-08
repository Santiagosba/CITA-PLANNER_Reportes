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

App: http://localhost:3001 · API: http://localhost:3002/api/health

## Variables (.env)

Solo variables `VITE_*` (públicas en el build). Ver `.env.example`.

En **Vercel**, define al menos `VITE_HUB_WEB_ID`, Supabase y `VITE_SQL_API_URL` apuntando a CitaplannerServer en Dokploy:

`https://avi-bot-avibotcitaplanner-khxi1c-391083-76-13-141-36.sslip.io`

En **local** deja `VITE_SQL_API_URL` sin definir (comentada): así `/api` pasa por el proxy de Vite
hasta `localhost:3002` y trabajas contra la API de la carpeta hermana.

## Build

```bash
npm run build
```

Output en `dist/` (desplegar en Vercel).
