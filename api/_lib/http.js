export class ApiError extends Error {
  constructor(message, status) {
    super(message)
    this.status = status
  }
}

export function sendJson(response, status, value) {
  response.writeHead(status, {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
  })
  response.end(JSON.stringify(value))
}

export async function readJsonBody(request) {
  if (request.body !== undefined) {
    if (request.body && typeof request.body === 'object') return request.body
    try {
      return JSON.parse(request.body || '{}')
    } catch {
      throw new ApiError('Expected a JSON request body.', 400)
    }
  }

  const chunks = []
  let length = 0
  for await (const chunk of request) {
    length += chunk.length
    if (length > 32 * 1024) throw new ApiError('Request body is too large.', 413)
    chunks.push(chunk)
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
  } catch {
    throw new ApiError('Expected a JSON request body.', 400)
  }
}

export async function runHandler(response, operation) {
  try {
    await operation()
  } catch (error) {
    if (error instanceof ApiError) {
      sendJson(response, error.status, { error: error.message })
      return
    }

    console.error(error)
    sendJson(response, 500, { error: 'Service temporarily unavailable.' })
  }
}
