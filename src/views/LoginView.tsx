
import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Lock, Mail, Loader2, AlertCircle, ChevronRight, Info, Eye, EyeOff } from 'lucide-react';
import type { TallerBranding } from '../lib/tallerBranding';
import {
  ACCENT_HEX_FALLBACK,
  brandingFullscreenHeroStyle,
  hexToRgba,
  safeBrandHex,
} from '../lib/brandingVisual';
import {
  getAppLoginDefaultSubtitle,
  getAppProductAccentLine,
  getAppProductName,
} from '../lib/appIdentity';
interface LoginViewProps {
  /** Branding del taller (cargado desde `crm_config.ui_branding`). `null` → diseño genérico. */
  branding?: TallerBranding | null;
  /** Subtítulo bajo el título cuando hay branding (= `nombre_personalizado`). */
  workshopDisplayName?: string | null;
  /** Aviso externo (URL inválida, sin acceso, etc.). */
  externalNotice?: { kind: 'error' | 'info'; message: string } | null;
  /** Callback para limpiar el aviso al iniciar sesión. */
  onDismissNotice?: () => void;
}

const LoginView: React.FC<LoginViewProps> = ({
  branding,
  workshopDisplayName,
  externalNotice,
  onDismissNotice,
}) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /**
   * `null` = aún no analizado · `true` = el logo es mayoritariamente blanco/muy claro
   * (no le añadimos tarjeta blanca porque desaparecería) · `false` = se puede usar el fondo blanco.
   */
  const [logoIsLight, setLogoIsLight] = useState<boolean | null>(null);

  const primary = useMemo(
    () => safeBrandHex(branding?.primary_color, ACCENT_HEX_FALLBACK),
    [branding?.primary_color],
  );

  const hasCustomLogo = Boolean(branding?.logo_url && branding.logo_url.trim());
  const hero = useMemo(() => brandingFullscreenHeroStyle(branding), [branding]);
  const hasCustomBg = Boolean(hero);

  useEffect(() => {
    setLogoIsLight(null);
  }, [branding?.logo_url]);

  const handleLogoLoad = (ev: React.SyntheticEvent<HTMLImageElement>) => {
    const img = ev.currentTarget;
    try {
      const w = Math.min(img.naturalWidth || 64, 96);
      const h = Math.min(img.naturalHeight || 64, 96);
      if (w === 0 || h === 0) return;
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, w, h);
      const { data } = ctx.getImageData(0, 0, w, h);
      let r = 0, g = 0, b = 0, count = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] < 32) continue;
        r += data[i];
        g += data[i + 1];
        b += data[i + 2];
        count++;
      }
      if (count === 0) {
        setLogoIsLight(true);
        return;
      }
      const avg = (r + g + b) / (count * 3);
      setLogoIsLight(avg > 235);
    } catch {
      setLogoIsLight(false);
    }
  };

  useEffect(() => {
    if (branding?.background_url) {
      const img = new Image();
      img.src = branding.background_url;
    }
  }, [branding?.background_url]);

  useEffect(() => {
    if (externalNotice) setError(null);
  }, [externalNotice]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    onDismissNotice?.();

    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        if (signInError.message === 'Invalid login credentials') {
          setError('Email o contraseña incorrectos.');
        } else {
          console.error('Supabase auth error:', signInError);
          setError('Ha ocurrido un error al iniciar sesión.');
        }
      }
    } catch (err) {
      console.error('Login error:', err);
      setError('Ha ocurrido un error inesperado.');
    } finally {
      setLoading(false);
    }
  };

  const containerStyle: React.CSSProperties = hero?.outerStyle ?? {};

  const focusRingStyle: React.CSSProperties = {
    ['--tw-ring-color' as string]: hexToRgba(primary, 0.35),
  };

  return (
    <div
      className={`relative flex min-h-screen w-full items-center justify-center overflow-hidden px-4 py-10 sm:py-12 ${hasCustomBg ? '' : 'bg-[#0a0f1a]'}`}
      style={containerStyle}
    >
      {hero ? (
        <div className="pointer-events-none absolute inset-0" style={hero.overlayStyle} aria-hidden />
      ) : (
        <>
          <div
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,rgba(20,184,166,0.12),transparent_50%)]"
            aria-hidden
          />
          <div
            className="pointer-events-none absolute inset-0 bg-gradient-to-b from-slate-950/80 via-[#0a0f1a] to-[#060a12]"
            aria-hidden
          />
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.08] [background-image:radial-gradient(rgb(148_163_184)_1px,transparent_1px)] [background-size:20px_20px]"
            aria-hidden
          />
        </>
      )}

      <div className="relative z-10 w-full max-w-[420px]">
        <div className="rounded-[1.5rem] border border-white/[0.06] bg-slate-950/40 p-8 shadow-[0_24px_48px_-12px_rgba(0,0,0,0.55)] backdrop-blur-md sm:p-10">
          <div className="flex flex-col items-center text-center">
            <h1 className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-2xl font-bold tracking-tight text-white sm:text-[1.65rem]">
              <span>{getAppProductName()}</span>
              {getAppProductAccentLine() ? (
                <span className="text-app-accent">{getAppProductAccentLine()}</span>
              ) : null}
            </h1>
            <p
              className="mt-2 max-w-sm text-sm font-normal leading-relaxed text-slate-400 line-clamp-3 sm:truncate"
              title={workshopDisplayName || undefined}
            >
              {workshopDisplayName || getAppLoginDefaultSubtitle()}
            </p>

            {hasCustomLogo && (
              <>
                <div className="mt-7 flex w-full items-center justify-center">
                  <div
                    className={
                      logoIsLight === true
                        ? 'flex h-[4.5rem] max-w-[18rem] items-center justify-center px-2 sm:h-20 sm:max-w-[20rem]'
                        : 'flex h-[4.5rem] max-w-[18rem] items-center justify-center rounded-xl bg-white px-5 py-3 shadow-[0_12px_28px_-14px_rgba(0,0,0,0.45)] ring-1 ring-white/20 sm:h-20 sm:max-w-[20rem]'
                    }
                  >
                    <img
                      src={branding!.logo_url!.trim()}
                      alt={workshopDisplayName || 'Logo del taller'}
                      className="h-full w-auto max-w-full object-contain object-center"
                      crossOrigin="anonymous"
                      loading="eager"
                      decoding="async"
                      onLoad={handleLogoLoad}
                      onError={(ev) => {
                        (ev.currentTarget as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  </div>
                </div>
                <div
                  className="mt-6 h-px w-16 bg-gradient-to-r from-transparent via-white/25 to-transparent"
                  aria-hidden
                />
              </>
            )}
          </div>

          <form className={hasCustomLogo ? 'mt-6' : 'mt-8'} onSubmit={handleLogin}>
            {externalNotice && (
              <div
                className={`mb-4 flex items-start gap-2 rounded-xl border px-4 py-3 text-sm ${
                  externalNotice.kind === 'error'
                    ? 'border-red-500/30 bg-red-950/50 text-red-200'
                    : 'border-amber-500/30 bg-amber-950/40 text-amber-200'
                }`}
              >
                {externalNotice.kind === 'error' ? (
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                ) : (
                  <Info className="mt-0.5 h-4 w-4 shrink-0" />
                )}
                <span className="flex-1">{externalNotice.message}</span>
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label
                  htmlFor="email"
                  className="mb-2 block text-left text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-slate-500"
                >
                  Email corporativo
                </label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
                    <Mail className="h-4 w-4" />
                  </span>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    className="block w-full rounded-xl border border-slate-600/50 bg-slate-900/80 py-3.5 pl-10 pr-4 text-sm text-white shadow-inner outline-none transition placeholder:text-slate-500 focus:border-teal-500/50 focus:ring-2 focus:ring-teal-500/20"
                    style={focusRingStyle}
                    placeholder="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
              </div>
              <div>
                <label
                  htmlFor="password"
                  className="mb-2 block text-left text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-slate-500"
                >
                  Contraseña
                </label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
                    <Lock className="h-4 w-4" />
                  </span>
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    required
                    className="block w-full rounded-xl border border-slate-600/50 bg-slate-900/80 py-3.5 pl-10 pr-12 text-sm text-white shadow-inner outline-none transition placeholder:text-slate-500 focus:border-teal-500/50 focus:ring-2 focus:ring-teal-500/20"
                    style={focusRingStyle}
                    placeholder="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    aria-pressed={showPassword}
                    className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition hover:bg-white/5 hover:text-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/40"
                    onClick={() => setShowPassword((v) => !v)}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" aria-hidden />
                    ) : (
                      <Eye className="h-4 w-4" aria-hidden />
                    )}
                  </button>
                </div>
              </div>
            </div>

            {error && (
              <div className="mt-4 rounded-xl border border-red-500/30 bg-red-950/50 px-4 py-3 text-sm text-red-200">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3.5 text-sm font-semibold text-white shadow-lg outline-none transition hover:brightness-110 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0f1a] disabled:cursor-not-allowed disabled:opacity-60"
              style={{ backgroundColor: primary }}
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Entrando…
                </>
              ) : (
                <>
                  Entrar al sistema
                  <ChevronRight className="h-4 w-4 opacity-90" />
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default LoginView;
