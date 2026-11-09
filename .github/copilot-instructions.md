# FSI Workspace Instructions

- Keep the interface deliberately minimal: name entry, weekday grid, automatic refresh, and Clear.
- Clear resets every availability toggle but preserves participant names.
- Shared state is served by `server.mjs`; persistent data lives in `.data/` and must not be committed.
- Preserve keyboard accessibility and a usable horizontal grid on mobile.
- Validate changes with `npm run build` and `npm run lint`.
