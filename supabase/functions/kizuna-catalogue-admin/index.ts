import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { favouriteCount, rarityFromPopularity } from "../_shared/rarity-policy.ts";

// verify_jwt is disabled at the gateway; this handler verifies every user itself.
const allowedOrigins = new Set([
  "https://kizuna.aleklecaribou.chatgpt.site",
  "http://127.0.0.1:8795",
]);
const lastRequestByAdmin = new Map<string, number>();
const maxBodyBytes = 4096;
const requestIntervalMs = 2100;
let lastProviderRequestAt = 0;
let providerTurn: Promise<void> = Promise.resolve();
const anilistUrl = "https://graphql.anilist.co";
const characterIdentityFields = `id name { full native } image { large } favourites gender`;
const characterFields = `
  ${characterIdentityFields}
  media(type:ANIME,sort:POPULARITY_DESC,perPage:25) {
    nodes { id type isAdult title { english romaji } genres tags { name } }
  }
`;
const searchQuery = `query KizunaAdminSearch($page:Int!,$search:String) {
  Page(page:$page,perPage:24) {
    pageInfo { hasNextPage }
    characters(search:$search,sort:FAVOURITES_DESC) { ${characterFields} }
  }
}`;
const importQuery = `query KizunaAdminCharacter($id:Int!) {
  Character(id:$id) { ${characterFields} }
}`;
const animeFields = `
  id type isAdult title { english romaji native } coverImage { large }
  format episodes season seasonYear status genres tags { name }
`;
const animeSearchQuery = `query KizunaAdminAnimeSearch($page:Int!,$search:String) {
  Page(page:$page,perPage:24) {
    pageInfo { hasNextPage }
    media(search:$search,type:ANIME,isAdult:false,sort:[POPULARITY_DESC,ID]) { ${animeFields} }
  }
}`;
// AniList does not offer a character-id filter on this connection. Imports
// re-read the exact page/sort shown by the UI to verify membership server-side.
const animeCharactersQuery = `query KizunaAdminAnimeCharacters($id:Int!,$page:Int!) {
  Media(id:$id,type:ANIME,isAdult:false) {
    ${animeFields}
    characters(page:$page,perPage:24,sort:[ROLE,FAVOURITES_DESC,ID]) {
      pageInfo { hasNextPage }
      nodes { ${characterIdentityFields} }
    }
  }
}`;
const albumAnimeQuery = `query KizunaAdminAlbumAnime($id:Int!) {
  Media(id:$id,type:ANIME,isAdult:false) {
    ${animeFields}
    characters(page:1,perPage:30,sort:[FAVOURITES_DESC,ID]) {
      nodes { ${characterIdentityFields} }
    }
  }
}`;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type CompactCard = {
  sourceId: string;
  name: string;
  native: string;
  series: string;
  image: string;
  fav: number;
  g: string;
  cats: string[];
};

class RequestError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public retryAfter?: number,
  ) {
    super(message);
    this.name = "RequestError";
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
    "Access-Control-Expose-Headers": "Retry-After",
  });
  if (origin && allowedOrigins.has(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
  }
  return headers;
}

function reply(body: unknown, status: number, headers: Headers): Response {
  return new Response(JSON.stringify(body), { status, headers });
}

function cleanString(value: unknown, max: number): string {
  return typeof value === "string"
    ? value.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, max)
    : "";
}

function integer(value: unknown, min: number, max: number, fallback = min): number {
  const number = Number(value);
  return Number.isFinite(number)
    ? Math.min(max, Math.max(min, Math.floor(number)))
    : fallback;
}

function sourceId(value: unknown): string | null {
  const text = typeof value === "string" || typeof value === "number"
    ? String(value)
    : "";
  // AniList GraphQL IDs are Ints, so the ten-digit input must also fit Int32.
  if (!/^\d{1,10}$/.test(text)) return null;
  const number = Number(text);
  return Number.isInteger(number) && number > 0 && number <= 2147483647
    ? String(number)
    : null;
}

function anilistImage(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 1500) return null;
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    if (
      url.protocol !== "https:" || url.username || url.password || url.port ||
      !(hostname === "anilist.co" || hostname.endsWith(".anilist.co"))
    ) return null;
    return url.href;
  } catch {
    return null;
  }
}

function compactAnime(value: any) {
  if (!value || typeof value !== "object" || value.type !== "ANIME" || value.isAdult !== false) return null;
  const id = sourceId(value.id), title = cleanString(value.title?.english || value.title?.romaji || value.title?.native,180);
  if (!id || !title) return null;
  return {
    id,title,titleRomaji:cleanString(value.title?.romaji,180),titleNative:cleanString(value.title?.native,180),
    coverImage:anilistImage(value.coverImage?.large) || "",format:cleanString(value.format,30),
    episodes:typeof value.episodes === "number" && Number.isInteger(value.episodes) && value.episodes >= 0 ? Math.min(value.episodes,1000000) : null,
    season:cleanString(value.season,30),seasonYear:typeof value.seasonYear === "number" && Number.isInteger(value.seasonYear) && value.seasonYear > 0 ? Math.min(value.seasonYear,9999) : null,
    status:cleanString(value.status,30),
  };
}

function compactCharacter(value: any, selectedAnime?: any): CompactCard | null {
  if (!value || typeof value !== "object") return null;
  const id = sourceId(value.id);
  const name = cleanString(value.name?.full, 160);
  const image = anilistImage(value.image?.large);
  const nodes = Array.isArray(value.media?.nodes) ? value.media.nodes : [];
  const anime = selectedAnime || nodes.find((node: any) =>
    node && node.type === "ANIME" && node.isAdult === false
  );
  if (!id || !name || !image || !anime || anime.type !== "ANIME" || anime.isAdult !== false) return null;
  const series = cleanString(anime.title?.english || anime.title?.romaji || anime.title?.native, 180);
  if (!series) return null;
  const tags = (Array.isArray(anime.tags) ? anime.tags : [])
    .map((tag: any) => cleanString(tag?.name, 64).toLowerCase());
  const genres = (Array.isArray(anime.genres) ? anime.genres : [])
    .map((genre: unknown) => cleanString(genre, 64).toLowerCase());
  const cats = [];
  if (tags.includes("shounen")) cats.push("shonen");
  if (tags.includes("seinen")) cats.push("seinen");
  if (tags.includes("shoujo") || genres.includes("mahou shoujo")) cats.push("shojo");
  if (tags.includes("isekai")) cats.push("isekai");
  if (genres.includes("sports")) cats.push("sport");
  if (genres.includes("mecha")) cats.push("mecha");
  if (genres.includes("fantasy")) cats.push("fantasy");
  const gender = cleanString(value.gender, 32).toLowerCase();
  return {
    sourceId: id,
    name,
    native: cleanString(value.name?.native, 160),
    series,
    image,
    fav: favouriteCount(value.favourites),
    g: gender === "female" ? "F" : gender === "male" ? "M" : "",
    cats,
  };
}

function canonicalCard(entry: CompactCard) {
  const id = "c" + entry.sourceId;
  const rarity = rarityFromPopularity(entry.fav,entry.sourceId);
  const tiers: Record<string, number[]> = {
    "Commun": [48, 8, 14],
    "Peu commune": [58, 8, 16],
    "Rare": [72, 9, 26],
    "Épique": [84, 10, 30],
    "Légendaire": [90, 7, 30],
    "Mythique": [96, 4, 25],
  };
  let fingerprint = 7;
  for (const char of id) {
    fingerprint = (fingerprint * 31 + char.charCodeAt(0)) >>> 0;
  }
  const tier = tiers[rarity];
  const pow = tier[0] + fingerprint % tier[1];
  return {
    ...entry,
    id,
    rank: 1000000 + Number(entry.sourceId),
    rarity,
    tag: "",
    pow,
    aura: pow - tier[2] + (fingerprint >> 3) % 3,
  };
}

async function readBody(request: Request): Promise<Record<string, unknown>> {
  const contentType = request.headers.get("content-type") || "";
  if (!/^application\/json(?:\s*;|$)/i.test(contentType)) {
    throw new RequestError(415, "JSON_REQUIRED", "Une requête JSON est requise.");
  }
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > maxBodyBytes) {
    throw new RequestError(413, "BODY_TOO_LARGE", "La requête est trop volumineuse.");
  }
  const reader = request.body?.getReader();
  if (!reader) throw new RequestError(400, "INVALID_BODY", "La requête est invalide.");
  const decoder = new TextDecoder();
  let total = 0;
  let text = "";
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      total += chunk.value.byteLength;
      if (total > maxBodyBytes) {
        await reader.cancel();
        throw new RequestError(413, "BODY_TOO_LARGE", "La requête est trop volumineuse.");
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
  } finally {
    reader.releaseLock();
  }
  try {
    const value = JSON.parse(text);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    return value;
  } catch {
    throw new RequestError(400, "INVALID_BODY", "La requête est invalide.");
  }
}

function checkRateLimit(userId: string): void {
  const now = Date.now();
  const previous = lastRequestByAdmin.get(userId) || 0;
  const remaining = requestIntervalMs - (now - previous);
  if (remaining > 0) {
    throw new RequestError(429, "RATE_LIMITED", "Patiente avant une nouvelle requête.", Math.ceil(remaining / 1000));
  }
  if (lastRequestByAdmin.size > 1000) {
    for (const [id, at] of lastRequestByAdmin) {
      if (now - at > 60000) lastRequestByAdmin.delete(id);
    }
  }
  lastRequestByAdmin.set(userId, now);
}

function retrySeconds(value: string | null): number {
  if (value && /^\d+$/.test(value)) return integer(value, 1, 3600, 60);
  const at = value ? Date.parse(value) : NaN;
  return Number.isFinite(at) ? integer(Math.ceil((at - Date.now()) / 1000), 1, 3600, 60) : 60;
}

async function queryAniList(query: string, variables: Record<string, unknown>) {
  const slot=providerTurn.then(async()=>{
    const delay=requestIntervalMs-(Date.now()-lastProviderRequestAt);
    if(delay>0)await new Promise<void>(resolve=>setTimeout(resolve,delay));
    lastProviderRequestAt=Date.now();
  });
  providerTurn=slot.catch(()=>{});
  await slot;
  let response;
  try {
    response = await fetch(anilistUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new RequestError(504, "ANILIST_TIMEOUT", "AniList ne répond pas pour le moment.");
  }
  if (response.status === 429) {
    throw new RequestError(429, "ANILIST_RATE_LIMITED", "AniList demande de patienter avant de réessayer.", retrySeconds(response.headers.get("Retry-After")));
  }
  if (!response.ok) {
    throw new RequestError(502, "ANILIST_UNAVAILABLE", "AniList est indisponible pour le moment.");
  }
  let result;
  try {
    result = await response.json();
  } catch {
    throw new RequestError(502, "ANILIST_INVALID_RESPONSE", "La réponse d’AniList est indisponible.");
  }
  if (result?.errors?.some((error: any) => Number(error?.status) === 429)) {
    throw new RequestError(429, "ANILIST_RATE_LIMITED", "AniList demande de patienter avant de réessayer.", retrySeconds(response.headers.get("Retry-After")));
  }
  if (!result?.data || (Array.isArray(result.errors) && result.errors.length)) {
    throw new RequestError(502, "ANILIST_UNAVAILABLE", "AniList est indisponible pour le moment.");
  }
  return result.data;
}

function pageNumber(value: unknown): number {
  if (value != null && typeof value !== "number" && (typeof value !== "string" || !/^\d{1,5}$/.test(value))) {
    throw new RequestError(400,"INVALID_PAGE","Le numéro de page est invalide.");
  }
  const page = value == null ? 1 : Number(value);
  if (!Number.isInteger(page) || page < 1 || page > 10000) {
    throw new RequestError(400,"INVALID_PAGE","Le numéro de page est invalide.");
  }
  return page;
}
function searchTerm(value: unknown): string {
  if (value != null && typeof value !== "string") throw new RequestError(400,"INVALID_SEARCH","La recherche est invalide.");
  const search = typeof value === "string" ? value.trim() : "";
  if (search && (search.length < 2 || search.length > 100 || /[\u0000-\u001f\u007f]/.test(search))) {
    throw new RequestError(400,"INVALID_SEARCH","La recherche doit contenir de 2 à 100 caractères.");
  }
  return search;
}
function selectedAnimeResult(result: any, animeId: string) {
  const media = result?.Media, anime = compactAnime(media);
  if (!anime || anime.id !== animeId) throw new RequestError(422,"ANIME_NOT_SUPPORTED","Cet anime n’est pas disponible dans le catalogue AniList.");
  if (!Array.isArray(media.characters?.nodes)) throw new RequestError(502,"ANILIST_INVALID_RESPONSE","Les personnages de cet anime sont indisponibles.");
  return {media,anime,nodes:media.characters.nodes};
}
function albumIdentifier(value: unknown): string {
  if (typeof value !== "string" || !uuidPattern.test(value)) throw new RequestError(400,"INVALID_ALBUM_ID","L’identifiant de l’album est invalide.");
  return value.toLowerCase();
}
async function albumRequest(service: ReturnType<typeof createClient>, actor: string, action: string, payload: Record<string, unknown>) {
  const result = await service.rpc("kizuna_album_dispatch",{p_actor:actor,p_action:action,p_payload:payload});
  if (result.error) {
    const known: Record<string,[number,string]> = {
      AUTH_REQUIRED:[401,"Ta session a expiré. Reconnecte-toi."],
      ADMIN_REQUIRED:[403,"La gestion des albums est réservée aux administrateurs."],
      ALBUM_NOT_FOUND:[404,"Cet album est introuvable."],
      CARD_NOT_FOUND:[400,"Cette carte du catalogue est introuvable."],
      INVALID_CARD:[400,"Cette carte du catalogue est introuvable."],
      ALBUM_NAME_TAKEN:[409,"Ce nom d’album est déjà utilisé."],
      ALBUM_LIMIT:[409,"Le nombre maximum d’albums est atteint."],
      ALBUM_CARD_LIMIT:[409,"Cet album a atteint sa limite de cartes."],
      ALBUM_MINIMUM_CHARACTERS:[409,"Un album doit conserver au moins deux personnages différents pour proposer deux Mythiques."],
      INVALID_INPUT:[400,"Les paramètres de l’album sont invalides."],
    };
    const match=known[result.error.message];
    if (match) throw new RequestError(match[0],result.error.message,match[1]);
    throw new RequestError(503,"ALBUM_UNAVAILABLE","La gestion des albums est temporairement indisponible.");
  }
  if (!result.data || typeof result.data !== "object") throw new RequestError(503,"ALBUM_UNAVAILABLE","La gestion des albums est temporairement indisponible.");
  return result.data;
}
async function importReply(service: ReturnType<typeof createClient>, actor: string, card: any, albumId: string | null, headers: Headers): Promise<Response> {
  if (albumId) {
    const result=await albumRequest(service,actor,"add_album_card",{albumId,cardId:card.id});
    const refreshed=await service.from("kizuna_cards").select("card").eq("id",card.id).single();
    if(refreshed.error||!refreshed.data?.card)throw new RequestError(503,"CATALOGUE_UNAVAILABLE","La carte ajoutée ne peut pas être relue.");
    return reply({card:refreshed.data.card,album:result.album},200,headers);
  }
  return reply({card},200,headers);
}
function narrativeName(value: string): boolean {
  const name=value.normalize("NFKD").replace(/[\u0300-\u036f]/g,"").trim().toLowerCase();
  return /^(narrator|narrateur|narratrice|narration|ナレーター|語り手)$/.test(name);
}
function popularEntries(result: any, animeId: string) {
  const {media,anime,nodes}=selectedAnimeResult(result,animeId);
  const entries: CompactCard[]=[];const seen=new Set<string>();
  for(const node of nodes){
    const entry=compactCharacter(node,media);
    if(!entry||narrativeName(entry.name)||seen.has(entry.sourceId))continue;
    seen.add(entry.sourceId);entries.push(entry);if(entries.length===5)break;
  }
  if(entries.length<2)throw new RequestError(409,"ALBUM_MINIMUM_CHARACTERS","AniList ne propose pas encore deux personnages nommés et illustrés pour cet anime. Cet album ne peut pas être créé.");
  return {media,anime,entries};
}
async function canonicalEntries(service: ReturnType<typeof createClient>, entries: CompactCard[], requiredSeries?: string): Promise<Map<string,any>> {
  const unique=[...new Map(entries.map(entry=>[entry.sourceId,entry])).values()];
  const ids=unique.map(entry=>Number(entry.sourceId));
  async function read(){
    const result=await service.from("kizuna_cards").select("id, source_id, card").in("source_id",ids).order("id",{ascending:true});
    if(result.error||!Array.isArray(result.data))throw new RequestError(503,"CATALOGUE_UNAVAILABLE","Le catalogue est indisponible pour le moment.");
    const bySource=new Map<string,any>();
    for(const row of result.data){
      const id=sourceId(row.source_id);
      if(!id||!row.card||row.card.id!==row.id)throw new RequestError(503,"CATALOGUE_UNAVAILABLE","Une carte du catalogue est indisponible.");
      if(!bySource.has(id))bySource.set(id,row.card);
    }
    return bySource;
  }
  for(let attempt=0;attempt<3;attempt++){
    const known=await read(),missing=unique.filter(entry=>!known.has(entry.sourceId));
    if(requiredSeries){
      const current=await seriesSize(service,requiredSeries),key=requiredSeries.trim().toLowerCase();
      const added=missing.filter(entry=>entry.series.trim().toLowerCase()===key).length;
      // Canonical editions keep their existing series. Recheck on every retry:
      // if another import won the shared IDs in a different franchise, reject
      // before inserting the remaining singleton rather than changing old cards.
      if(current+added<2)throw new RequestError(409,"ALBUM_MINIMUM_CHARACTERS","Les personnages déjà présents gardent leur univers d’origine. Crée un album par anime pour les regrouper avant d’ajouter un personnage isolé.");
    }
    if(!missing.length)return known;
    const result=await service.from("kizuna_cards").insert(missing.map(entry=>({id:"c"+entry.sourceId,source_id:Number(entry.sourceId),card:canonicalCard(entry)}))).select("id");
    if(result.error?.code==="23505")continue;
    if(result.error)throw new RequestError(503,"IMPORT_FAILED","Les personnages de cet album n’ont pas pu être enregistrés.");
    // AFTER STATEMENT triggers assign the global album ranks. Re-read instead
    // of returning INSERT RETURNING values captured before those triggers ran.
    const refreshed=await read();
    if(unique.every(entry=>refreshed.has(entry.sourceId)))return refreshed;
  }
  throw new RequestError(503,"IMPORT_BUSY","Une autre importation est en cours. Réessaie dans un instant.");
}
async function seriesSize(service: ReturnType<typeof createClient>, series: string): Promise<number> {
  const result=await service.rpc("kizuna_catalogue_series_size",{p_series:series});
  if(result.error||typeof result.data!=="number"||!Number.isInteger(result.data)||result.data<0)throw new RequestError(503,"CATALOGUE_UNAVAILABLE","Le catalogue est indisponible pour le moment.");
  return result.data;
}

export async function handler(request: Request): Promise<Response> {
  const origin = request.headers.get("origin");
  const headers = responseHeaders(origin);
  try {
    if (origin && !allowedOrigins.has(origin)) {
      throw new RequestError(403, "ORIGIN_NOT_ALLOWED", "Accès refusé.");
    }
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    if (request.method !== "POST") {
      headers.set("Allow", "POST, OPTIONS");
      throw new RequestError(405, "METHOD_NOT_ALLOWED", "Méthode non autorisée.");
    }
    const authorization = request.headers.get("authorization") || "";
    const bearer = authorization.match(/^Bearer\s+(\S+)$/i)?.[1];
    if (!bearer || bearer.length > 8192) {
      throw new RequestError(401, "AUTH_REQUIRED", "Connecte-toi pour continuer.");
    }
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) {
      throw new RequestError(503, "SERVICE_UNAVAILABLE", "Le service est indisponible pour le moment.");
    }
    const service = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(15000) }) },
    });
    const { data: authData, error: authError } = await service.auth.getUser(bearer);
    if (authError || !authData?.user?.id) {
      throw new RequestError(401, "AUTH_REQUIRED", "La session est invalide ou expirée.");
    }
    const { data: admin, error: adminError } = await service
      .from("kizuna_admins")
      .select("user_id")
      .eq("user_id", authData.user.id)
      .maybeSingle();
    if (adminError) {
      throw new RequestError(503, "SERVICE_UNAVAILABLE", "Le service est indisponible pour le moment.");
    }
    if (!admin?.user_id) {
      throw new RequestError(403, "ADMIN_REQUIRED", "Cette action est réservée aux administrateurs.");
    }
    // No AniList request or catalogue write can occur before this authorization.
    const body = await readBody(request);
    if (body.action === "list_albums") {
      return reply(await albumRequest(service,authData.user.id,"list_albums",{}),200,headers);
    }
    if (body.action === "create_album") {
      const animeId=sourceId(body.animeId);
      if (!animeId) throw new RequestError(400,"INVALID_ANIME_ID","L’identifiant de l’anime est invalide.");
      if (body.name != null && (typeof body.name !== "string" || body.name.trim().length < 2 || body.name.trim().length > 120 || /[\u0000-\u001f\u007f]/.test(body.name))) throw new RequestError(400,"INVALID_ALBUM_NAME","Le nom de l’album doit contenir de 2 à 120 caractères.");
      checkRateLimit(authData.user.id);
      const result=await queryAniList(albumAnimeQuery,{id:Number(animeId)}), {anime,entries}=popularEntries(result,animeId);
      const name=typeof body.name === "string" ? body.name.trim() : anime.title.slice(0,120);
      if (name.length<2) throw new RequestError(400,"INVALID_ALBUM_NAME","Choisis un nom d’album d’au moins 2 caractères.");
      const cards=await canonicalEntries(service,entries);
      const created=await albumRequest(service,authData.user.id,"create_album",{animeId:Number(animeId),name,coverImage:anime.coverImage,cardIds:entries.map(entry=>cards.get(entry.sourceId).id)});
      const refreshed=await canonicalEntries(service,entries);
      return reply({...created,addedCards:[...refreshed.values()]},200,headers);
    }
    if (body.action === "add_album_card" || body.action === "remove_album_card") {
      const albumId=albumIdentifier(body.albumId), cardId=body.cardId;
      if (typeof cardId !== "string" || cardId.length < 1 || cardId.length > 120 || /[\u0000-\u001f\u007f]/.test(cardId)) throw new RequestError(400,"INVALID_CARD","L’identifiant de la carte est invalide.");
      return reply(await albumRequest(service,authData.user.id,body.action,{albumId,cardId}),200,headers);
    }
    if (body.action === "search") {
      const page = pageNumber(body.page), search = searchTerm(body.search);
      checkRateLimit(authData.user.id);
      const result = await queryAniList(searchQuery, { page, search: search || null });
      const characters = result.Page?.characters;
      if (!Array.isArray(characters)) {
        throw new RequestError(502, "ANILIST_INVALID_RESPONSE", "La réponse d’AniList est indisponible.");
      }
      const entries = characters.slice(0, 24).map((character: any) => compactCharacter(character)).filter(Boolean);
      return reply({ entries, page, hasNext: page < 10000 && result.Page?.pageInfo?.hasNextPage === true }, 200, headers);
    }
    if (body.action === "search_anime") {
      const page = pageNumber(body.page), search = searchTerm(body.search);
      checkRateLimit(authData.user.id);
      const result = await queryAniList(animeSearchQuery,{page,search:search || null});
      if (!Array.isArray(result.Page?.media)) throw new RequestError(502,"ANILIST_INVALID_RESPONSE","La réponse d’AniList est indisponible.");
      const anime = result.Page.media.slice(0,24).map(compactAnime).filter(Boolean);
      return reply({anime,page,hasNext:page < 10000 && result.Page.pageInfo?.hasNextPage === true},200,headers);
    }
    if (body.action === "anime_characters") {
      const animeId = sourceId(body.animeId), page = pageNumber(body.page);
      if (!animeId) throw new RequestError(400,"INVALID_ANIME_ID","L’identifiant de l’anime est invalide.");
      checkRateLimit(authData.user.id);
      const result = await queryAniList(animeCharactersQuery,{id:Number(animeId),page});
      const {media,anime,nodes} = selectedAnimeResult(result,animeId);
      const entries = nodes.slice(0,24).map((character: any) => compactCharacter(character,media)).filter(Boolean);
      return reply({anime,entries,page,hasNext:page < 10000 && media.characters.pageInfo?.hasNextPage === true},200,headers);
    }
    if (body.action === "import") {
      const id = sourceId(body.sourceId);
      if (!id) {
        throw new RequestError(400, "INVALID_SOURCE_ID", "L’identifiant AniList est invalide.");
      }
      const animeId = body.animeId == null ? null : sourceId(body.animeId);
      if ((body.animeId != null && !animeId) || (body.animePage != null && !animeId)) throw new RequestError(400,"INVALID_ANIME_ID","L’identifiant de l’anime est invalide.");
      const animePage = animeId ? pageNumber(body.animePage) : 1;
      const albumId = body.albumId == null ? null : albumIdentifier(body.albumId);
      checkRateLimit(authData.user.id);
      let entry: CompactCard | null = null;
      let contextMedia: any=null,rawCharacter: any=null;
      if (animeId) {
        const result = await queryAniList(animeCharactersQuery,{id:Number(animeId),page:animePage});
        const {media,nodes} = selectedAnimeResult(result,animeId);
        const character = nodes.slice(0,24).find((node: any) => sourceId(node?.id) === id);
        if (!character) throw new RequestError(422,"CHARACTER_NOT_IN_ANIME","Ce personnage ne figure pas sur cette page de l’anime. Recharge la liste avant de l’ajouter.");
        entry = compactCharacter(character,media);
        contextMedia=media;rawCharacter=character;
        if (!entry) throw new RequestError(422,"CHARACTER_NOT_SUPPORTED","Ce personnage ne peut pas être ajouté au catalogue.");
      }
      const { data: existing, error: lookupError } = await service
        .from("kizuna_cards")
        .select("id, card")
        .eq("source_id", Number(id))
        .order("id", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (lookupError) {
        throw new RequestError(503, "CATALOGUE_UNAVAILABLE", "Le catalogue est indisponible pour le moment.");
      }
      if (existing) {
        if (existing.card && typeof existing.card === "object" && !Array.isArray(existing.card) && existing.card.id === existing.id) {
          return await importReply(service,authData.user.id,existing.card,albumId,headers);
        }
        // An inconsistent retained record must never create a second alias.
        throw new RequestError(503, "CATALOGUE_UNAVAILABLE", "Cette carte du catalogue est indisponible pour le moment.");
      }
      if (!entry) {
        const result = await queryAniList(importQuery, { id: Number(id) });
        entry = compactCharacter(result.Character);
        rawCharacter=result.Character;
        contextMedia=Array.isArray(rawCharacter?.media?.nodes)?rawCharacter.media.nodes.find((node:any)=>node?.type==="ANIME"&&node.isAdult===false):null;
      }
      if (!entry || entry.sourceId !== id || narrativeName(entry.name)) {
        throw new RequestError(422, "CHARACTER_NOT_SUPPORTED", "Ce personnage ne peut pas être ajouté au catalogue.");
      }
      if(await seriesSize(service,entry.series)<2){
        const companionAnimeId=sourceId(contextMedia?.id);
        if(!companionAnimeId)throw new RequestError(409,"ALBUM_MINIMUM_CHARACTERS","Cet univers doit contenir au moins deux personnages avant son ajout.");
        const result=await queryAniList(albumAnimeQuery,{id:Number(companionAnimeId)}), popular=popularEntries(result,companionAnimeId);
        const target=compactCharacter(rawCharacter,popular.media);
        if(!target)throw new RequestError(422,"CHARACTER_NOT_SUPPORTED","Ce personnage ne peut pas être ajouté au catalogue.");
        const cards=await canonicalEntries(service,[...popular.entries,target],target.series);
        const response=await importReply(service,authData.user.id,cards.get(id),albumId,headers);
        const value=await response.json();
        const refreshed=albumId?await canonicalEntries(service,[...popular.entries,target]):cards;
        return reply({...value,addedCards:[...refreshed.values()]},response.status,headers);
      }
      const card = canonicalCard(entry);
      let { data: stored, error: saveError } = await service
        .from("kizuna_cards")
        .insert({ id: card.id, source_id: Number(id), card })
        .select("card")
        .single();
      // Concurrent imports never overwrite the first canonical edition/context.
      if (saveError?.code === "23505") {
        const winner = await service.from("kizuna_cards").select("card").eq("id",card.id).eq("source_id",Number(id)).single();
        stored=winner.data;saveError=winner.error;
      }
      if (saveError || !stored?.card) {
        throw new RequestError(503, "IMPORT_FAILED", "La carte n’a pas pu être enregistrée.");
      }
      if (stored.card.id!==card.id) throw new RequestError(503,"IMPORT_FAILED","La carte n’a pas pu être confirmée.");
      const refreshed=await service.from("kizuna_cards").select("card").eq("id",stored.card.id).single();
      if(refreshed.error||!refreshed.data?.card)throw new RequestError(503,"CATALOGUE_UNAVAILABLE","La carte importée ne peut pas être relue.");
      return await importReply(service,authData.user.id,refreshed.data.card,albumId,headers);
    }
    throw new RequestError(400, "INVALID_ACTION", "L’action demandée est invalide.");
  } catch (error) {
    if (error instanceof RequestError) {
      if (error.retryAfter) headers.set("Retry-After", String(error.retryAfter));
      return reply({ error: error.message, code: error.code, ...(error.retryAfter ? { retryAfter: error.retryAfter } : {}) }, error.status, headers);
    }
    // Never return provider errors, service credentials, JWTs or stack traces.
    return reply({ error: "Le service est indisponible pour le moment.", code: "SERVICE_UNAVAILABLE" }, 503, headers);
  }
}

Deno.serve(handler);
