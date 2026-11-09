# FuckinScheduleIt (FSI)

FSI is a shared weekly availability board for one group. Participants add a name, mark the weekdays they can make it, and can remove a row when needed. Days that work for everyone are highlighted. The grid checks for shared changes every five seconds. **Clear** turns every day off while keeping names on the grid.

## Run locally

Requirements: Node.js 20.19+ or 22.12+.

```sh
npm install
npm run dev
```

Open the local address printed by Vite. Without `DATABASE_URL`, local development uses `.data/participants.json`. To develop against Neon instead, copy `.env.example` to `.env`, add the Neon connection string as `DATABASE_URL`, then restart the dev server.

## Deploy to Vercel

1. Create a Neon Postgres project and copy its pooled connection string.
2. Before importing, set that connection string in `.env` as `DATABASE_URL`.
3. Run `npm run import:local-data` once to copy existing local participants and availability into Neon. The command refuses to import if Neon already contains participant rows. It is safe to skip if you do not need the local board data.
4. Push the project to GitHub and import that repository into Vercel.
5. Add `DATABASE_URL` to the Vercel project's environment variables for the deployments you use.
6. Deploy. `vercel.json` configures the Vite build; API functions create the `fsi_participants` table automatically on their first request.

The production frontend and API are served from the same Vercel project. The API uses Neon Postgres; weekday choices are stored in JSONB. Keep `DATABASE_URL` private and never commit `.env`.

## Local production server

After configuring `DATABASE_URL`, `npm run build` and `npm start` run the production app locally against Neon.

The app has no sign-in. Anyone who can reach the page can add names, change availability, or clear the grid. Do not use it for sensitive information.
