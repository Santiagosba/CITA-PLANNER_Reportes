# Base React para una web del Hub

Plantilla **lista para el siguiente producto**: rutas `/<slug>` (`src/lib/routePath.ts`), sincronía de URL (`src/lib/urlSync.ts`), login Supabase + selector de taller (Hub Connect / `licencia_module_talleres`), dashboard placeholder. Nombre y copys por **`.env`** (`VITE_APP_*`, ver `src/lib/appIdentity.ts`); marca de taller sigue en BD (`crm_config.ui_branding`).

## Arranque

```bash
cd la-carpeta-del-zip
npm install
npm run dev
```

(Al extraer `hub-web-react-mislug.zip`, Windows suele crear una sola carpeta con el nombre del archivo; ahí está ya el `package.json`.)

Opcional: si no descargaste desde Connect, copia `.env.example` → `.env`.

## Build

```bash
npm run build
```
