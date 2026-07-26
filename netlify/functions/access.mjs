import {
  createHash,
  timingSafeEqual
} from "node:crypto";

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
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

export default async function handler(request) {
  let password;
  try {
    password = configuredPassword();
  } catch (error) {
    return json({ error: error.message }, 503);
  }

  if (request.method === "GET") {
    return json({ unlocked: false });
  }

  if (request.method === "POST") {
    const body = await request.json().catch(() => ({}));
    if (typeof body.password !== "string" || !equal(body.password, password)) {
      return json({ error: "That password is not correct." }, 401);
    }
    return json({ unlocked: true });
  }

  if (request.method === "DELETE") {
    return json({ unlocked: false });
  }

  return json({ error: "Method not allowed." }, 405);
}
