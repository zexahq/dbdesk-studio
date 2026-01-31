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
