import { getDatabase, listParticipants } from './_lib/db.js'
import { sendJson, runHandler } from './_lib/http.js'

const inactiveDays = JSON.stringify(Array(7).fill(false))

export default async function handler(request, response) {
  await runHandler(response, async () => {
    if (request.method !== 'POST') {
      response.setHeader('Allow', 'POST')
      sendJson(response, 405, { error: 'Method not allowed.' })
      return
    }

    const sql = await getDatabase()
    await sql`UPDATE fsi_participants SET days = ${inactiveDays}::jsonb`
    sendJson(response, 200, { participants: await listParticipants(sql) })
  })
}
