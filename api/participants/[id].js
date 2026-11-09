import { getDatabase } from '../_lib/db.js'
import { ApiError, readJsonBody, runHandler, sendJson } from '../_lib/http.js'

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export default async function handler(request, response) {
  await runHandler(response, async () => {
    if (request.method !== 'PATCH') {
      response.setHeader('Allow', 'PATCH')
      sendJson(response, 405, { error: 'Method not allowed.' })
      return
    }

    const id = Array.isArray(request.query?.id) ? request.query.id[0] : request.query?.id
    if (typeof id !== 'string' || !uuidPattern.test(id)) {
      throw new ApiError('Participant not found.', 404)
    }

    const body = await readJsonBody(request)
    if (!Number.isInteger(body.dayIndex) || body.dayIndex < 0 || body.dayIndex > 6 || typeof body.available !== 'boolean') {
      throw new ApiError('A valid day index and availability value are required.', 400)
    }

    const sql = await getDatabase()
    const [participant] = await sql`
      UPDATE fsi_participants
      SET days = jsonb_set(
        days,
        ARRAY[${String(body.dayIndex)}]::text[],
        ${JSON.stringify(body.available)}::jsonb,
        false
      )
      WHERE id = ${id}::uuid
      RETURNING id::text AS id, name, days
    `

    if (!participant) throw new ApiError('Participant not found.', 404)
    sendJson(response, 200, { participant })
  })
}
