import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import participantsHandler from './api/participants/index.js'
import participantHandler from './api/participants/[id].js'
import resetHandler from './api/reset.js'

const projectRoot = path.dirname(fileURLToPath(import.meta.url))
const dataDirectory = path.join(projectRoot, '.data')
const dataFile = path.join(dataDirectory, 'participants.json')
const staticDirectory = path.join(projectRoot, 'dist')
const apiOnly = process.argv.includes('--api-only')
const port = Number(process.env.PORT || (apiOnly ? 3001 : 3000))
const dayCount = 7
let writeQueue = Promise.resolve()

class RequestError extends Error {
  constructor(message, status) {
    super(message)
    this.status = status
  }
}

async function readBoard() {
  try {
    const contents = await readFile(dataFile, 'utf8')
    const board = JSON.parse(contents)
    return Array.isArray(board) ? board : []
  } catch (error) {
    if (error.code === 'ENOENT') return []
    throw error
  }
}

async function writeBoard(board) {
  await mkdir(dataDirectory, { recursive: true })
  const temporaryFile = `${dataFile}.${randomUUID()}.tmp`
  await writeFile(temporaryFile, JSON.stringify(board, null, 2), 'utf8')
  await rename(temporaryFile, dataFile)
}

function updateBoard(update) {
  const operation = writeQueue.then(async () => {
    const board = await readBoard()
    const result = update(board)
    await writeBoard(result.board)
    return result
  })
  writeQueue = operation.then(() => undefined, () => undefined)
  return operation
}

async function readJsonBody(request) {
  const chunks = []
  let length = 0

  for await (const chunk of request) {
    length += chunk.length
    if (length > 1024 * 32) throw new RequestError('Request body is too large.', 413)
    chunks.push(chunk)
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw new RequestError('Expected a JSON request body.', 400)
  }
}

function sendJson(response, status, value) {
  response.writeHead(status, {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
  })
  response.end(JSON.stringify(value))
}

async function handleApi(request, response, url) {
  if (request.method === 'GET' && url.pathname === '/api/participants') {
    await writeQueue
    sendJson(response, 200, { participants: await readBoard() })
    return true
  }

  if (request.method === 'POST' && url.pathname === '/api/participants') {
    const body = await readJsonBody(request)
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    if (!name || name.length > 40) {
      throw new RequestError('Name must be between 1 and 40 characters.', 400)
    }

    const result = await updateBoard((board) => {
      const existing = board.find((person) => person.name.toLowerCase() === name.toLowerCase())
      if (existing) return { board, participant: existing, created: false }

      const participant = { id: randomUUID(), name, days: Array(dayCount).fill(false) }
      return { board: [...board, participant], participant, created: true }
    })
    sendJson(response, result.created ? 201 : 200, { participant: result.participant })
    return true
  }

  const participantMatch = url.pathname.match(/^\/api\/participants\/([0-9a-f-]+)$/i)
  if (participantMatch && request.method === 'DELETE') {
    await updateBoard((board) => {
      const nextBoard = board.filter((person) => person.id !== participantMatch[1])
      if (nextBoard.length === board.length) throw new RequestError('Participant not found.', 404)
      return { board: nextBoard }
    })
    sendJson(response, 200, { ok: true })
    return true
  }

  if (participantMatch && request.method === 'PATCH') {
    const body = await readJsonBody(request)
    if (!Number.isInteger(body.dayIndex) || body.dayIndex < 0 || body.dayIndex >= dayCount || typeof body.available !== 'boolean') {
      throw new RequestError('A valid day index and availability value are required.', 400)
    }

    const result = await updateBoard((board) => {
      const index = board.findIndex((person) => person.id === participantMatch[1])
      if (index < 0) throw new RequestError('Participant not found.', 404)
      const participant = { ...board[index], days: [...board[index].days] }
      participant.days[body.dayIndex] = body.available
      const nextBoard = [...board]
      nextBoard[index] = participant
      return { board: nextBoard, participant }
    })
    sendJson(response, 200, { participant: result.participant })
    return true
  }

  if (request.method === 'POST' && url.pathname === '/api/reset') {
    const result = await updateBoard((board) => ({
      board: board.map((person) => ({ ...person, days: Array(dayCount).fill(false) })),
    }))
    sendJson(response, 200, { participants: result.board })
    return true
  }

  if (url.pathname.startsWith('/api/')) {
    sendJson(response, 404, { error: 'Not found.' })
    return true
  }

  return false
}

async function handleNeonApi(request, response, url) {
  if (url.pathname === '/api/participants') {
    await participantsHandler(request, response)
    return true
  }

  if (url.pathname === '/api/reset') {
    await resetHandler(request, response)
    return true
  }

  const participantMatch = url.pathname.match(/^\/api\/participants\/([0-9a-f-]+)$/i)
  if (participantMatch) {
    request.query = { id: participantMatch[1] }
    await participantHandler(request, response)
    return true
  }

  return false
}

const contentTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
])

async function serveStatic(request, response, url) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    sendJson(response, 404, { error: 'Not found.' })
    return
  }

  let pathname
  try {
    pathname = decodeURIComponent(url.pathname)
  } catch {
    sendJson(response, 400, { error: 'Invalid URL.' })
    return
  }

  const filePath = path.resolve(staticDirectory, `.${pathname}`)
  const relativePath = path.relative(staticDirectory, filePath)
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    sendJson(response, 403, { error: 'Forbidden.' })
    return
  }

  let contents
  let resolvedPath = filePath
  try {
    contents = await readFile(resolvedPath)
  } catch {
    if (path.extname(pathname)) {
      sendJson(response, 404, { error: 'Not found.' })
      return
    }
    resolvedPath = path.join(staticDirectory, 'index.html')
    try {
      contents = await readFile(resolvedPath)
    } catch {
      sendJson(response, 503, { error: 'Build the app before starting the production server.' })
      return
    }
  }

  response.writeHead(200, {
    'Cache-Control': path.basename(resolvedPath) === 'index.html' ? 'no-cache' : 'public, max-age=3600',
    'Content-Type': contentTypes.get(path.extname(resolvedPath)) || 'application/octet-stream',
    'X-Content-Type-Options': 'nosniff',
  })
  response.end(request.method === 'HEAD' ? undefined : contents)
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`)

  try {
    if (process.env.DATABASE_URL && await handleNeonApi(request, response, url)) return
    if (await handleApi(request, response, url)) return
    if (apiOnly) {
      sendJson(response, 404, { error: 'Not found.' })
      return
    }
    await serveStatic(request, response, url)
  } catch (error) {
    const status = error instanceof RequestError ? error.status : 500
    sendJson(response, status, { error: status === 500 ? 'Internal server error.' : error.message })
    if (status === 500) console.error(error)
  }
})

server.listen(port, '0.0.0.0', () => {
  console.log(`FSI ${apiOnly ? 'API' : 'server'} listening on port ${port}`)
})
