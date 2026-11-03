const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { randomBytes, scrypt, timingSafeEqual, createHmac } = require('node:crypto');
const { promisify } = require('node:util');

// Load local secrets without adding a runtime dependency.
try {
  for (const line of fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (match && !Object.hasOwn(process.env, match[1])) process.env[match[1]] = match[2].replace(/^(["'])(.*)\1$/, '$2');
  }
} catch { /* environment variables can be supplied by the host */ }

const scryptAsync = promisify(scrypt);
const ROOT = __dirname;
const PORT = Number(process.env.PORT || 3000);
// Optional code-based production credentials. Generate PASSWORD_HASH with
// `npm run password-hash`; keep the plain password out of this file.
const CODE_PASSWORD_HASH = 'fff0ad68d688208d69c08f5488da0185:36d34518a0dbb53f54320e6e6def1df12367d22d604a65c624466dd81459e1bfaab8092273b7b2885d8ecd6cfccf4c26f12c115a188032e2a4aae2b9d4ac69c2';
const CODE_SESSION_SECRET = 'e5113ffe1dd88bd18070d32b6cdc8cbd8ced350b715763f20510958c47ac67cf7626d2bc1b4eda92c72b4d5e25f7833c';
const hosted = Boolean(process.env.VERCEL);
let SESSION_SECRET = (hosted ? process.env.SESSION_SECRET || CODE_SESSION_SECRET : CODE_SESSION_SECRET || process.env.SESSION_SECRET);
const COOKIE_SECURE = process.env.COOKIE_SECURE === 'true' || process.env.VERCEL === '1' || process.env.NODE_ENV === 'production';
const HOST = process.env.HOST || '127.0.0.1';
let PASSWORD_HASH = (hosted ? process.env.PASSWORD_HASH || CODE_PASSWORD_HASH : CODE_PASSWORD_HASH || process.env.PASSWORD_HASH);
const sessions = new Map();
const attempts = new Map();
let setupInProgress = false;
const MAX_ATTEMPTS = 8;
const WINDOW_MS = 15 * 60 * 1000;
const SESSION_MS = 12 * 60 * 60 * 1000;
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.aac': 'audio/aac', '.woff2': 'font/woff2' };

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', ...headers });
  res.end(JSON.stringify(body));
}

function cookieOptions() {
  return `Path=/; HttpOnly; SameSite=Strict; Max-Age=${Math.floor(SESSION_MS / 1000)}${COOKIE_SECURE ? '; Secure' : ''}`;
}

function readCookie(req, name) {
  const source = req.headers.cookie || '';
  const entry = source.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  if (!entry) return '';
  try { return decodeURIComponent(entry.slice(name.length + 1)); } catch { return ''; }
}

function originMatchesHost(req) {
  if (!req.headers.origin) return true;
  try { return new URL(req.headers.origin).host === req.headers.host; } catch { return false; }
}

function isAuthReady() {
  return SESSION_SECRET.length >= 32 && /^[a-f0-9]{32}:[a-f0-9]{128}$/i.test(PASSWORD_HASH);
}

function isLoopbackAddress(address = '') {
  const normalized = address.toLowerCase().replace(/^::ffff:/, '');
  return normalized === '127.0.0.1' || normalized === '::1';
}

function isLocalSetupRequest(req) {
  if (req.headers['x-forwarded-for'] || req.headers.forwarded) return false;
  if (!isLoopbackAddress(req.socket.remoteAddress || '')) return false;
  try {
    const hostname = new URL(`http://${req.headers.host || ''}`).hostname.toLowerCase();
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]' || hostname === '::1';
  } catch { return false; }
}

async function persistAuthSettings(passwordHash, sessionSecret) {
  const file = path.join(ROOT, '.env');
  let lines = [];
  try { lines = (await fs.promises.readFile(file, 'utf8')).split(/\r?\n/); } catch { /* create it on first setup */ }
  const values = { PASSWORD_HASH: passwordHash, SESSION_SECRET: sessionSecret };
  const seen = new Set();
  const updated = lines.flatMap((line) => {
    const match = line.match(/^\s*([A-Z_]+)\s*=/);
    if (!match || !Object.hasOwn(values, match[1])) return [line];
    if (seen.has(match[1])) return [];
    seen.add(match[1]);
    return [`${match[1]}=${values[match[1]]}`];
  });
  for (const [key, value] of Object.entries(values)) if (!seen.has(key)) updated.push(`${key}=${value}`);
  const temp = path.join(ROOT, `.env.${process.pid}.tmp`);
  await fs.promises.writeFile(temp, `${updated.filter((line, index) => line || index < updated.length - 1).join('\n')}\n`, { encoding: 'utf8', mode: 0o600, flag: 'w' });
  try { await fs.promises.rename(temp, file); }
  catch (error) { await fs.promises.rm(temp, { force: true }); throw error; }
}

function isAuthenticated(req) {
  const token = readCookie(req, 'hikayatuna_session');
  const [expiresText, signature, extra] = token.split('.');
  const expires = Number(expiresText);
  if (!token || extra || !Number.isSafeInteger(expires) || expires < Date.now() || !signature || !SESSION_SECRET) return false;
  const expected = createHmac('sha256', SESSION_SECRET).update(expiresText).digest('base64url');
  return safeEqual(signature, expected);
}

function createSessionCookie() {
  const expires = Date.now() + SESSION_MS;
  const expiresText = String(expires);
  const signature = createHmac('sha256', SESSION_SECRET).update(expiresText).digest('base64url');
  return `hikayatuna_session=${encodeURIComponent(`${expiresText}.${signature}`)}; ${cookieOptions()}`;
}

function cleanAttempts() {
  const now = Date.now();
  for (const [key, value] of attempts) if (now - value.started > WINDOW_MS) attempts.delete(key);
  for (const [token, session] of sessions) if (session.expires < now) sessions.delete(token);
}

function safeEqual(left, right) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function verifyPassword(password) {
  const [saltHex, hashHex] = PASSWORD_HASH.split(':');
  if (!saltHex || !hashHex || !/^[a-f0-9]{32}$/i.test(saltHex) || !/^[a-f0-9]{128}$/i.test(hashHex)) return false;
  const candidate = await scryptAsync(password, Buffer.from(saltHex, 'hex'), 64);
  return safeEqual(candidate, Buffer.from(hashHex, 'hex'));
}

function authenticated(req, res) {
  if (!isAuthenticated(req)) {
    send(res, 401, { error: 'انتهت صلاحية الجلسة، افتحي عالمنا من جديد.' });
    return false;
  }
  return true;
}

async function bodyJson(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  let data = '';
  for await (const chunk of req) {
    data += chunk;
    if (data.length > 4096) throw new Error('Request too large');
  }
  return JSON.parse(data || '{}');
}

function serveFile(res, file, cache = 'no-cache') {
  fs.readFile(file, (error, data) => {
    if (error) return send(res, 404, { error: 'الصفحة غير متاحة.' });
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': cache, 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; media-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'" });
    res.end(data);
  });
}

function serveVideo(req, res, file) {
  fs.stat(file, (error, stats) => {
    if (error || !stats.isFile()) return send(res, 404, { error: 'المقطع غير متاح.' });
    const headers = { 'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes', 'Cache-Control': 'private, max-age=3600', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' };
    const range = req.headers.range;
    if (!range) {
      res.writeHead(200, { ...headers, 'Content-Length': stats.size });
      return fs.createReadStream(file).pipe(res);
    }
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match) return send(res, 416, { error: 'نطاق تشغيل غير صالح.' }, { 'Content-Range': `bytes */${stats.size}` });
    let start = match[1] ? Number(match[1]) : Math.max(0, stats.size - Number(match[2]));
    let end = match[2] && match[1] ? Number(match[2]) : stats.size - 1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || end >= stats.size) return send(res, 416, { error: 'نطاق تشغيل غير صالح.' }, { 'Content-Range': `bytes */${stats.size}` });
    res.writeHead(206, { ...headers, 'Content-Length': end - start + 1, 'Content-Range': `bytes ${start}-${end}/${stats.size}` });
    fs.createReadStream(file, { start, end }).pipe(res);
  });
}

const handler = async (req, res) => {
  cleanAttempts();
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const routedPath = url.searchParams.get('path');
  if (routedPath) url.pathname = routedPath;
  const clientKey = createHmac('sha256', SESSION_SECRET || 'unconfigured').update(req.socket.remoteAddress || 'unknown').digest('hex');

  if (req.method === 'GET' && url.pathname === '/api/session') {
    return send(res, 200, { authenticated: isAuthenticated(req) });
  }

  if (req.method === 'GET' && url.pathname === '/api/setup/status') {
    const required = !isAuthReady();
    return send(res, 200, { setupRequired: required, setupAllowed: required && !process.env.VERCEL && isLocalSetupRequest(req), hosted: Boolean(process.env.VERCEL) });
  }

  if (req.method === 'POST' && url.pathname === '/api/setup') {
      if (process.env.VERCEL || !isLocalSetupRequest(req) || !originMatchesHost(req)) return send(res, 403, { error: 'إعداد كلمة المرور متاح محلياً فقط. اضبطي أسرار الإنتاج من لوحة الاستضافة.' });
    if (isAuthReady()) return send(res, 409, { error: 'كلمة المرور مضبوطة بالفعل.' });
    if (setupInProgress) return send(res, 409, { error: 'جارٍ إعداد كلمة المرور الآن.' });
    setupInProgress = true;
    try {
      const { password, confirmPassword } = await bodyJson(req);
      if (typeof password !== 'string' || password.length < 10 || password.length > 256) return send(res, 400, { error: 'اختاري كلمة مرور من عشرة أحرف على الأقل.' });
      if (password !== confirmPassword) return send(res, 400, { error: 'كلمتا المرور غير متطابقتين.' });
      const salt = randomBytes(16);
      const hash = await scryptAsync(password, salt, 64);
      const passwordHash = `${salt.toString('hex')}:${Buffer.from(hash).toString('hex')}`;
      const sessionSecret = randomBytes(48).toString('hex');
      await persistAuthSettings(passwordHash, sessionSecret);
      PASSWORD_HASH = passwordHash;
      SESSION_SECRET = sessionSecret;
      process.env.PASSWORD_HASH = passwordHash;
      process.env.SESSION_SECRET = sessionSecret;
      attempts.delete(clientKey);
      return send(res, 201, { message: 'أهلاً بكِ في أجمل حكاياتنا...' }, { 'Set-Cookie': createSessionCookie() });
    } catch {
      return send(res, 500, { error: 'تعذّر حفظ كلمة المرور على هذا الجهاز.' });
    } finally { setupInProgress = false; }
  }

  if (req.method === 'POST' && url.pathname === '/api/login') {
    if (!originMatchesHost(req)) return send(res, 403, { error: 'لم نتمكن من التحقق من هذا الطلب.' });
    if (!isAuthReady()) return send(res, 503, { error: 'هذا العالم ينتظر إعداد كلمة مروره الخاصة.' });
    const record = attempts.get(clientKey) || { started: Date.now(), count: 0 };
    if (Date.now() - record.started > WINDOW_MS) { record.started = Date.now(); record.count = 0; }
    if (record.count >= MAX_ATTEMPTS) return send(res, 429, { error: 'لنأخذ نفساً قصيراً، ثم نحاول من جديد.' }, { 'Retry-After': String(Math.ceil((WINDOW_MS - Date.now() + record.started) / 1000)) });
    try {
      const { password } = await bodyJson(req);
      record.count += 1;
      attempts.set(clientKey, record);
      if (typeof password !== 'string' || password.length > 256 || !(await verifyPassword(password))) return send(res, 401, { error: 'يبدو أن هذا العالم ينتظر كلمة السر الصحيحة.' });
      attempts.delete(clientKey);
      return send(res, 200, { message: 'أهلاً بكِ في أجمل حكاياتنا...' }, { 'Set-Cookie': createSessionCookie() });
    } catch {
      return send(res, 400, { error: 'حدث شيء غير متوقع، حاولي مرة أخرى.' });
    }
  }

  if (req.method === 'POST' && url.pathname === '/api/logout') {
    if (!originMatchesHost(req)) return send(res, 403, { error: 'لم نتمكن من التحقق من هذا الطلب.' });
    const token = readCookie(req, 'hikayatuna_session');
    return send(res, 200, { ok: true }, { 'Set-Cookie': `hikayatuna_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${COOKIE_SECURE ? '; Secure' : ''}` });
  }

  if ((url.pathname === '/api/config' || url.pathname.startsWith('/media/') || url.pathname.startsWith('/private/')) && !authenticated(req, res)) return;
  if (req.method === 'GET' && url.pathname === '/api/config') return serveFile(res, path.join(ROOT, 'config.js'), 'private, no-store');
  if (req.method === 'GET' && url.pathname.startsWith('/media/')) {
    const parts = url.pathname.slice('/media/'.length).split('/');
    const folders = { image: 'images', video: 'videos', music: 'music' };
    const folder = parts.length === 1 ? 'images' : folders[parts[0]];
    const name = parts.length === 1 ? parts[0] : parts[1];
    if (!folder || parts.length > 2 || !/^[\w.-]+$/.test(name || '') || name.includes('..')) return send(res, 400, { error: 'طلب غير صالح.' });
    if (folder === 'videos' && path.extname(name).toLowerCase() !== '.mp4') return send(res, 415, { error: 'المقاطع المدعومة بصيغة MP4.' });
    if (folder === 'videos') return serveVideo(req, res, path.join(ROOT, 'assets', folder, name));
    return serveFile(res, path.join(ROOT, 'assets', folder, name), 'private, max-age=3600');
  }
  if (req.method === 'GET' && url.pathname === '/') return serveFile(res, path.join(ROOT, 'index.html'));
  if (req.method === 'GET' && ['/style.css', '/script.js'].includes(url.pathname)) return serveFile(res, path.join(ROOT, url.pathname.slice(1)));
  return send(res, 404, { error: 'الصفحة غير متاحة.' });
};

if (require.main === module) {
  http.createServer(handler).listen(PORT, HOST, () => {
    console.log(`Hikayatuna is ready at http://${HOST}:${PORT}`);
    if (!isAuthReady()) console.warn('Complete first-time password setup from this device before sharing the site.');
  });
}
module.exports = handler;
