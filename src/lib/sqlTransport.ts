/** Retry only reads during a brief API/proxy outage; never replay a mutation. */
export async function fetchSqlResponse(input: string, init: RequestInit = {}): Promise<Response> {
  const attempts = (init.method || 'GET').toUpperCase() === 'GET' ? 3 : 1
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const response = await fetch(input, init)
      const proxyFailure = [502, 503, 504].includes(response.status) ||
        (response.status === 500 && !(response.headers.get('content-type') || '').includes('json'))
      if (!proxyFailure || attempt === attempts - 1 || init.signal?.aborted) return response
      void response.body?.cancel().catch(() => {})
    } catch (error) {
      if (attempt === attempts - 1 || init.signal?.aborted) throw error
    }
    await new Promise((resolve) => setTimeout(resolve, 350 * (attempt + 1)))
  }
  throw new Error('No se pudo conectar con la API SQL.')
}
