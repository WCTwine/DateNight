import {
  createHash,
  createHmac,
  timingSafeEqual
} from "node:crypto";

const COOKIE_NAME = "datenight_access";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...extraHeaders
    }
  });
}

function configuredPassword() {
  const password = process.env.DATENIGHT_ACCESS_PASSWORD;
  if (!password) throw new Error("Password protection has not been configured.");
  return password;
}

function digest(value) {
  return createHash("sha256").update(value).digest();
}

function equal(left, right) {
  return timingSafeEqual(digest(left), digest(right));
}

function sign(payload, password) {
  return createHmac("sha256", password).update(payload).digest("base64url");
}

function createToken(password) {
  const expiresAt = String(Date.now() + (MAX_AGE_SECONDS * 1000));
  const payload = Buffer.from(expiresAt).toString("base64url");
  return `${payload}.${sign(payload, password)}`;
}

function validToken(token, password) {
  if (!token) return false;
  const [payload, signature] = token.split(".");
  if (!payload || !signature || !equal(signature, sign(payload, password))) return false;

  const expiresAt = Number(Buffer.from(payload, "base64url").toString("utf8"));
  return Number.isFinite(expiresAt) && expiresAt > Date.now();
}

function cookieValue(request) {
  const cookieHeader = request.headers.get("cookie") || "";
  const cookies = cookieHeader.split(";").map(item => item.trim());
  const match = cookies.find(item => item.startsWith(`${COOKIE_NAME}=`));
  return match ? match.slice(COOKIE_NAME.length + 1) : "";
}

export default async function handler(request) {
  let password;
  try {
    password = configuredPassword();
  } catch (error) {
    return json({ error: error.message }, 503);
  }

  if (request.method === "GET") {
    return json({ unlocked: validToken(cookieValue(request), password) });
  }

  if (request.method === "POST") {
    const body = await request.json().catch(() => ({}));
    if (typeof body.password !== "string" || !equal(body.password, password)) {
      return json({ error: "That password is not correct." }, 401);
    }

    const cookie = [
      `${COOKIE_NAME}=${createToken(password)}`,
      "Path=/",
      `Max-Age=${MAX_AGE_SECONDS}`,
      "HttpOnly",
      "Secure",
      "SameSite=Strict"
    ].join("; ");
    return json({ unlocked: true }, 200, { "set-cookie": cookie });
  }

  if (request.method === "DELETE") {
    const cookie = [
      `${COOKIE_NAME}=`,
      "Path=/",
      "Max-Age=0",
      "HttpOnly",
      "Secure",
      "SameSite=Strict"
    ].join("; ");
    return json({ unlocked: false }, 200, { "set-cookie": cookie });
  }

  return json({ error: "Method not allowed." }, 405);
}
