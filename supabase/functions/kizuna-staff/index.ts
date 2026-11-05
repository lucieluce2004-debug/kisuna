import { createClient } from "npm:@supabase/supabase-js@2.118.0";

// The gateway accepts OAuth JWTs. No application action is reachable until
// Auth.getUser verifies the bearer; database RPCs then recheck protected roles.
const allowedOrigins = new Set([
  "https://kizuna.aleklecaribou.chatgpt.site",
  "http://127.0.0.1:8795",
]);
const maxBodyBytes = 70000;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const staffActions = new Set(["list_players", "review_player"]);
const adminActions = new Set(["list_boosters", "save_booster", "grant_rewards", "set_moderator", "set_staff_role"]);
const allowedActions = new Set(["me", "claim_rewards", ...staffActions, ...adminActions]);

class RequestError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
function headersFor(origin: string | null): Headers {
  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff", Vary: "Origin",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-retry-count, traceparent, tracestate, baggage",
    "Access-Control-Expose-Headers": "Retry-After",
  });
  if (origin && allowedOrigins.has(origin)) headers.set("Access-Control-Allow-Origin", origin);
  return headers;
}
function reply(body: unknown, status: number, headers: Headers): Response {
  return new Response(JSON.stringify(body), { status, headers });
}
async function readBody(request: Request): Promise<Record<string, unknown>> {
  const length = request.headers.get("content-length");
  if (length && (!/^\d+$/.test(length) || Number(length) > maxBodyBytes)) throw new RequestError(413,"BODY_TOO_LARGE","Requête trop volumineuse.");
  if (!request.body) throw new RequestError(400,"INVALID_INPUT","Requête invalide.");
  const reader = request.body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new RequestError(408,"BODY_TIMEOUT","La requête a expiré.")),3000); });
  try {
    while (true) {
      const part = await Promise.race([reader.read(), timeout]);
      if (part.done) break;
      size += part.value.byteLength;
      if (size > maxBodyBytes) throw new RequestError(413,"BODY_TOO_LARGE","Requête trop volumineuse.");
      parts.push(part.value);
    }
  } finally { clearTimeout(timer); void reader.cancel().catch(() => {}); }
  const buffer = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) { buffer.set(part,offset); offset += part.byteLength; }
  let value;
  try { value = JSON.parse(new TextDecoder().decode(buffer)); } catch { throw new RequestError(400,"INVALID_INPUT","Requête invalide."); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new RequestError(400,"INVALID_INPUT","Requête invalide.");
  return value;
}
function invalid(message = "Les paramètres sont invalides."): never { throw new RequestError(400,"INVALID_INPUT",message); }
function clean(value: unknown, min: number, max: number, fallback?: string): string {
  if (value === undefined && fallback !== undefined) return fallback;
  if (typeof value !== "string") invalid();
  const result = value.trim();
  if (result.length < min || result.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(result)) invalid();
  return result;
}
function integer(value: unknown, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max) invalid();
  return value;
}
function uuid(value: unknown): string {
  if (typeof value !== "string" || !uuidPattern.test(value)) invalid();
  return value.toLowerCase();
}
function keys(body: Record<string, unknown>, fields: string[]): void {
  if (Object.keys(body).some(key => !fields.includes(key))) invalid();
}
function payloadFor(action: string, body: Record<string, unknown>): Record<string, unknown> {
  if (action === "me") { keys(body,["action"]); return {}; }
  if (action === "claim_rewards") {
    keys(body,["action","expectedRevision"]);
    return { expectedRevision: integer(body.expectedRevision,0,Number.MAX_SAFE_INTEGER) };
  }
  if (action === "list_players") {
    keys(body,["action","search","page"]);
    return { search: clean(body.search,0,100,""), page: body.page === undefined ? 1 : integer(body.page,1,10000) };
  }
  if (action === "review_player") {
    keys(body,["action","userId","status","note"]);
    if (body.status !== "pending" && body.status !== "reviewed") invalid();
    return { userId:uuid(body.userId),status:body.status,note:clean(body.note,0,500,"") };
  }
  if (action === "list_boosters") { keys(body,["action"]); return {}; }
  if (action === "set_moderator") {
    keys(body,["action","userId","enabled"]);
    if (typeof body.enabled !== "boolean") invalid();
    return { userId:uuid(body.userId),enabled:body.enabled };
  }
  if (action === "set_staff_role") {
    keys(body,["action","userId","role"]);
    if (body.role !== null && body.role !== "admin" && body.role !== "moderator") invalid();
    return { userId:uuid(body.userId),role:body.role };
  }
  if (action === "grant_rewards") {
    keys(body,["action","userId","rolls","chakra","reason","requestId"]);
    const rolls = integer(body.rolls,0,1000), chakra = integer(body.chakra,0,1000000);
    if (rolls + chakra === 0) invalid("Indique au moins un roll ou du Chakra.");
    return { userId:uuid(body.userId),rolls,chakra,reason:clean(body.reason,2,280),requestId:uuid(body.requestId) };
  }
  if (action === "save_booster") {
    keys(body,["action","booster"]);
    const booster = body.booster;
    if (!booster || typeof booster !== "object" || Array.isArray(booster)) invalid();
    const item = booster as Record<string, unknown>;
    keys(item,["id","name","description","card_ids","published"]);
    if (typeof item.published !== "boolean" || !Array.isArray(item.card_ids) || item.card_ids.length > 500) invalid();
    const card_ids = item.card_ids.map(id => clean(id,1,120));
    if (new Set(card_ids).size !== card_ids.length) invalid("Une carte ne peut apparaître qu’une fois dans le pool.");
    const result: Record<string, unknown> = { name:clean(item.name,3,60),description:clean(item.description,0,300,""),card_ids,published:item.published };
    if (item.id !== undefined) result.id = uuid(item.id);
    return { booster:result };
  }
  invalid();
}
function databaseError(error: { code?: string; message?: string }): RequestError {
  const code = error.message || "";
  const known: Record<string,[number,string]> = {
    AUTH_REQUIRED:[401,"Ta session a expiré. Reconnecte-toi."],
    STAFF_REQUIRED:[403,"L’accès au panel est réservé au staff."],
    ADMIN_REQUIRED:[403,"Cette action est réservée aux administrateurs."],
    ADMIN_ROLE_PROTECTED:[403,"Le grade administrateur est protégé."],
    SELF_ROLE_PROTECTED:[403,"Tu ne peux pas retirer ton propre grade administrateur."],
    LAST_ADMIN_PROTECTED:[409,"Le site doit conserver au moins un administrateur."],
    PROFILE_REQUIRED:[403,"Termine la création de ton profil Kizuna."],
    STATE_REQUIRED:[409,"Charge ta collection avant de recevoir les récompenses."],
    STATE_CONFLICT:[409,"Une autre session a modifié la collection. Recharge sa sauvegarde avant de recevoir les récompenses."],
    BALANCE_LIMIT:[409,"Le solde maximum est atteint. Les récompenses restent en attente."],
    REQUEST_REUSED:[409,"Cette référence de récompense est déjà utilisée pour une autre attribution."],
    PLAYER_NOT_FOUND:[404,"Ce compte Kizuna est introuvable."],
    BOOSTER_NOT_FOUND:[404,"Ce booster est introuvable."],
    INVALID_CARD_POOL:[400,"Le pool contient une carte inconnue ou un doublon."],
    MISSING_RARITIES:[400,"Ajoute au moins une Rare, une Épique, une Légendaire et une Mythique avant de publier."],
    INVALID_INPUT:[400,"Les paramètres sont invalides."],
    INVALID_ACTION:[400,"L’action demandée est invalide."],
  };
  const match = known[code];
  if (match) return new RequestError(match[0],code,match[1]);
  if (["22P02","22023","22003"].includes(error.code || "")) return new RequestError(400,"INVALID_INPUT","Les paramètres sont invalides.");
  return new RequestError(503,"STAFF_UNAVAILABLE","Le service staff est temporairement indisponible.");
}
export async function handler(request: Request): Promise<Response> {
  const origin = request.headers.get("origin"), headers = headersFor(origin);
  try {
    if (origin && !allowedOrigins.has(origin)) throw new RequestError(403,"ORIGIN_FORBIDDEN","Origine non autorisée.");
    if (request.method === "OPTIONS") return new Response(null,{status:204,headers});
    if (request.method !== "POST") { headers.set("Allow","POST, OPTIONS"); throw new RequestError(405,"METHOD_NOT_ALLOWED","Méthode non autorisée."); }
    const bearer = /^Bearer ([^\s]{1,8192})$/i.exec(request.headers.get("authorization") || "");
    if (!bearer) throw new RequestError(401,"AUTH_REQUIRED","Connecte-toi pour continuer.");
    const url = Deno.env.get("SUPABASE_URL"), serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !serviceKey) throw new RequestError(503,"STAFF_UNAVAILABLE","Le service staff est temporairement indisponible.");
    const deadline = AbortSignal.timeout(15000);
    const service = createClient(url,serviceKey,{
      auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
      global:{fetch:(input,init) => fetch(input,{...init,signal:init?.signal?AbortSignal.any([deadline,init.signal]):deadline})},
    });
    const verified = await service.auth.getUser(bearer[1]);
    const user = verified.data?.user;
    if (verified.error || !user || user.is_anonymous || !uuidPattern.test(user.id)) throw new RequestError(401,"AUTH_REQUIRED","Ta session est invalide ou expirée.");
    const body = await readBody(request);
    if (typeof body.action !== "string" || !allowedActions.has(body.action)) throw new RequestError(400,"INVALID_ACTION","L’action demandée est invalide.");
    const action = body.action;
    // The actor is always Auth's canonical user ID. Caller metadata and any
    // submitted role, actor, e-mail or permissions are never trusted.
    const roleResult = await service.rpc("kizuna_staff_dispatch",{p_actor:user.id,p_action:"me",p_payload:{}});
    if (roleResult.error) throw databaseError(roleResult.error);
    const role = roleResult.data?.role;
    if (adminActions.has(action) && role !== "admin") throw new RequestError(403,"ADMIN_REQUIRED","Cette action est réservée aux administrateurs.");
    if (staffActions.has(action) && role !== "admin" && role !== "moderator") throw new RequestError(403,"STAFF_REQUIRED","L’accès au panel est réservé au staff.");
    const payload = payloadFor(action,body);
    if (action === "me") return reply({role:role === "admin" || role === "moderator" ? role : null},200,headers);
    const result = action === "set_staff_role"
      ? await service.rpc("kizuna_set_staff_role",{p_actor:user.id,p_target:payload.userId,p_role:payload.role})
      : await service.rpc("kizuna_staff_dispatch",{p_actor:user.id,p_action:action,p_payload:payload});
    if (result.error) throw databaseError(result.error);
    if (!result.data || typeof result.data !== "object") throw new RequestError(503,"STAFF_UNAVAILABLE","Le service staff est temporairement indisponible.");
    return reply(result.data,200,headers);
  } catch (error) {
    if (error instanceof RequestError) return reply({code:error.code,error:error.message},error.status,headers);
    return reply({code:"STAFF_UNAVAILABLE",error:"Le service staff est temporairement indisponible."},503,headers);
  }
}
Deno.serve(handler);
