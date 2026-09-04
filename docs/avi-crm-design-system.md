# Sistema de diseño — AVI CRM

Documentación de la "capa" visual de esta app para reutilizarla en otro proyecto.
Todo está basado en CSS puro con **custom properties** (variables), sin dependencias
de UI. Para portarlo a otra app basta con copiar el bloque `:root`, la receta
`.glass` y los patrones de componentes de este documento.

---

## 1. Filosofía visual

- **Glassmorphism claro (light glass):** superficies translúcidas con `backdrop-filter`,
  bordes claros, sombras suaves y un brillo interior. Fondo de página gris muy claro.
- **Neutros fríos + un único azul de marca.** El color se reserva para acciones,
  foco y estados; el resto es escala de grises.
- **Bordes muy redondeados** (16–28 px en tarjetas, `999px` en píldoras/botones).
- **Jerarquía por peso y tamaño**, no por saturación de color.
- **Accesibilidad:** foco de teclado siempre visible, objetivos táctiles ≥ 44–48 px.

---

## 2. Design tokens (copia este bloque tal cual)

```css
:root {
  /* ---- Paleta base ---- */
  --ink: #0f1115;
  --fog: #33383f;          /* texto normal */
  --fog-strong: #0f1115;   /* títulos / texto fuerte */
  --muted: #565c66;        /* texto secundario */
  --line: rgba(15, 17, 21, 0.1);
  --page: #eef1f5;         /* fondo de la app */
  --accent: #0b63d6;

  /* ---- Tokens semánticos de color ---- */
  --color-text: var(--fog);
  --color-text-strong: var(--fog-strong);
  --color-text-muted: var(--muted);
  --color-brand: #0b63d6;
  --color-brand-strong: #0a55b8;
  --color-brand-soft: rgba(11, 99, 214, 0.12);
  --color-brand-ring: rgba(11, 99, 214, 0.4);
  --color-success: #1d8a4e;
  --color-warning: #b4640a;
  --color-danger: #c0342b;
  --color-surface: rgba(255, 255, 255, 0.82);
  --color-surface-solid: #ffffff;

  /* ---- Escala tipográfica ---- */
  --font-2xs: 12px;
  --font-xs: 13px;
  --font-sm: 15px;
  --font-md: 16px;   /* base */
  --font-lg: 18px;
  --font-xl: 22px;
  --font-2xl: 28px;
  --font-3xl: 36px;
  --font-display: clamp(32px, 5vw, 52px);
  --leading-tight: 1.2;
  --leading-normal: 1.5;

  /* ---- Escala de espaciado (múltiplos de 4) ---- */
  --space-1: 4px;   --space-2: 8px;   --space-3: 12px;
  --space-4: 16px;  --space-5: 20px;  --space-6: 24px;
  --space-8: 32px;  --space-10: 40px;

  /* ---- Radios ---- */
  --radius-sm: 12px;
  --radius-md: 16px;
  --radius-lg: 22px;
  --radius-xl: 28px;
  --radius-pill: 999px;

  /* ---- Anchos de layout ---- */
  --shell-max: min(1920px, 100%);
  --content-max: 1600px;

  /* ---- Ergonomía / interacción ---- */
  --tap-target: 48px;
  --focus-ring: 0 0 0 3px var(--color-surface-solid), 0 0 0 6px var(--color-brand-ring);
  --transition-fast: 0.16s ease;
  --transition-base: 0.24s ease;

  font-family: Inter, ui-sans-serif, system-ui, sans-serif;
  font-optical-sizing: auto;
  font-synthesis: none;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
  color: var(--fog);
  background: var(--page);
}
```

**Tipografía:** [Inter](https://fonts.google.com/specimen/Inter) con fallback al
system-ui. Títulos con `letter-spacing: -0.04em` y `font-weight: 600`.

---

## 3. Reset base recomendado

```css
* { box-sizing: border-box; }
html, body, #root { min-height: 100%; }
body { margin: 0; overflow-x: hidden; font-size: var(--font-md); line-height: var(--leading-normal); }
button, input, select, textarea { font: inherit; }
button { cursor: pointer; }
h1, h2, p { margin: 0; }

/* Foco de teclado visible en todo (requisito estructural de accesibilidad) */
:where(a, button, input, select, textarea, [tabindex]):focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
  border-radius: 10px;
}
:where(a, button, input, select, textarea, [tabindex]):focus:not(:focus-visible) {
  box-shadow: none; /* no mostrar anillo con ratón */
}
```

---

## 4. Superficie "glass" (el sello de la app)

Clase reutilizable que se aplica a cualquier contenedor (tarjetas, paneles, barras).

```css
.glass {
  position: relative;
  isolation: isolate;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.7), rgba(255, 255, 255, 0.28));
  backdrop-filter: blur(32px) saturate(180%);
  -webkit-backdrop-filter: blur(32px) saturate(180%);
  border: 1px solid rgba(255, 255, 255, 0.72);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.95),
    inset 0 -1px 0 rgba(255, 255, 255, 0.3),
    0 1px 2px rgba(31, 41, 55, 0.06),
    0 14px 40px rgba(31, 41, 55, 0.1);
}

/* Brillo/reflejo superior — da el efecto cristal */
.glass::after {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 0;
  border-radius: inherit;
  pointer-events: none;
  background:
    linear-gradient(115deg, rgba(255, 255, 255, 0.42), transparent 28%),
    radial-gradient(circle at 76% 0%, rgba(255, 255, 255, 0.6), transparent 30%);
  opacity: 0.75;
}

/* El contenido va por encima del reflejo */
.glass > * { position: relative; z-index: 1; }
```

**Variante `glass-inline`:** misma idea pero más sutil, para paneles anidados dentro
de otra tarjeta glass (menos blur y sombra). Regla práctica: el glass anidado no
lleva sombra propia y usa fondos semitransparentes blancos (`rgba(255,255,255,0.42–0.55)`).

> Nota: `backdrop-filter` necesita algo detrás para difuminar. Usa siempre un
> `--page` claro de fondo. En navegadores sin soporte, degrada al gradiente blanco.

---

## 5. Botones (patrones)

| Clase | Uso | Aspecto |
|-------|-----|---------|
| `.client-submit` | CTA principal | Sólido azul de marca, texto blanco |
| `.ghost-button .glass` | Secundario neutro | Superficie clara translúcida, borde gris |
| `.confirm-action` | Acción positiva compacta | Píldora azul suave, hover azul sólido |
| `.ghost-action` | Acción destructiva/neutra compacta | Píldora roja suave (`.is-neutral` → gris) |
| `.back-button .glass` | Volver | Píldora glass con flecha |

```css
/* Secundario neutro */
.ghost-button {
  min-height: 44px;
  padding: 10px 18px;
  border-radius: var(--radius-md);
  border: 1px solid rgba(15, 17, 21, 0.12);
  background: rgba(255, 255, 255, 0.55);
  color: var(--fog-strong);
  font-size: var(--font-sm);
  font-weight: 600;
}
.ghost-button:hover:not(:disabled) { background: rgba(255, 255, 255, 0.82); }

/* Positiva compacta (píldora) */
.confirm-action {
  padding: 7px 10px;
  border: 1px solid rgba(11, 99, 214, 0.18);
  border-radius: 999px;
  background: rgba(11, 99, 214, 0.1);
  color: var(--color-brand);
  font-size: 11px;
  font-weight: 600;
}
.confirm-action:hover:not(:disabled) { background: var(--color-brand); color: #fff; }

/* Neutra/destructiva compacta (píldora) */
.ghost-action {
  padding: 7px 10px;
  border: 1px solid rgba(194, 65, 12, 0.14);
  border-radius: 999px;
  background: rgba(255, 69, 58, 0.06);
  color: #c2410c;
  font-size: 11px;
  font-weight: 600;
}
.ghost-action.is-neutral {
  border-color: rgba(15, 17, 21, 0.12);
  background: rgba(255, 255, 255, 0.62);
  color: var(--fog-strong);
}

.confirm-action:disabled, .ghost-action:disabled, .ghost-button:disabled { opacity: 0.6; }
```

**Regla de oro:** un solo botón sólido de marca por vista (la acción primaria); el
resto en estilo ghost/píldora.

---

## 6. Badges de estado (tono semántico)

Patrón `tono-*` reutilizable para etiquetas de estado (píldora con fondo suave del
color + texto oscuro del mismo tono). Fondo a ~12–16% de opacidad, texto sólido.

```css
.badge {
  display: inline-flex;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: var(--font-2xs);
  font-weight: 700;
  letter-spacing: 0.02em;
}
.badge.tone-positive { background: rgba(16, 185, 129, 0.14); color: #047857; }
.badge.tone-negative { background: rgba(239, 68, 68, 0.12);  color: #b91c1c; }
.badge.tone-warning  { background: rgba(245, 158, 11, 0.16); color: #b45309; }
.badge.tone-neutral  { background: rgba(37, 99, 235, 0.12);  color: #1d4ed8; }
.badge.tone-muted    { background: rgba(15, 17, 21, 0.06);   color: var(--muted); }
```

Mapa de significado usado en la app:
- **positive** → aceptado / confirmado / éxito
- **warning** → pendiente de acción / requiere atención
- **neutral** → informativo / enviado
- **negative** → rechazado / cancelado / error
- **muted** → borrador / inactivo

---

## 7. Tarjeta de métrica (KPI)

```css
.metric {            /* aplícala junto con .glass */
  min-height: 112px;
  padding: 18px;
  border-radius: 22px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}
.metric > span   { color: var(--muted); font-size: var(--font-sm); font-weight: 500; }
.metric > strong { color: var(--fog-strong); font-size: var(--font-3xl); font-weight: 600; letter-spacing: -0.04em; }
.metric small    { color: var(--muted); font-size: var(--font-md); font-weight: 400; }
```

Rejilla de métricas con **reflujo automático** (recomendado sobre columnas fijas):

```css
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  gap: 14px;
}
```

---

## 8. Layout y responsive

### Shell
- Contenedor centrado con `max-width: var(--content-max)` (1600px) y padding lateral.
- Barra superior / sidebar en `.glass`.

### Breakpoints (estrategia de la app)

| Ancho máx. | Qué ocurre |
|-----------|-----------|
| **1024px** | Layouts de 2 columnas "tablero + panel lateral" colapsan a 1 columna (evita que el contenido se aplaste). |
| **860px** | Shell del CRM a 1 columna; sidebar pasa a barra horizontal scrollable; cabeceras se apilan. |
| **720px** | Rejillas de formularios/paneles pasan a 1 columna. |
| **640 / 620px** | Modo compacto: menos padding, celdas más pequeñas, selects a ancho completo. |
| **420px** | Extra pequeño: se ocultan textos secundarios, tipografías mínimas. |

**Principios responsive aprendidos (aplícalos siempre):**
1. Colapsa las rejillas de 2 columnas **antes** de que la columna principal se
   quede sin espacio (no esperes a móvil). Ej.: calendario a 1024px, no a 860px.
2. Rejillas de tarjetas: usa `repeat(auto-fit, minmax(Xpx, 1fr))` para que
   reacomoden solas 4→3→2→1 sin saltos bruscos.
3. Cuadrículas anchas (mapas de calor, tablas densas): **scroll horizontal**
   (`overflow-x: auto` + `min-width` interno) en vez de comprimirlas.
4. Selects/inputs a `width: 100%` en pantallas pequeñas; nada de `min-width` fijo.

---

## 9. Convenciones de componentes

- **Cabecera de sección:** `eyebrow` (span en mayúsculas, `--font-xs`, `--muted`,
  `letter-spacing: 0.05em`) + título fuerte (`--font-lg/xl`, `--fog-strong`).
- **Separadores** internos: `border-top/bottom: 1px solid rgba(15,17,21,0.08)`.
- **Espaciado de paneles:** usa `display:flex; flex-direction:column; gap:14px`
  en el contenedor en vez de márgenes sueltos en cada hijo (distribución uniforme).
- **No dupliques información/acciones** en un mismo bloque (un solo "Llamar", una
  sola vez el estado). Jerarquía: contexto → dato → acción.
- **Transiciones** solo en `background`, `border-color`, `color`, `transform`,
  `box-shadow`, con `--transition-fast`. Respeta `prefers-reduced-motion`.

```css
@media (prefers-reduced-motion: reduce) {
  * { animation: none !important; transition: none !important; }
}
```

---

## 10. Cómo aplicar esta capa a otra app

1. Copia el bloque `:root` (sección 2) y el **reset** (sección 3) a tu `index.css`.
2. Añade la receta `.glass` (sección 4) y aplícala a tarjetas/paneles/barras.
3. Fondo de página: `background: var(--page)` en `body` (imprescindible para el blur).
4. Reutiliza los patrones de **botones**, **badges** y **métricas** (secciones 5–7).
5. Monta el layout con `--content-max` y aplica los **breakpoints** de la sección 8.
6. Sigue las **convenciones** de la sección 9 al crear componentes nuevos.

Con eso cualquier pantalla nueva "hereda" la línea visual de AVI CRM sin librerías
externas. Si más adelante quieres tematizar (p. ej. modo oscuro), basta con
redefinir los tokens de `:root` bajo un selector de tema; los componentes no cambian.
