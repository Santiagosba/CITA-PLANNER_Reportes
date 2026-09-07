import { useState } from 'react'
import { BookOpen, Lightbulb, MessageSquareQuote } from 'lucide-react'

type GuideTab = 'tips' | 'script'

type Section = {
  title: string
  items: string[]
}

const TIPS: Section[] = [
  {
    title: 'El escritorio',
    items: [
      'Cada cliente que abres es una ventana: muévela por la barra de título, redimensiónala por los bordes y usa el semáforo para cerrar, minimizar o agrandar (doble clic en el título también agranda).',
      'Pulsa en el fondo o en la cabecera para recoger todas las ventanas a los lados; vuelve a pulsar para restaurarlas. Pulsar dentro de una ventana la trae al frente.',
      'La barra de tareas guarda las fichas abiertas y las apps (teléfono, notas, contactos, guía). Puedes abrirla siempre desde el botón de la cabecera, junto a la campana.',
    ],
  },
  {
    title: 'Triage y prioridades',
    items: [
      'El tablero ordena las peticiones por urgencia. Arrastra una tarjeta para cambiarla de columna; el orden se guarda.',
      'Las peticiones con SLA crítico llevan borde rojo y aparecen en la campana de notificaciones. Empieza siempre por ellas.',
      'Cuando marcas «Gestionado» la ficha se cierra sola y desaparece de pendientes; si no quieres cerrarla, deja una nota y guarda.',
    ],
  },
  {
    title: 'Buscar rápido',
    items: [
      'El buscador de la cabecera entiende matrículas (1234 ABC), nombres, teléfonos, averías y también «SLA» o «pendientes».',
      'Escribe y pulsa Enter para abrir el primer resultado; con la lista abierta, cada fila abre su ficha.',
    ],
  },
  {
    title: 'Llamadas',
    items: [
      '«Llamar» en cualquier ficha usa el teléfono del CRM: el cliente ve el número del taller y la llamada se graba y se transcribe automáticamente.',
      'Al colgar, la constancia de la llamada se añade sola a las notas de gestión del cliente. Revísala, completa y guarda.',
      'El teléfono también sirve para marcar a mano y ver el historial de llamadas de este navegador. Durante una llamada, las teclas envían tonos.',
      'Si el chip del teléfono está en rojo, pulsa para reconectar. Si no aparece, el CRM no tiene el teléfono configurado.',
    ],
  },
  {
    title: 'Notas y contactos',
    items: [
      'Notas: apuntes rápidos mientras hablas; se guardan solos en este navegador. Para lo que deba quedar en el cliente, usa las notas de gestión de su ficha.',
      'Contactos: administración, soporte IT y soporte de llamadas. Rellena los teléfonos la primera vez; después «Llamar» sale por el teléfono del CRM.',
    ],
  },
]

const SCRIPT: Section[] = [
  {
    title: '1. Saludo e identificación',
    items: [
      '«Buenos días, le llamo de [taller], soy [nombre], asesor de servicio. ¿Hablo con [cliente]?»',
      'Confirma que es buen momento: «¿Le pillo bien? Serán dos minutos».',
      'Si no contesta: no insistas más de dos veces el mismo día; deja constancia y programa el siguiente intento.',
    ],
  },
  {
    title: '2. Motivo de la llamada',
    items: [
      'Ve al grano y en su lenguaje: «Le llamo por la solicitud que nos dejó sobre [avería / revisión / presupuesto] de su [marca modelo, matrícula]».',
      'Si viene de WhatsApp o del asistente: «Vi que nos escribió por [canal]; quería confirmarlo con usted directamente».',
      'Deja que explique. Escucha sin interrumpir y anota lo importante en Notas.',
    ],
  },
  {
    title: '3. Preguntas clave',
    items: [
      '¿Desde cuándo pasa? ¿En frío o en caliente? ¿Con qué frecuencia? ¿Algún testigo encendido?',
      '¿Puede seguir usando el vehículo con seguridad? Si hay duda, recomienda no circular y ofrece grúa.',
      '¿Kilometraje aproximado? ¿Última revisión? Sirve para proponer mantenimiento pendiente.',
    ],
  },
  {
    title: '4. Propuesta de cita',
    items: [
      'Ofrece dos opciones concretas, no una pregunta abierta: «Tengo hueco el martes a las 9:00 o el jueves a las 16:30, ¿cuál le viene mejor?»',
      'Explica qué haremos: «Lo recibimos, hacemos diagnóstico y le llamamos con el presupuesto antes de tocar nada».',
      'Pregunta si necesita coche de sustitución, recogida o espera en el taller.',
    ],
  },
  {
    title: '5. Objeciones frecuentes',
    items: [
      '«Es muy caro» → «Le entiendo. Primero diagnosticamos sin compromiso y le damos el presupuesto cerrado; usted decide».',
      '«No tengo tiempo» → «Podemos recogerlo en su casa o trabajo y devolvérselo listo». Ofrece franja concreta.',
      '«Ya lo miro en otro sitio» → «Perfecto. Si quiere, le dejamos el diagnóstico hecho para que compare con datos».',
    ],
  },
  {
    title: '6. Cierre',
    items: [
      'Resume: fecha, hora, qué haremos y qué debe traer (llave, documentación, si vendrá alguien más).',
      '«Le llegará una confirmación por WhatsApp/SMS. Cualquier cambio, respóndanos ahí o llámenos».',
      'Despedida corta y amable. Al colgar, revisa la nota automática en la ficha, completa y marca gestionado.',
    ],
  },
  {
    title: 'Recuerda',
    items: [
      'Tono cercano, frases cortas, sin tecnicismos. Nombre del cliente al menos dos veces.',
      'Nunca prometas precios ni plazos que no puedas cumplir: «le confirmo en cuanto lo vea el técnico».',
      'Todo lo acordado va a la ficha. Si no está escrito, no existe.',
    ],
  },
]

/** Guía de uso del CRM y guion de llamada para el asesor. Solo lectura. */
export default function GuideApp() {
  const [tab, setTab] = useState<GuideTab>('tips')
  const sections = tab === 'tips' ? TIPS : SCRIPT
  return (
    <div className="guide-app">
      <div className="phone-pad-tabs" role="tablist" aria-label="Guía">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'tips'}
          className={`phone-pad-tab${tab === 'tips' ? ' is-active' : ''}`}
          onClick={() => setTab('tips')}
        >
          <Lightbulb size={14} aria-hidden />
          Uso de la app
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'script'}
          className={`phone-pad-tab${tab === 'script' ? ' is-active' : ''}`}
          onClick={() => setTab('script')}
        >
          <MessageSquareQuote size={14} aria-hidden />
          Guion del asesor
        </button>
      </div>

      <div className="guide-list custom-scrollbar-light">
        {sections.map((s, i) => (
          <details key={s.title} className="guide-section lg-surface" open={i === 0}>
            <summary>
              <BookOpen size={14} aria-hidden />
              {s.title}
            </summary>
            <ul>
              {s.items.map((it) => (
                <li key={it}>{it}</li>
              ))}
            </ul>
          </details>
        ))}
      </div>
    </div>
  )
}
