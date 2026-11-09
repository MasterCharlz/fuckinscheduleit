import { neon } from '@neondatabase/serverless'

let sqlClient
let schemaInitialization

export async function getDatabase() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not configured.')
  }

  sqlClient ??= neon(process.env.DATABASE_URL)
  schemaInitialization ??= sqlClient`
    CREATE TABLE IF NOT EXISTS fsi_participants (
      id UUID PRIMARY KEY,
      name TEXT NOT NULL,
      name_key TEXT NOT NULL UNIQUE,
      days JSONB NOT NULL CHECK (
        jsonb_typeof(days) = 'array' AND jsonb_array_length(days) = 7
      ),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `.catch((error) => {
    schemaInitialization = undefined
    throw error
  })

  await schemaInitialization
  return sqlClient
}

export async function listParticipants(sql) {
  return sql`
    SELECT id::text AS id, name, days
    FROM fsi_participants
    ORDER BY created_at, id
  `
}
