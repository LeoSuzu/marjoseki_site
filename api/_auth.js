const crypto = require("crypto");

const COOKIE_NAME = "marjo_admin_session";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

function getSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET environment variable is not set.");
  }
  return secret;
}

function sign(expiry) {
  return crypto.createHmac("sha256", getSecret()).update(String(expiry)).digest("hex");
}

function createSessionCookieValue() {
  const expiry = Date.now() + SESSION_TTL_MS;
  const signature = sign(expiry);
  return `${expiry}.${signature}`;
}

function parseCookies(header) {
  const cookies = {};
  if (!header) {
    return cookies;
  }
  header.split(";").forEach((part) => {
    const index = part.indexOf("=");
    if (index === -1) {
      return;
    }
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    cookies[key] = decodeURIComponent(value);
  });
  return cookies;
}

function isSessionValid(req) {
  const cookies = parseCookies(req.headers.cookie);
  const value = cookies[COOKIE_NAME];
  if (!value) {
    return false;
  }

  const [expiryRaw, signature] = value.split(".");
  const expiry = Number(expiryRaw);
  if (!expiry || !signature || Date.now() > expiry) {
    return false;
  }

  const expected = sign(expiry);
  const expectedBuffer = Buffer.from(expected);
  const signatureBuffer = Buffer.from(signature);
  if (expectedBuffer.length !== signatureBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, signatureBuffer);
}

function setSessionCookie(res) {
  const value = createSessionCookieValue();
  const maxAge = Math.floor(SESSION_TTL_MS / 1000);
  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=${value}; Max-Age=${maxAge}; Path=/; HttpOnly; Secure; SameSite=Strict`,
  );
}

function clearSessionCookie(res) {
  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Strict`,
  );
}

function timingSafeEqualString(a, b) {
  const aBuffer = Buffer.from(String(a));
  const bBuffer = Buffer.from(String(b));
  if (aBuffer.length !== bBuffer.length) {
    crypto.timingSafeEqual(aBuffer, aBuffer);
    return false;
  }
  return crypto.timingSafeEqual(aBuffer, bBuffer);
}

module.exports = {
  isSessionValid,
  setSessionCookie,
  clearSessionCookie,
  timingSafeEqualString,
};
