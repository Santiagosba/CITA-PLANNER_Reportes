import { AlertCircle } from 'lucide-react'

type Props = {
  message: string
  variant?: 'error' | 'warning'
}

export default function ApiStatusBanner({ message, variant = 'error' }: Props) {
  const isError = variant === 'error'
  return (
    <div className={`alert flex items-start gap-3 ${isError ? 'alert-error' : 'alert-warning'}`}>
      <AlertCircle size={22} className="shrink-0" />
      <div>
        <p className="font-semibold">{isError ? 'Hay un problema de conexión' : 'Aviso'}</p>
        <p className="mt-1">{message}</p>
        {isError && (
          <p className="mt-2 text-[var(--font-xs)] opacity-90">
            Pide a tu responsable que revise que el servidor esté encendido y la contraseña configurada.
          </p>
        )}
      </div>
    </div>
  )
}
