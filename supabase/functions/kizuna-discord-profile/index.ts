import { createClient } from "npm:@supabase/supabase-js@2.118.0";

// The gateway accepts OAuth user JWTs; every request is verified against Auth
// below before any application data is read or written.
const allowedOrigins = new Set([
  "https://kizuna.aleklecaribou.chatgpt.site",
  "http://127.0.0.1:8795",
]);
const maxBodyBytes = 256;
const usernamePattern = /^[A-Za-z0-9_.-]{2,20}$/;
type Service = ReturnType<typeof createClient>;
type Profile = { id: string; username: string; [key: string]: unknown };

class RequestError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

function responseHeaders(origin: string | null): Headers {
  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    Vary: "Origin",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "authorization, apikey, content-type, x-client-info, x-retry-count, traceparent, tracestate, baggage",
  });
  if (origin && allowedOrigins.has(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
  }
  return headers;
}

function reply(body: unknown, status: number, headers: Headers): Response {
  return new Response(JSON.stringify(body), { status, headers });
}

async function requestedUsername(request: Request): Promise<string | null> {
  const length = request.headers.get("content-length");
  if (length && (!/^\d+$/.test(length) || Number(length) > maxBodyBytes)) {
    throw new RequestError(413, "BODY_TOO_LARGE", "Requête trop volumineuse.");
  }
  if (!request.body) return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new RequestError(408, "BODY_TIMEOUT", "La requête a expiré."));
    }, 3000);
  });
  try {
    while (true) {
      const part = await Promise.race([reader.read(), timeout]);
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > maxBodyBytes) {
        throw new RequestError(413, "BODY_TOO_LARGE", "Requête trop volumineuse.");
      }
      chunks.push(part.value);
    }
  } finally {
    clearTimeout(timer);
    void reader.cancel().catch(() => {});
  }
  const buffer = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const text = new TextDecoder().decode(buffer).trim();
  if (!text) return null;
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new RequestError(400, "INVALID_BODY", "Requête invalide.");
  }
  // Only the chosen display name may come from the caller. Identity, e-mail
  // and roles always come from verified Auth and protected application tables.
  if (
    !payload || typeof payload !== "object" || Array.isArray(payload) ||
    Object.keys(payload).some((key) => key !== "username")
  ) throw new RequestError(400, "INVALID_BODY", "Requête invalide.");
  if (!Object.hasOwn(payload, "username")) return null;
  const value = (payload as Record<string, unknown>).username;
  const username = typeof value === "string" ? value.trim() : "";
  if (!usernamePattern.test(username)) {
    throw new RequestError(400, "INVALID_USERNAME", "Choisis un pseudo de 2 à 20 lettres, chiffres, points, tirets ou tirets bas.");
  }
  return username;
}

async function readProfile(service: Service, userId: string): Promise<Profile | null> {
  const { data, error } = await service.from("kizuna_profiles")
    .select("*").eq("id", userId).maybeSingle();
  if (error || (data && data.id !== userId)) {
    throw new RequestError(503, "PROFILE_UNAVAILABLE", "Le profil est temporairement indisponible.");
  }
  return data as Profile | null;
}

function nicknameSlug(identityData: Record<string, unknown>): string {
  const claims = identityData.custom_claims;
  const globalName = claims && typeof claims === "object"
    ? (claims as Record<string, unknown>).global_name
    : undefined;
  const values = [
    globalName, identityData.global_name, identityData.full_name,
    identityData.name, identityData.preferred_username, identityData.user_name,
  ];
  for (const value of values) {
    if (typeof value !== "string") continue;
    const slug = value.slice(0, 256).normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "").toLowerCase()
      .replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    if (slug.length >= 2) return slug.slice(0, 20);
  }
  return "player";
}

async function ensureProfile(
  service: Service,
  userId: string,
  username: string,
): Promise<Profile> {
  const token = crypto.randomUUID();
  const reserved = await service.rpc("kizuna_reserve_username", {
    p_username: username, p_token: token,
  });
  if (reserved.error && reserved.error.code !== "23505") {
    throw new RequestError(503, "PROFILE_UNAVAILABLE", "Le profil est temporairement indisponible.");
  }
  if (reserved.error || reserved.data !== true) {
    const concurrent = await readProfile(service, userId);
    if (concurrent) return concurrent;
    throw new RequestError(409, "USERNAME_TAKEN", "Ce pseudo est déjà utilisé ou en cours de réservation. Choisis-en un autre.");
  }
  let finished = false;
  try {
    const result = await service.rpc("kizuna_finish_username", {
      p_username: username, p_token: token, p_user_id: userId,
    });
    if (result.error && result.error.code !== "23505") {
      throw new RequestError(503, "PROFILE_UNAVAILABLE", "Le profil est temporairement indisponible.");
    }
    finished = !result.error && result.data === true;
    // A different request may have finished this same account first. Return
    // its insert-only winner, without renaming it or resetting profile fields.
    const profile = await readProfile(service, userId);
    if (profile) return profile;
    if (result.error?.code === "23505") {
      throw new RequestError(409, "USERNAME_TAKEN", "Ce pseudo est déjà utilisé. Choisis-en un autre.");
    }
  } finally {
    if (!finished) {
      // On transient cleanup failures the private reservation expires itself.
      await Promise.resolve(service.rpc("kizuna_release_username", {
        p_username: username, p_token: token,
      })).catch(() => {});
    }
  }
  const concurrent = await readProfile(service, userId);
  if (concurrent) return concurrent;
  throw new RequestError(409, "PROFILE_BUSY", "La création du profil est en cours. Réessaie dans un instant.");
}

export async function handler(request: Request): Promise<Response> {
  const origin = request.headers.get("origin");
  const headers = responseHeaders(origin);
  if (origin && !allowedOrigins.has(origin)) {
    return reply({ code: "ORIGIN_FORBIDDEN", error: "Origine non autorisée." }, 403, headers);
  }
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (request.method !== "POST") {
    headers.set("Allow", "POST, OPTIONS");
    return reply({ code: "METHOD_NOT_ALLOWED", error: "Méthode non autorisée." }, 405, headers);
  }
  const bearer = /^Bearer ([^\s]{1,8192})$/i.exec(request.headers.get("authorization") || "");
  if (!bearer) {
    return reply({ code: "AUTH_REQUIRED", error: "Connecte-toi avec Discord pour continuer." }, 401, headers);
  }
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !serviceKey) {
      throw new RequestError(503, "AUTH_UNAVAILABLE", "La connexion est temporairement indisponible.");
    }
    const deadline = AbortSignal.timeout(15000);
    const service = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: {
        fetch: (input, init) => fetch(input, {
          ...init,
          signal: init?.signal ? AbortSignal.any([deadline, init.signal]) : deadline,
        }),
      },
    });
    // getUser performs a server request to Auth; decoded JWTs or editable
    // user_metadata are never evidence of a Discord identity.
    const verified = await service.auth.getUser(bearer[1]);
    const user = verified.data?.user;
    if (
      verified.error || !user || user.is_anonymous ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(user.id)
    ) throw new RequestError(401, "AUTH_REQUIRED", "Connecte-toi avec Discord pour continuer.");
    const discord = Array.isArray(user.identities)
      ? user.identities.find((identity) => identity.provider === "discord")
      : undefined;
    if (!discord) {
      throw new RequestError(403, "DISCORD_REQUIRED", "Ce profil nécessite une connexion Discord.");
    }
    const username = await requestedUsername(request);
    const existing = await readProfile(service, user.id);
    if (existing) return reply({ profile: existing }, 200, headers);
    const identityData = discord.identity_data && typeof discord.identity_data === "object"
      ? discord.identity_data
      : {};
    if (username === null) {
      return reply({ needsUsername: true, userHint: nicknameSlug(identityData) }, 200, headers);
    }
    const profile = await ensureProfile(service, user.id, username);
    return reply({ profile }, 200, headers);
  } catch (error) {
    if (error instanceof RequestError) {
      if (error.status === 409) headers.set("Retry-After", "1");
      return reply({ code: error.code, error: error.message }, error.status, headers);
    }
    return reply({ code: "PROFILE_UNAVAILABLE", error: "Le profil est temporairement indisponible." }, 503, headers);
  }
}

Deno.serve(handler);
