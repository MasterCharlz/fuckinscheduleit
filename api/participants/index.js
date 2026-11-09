import { randomUUID } from 'node:crypto'
import { getDatabase, listParticipants } from '../_lib/db.js'
import { ApiError, readJsonBody, runHandler, sendJson } from '../_lib/http.js'

const inactiveDays = JSON.stringify(Array(7).fill(false))

export default async function handler(request, response) {
  await runHandler(response, async () => {
    const sql = await getDatabase()

    if (request.method === 'GET') {
      sendJson(response, 200, { participants: await listParticipants(sql) })
      return
    }

    if (request.method !== 'POST') {
      response.setHeader('Allow', 'GET, POST')
      sendJson(response, 405, { error: 'Method not allowed.' })
      return
    }

    const body = await readJsonBody(request)
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    if (!name || name.length > 40) {
      throw new ApiError('Name must be between 1 and 40 characters.', 400)
    }

    const [participant] = await sql`
      INSERT INTO fsi_participants (id, name, name_key, days)
      VALUES (
        ${randomUUID()}::uuid,
        ${name},
        ${name.toLowerCase()},
        ${inactiveDays}::jsonb
      )
      ON CONFLICT (name_key) DO UPDATE
      SET name_key = EXCLUDED.name_key
      RETURNING id::text AS id, name, days
    `

    sendJson(response, 200, { participant })
  })
}
