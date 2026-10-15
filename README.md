# dbdesk-studio

A modern database management studio with a beautiful web interface. Manage PostgreSQL, MySQL, and other databases with ease.

## Installation

### Via NPM (recommended)

```bash
npm install -g dbdesk-studio
dbdesk-studio
```

Or run directly without installation:

```bash
npx dbdesk-studio
```

### Via PNPM (local development)

```bash
git clone https://github.com/zexahq/dbdesk-studio.git
cd dbdesk-studio
pnpm install
pnpm build
pnpm start
```

## Features

- 🎨 **Modern Web Interface** - Built with React and TanStack Router
- 🗄️ **Multi-Database Support** - PostgreSQL, MySQL, and more
- 📝 **Query Editor** - Full-featured SQL editor with syntax highlighting
- 📊 **Table Browser** - Browse and edit data directly
- 💾 **Saved Queries** - Save and organize your queries
- 📈 **Export Data** - Export tables as CSV or SQL
- 🎯 **Type-Safe** - Built entirely in TypeScript
- 🚀 **Fast** - Powered by Vite and Express

## Quick Start

### Default Configuration

```bash
dbdesk-studio
```

- Frontend: http://localhost:9876
- Backend: http://localhost:6789

### Custom Ports

```bash
dbdesk-studio --backend-port 4000 --frontend-port 8080
```

### External Backend

```bash
dbdesk-studio --backend-url http://api.example.com:6789
```

## Options

```
Usage: dbdesk-studio [options]

Options:
  --backend-port <port>     Backend server port (default: 6789)
  --frontend-port <port>    Frontend server port (default: 9876)
  --backend-url <url>       Backend URL for frontend (default: http://localhost:6789)
  --help, -h               Show this help message
```

## Development

### Prerequisites

- Node.js >=20
- pnpm >=10.13.1

### Setup

```bash
git clone https://github.com/zexahq/dbdesk-studio.git
cd dbdesk-studio
pnpm install
```

### Development Mode

```bash
pnpm run dev
```

This starts:
- Frontend: http://localhost:3001
- Backend: http://localhost:6789

UI changes are applied by Vite hot-module replacement; a production build is
not required. Server source changes restart automatically through `tsx watch`.

### Development in Docker or Podman

Use the development Compose configuration instead of the production Dockerfile:

```bash
docker compose -f compose.dev.yaml up --build
# or: podman compose -f compose.dev.yaml up --build
```

Open http://localhost:3001. The checkout is mounted into the container, so UI
edits hot-reload without rebuilding the image. Rebuild only after changing
dependencies, the Dockerfile, or the lockfile:

```bash
docker compose -f compose.dev.yaml up --build
```

### Build

```bash
pnpm run build
```

### Type Checking

```bash
pnpm run typecheck
```

## Project Structure

```
dbdesk-studio/
├── apps/
│   ├── web/              # Frontend (React + TanStack Router + Vite)
│   └── server/           # Backend API (Express)
├── packages/
│   ├── common/           # Shared types and utilities
│   ├── config/           # Shared configuration
│   ├── env/              # Environment variables
│   └── cli/              # CLI entry point
└── turbo.json            # Monorepo configuration
```

## Features in Detail

### Host SQL integration

The API uses the shared connection manager for saved profiles and SQL routes.
Query/schema/table routes live in `apps/server/src/routes/sql.ts`; PostgreSQL
execution and cancellation live in `apps/server/src/lib/postgres/execution.ts`.
Hosts can connect a saved profile and POST a single query with
`options: { readOnly: true, queryId: "unique-id", limit: 100, offset: 0 }`.
Read-only execution uses a dedicated READ ONLY transaction, cancellation targets
that query ID, and statements have a 20-second server timeout. The public adapter
methods remain the SQLAdapter contract and forward to the query execution owner.
A host must independently approve the target and SQL, reject transaction control
that could escape read-only execution, and never repeat a write after an uncertain
outcome. Rebuild the container after changing server sources; old bundles with an
unresolved `ConnectionManager` reference cannot execute queries.

### Connections
- Save and manage multiple database connections
- Support for PostgreSQL and MySQL
- Connection profiles with credentials

### Query Editor
- Full-featured SQL editor with Monaco Editor
- Syntax highlighting for SQL
- Query history and saved queries
- Execute queries and view results

### Data Browser
- Browse tables and schemas
- View and edit table data inline
- Filter and sort data
- Delete rows and export data

### Workspace
- Save your workspace configuration
- Auto-save workspace state
- Quick access to saved queries

## Troubleshooting

### Port Already in Use
Use different ports:
```bash
dbdesk-studio --backend-port 4000 --frontend-port 8080
```

### CORS Errors
If frontend can't connect to backend, ensure the backend URL is correct:
```bash
dbdesk-studio --backend-url http://localhost:6789
```

### Build Issues
Clean and rebuild:
```bash
pnpm clean
pnpm install
pnpm build
```
## License

MIT

### Native database workspace integration

Native hosts may call `window.__DBDESK_WORKSPACE__.present(payload)` after boot
(`version === 1`). The payload contains `id`, `phase` (`prepare` or `result`),
`connectionId`, optional `sql`, `mode`, and the standard `result` or `error`.
This bridge only displays approved SQL/results in the existing query editor;
it never executes or replays SQL. Prepare selects a saved connection workspace;
result delivery updates that action's tab and refuses a disconnected workspace.
In-flight query cancellation uses the original action ID. The offline bridge
regression runs with `pnpm --filter server exec tsx --tsconfig ../web/tsconfig.json --test ../../test/host-workspace.ts`. Reload restores drafts,
never a running host action or executable request. The sidebar is visible only
inside an active connected workspace. Disconnect clears remembered connection,
tabs, metadata caches and live selection; the route cannot auto-reconnect it.

The production image carries `ai.cipher.dbdesk.workspace-contract=1`; both
`/health` and `/api/health` report `workspaceContract: 1`. Cipher mounts its
provider-neutral registry at `/usr/share/nginx/html/runtime.yaml`. Tagged Docker
releases publish **linux/amd64 and linux/arm64** to
`anuraggoswami/dbdesk-studio` (the repository Cipher pulls). Source changes alone
do not update an image already downloaded by another laptop. Publish the updated
release, then use **Pull latest** in Cipher. A missing engine, unavailable image,
or incompatible release is reported explicitly rather than showing an empty Studio.
