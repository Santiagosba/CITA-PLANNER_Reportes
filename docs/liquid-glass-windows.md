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

- `src/hooks/useLiquidGlass.tsx`: genera la lente y controla la luz interactiva.
- `src/styles/avi-crm.css`: compone las capas, tintes, blur, bordes y fallbacks.
- `src/components/ToolWindow.tsx`: activa el efecto en las apps flotantes.
- `src/components/LeadGestionDrawer.tsx`: activa el efecto en las fichas.
- `src/components/GestionBubbleDock.tsx`: activa el efecto en la barra de tareas.

## Arquitectura visual

El marco real de la ventana queda transparente. Dos pseudoelementos se sitúan
detrás de su contenido:

```text
Contenido de la ventana
└── ::before  Cuerpo translúcido (tinte + blur + reflejo)
    └── ::after  Lente refractiva completa (SVG + aberración cromática)
        └── Dashboard vivo situado detrás de la ventana
```

No se rasteriza el dashboard ni se sustituye por una captura. Los filtros leen
el contenido real que el navegador está componiendo detrás de cada ventana.

## 1. La lente refractiva

`useLiquidGlass()` crea un mapa de desplazamiento a la medida de cada ventana.
El mapa se genera en un `canvas` a un cuarto de la resolución para reducir coste.

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

El hook inyecta un filtro SVG único dentro de cada ventana. Ese filtro ejecuta
tres desplazamientos:

- Rojo: refracción base menos 9 %.
- Verde: refracción base.
- Azul: refracción base más 9 %.

Después separa y vuelve a combinar los canales. La diferencia solo se aprecia
claramente donde la lente tiene pendiente, especialmente en el filo.

El filtro llega al CSS mediante una variable propia del elemento:

```css
--lg-filter: url(#identificador-unico);
```

Cada ventana necesita un identificador independiente para evitar que dos
instancias compartan accidentalmente el mismo mapa.

## 3. Cuerpo translúcido

La lente completa vive en `::after`. Encima, `::before` cubre el interior y
añade el acabado translúcido:

```css
.lead-os-frame::before,
.call-agenda-panel::before {
  inset: var(--lg-rim);
  background:
    radial-gradient(/* luz interactiva */),
    var(--lgw-sheen),
    var(--lgw-bg);
  backdrop-filter: var(--lgw-blur);
}
```

Valores actuales:

- Ventanas: canto visible de `8px`.
- Barra de tareas: canto visible de `10px`.
- Cuerpo claro: blanco al 60 %.
- Cuerpo oscuro: gris azulado al 62 %.
- Desenfoque: `blur(14px) saturate(1.15)`.

El cuerpo no pretende ocultar completamente el dashboard. Lo convierte en
formas suavizadas y coloreadas para que el texto y los controles tengan
prioridad visual.

## 4. Canto, Fresnel y reflejos

`::after` cubre toda la ventana y aplica el filtro refractivo:

```css
.lead-os-frame::after,
.call-agenda-panel::after {
  background: var(--lg-rim-tint);
  box-shadow: var(--lg-rim-shadow);
  backdrop-filter:
    var(--lg-filter, blur(0px))
    var(--lg-rim-fx);
}
```

El `box-shadow` interior simula Fresnel y la iluminación del material:

- Línea blanca en la parte superior e izquierda.
- Resplandor que nace en el filo.
- Arista ligeramente más oscura abajo y a la derecha.
- En la barra de tareas, matices cian y violeta refuerzan la aberración.

El reflejo radial del cuerpo sigue el puntero mediante `--lg-mx` y `--lg-my`.
Las actualizaciones se agrupan con `requestAnimationFrame` para realizar como
máximo una escritura visual por fotograma.

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

Un `ResizeObserver` vigila cada marco. Cuando cambia su tamaño:

1. Agrupa las notificaciones con `requestAnimationFrame`.
2. Durante un resize limita la reconstrucción a una cada 96 ms; el filtro,
   tinte y blur nunca se sustituyen, por lo que el material mantiene continuidad.
3. Al finalizar, recibe `liquidglass:refresh` para ajustar el mapa definitivo.
4. Lee anchura, altura y radio actuales.
5. Reutiliza un mapa de la caché LRU o genera uno nuevo.
6. Actualiza el `<feImage>` del filtro SVG.

El mapa no se vuelve a crear si las dimensiones y el radio no han cambiado.

## 7. Rendimiento

La implementación evita capturar y rasterizar el DOM:

- El dashboard sigue siendo HTML vivo.
- El mapa se actualiza como máximo cada 96 ms durante resize y una vez al terminar.
- Los últimos 20 mapas se conservan en una caché LRU.
- El movimiento del puntero reutiliza el rectángulo leído en `pointerenter` y
  solo actualiza dos variables CSS; durante un drag se pausa para no forzar
  una lectura de layout adicional.
- Elementos interiores como teclas y tarjetas no añaden otro
  `backdrop-filter`.
- El mapa se calcula a una cuarta parte de la resolución.
- Arrastrar utiliza `translate3d` y fija `left/top` una sola vez al soltar.
- Maximizar/restaurar usa FLIP con Web Animations (`transform`) en lugar de
  animar `left`, `top`, `width` y `height`.
- Refracción, aberración, tinte y blur permanecen iguales durante movimiento,
  resize, apertura, maximizado y minimizado. La continuidad se obtiene moviendo
  con `translate3d`, estirando temporalmente el mapa y actualizándolo con throttle.

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

- `--lg-rim`: anchura visual del canto.
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

Reducir `--lg-rim`. No es necesario reducir `BEVEL`: el primero controla el
canto visible y el segundo la transición óptica bajo el cuerpo.

### Baja el rendimiento

- No aplicar vidrio a cada tarjeta interior.
- No aumentar `MAP_SCALE` sin medir.
- Evitar regenerar el mapa durante cambios continuos que no alteren tamaño.
- Mantener las animaciones de movimiento basadas en `transform`.
