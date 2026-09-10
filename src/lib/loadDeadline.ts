/** Limita la espera de la UI aunque una dependencia no termine de responder. */
export async function withLoadDeadline<T>(pending: Promise<T>, timeoutMs = 15_000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      pending,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('La carga de tickets ha superado el tiempo de espera. Vuelve a intentarlo.')), timeoutMs)
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}
