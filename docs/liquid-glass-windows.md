# Liquid Glass en el sistema de ventanas

## Objetivo

Las fichas de gestión, las aplicaciones flotantes y la barra de tareas deben
parecer piezas de vidrio, no paneles blancos transparentes.

El resultado combina cuatro propiedades:

1. **Translucidez:** deja pasar luz y color, pero mantiene legible el contenido.
2. **Desenfoque:** el fondo se percibe suavizado bajo el cuerpo de la ventana.
3. **Refracción:** el fondo se desplaza al acercarse al canto, como en una lente.
4. **Aberración cromática y reflejos:** el filo separa ligeramente los canales
   rojo, verde y azul y recibe una iluminación especular.

## Componentes involucrados

- `src/hooks/useLiquidGlass.tsx`: genera y precarga la lente compartida.
- `src/styles/avi-crm.css`: compone las capas, tintes, blur, bordes y fallbacks.
- `src/hooks/useOsWindow.ts`: marco de fichas y apps; activa el vidrio una sola vez.
- `src/components/ToolWindow.tsx`: ventana de app; no duplica gestos.
- `src/components/LeadGestionDrawer.tsx`: activa el efecto en las fichas.
- `src/components/GestionBubbleDock.tsx`: activa el efecto en la barra de tareas.

## Arquitectura visual

El marco real de la ventana queda transparente. Dos pseudoelementos se sitúan
detrás de su contenido:

```text
Contenido de la ventana
└── ::after   Fresnel sobre el mismo vidrio
    └── ::before  Cuerpo translúcido a toda la caja (tinte + blur)
        └── .lg-lens  Lente refractiva SVG por piezas
```

No se rasteriza el dashboard ni se sustituye por una captura. Los filtros leen
el contenido real que el navegador está componiendo detrás de cada ventana.

## 1. La lente refractiva

`useLiquidGlass()` crea **ocho mapas fijos** (4 lados + 4 esquinas) una sola vez.
Cada tira mide `BEVEL = 56px`. Al redimensionar, los lados se estiran solo en
la dirección tangente, donde el mapa es constante: el canto no se deforma.

Cada píxel guarda en sus canales:

- **R:** cuánto debe desplazarse horizontalmente el fondo.
- **G:** cuánto debe desplazarse verticalmente el fondo.
- **128:** posición neutra, sin desplazamiento.

Para calcular la dirección correcta se utiliza la distancia firmada de un
rectángulo redondeado. Así, las esquinas refractan en diagonal y los laterales
en perpendicular al borde. El perfil de lente es fuerte en el filo y se reduce
progresivamente hacia el centro:

```ts
function bevelProfile(t: number): number {
  const u = 1 - Math.min(1, Math.max(0, t))
  return u * u * (0.6 + 0.4 * u)
}
```

La curvatura óptica penetra `BEVEL = 56px` desde el exterior, aunque el canto
visible sea más estrecho. Esto evita que el efecto termine bruscamente.

## 2. Aberración cromática

Hay 8 filtros SVG compartidos (`#lg2-shared-n`, esquinas, etc.). Cada uno ejecuta
un único desplazamiento del fondo. La separación cromática visible se dibuja
en el anillo Fresnel con líneas cian y magenta. Esto conserva la apariencia y
reduce las pasadas SVG de 24 a 8 por ventana.

## 3. Cuerpo translúcido

La lente completa vive en `::after`. Encima, `::before` cubre el interior y
añade el acabado translúcido:

```css
.lead-os-frame::before,
.call-agenda-panel::before {
  inset: 0;
  background:
    var(--lgw-sheen),
    var(--lgw-bg);
  backdrop-filter: var(--lgw-blur);
}
```

Valores actuales:

- Ventanas y barra: el cuerpo cubre también el canto (`--lg-rim: 0`).
- Cuerpo claro: blanco al 60 %.
- Cuerpo oscuro: gris azulado al 62 %.
- Desenfoque: `blur(14px) saturate(1.15)`.

El filo y el interior son el mismo vidrio. El Fresnel (`::after`) solo
ilumina ese material; no es un marco hueco. No vuelvas a insetar el
cuerpo ni a ocultar `.lead-modal.lead-os-frame::after`.

## 4. Canto, Fresnel y reflejos

`.lg-lens` aplica la refracción. `::after` solo pinta el Fresnel, sin filtro:

```css
.lg-lens-n { height: var(--lg-bevel); backdrop-filter: url(#lg-shared-n) var(--lg-rim-fx); }
.lead-os-frame::after { box-shadow: var(--lg-rim-shadow); }
```

El `box-shadow` interior simula Fresnel y la iluminación del material:

- Línea blanca en la parte superior e izquierda.
- Resplandor que nace en el filo.
- Arista ligeramente más oscura abajo y a la derecha.
- En la barra de tareas, matices cian y violeta refuerzan la aberración.

El reflejo del cuerpo es fijo: el cristal no registra movimientos del puntero.

## 5. Integración en React

Cada marco conserva una referencia al elemento que recibirá el filtro:

```tsx
const frameRef = useRef<HTMLDivElement>(null)
const glassDefs = useLiquidGlass(frameRef)

return (
  <div ref={frameRef} className="lead-modal lead-os-frame">
    {glassDefs}
    {/* contenido */}
  </div>
)
```

La barra de tareas se monta y desmonta. Por eso pasa una clave de activación:

```tsx
const glassDefs = useLiquidGlass(panelRef, `${mounted}:${deskVisual}`)
```

Sin esa clave, el primer efecto podía ejecutarse cuando `panelRef.current`
todavía era `null`; al abrir la barra después, la refracción no se inicializaba.

## 6. Redimensionado y maximizado

El cristal no se regenera al cambiar de tamaño:

1. Las 8 tiras se colocan con CSS (`top/left/right/bottom` + `--lg-bevel`).
2. Los mapas de desplazamiento son compartidos y permanentes.
3. El cuerpo (`::before`) usa el mismo blur y tinte en cualquier tamaño.
4. El anillo Fresnel (`::after`) es solo sombra, también en px.
5. Maximizar anima `left/top/width/height` (no `scale`) para no estirar el canto.

Los mapas compartidos se preparan al cargar el módulo, antes de abrir una ficha.

## 7. Rendimiento

La implementación evita capturar y rasterizar el DOM:

- El dashboard sigue siendo HTML vivo.
- Los 8 mapas de la lente se generan una vez y se reutilizan en todas las ventanas.
- Redimensionar no toca el canvas ni el SVG: solo cambia el layout CSS.
- No hay listeners de puntero por ventana ni escrituras CSS por movimiento.
- Elementos interiores como teclas y tarjetas no añaden otro
  `backdrop-filter`.
- Arrastrar utiliza `translate3d` y fija `left/top` una sola vez al soltar.
- Maximizar/restaurar anima la caja real para que el bevel siga midiendo 56 px.

Esto resulta más adecuado para un CRM dinámico que una solución WebGL basada
en capturas de todo el dashboard.

## 8. Compatibilidad y degradación

- Chrome y Edge ofrecen el efecto completo cuando aceptan filtros SVG en
  `backdrop-filter`.
- Si el navegador no admite el filtro SVG, mantiene tinte, blur, sombras y
  reflejos, pero no refracción real.
- Si no existe soporte para `backdrop-filter`, el CSS utiliza una superficie
  casi opaca para conservar la legibilidad.
- Con `prefers-reduced-transparency`, aumenta el tinte y reduce el desenfoque.

## 9. Parámetros de ajuste

### En `useLiquidGlass.tsx`

- `BEVEL`: profundidad de la curvatura desde el borde.
- `MAX_SHIFT`: intensidad de la refracción.
- `CHROMA`: separación de los canales de color.
- `MAP_SCALE`: resolución del mapa; aumentarla mejora detalle y aumenta coste.

### En `avi-crm.css`

- `--lg-rim`: debe ser `0`. El cuerpo y el canto son el mismo vidrio.
- `--lgw-bg`: densidad del cuerpo translúcido.
- `--lgw-blur`: desenfoque y saturación del fondo.
- `--lg-rim-tint`: tinte del canto.
- `--lg-rim-shadow`: Fresnel, línea especular y color del filo.
- `--lg-rim-fx`: saturación, brillo y contraste aplicados a la lente.

Los tokens de las ventanas usan el prefijo `--lgw-*`. No deben reutilizarse
los tokens `--glass-*` del design system porque tienen tipos y propósitos
diferentes.

## 10. Diagnóstico

### Se ve completamente transparente

Comprobar en las herramientas del navegador que `::before` tenga:

- `background-image` válido.
- `backdrop-filter: blur(...)`.
- Un valor válido en `--lgw-bg`.

Una variable con un tipo incorrecto invalida toda la declaración CSS.

### La barra tiene blur pero no refracción

Comprobar:

- Que contiene un `<svg class="lg-defs">`.
- Que el panel tiene `--lg-filter: url(#...)`.
- Que `useLiquidGlass()` recibió una clave que cambia al volver a montarse.

### El filo ocupa demasiado espacio

No agrandes `--lg-rim`: el cuerpo debe cubrir el canto. Si el Fresnel se lee
demasiado, suaviza `--lg-rim-shadow`. `BEVEL` solo es la profundidad óptica.

### Baja el rendimiento

- No aplicar vidrio a cada tarjeta interior.
- No aumentar `MAP_SCALE` sin medir.
- Evitar regenerar el mapa durante cambios continuos que no alteren tamaño.
- Mantener las animaciones de movimiento basadas en `transform`.
