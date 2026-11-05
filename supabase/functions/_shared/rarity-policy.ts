// One policy is bundled into the browser and imported by the Edge catalogue.
// Favourite thresholds classify ordinary cards. The top three rarity bands are
// selected by album ranking; neither policy changes drop weights or guarantees.
export const FAVOURITE_THRESHOLDS = Object.freeze({
  Rare: 2500,
  "Peu commune": 1000,
  Commun: 0,
} as const);
export type CardRarity = "Mythique" | "Légendaire" | "Épique" | keyof typeof FAVOURITE_THRESHOLDS;
export type RaritySourceIds = ReadonlySet<string> | readonly string[];
export type MythicSources = RaritySourceIds;
export type AlbumRarityContext = {
  mythicSources?: RaritySourceIds;
  legendarySources?: RaritySourceIds;
  epicSources?: RaritySourceIds;
};

export type AlbumRankCard = {
  id: string;
  sourceId?: unknown;
  source_id?: unknown;
  series?: unknown;
  fav?: unknown;
  favourites?: unknown;
};
export type AlbumRankDefinition = {
  id: string;
  name: string;
  card_ids: readonly string[];
};
export type AlbumMythicRanking = {
  id: string;
  name: string;
  managed: boolean;
  cardIds: string[];
  sourceIds: string[];
  mythicSources: string[];
  legendarySources: string[];
  epicSources: string[];
  distinctCharacters: number;
  needsMoreCards: boolean;
};
export type AlbumMythicRanks = {
  mythicSources: Set<string>;
  legendarySources: Set<string>;
  epicSources: Set<string>;
  albums: AlbumMythicRanking[];
  insufficientAlbums: AlbumMythicRanking[];
};

export function favouriteCount(value: unknown): number {
  if (typeof value !== "number" && typeof value !== "string") return 0;
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0,Math.min(1000000000,Math.floor(number))) : 0;
}

function sourceKey(value: unknown): string {
  if (typeof value !== "number" && typeof value !== "string") return "";
  const raw=String(value);
  if (!/^\d{1,10}$/.test(raw)) return "";
  const number=Number(raw);
  return Number.isSafeInteger(number)&&number>0?String(number):"";
}

function containsSource(values: RaritySourceIds | undefined, source: string): boolean {
  if(!source||!values)return false;
  return Array.isArray(values)?values.includes(source):typeof (values as ReadonlySet<string>).has==="function"&&(values as ReadonlySet<string>).has(source);
}

export function rarityFromPopularity(favourites: unknown, sourceId?: unknown, context?: MythicSources | AlbumRarityContext): CardRarity {
  // Explicit site-owner exception: Madara Uchiha's AniList character is mythic
  // even though its current favourites would normally place it in the rare tier.
  const source=sourceKey(sourceId);
  if (source==="53901") return "Mythique";
  // Keep legacy set/array callers working as a Mythique-only context. New
  // callers pass the complete ranked object, with higher rarity taking priority.
  const bands:AlbumRarityContext|undefined=context&&(Array.isArray(context)||typeof (context as ReadonlySet<string>).has==="function")
    ? {mythicSources:context as MythicSources}
    : context as AlbumRarityContext|undefined;
  if(containsSource(bands?.mythicSources,source))return "Mythique";
  if(containsSource(bands?.legendarySources,source))return "Légendaire";
  if(containsSource(bands?.epicSources,source))return "Épique";
  const count = favouriteCount(favourites);
  if (count >= FAVOURITE_THRESHOLDS.Rare) return "Rare";
  if (count >= FAVOURITE_THRESHOLDS["Peu commune"]) return "Peu commune";
  return "Commun";
}

/**
 * Rank real, distinct AniList characters in each album. Managed albums replace
 * implicit series albums with the same trimmed, case-insensitive name. The
 * result does not add cards or change any input collection or album membership.
 */
export function rankAlbumMythics(
  inputCards: readonly AlbumRankCard[],
  inputAlbums: readonly AlbumRankDefinition[] = [],
): AlbumMythicRanks {
  type RankedCard={id:string;sourceId:string;series:string;fav:number};
  type Group={id:string;name:string;managed:boolean;ids:Set<string>};
  const byId=new Map<string,RankedCard>();
  for(const input of inputCards){
    if(!input||typeof input.id!=="string"||!input.id.trim())continue;
    const sourceId=sourceKey(input.sourceId??input.source_id);
    if(!sourceId)continue;
    const card={id:input.id.trim(),sourceId,series:typeof input.series==="string"?input.series.trim():"",fav:favouriteCount(input.fav??input.favourites)};
    const previous=byId.get(card.id);
    // Canonical IDs are unique in the database. This deterministic tie-breaker
    // also keeps malformed duplicate input rows independent of array order.
    if(!previous||card.fav>previous.fav||(card.fav===previous.fav&&(Number(card.sourceId)<Number(previous.sourceId)||(card.sourceId===previous.sourceId&&card.series<previous.series))))byId.set(card.id,card);
  }
  const groups=new Map<string,Group>();
  const definitions=inputAlbums.filter(album=>album&&typeof album.id==="string"&&typeof album.name==="string"&&album.name.trim()&&Array.isArray(album.card_ids)).slice().sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
  for(const album of definitions){
    const name=album.name.trim(),key=name.toLowerCase();
    if(groups.has(key))continue;
    groups.set(key,{id:album.id,name,managed:true,ids:new Set(album.card_ids.filter(id=>typeof id==="string"&&byId.has(id)))});
  }
  for(const card of byId.values()){
    if(!card.series)continue;
    const key=card.series.toLowerCase(),existing=groups.get(key);
    if(existing?.managed)continue;
    if(existing){existing.ids.add(card.id);if(card.series<existing.name)existing.name=card.series;}
    else groups.set(key,{id:"series:"+key,name:card.series,managed:false,ids:new Set([card.id])});
  }
  const mythicSources=new Set<string>(),legendarySources=new Set<string>(),epicSources=new Set<string>();
  if([...byId.values()].some(card=>card.sourceId==="53901"))mythicSources.add("53901");
  const albums:AlbumMythicRanking[]=[];
  for(const [key,group]of [...groups].sort(([left],[right])=>left<right?-1:left>right?1:0)){
    void key;
    const sourceCounts=new Map<string,number>();
    for(const id of group.ids){const card=byId.get(id)!;sourceCounts.set(card.sourceId,Math.max(sourceCounts.get(card.sourceId)??0,card.fav));}
    const sourceIds=[...sourceCounts.keys()].sort((left,right)=>sourceCounts.get(right)!-sourceCounts.get(left)!||Number(left)-Number(right));
    const mythics=sourceIds.slice(0,5),legendaries=sourceIds.slice(5,10),epics=sourceIds.slice(10,15);
    mythics.forEach(source=>mythicSources.add(source));legendaries.forEach(source=>legendarySources.add(source));epics.forEach(source=>epicSources.add(source));
    albums.push({id:group.id,name:group.name,managed:group.managed,cardIds:[...group.ids].sort(),sourceIds,mythicSources:mythics,legendarySources:legendaries,epicSources:epics,distinctCharacters:sourceIds.length,needsMoreCards:sourceIds.length<2});
  }
  // One source has one canonical rarity even if it appears in several albums.
  for(const source of mythicSources){legendarySources.delete(source);epicSources.delete(source);}
  for(const source of legendarySources)epicSources.delete(source);
  return {mythicSources,legendarySources,epicSources,albums,insufficientAlbums:albums.filter(album=>album.needsMoreCards)};
}
