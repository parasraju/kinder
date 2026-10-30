# Kinder

> A quiet, private workspace for API discovery, credential vaulting, and secret hygiene.

Kinder is a local-first developer tool that brings together a curated API catalog, an encrypted credential vault, a secret scanner for repository exposure, and a proxy-powered request playground that never leaks secrets to the client.

---

## Features

- **Curated API Catalog**  
  Browse 40+ popular providers (AI, payments, communications, developer tools, database services) with authentication requirements, endpoint documentation, and request schemas.

- **Encrypted Credential Vault**  
  Store API keys, tokens, and secrets encrypted at rest using AES-256-GCM. Stored secrets are injected by the server proxy during requests and never exposed back to the client interface.

- **Secret Exposure Scanner**  
  Scan code repositories and public commits for leaked API keys, tokens, and credentials using structured pattern-matching rules. Detection and remediation only—Kinder never attempts to validate discovered keys against third-party providers.

- **Zero-Leak Request Console**  
  Test endpoints directly from the browser through a local backend proxy. Auth headers and bearer tokens are attached server-side, and sensitive headers are redacted before response logs are persisted.

- **Request History & Audit Log**  
  Inspect request latency, response statuses, payload sizes, and responses with timestamps and filtering.

- **Local & Self-Contained**  
  Built on Node.js and a zero-configuration SQLite database (`node:sqlite`). No external telemetry, no hosted databases, and complete ownership of your data.

---

## Tech Stack

| Layer | Technologies |
|---|---|
| **Frontend** | React 19, Vite 7, Tailwind CSS v4, TanStack Query, React Router v7, Lucide Icons, Geist Variable Fonts |
| **Backend** | Node.js (v22+), Express 5, `node:sqlite`, Zod, TypeScript, TSX |
| **Security** | Node `crypto` AES-256-GCM encryption, HTTP-only secure cookies, PBKDF2 password hashing |

---

## Getting Started

### Prerequisites

- **Node.js**: v22.0.0 or later (required for native `node:sqlite` support)
- **npm**: v10+

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/parasraju/kinder.git
   cd kinder
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure environment:**
   ```bash
   cp .env.example .env
   ```
   *(Optional)* Generate a dedicated 32-byte AES encryption key:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
   ```
   and set it as `APP_ENCRYPTION_KEY` in your `.env` file. If omitted in development, a local key is automatically generated in `data/.dev-encryption-key`.

4. **Start development servers:**
   ```bash
   npm run dev
   ```
   This runs both the Express API server (port `8787`) and the Vite development server (port `5173`) concurrently.

5. **Open in browser:**
   Navigate to [http://localhost:5173](http://localhost:5173).

---

## Demo Account

When `SEED_DEMO=true` is enabled in your `.env` (default), a pre-configured demo account is seeded automatically:

- **Email:** `demo@kinderapply.dev`
- **Password:** `kinderdemo123`

You can also use the **"Open the demo workspace"** shortcut directly on the login screen.

---

## Available Scripts

| Command | Description |
|---|---|
| `npm run dev` | Run API server and Vite client concurrently in watch mode |
| `npm run dev:api` | Run only the Express API server with TSX watch |
| `npm run dev:web` | Run only the Vite development server |
| `npm run build` | Type-check TypeScript and build the production web client |
| `npm start` | Run the Express server in production mode |
| `npm run typecheck` | Run TypeScript verification across client and server |
| `npm run lint` | Run ESLint checks |
| `npm test` | Run server unit and integration tests |
| `npm run db:reset` | Remove the local `data/` directory to re-seed the SQLite database |

---

## Project Structure

```
kinder/
├── public/                # Static assets & brand favicon
├── server/                # Backend API & services
│   ├── routes/            # Express route handlers (auth, catalog, vault, scans, playground)
│   ├── services/          # Scanner, GitHub API, request proxy, crypto helpers
│   ├── db.ts              # SQLite database schema, migrations, and queries
│   └── crypto.ts          # AES-256-GCM vault encryption
├── shared/                # Shared types and catalog definitions
├── src/                   # React frontend
│   ├── components/        # Shell, navigation, UI primitives
│   ├── pages/             # Overview, Explore, Vault, Scans, Playground, Settings
│   └── lib/               # Auth context, API client, formatting utilities
└── .env.example           # Environment template
```

---

## Security & Ethics

- **Non-Invasive Secret Scanning:** Kinder is built for detection, developer alerting, and remediation. It does not validate third-party keys against provider APIs or transmit discovered secrets off-machine.
- **Client Sanitization:** Encrypted credentials stored in your vault are never passed down to the browser. The request console sends requests through the local proxy server, which attaches authentication headers on the fly and strips sensitive tokens from logs.

---

## License

ISC License. See repository for details.
