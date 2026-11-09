import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getDatabase } from '../api/_lib/db.js'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dataFile = path.join(projectRoot, '.data', 'participants.json')
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

let participants
try {
  participants = JSON.parse(await readFile(dataFile, 'utf8'))
} catch (error) {
  if (error.code === 'ENOENT') {
    console.log('No local participant data found; nothing to import.')
    process.exit(0)
  }
  throw error
}

if (!Array.isArray(participants)) throw new Error('Local participant data must be a JSON array.')

const names = new Set()
for (const participant of participants) {
  if (
    !participant ||
    typeof participant.id !== 'string' ||
    !uuidPattern.test(participant.id) ||
    typeof participant.name !== 'string' ||
    !participant.name.trim() ||
    participant.name.trim().length > 40 ||
    !Array.isArray(participant.days) ||
    participant.days.length !== 7 ||
    !participant.days.every((day) => typeof day === 'boolean')
  ) {
    throw new Error('Local data contains a participant with an invalid id, name, or weekday list.')
  }

  const key = participant.name.trim().toLowerCase()
  if (names.has(key)) throw new Error(`Local data contains duplicate participant name: ${participant.name}`)
  names.add(key)
  participant.name = participant.name.trim()
}

if (participants.length === 0) {
  console.log('The local participant list is empty; nothing to import.')
  process.exit(0)
}

const sql = await getDatabase()
const [{ count }] = await sql`SELECT count(*)::int AS count FROM fsi_participants`
if (count > 0) {
  throw new Error('Neon already has participant rows. Import stopped without changing either dataset.')
}

const imported = await sql`
  INSERT INTO fsi_participants (id, name, name_key, days, created_at)
  SELECT source.id, source.name, lower(source.name), source.days,
    now() + ((entry.ordinal - 1) * interval '1 microsecond')
  FROM jsonb_array_elements(${JSON.stringify(participants)}::jsonb)
    WITH ORDINALITY AS entry(value, ordinal)
  CROSS JOIN LATERAL jsonb_to_record(entry.value)
    AS source(id uuid, name text, days jsonb)
  ORDER BY entry.ordinal
  RETURNING id
`

if (imported.length !== participants.length) {
  throw new Error(`Imported ${imported.length} of ${participants.length} participants.`)
}

console.log(`Imported ${imported.length} participant${imported.length === 1 ? '' : 's'} into Neon.`)
