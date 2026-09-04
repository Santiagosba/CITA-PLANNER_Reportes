export const DEFAULT_LAURA_AVATAR = 'https://app.avibot.pro/assets/avi-bot/bots/laura/laura-avatar.png'
export const LAURA_AVATAR_KEY = 'avi_laura_avatar'
export const LAURA_AVATAR_EVENT = 'laura-avatar-changed'

export function loadLauraAvatar(): string {
  try {
    return localStorage.getItem(LAURA_AVATAR_KEY) || DEFAULT_LAURA_AVATAR
  } catch {
    return DEFAULT_LAURA_AVATAR
  }
}

export function saveLauraAvatar(dataUrl: string) {
  try {
    localStorage.setItem(LAURA_AVATAR_KEY, dataUrl)
  } catch {
    /* quota / private mode */
  }
  window.dispatchEvent(new Event(LAURA_AVATAR_EVENT))
}

export function clearLauraAvatar() {
  try {
    localStorage.removeItem(LAURA_AVATAR_KEY)
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event(LAURA_AVATAR_EVENT))
}

export function resizeImageFile(file: File, max = 320): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(img.width * scale))
      canvas.height = Math.max(1, Math.round(img.height * scale))
      const ctx = canvas.getContext('2d')
      URL.revokeObjectURL(url)
      if (!ctx) {
        reject(new Error('No se pudo preparar la imagen'))
        return
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      resolve(canvas.toDataURL('image/jpeg', 0.86))
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('La imagen no se pudo leer'))
    }
    img.src = url
  })
}
