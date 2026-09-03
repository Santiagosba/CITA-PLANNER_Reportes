import React, { useEffect, useState } from 'react'
import { ArrowRight, Eye, EyeOff } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { TallerBranding } from '../lib/tallerBranding'
import { getAppLoginDefaultSubtitle, getAppProductName } from '../lib/appIdentity'
import ActionButton, { type ActionStatus } from '../components/ui/ActionButton'
import Card from '../components/ui/Card'

interface LoginViewProps {
  branding?: TallerBranding | null
  workshopDisplayName?: string | null
  externalNotice?: { kind: 'error' | 'info'; message: string } | null
  onDismissNotice?: () => void
}

export default function LoginView({
  branding,
  workshopDisplayName,
  externalNotice,
  onDismissNotice,
}: LoginViewProps) {
  const [step, setStep] = useState(1)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loginStatus, setLoginStatus] = useState<ActionStatus>('idle')
  const [error, setError] = useState<string | null>(null)

  const logoUrl = branding?.logo_url?.trim()

  useEffect(() => {
    if (externalNotice) setError(null)
  }, [externalNotice])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoginStatus('loading')
    setError(null)
    onDismissNotice?.()

    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
      if (signInError) {
        setLoginStatus('idle')
        setError(
          signInError.message === 'Invalid login credentials'
            ? 'Correo o contraseña incorrectos.'
            : 'No se pudo entrar. Inténtalo de nuevo.',
        )
      }
    } catch {
      setLoginStatus('idle')
      setError('Ha ocurrido un error. Inténtalo de nuevo.')
    }
  }

  const notice = externalNotice?.message || error
  const emailValid = email.trim().includes('@')

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <a href="#login-form" className="skip-link">
        Ir al formulario
      </a>
      <div className="w-full max-w-md">
        <Card padding="lg" className="text-center">
          <div className="logo-slot mx-auto mb-6">
            {logoUrl ? (
              <img
                src={logoUrl}
                alt={workshopDisplayName || 'Logo'}
                width={220}
                height={64}
                className="logo-slot-img"
                referrerPolicy="no-referrer"
              />
            ) : null}
          </div>

          <p className="section-eyebrow">{getAppProductName()}</p>
          <h1 className="section-title mt-1">{workshopDisplayName || 'Acceso'}</h1>
          <p className="section-subtitle mt-2">
            {step === 1 ? 'Paso 1 de 2 · Tu correo' : 'Paso 2 de 2 · Tu contraseña'}
          </p>

          <nav className="wizard-steps wizard-steps-compact mt-4" aria-label="Pasos de acceso">
            <span className={`wizard-step ${step === 1 ? 'is-current' : 'is-done'}`}>
              <span className="wizard-step-num">{step > 1 ? '✓' : '1'}</span>
              Correo
            </span>
            <span className={`wizard-step ${step === 2 ? 'is-current' : ''}`}>
              <span className="wizard-step-num">2</span>
              Contraseña
            </span>
          </nav>

          <form id="login-form" className="panel-stack mt-8 text-left" onSubmit={handleLogin}>
            {notice ? (
              <div
                className={`alert ${externalNotice?.kind === 'info' ? 'alert-info' : 'alert-error'}`}
                role="alert"
              >
                {notice}
              </div>
            ) : null}

            {step === 1 ? (
              <div className="panel-stack scroll-reveal is-visible">
                <label htmlFor="email" className="field-label">
                  ¿Cuál es tu correo?
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  autoFocus
                  placeholder="tu@correo.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="field-input"
                />
                <button
                  type="button"
                  disabled={!emailValid}
                  className="client-submit w-full-btn"
                  onClick={() => setStep(2)}
                >
                  Continuar
                  <ArrowRight size={18} />
                </button>
              </div>
            ) : (
              <div className="panel-stack scroll-reveal is-visible">
                <p className="section-subtitle">
                  Entrando como <strong>{email}</strong>
                  {' · '}
                  <button type="button" className="link-button" onClick={() => setStep(1)}>
                    Cambiar
                  </button>
                </p>
                <label htmlFor="password" className="field-label">
                  ¿Cuál es tu contraseña?
                </label>
                <div className="relative">
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    required
                    autoFocus
                    placeholder="Tu contraseña"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="field-input pr-14"
                  />
                  <button
                    type="button"
                    aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    className="ghost-button absolute right-1 top-1/2 min-h-0 -translate-y-1/2 border-0 bg-transparent px-2 py-2"
                    onClick={() => setShowPassword((v) => !v)}
                  >
                    {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>
                <ActionButton
                  type="submit"
                  status={loginStatus}
                  successLabel="Entrando…"
                  fullWidth
                  disabled={!password.trim()}
                >
                  Entrar
                </ActionButton>
                <button type="button" className="ghost-button w-full-btn" onClick={() => setStep(1)}>
                  Atrás
                </button>
              </div>
            )}
          </form>
        </Card>

        <p className="mt-6 text-center text-[var(--font-sm)] text-[var(--color-text-muted)]">
          Si tienes problemas para entrar, pide ayuda a tu responsable.
        </p>
      </div>
    </div>
  )
}
