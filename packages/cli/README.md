# dbdesk-studio

Database management studio with a beautiful web interface. Connect, query, and manage your databases with ease.

## Installation

### Option 1: Use with `npx` (no installation needed)
```bash
npx dbdesk-studio
```

### Option 2: Install globally
```bash
npm install -g dbdesk-studio
dbdesk-studio
```

### Option 3: Install locally
```bash
npm install dbdesk-studio
npx dbdesk-studio
```

## Quick Start

After running `dbdesk-studio`, the web interface will start at `http://localhost:9876`

### Quick Connect with URI

You can connect directly to a database using a connection URI:

```bash
# PostgreSQL
npx dbdesk-studio --uri "postgresql://user:password@localhost:5432/mydb"

# MySQL
npx dbdesk-studio --uri "mysql://user:password@localhost:3306/mydb"

# With SSL
npx dbdesk-studio --uri "postgresql://user:password@localhost:5432/mydb?sslmode=require"
```

This will start the studio and automatically open your browser connected to the specified database.

> ⚠️ **Security Note:** Passing credentials directly in the command line may expose them in shell history and process listings. For sensitive environments, consider:
> - Using environment variables: `--uri "$DATABASE_URL"`
> - Omitting the password and entering it in the UI
> - Using `.pgpass` or similar credential files for your database

## Features

- 🗄️ Support for PostgreSQL, MySQL, and more
- 🎨 Modern web-based UI
- 📝 Interactive SQL editor
- 🚀 Real-time query execution
- 💾 Database browsing and management

## Supported Databases

- PostgreSQL
- MySQL
- SQLite (coming soon)

## Usage

```bash
# Start the studio
dbdesk-studio

# Connect directly with a URI
dbdesk-studio --uri "postgresql://user:pass@localhost:5432/mydb"

# The web interface opens automatically
# Default: http://localhost:9876
```

## CLI Options

```
--uri <connection-string>  Database connection URI (opens directly to connection)
                           Supports: postgresql://, postgres://, mysql://
--backend-port <port>      Backend server port (default: 6789)
--frontend-port <port>     Frontend server port (default: 9876)
--backend-url <url>        Backend URL for frontend (default: http://localhost:6789)
--help, -h                 Show help message
```

## Configuration

Set database connection details directly in the web interface.

## License

MIT

## Repository

[github.com/zexahq/dbdesk-studio](https://github.com/zexahq/dbdesk-studio)
