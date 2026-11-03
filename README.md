# حكايتنا

A private, Arabic RTL memory garden built with HTML, CSS, vanilla JavaScript, and Node.js. The supplied illustrations are atmospheric stand-ins; replace them with your own photographs before treating the gallery as a personal archive.

## Run locally

Requires Node.js 20 or newer. No packages need to be installed.

1. Start the site with `npm start`.
2. Open `http://127.0.0.1:3000` on the same computer and choose your password on the welcome screen.

On first run, the server securely hashes the password, generates a session secret, and stores both in the ignored `.env` file. The setup screen only accepts its first password from a loopback connection on the host computer. Once setup is complete, the page returns to the normal sign-in screen.

## Deploy to Vercel

This repository includes a Vercel Node.js Function entry point and route rules. The login session is a signed, expiring HttpOnly cookie, so it works across function invocations without relying on in-memory sessions. Vercel first-run setup is intentionally disabled: set secrets before the first production deployment.

1. Create a Git repository and push this project. Do not commit `.env`.
2. Import that repository into Vercel and keep the project root as the Root Directory. Vercel detects `vercel.json`.
3. Locally, run `npm run password-hash` and enter the password you want to share. By default, copy the resulting `PASSWORD_HASH=...` value into Vercel Project Settings → Environment Variables.
4. Generate a secret locally with `node -p "require('node:crypto').randomBytes(48).toString('hex')"`. Add the output in Vercel as `SESSION_SECRET`.
5. Deploy or redeploy. Give visitors the production URL and the password you chose. Never add the plain password or generated secrets to source files or Git.

Use the current Production domain shown in Vercel after deployment. A deployment-specific `*.vercel.app` URL is an immutable snapshot and will keep showing its original build after later changes.

The Vercel function protects `/api/config` and media routes; direct requests to the source config and asset paths are routed through the same protection. Production setup must use Vercel environment variables because serverless files cannot persist `.env` changes. If you change either secret, redeploy so the new values take effect.

If you prefer code-based configuration, `server.js` has `CODE_PASSWORD_HASH` and `CODE_SESSION_SECRET` constants near the top. Paste the generated hash value (without the `PASSWORD_HASH=` prefix) and a generated session secret there, then deploy. On Vercel, explicitly configured environment variables take precedence; locally the code values take precedence. Do not put the plain password in client-side files such as `script.js`, `index.html`, or `config.js`.

## Configuration

Edit `config.js` to change the relationship start date, illustrated memory cards, timeline entries, Arabic letters, future dreams, optional video clips, and music. The server returns this file only after login. Keep private media under `assets/images`, `assets/videos`, and `assets/music`; those folders are deliberately not exposed as static directories. The authenticated `/media/` route serves only a single filename from the corresponding folder.

Photo entries use `image`, `title`, `category`, `date`, `description`, and `letter`. Timeline entries use `title`, `date`, `image`, and `description`. Video entries use `src`, `poster`, `title`, `date`, and `description`. Music uses `src` and `title`. Leave the videos list empty or music source blank when you do not have those files.

Dreams added in the interface are saved in this browser's session storage. The relationship start date is an ISO 8601 value; include the intended timezone offset.

## Production security

The app uses scrypt password verification, random opaque 256-bit session tokens, HttpOnly and SameSite=Strict cookies, session expiry, origin checks, login rate limiting, and authenticated routes for private config and media. First-run setup is limited to the local machine. Sessions and rate limits live in server memory, so restarting the server invalidates active sessions and resets counters. For a multi-instance deployment, use a shared session and rate-limit store before scaling out.

Terminate HTTPS at a trusted reverse proxy and set `COOKIE_SECURE=true` in `.env`. Set `HOST=0.0.0.0` only when the host/container must accept traffic from outside its local interface. Keep `.env` private and do not commit it. The example default binds to `127.0.0.1` for local use.

## Project map

- `server.js`: HTTP server, authentication, session handling, and protected media.
- `index.html`: Arabic document shell and all site sections.
- `style.css`: responsive glass, sky, timeline, gallery, letter, and modal treatments.
- `script.js`: login flow and interactive features.
- `config.js`: centralized private story content.
- `assets/images/`: illustrative sample images, gated by the server.
- `assets/videos/` and `assets/music/`: private media directories for optional files.
