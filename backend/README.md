# Bobbatlu API

This backend uses Node.js, Express, PostgreSQL, and SMTP email. Node.js 20 or newer and PostgreSQL are required; PHP and Composer are not used.

## Setup

Create a PostgreSQL database named `storepos` (for example, using pgAdmin). From the repository root, run:

```powershell
Copy-Item backend/.env.example backend/.env
```

Edit `backend/.env` and set the PostgreSQL password, SMTP server details, and a private random `OTP_SECRET`. Keep `.env` private. Set `MAIL_SECURE=true` for SMTP port 465; use `false` for STARTTLS port 587. Set `ADMIN_EMAIL` to `samruddhivskp@gmail.com` or the authorized admin address.

Then install dependencies and start the API:

```powershell
cd backend
npm install
npm run dev
```

On startup, the API creates its tables and creates or updates the configured admin account. The React development server proxies `/api` requests to `http://localhost:3000`.

Available auth endpoints are `POST /api/auth/request-otp`, `POST /api/auth/verify-otp`, `GET /api/auth/me`, and `POST /api/auth/logout`. Health check: `GET /api/health`.
