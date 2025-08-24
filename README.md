# Kracken Messenger

A modern cross-platform messenger application built with Node.js, Express, Socket.IO, and Electron. This project is organized as a monorepo containing web, desktop, and server applications with shared packages.

## 🏗️ Architecture

This is a monorepo containing multiple applications and shared packages:

### Apps
- **`@kracken/server`** - Backend API server (Node.js, Express, Socket.IO)
- **`@kracken/web`** - Web application (HTML, CSS, JavaScript)
- **`@kracken/desktop`** - Desktop application (Electron)

### Shared Packages
- **`@kracken/shared-db`** - Database utilities, schemas, and migrations
- **`@kracken/shared-ui`** - Common UI components and styles
- **`@kracken/shared-types`** - TypeScript type definitions
- **`@kracken/config`** - Shared configuration constants

## 🚀 Quick Start

### Prerequisites
- Node.js (v16.0.0 or higher)
- npm (v8.0.0 or higher)
- PostgreSQL (for production) or SQLite (for development)

### Installation

1. **Clone the repository**
   ```bash
   git clone <your-repo-url>
   cd Kracken
   ```

2. **Install all dependencies**
   ```bash
   npm install
   ```
   This will install dependencies for all workspaces automatically.

3. **Set up environment variables**
   ```bash
   # For server
   cp apps/server/.env.example apps/server/.env
   # Edit apps/server/.env with your database credentials
   ```

4. **Initialize the database**
   ```bash
   npm run db:init
   ```

### Development

#### Run all applications
```bash
# Start server and web app together
npm run dev:full

# Or start individual applications
npm run dev:server    # Backend API on port 3000
npm run dev:web        # Web app on port 3001
npm run dev:desktop    # Desktop app
```

#### Database management
```bash
npm run db:init        # Initialize database
npm run db:migrate     # Run migrations
npm run db:reset       # Reset database (destructive!)
```

### Production

#### Build applications
```bash
npm run build:web              # Build web application
npm run build:desktop          # Build desktop app for current OS
npm run build:desktop:win      # Build for Windows
npm run build:desktop:linux    # Build for Linux
```

#### Start production server
```bash
npm run start:server
```

## 📁 Project Structure

```
Kracken/
├── apps/
│   ├── server/          # Backend API
│   │   ├── server.js    # Main server file
│   │   ├── api/         # API endpoints
│   │   ├── utils/       # Server utilities
│   │   └── public/      # Static files
│   ├── web/             # Web application
│   │   └── public/      # Web assets
│   └── desktop/         # Electron application
│       ├── electron/    # Electron main process
│       └── resources/   # App resources
├── packages/
│   ├── shared-db/       # Database layer
│   │   ├── scripts/     # DB scripts
│   │   ├── utils/       # DB utilities
│   │   └── schema.sql   # Database schema
│   ├── shared-ui/       # UI components
│   ├── shared-types/    # TypeScript types
│   └── config/          # Configuration
├── docs/                # Documentation
├── deploy/              # Deployment scripts
└── package.json         # Root workspace config
```

## 🔧 Development Workflow

### Adding a new feature

1. **Identify the right package/app** - Add features to the appropriate workspace
2. **Use shared packages** - Import from `@kracken/*` packages for common functionality
3. **Update types** - Add TypeScript types to `@kracken/shared-types` if needed
4. **Test locally** - Use the development scripts to test your changes

### Working with the monorepo

```bash
# Install a dependency to a specific app
npm install lodash --workspace=@kracken/server

# Run a script in a specific workspace
npm run dev --workspace=@kracken/web

# Run a script in all workspaces
npm run build --workspaces
```

## 📊 Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev:server` | Start backend server in development |
| `npm run dev:web` | Start web application |
| `npm run dev:desktop` | Start desktop application |
| `npm run dev:full` | Start server + web together |
| `npm run build:desktop` | Build desktop app |
| `npm run db:init` | Initialize database |
| `npm run db:migrate` | Run database migrations |
| `npm run db:reset` | Reset database |

## 🛠️ Tech Stack

### Backend (`@kracken/server`)
- **Runtime**: Node.js
- **Framework**: Express.js
- **Real-time**: Socket.IO
- **Database**: PostgreSQL / SQLite
- **Environment**: dotenv

### Web App (`@kracken/web`)
- **Frontend**: Vanilla HTML, CSS, JavaScript
- **Real-time**: Socket.IO client
- **Dev Server**: http-server

### Desktop App (`@kracken/desktop`)
- **Framework**: Electron
- **Builder**: electron-builder
- **Packaging**: Native installers (AppImage, NSIS)

## 🔒 Security Considerations

⚠️ **This is a development/MVP version**. For production deployment, consider implementing:

- Password hashing and salting
- JWT-based authentication
- Rate limiting
- Input validation and sanitization
- HTTPS enforcement
- CORS configuration
- CSP headers
- Session management

See individual app READMEs for specific security considerations.

## 🚀 Deployment

### Server Deployment
The server app can be deployed to any Node.js hosting platform:
- Railway, Render, Heroku
- VPS with PM2
- Docker containers
- Serverless functions (with modifications)

### Desktop Distribution
Desktop apps are built as native installers:
- **Linux**: AppImage
- **Windows**: NSIS installer
- **macOS**: DMG (requires macOS build environment)

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make changes in the appropriate workspace
4. Test all affected applications
5. Commit changes: `git commit -m 'Add amazing feature'`
6. Push to the branch: `git push origin feature/amazing-feature`
7. Open a Pull Request

### Development Guidelines

- Use the existing code style and conventions
- Add TypeScript types to `@kracken/shared-types` for shared interfaces
- Update documentation when adding features
- Test both web and desktop applications when making UI changes
- Follow the existing project structure

## 📝 License

This project is licensed under the ISC License - see the `package.json` files for details.

## 🆘 Support

- 📖 Check the documentation in the `docs/` folder
- 🐛 Report issues in the GitHub Issues section
- 💬 Join our community discussions

## 📈 Future Roadmap

- [ ] TypeScript migration
- [ ] Enhanced security features
- [ ] Mobile applications
- [ ] Advanced chat features (file sharing, reactions, etc.)
- [ ] Admin panel
- [ ] Multi-language support
- [ ] Testing suite implementation

---

Made with ❤️ using modern web technologies
