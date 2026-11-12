import { defineAction, z, type ActionsModule, type Ctx } from "@hatch/space-sdk";
import { and, desc, eq, inArray } from "drizzle-orm";
import * as schema from "./schema";

// ---------- shared shapes ----------

const podcastShape = z.object({
  podcastKey: z.string(),
  appleId: z.string().nullable(),
  title: z.string(),
  author: z.string(),
  artworkUrl: z.string().nullable(),
  feedUrl: z.string().nullable(),
  genre: z.string().nullable(),
  description: z.string().nullable(),
  source: z.enum(["itunes", "rss", "lizhi"]),
  country: z.string(),
  trackCount: z.number().nullable(),
});
type PodcastOut = z.infer<typeof podcastShape>;

const episodeShape = z.object({
  episodeKey: z.string(),
  title: z.string(),
  audioUrl: z.string(),
  artworkUrl: z.string().nullable(),
  publishedAt: z.string().nullable(),
  durationSec: z.number().nullable(),
  description: z.string().nullable(),
  /** Source-side paid marker (e.g. Lizhi voicePrice). Display only — never gates playback. */
  paid: z.boolean(),
});
type EpisodeOut = z.infer<typeof episodeShape>;

const episodeInput = z.object({
  episodeKey: z.string().min(1),
  podcastKey: z.string().nullable().optional(),
  podcastTitle: z.string().default(""),
  episodeTitle: z.string().min(1),
  audioUrl: z.string().min(1),
  artworkUrl: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  publishedAt: z.string().nullable().optional(),
  durationSec: z.number().nullable().optional(),
});

// ---------- helpers ----------

function stripHtml(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'");
}

function tagContent(block: string, tag: string): string | null {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return m?.[1] != null ? decodeEntities(m[1]).trim() : null;
}

function parseDuration(raw: string | null): number | null {
  if (!raw) return null;
  const t = raw.trim();
  if (/^\d+$/.test(t)) return parseInt(t, 10);
  const parts = t.split(":").map((p) => parseInt(p, 10));
  if (parts.some((n) => Number.isNaN(n))) return null;
  if (parts.length === 3) return (parts[0] ?? 0) * 3600 + (parts[1] ?? 0) * 60 + (parts[2] ?? 0);
  if (parts.length === 2) return (parts[0] ?? 0) * 60 + (parts[1] ?? 0);
  return null;
}

interface RssParsed {
  title: string;
  author: string;
  description: string | null;
  imageUrl: string | null;
  episodes: EpisodeOut[];
}

function parseRss(xml: string, feedUrl: string): RssParsed {
  const channelMatch = xml.match(/<channel>([\s\S]*?)<item>/i) ?? xml.match(/<channel>([\s\S]*?)<\/channel>/i);
  const channel = channelMatch?.[1] ?? xml;
  const title = tagContent(channel, "title") ?? "未命名播客";
  const author =
    tagContent(channel, "itunes:author") ?? tagContent(channel, "managingEditor") ?? "";
  const description =
    tagContent(channel, "description") ?? tagContent(channel, "itunes:summary");
  let imageUrl: string | null = null;
  const itunesImg = channel.match(/<itunes:image[^>]*href="([^"]+)"/i);
  if (itunesImg?.[1]) imageUrl = itunesImg[1];
  if (!imageUrl) {
    const imgBlock = channel.match(/<image>([\s\S]*?)<\/image>/i);
    if (imgBlock?.[1]) imageUrl = tagContent(imgBlock[1], "url");
  }

  const episodes: EpisodeOut[] = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/gi;
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(xml)) !== null && episodes.length < 1000) {
    const item = m[1] ?? "";
    const enc = item.match(/<enclosure[^>]*url="([^"]+)"/i);
    const guid = tagContent(item, "guid");
    const audioUrl = enc?.[1] ?? guid;
    if (!audioUrl || !/^https?:\/\//i.test(audioUrl)) continue;
    const epTitle = tagContent(item, "title") ?? "未命名单集";
    const pub = tagContent(item, "pubDate");
    let publishedAt: string | null = null;
    if (pub) {
      const d = new Date(pub);
      if (!Number.isNaN(d.getTime())) publishedAt = d.toISOString();
    }
    const descRaw = tagContent(item, "description") ?? tagContent(item, "itunes:summary");
    const itemImg = item.match(/<itunes:image[^>]*href="([^"]+)"/i);
    episodes.push({
      episodeKey: audioUrl,
      title: stripHtml(epTitle).slice(0, 300),
      audioUrl,
      artworkUrl: itemImg?.[1] ?? null,
      publishedAt,
      durationSec: parseDuration(tagContent(item, "itunes:duration")),
      description: descRaw ? stripHtml(descRaw).slice(0, 1200) : null,
      paid: false,
    });
  }
  void feedUrl;
  return {
    title: stripHtml(title).slice(0, 300),
    author: stripHtml(author).slice(0, 200),
    description: description ? stripHtml(description).slice(0, 1500) : null,
    imageUrl,
    episodes,
  };
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; MusePodcastSpace/1.0)" },
  });
  if (!res.ok) throw new Error(`fetch failed: ${res.status} ${url}`);
  return res.text();
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; MusePodcastSpace/1.0)" },
  });
  if (!res.ok) throw new Error(`fetch failed: ${res.status} ${url}`);
  return res.json();
}

interface ItunesPodcastRaw {
  collectionId?: number;
  collectionName?: string;
  trackName?: string;
  artistName?: string;
  artworkUrl600?: string;
  artworkUrl100?: string;
  feedUrl?: string;
  primaryGenreName?: string;
  genres?: string[];
  trackCount?: number;
  country?: string;
}

function mapItunesPodcast(r: ItunesPodcastRaw, country: string): PodcastOut {
  const id = r.collectionId ?? 0;
  return {
    podcastKey: `itunes:${id}`,
    appleId: String(id),
    title: r.collectionName ?? r.trackName ?? "未命名播客",
    author: r.artistName ?? "",
    artworkUrl: r.artworkUrl600 ?? r.artworkUrl100 ?? null,
    feedUrl: r.feedUrl ?? null,
    genre: r.primaryGenreName ?? r.genres?.[0] ?? null,
    description: null,
    source: "itunes",
    country,
    trackCount: r.trackCount ?? null,
  };
}

interface ItunesEpisodeRaw {
  trackName?: string;
  episodeUrl?: string;
  releaseDate?: string;
  trackTimeMillis?: number;
  description?: string;
  episodeGuid?: string;
  artworkUrl160?: string;
  artworkUrl60?: string;
}

async function lookupEpisodes(
  appleId: string,
  country: string,
): Promise<{ podcast: PodcastOut | null; episodes: EpisodeOut[] }> {
  const url = `https://itunes.apple.com/lookup?id=${encodeURIComponent(appleId)}&media=podcast&entity=podcastEpisode&limit=200&country=${encodeURIComponent(country)}`;
  const data = (await fetchJson(url)) as { results?: unknown[] };
  const results = (data.results ?? []) as Array<ItunesPodcastRaw & ItunesEpisodeRaw>;
  const head = results[0];
  const podcast = head && (head.collectionId != null || head.collectionName)
    ? mapItunesPodcast(head, country)
    : null;
  const episodes: EpisodeOut[] = [];
  for (const r of results.slice(1)) {
    if (!r.episodeUrl) continue;
    episodes.push({
      episodeKey: r.episodeUrl,
      title: r.trackName ?? "未命名单集",
      audioUrl: r.episodeUrl,
      artworkUrl: r.artworkUrl160 ?? r.artworkUrl60 ?? null,
      publishedAt: r.releaseDate ?? null,
      durationSec: r.trackTimeMillis ? Math.round(r.trackTimeMillis / 1000) : null,
      description: r.description ? stripHtml(r.description).slice(0, 1200) : null,
      paid: false,
    });
  }
  return { podcast, episodes };
}

/** Fetch episodes for a favorite podcast: Lizhi vodapi, iTunes lookup, or RSS. */
async function fetchEpisodesFor(p: {
  podcastKey?: string;
  appleId: string | null;
  feedUrl: string | null;
  country: string;
  title?: string | null;
}): Promise<EpisodeOut[]> {
  if (p.podcastKey?.startsWith("lizhi:")) {
    const userId = p.podcastKey.slice("lizhi:".length);
    const { episodes } = await fetchLizhiUser(userId, 3);
    return episodes;
  }
  let base: EpisodeOut[] = [];
  if (p.appleId) {
    try {
      const { episodes } = await lookupEpisodes(p.appleId, p.country);
      if (episodes.length > 0) base = episodes;
    } catch {
      // fall through to RSS
    }
    if (base.length === 0 && p.country !== "US") {
      try {
        const { episodes } = await lookupEpisodes(p.appleId, "US");
        if (episodes.length > 0) base = episodes;
      } catch {
        // fall through to RSS
      }
    }
  }
  if (base.length === 0 && p.feedUrl) {
    const xml = await fetchText(p.feedUrl);
    base = parseRss(xml, p.feedUrl).episodes;
  }
  // Mirrored shows publish first on Lizhi; merge its newest episodes ahead
  // so the daily refresh sees them even while the RSS feed lags behind.
  const mirror = lizhiMirrorFor({ appleId: p.appleId, title: p.title });
  if (mirror) return mergeLizhiMirror(base, mirror, 3);
  return base;
}

// ---------- Lizhi FM collection (ported from the stream handoff recipe) ----------
//
// Source of truth: workspace handoff package `lizhi-recipe/` (@streamapp/lizhi
// 1.0.2) — declarative http recipe over the Lizhi App's vodapi. Hard rules
// carried over from its README (all re-verified live at port time):
//  1. UA is camouflage, not a key: use the crowd UA `okhttp/4.12.0`; which UAs
//     the WAF accepts flips over time, so never hard-depend on one string.
//  2. Audio direct links must not be handed to the browser raw: cold CDN
//     objects answer 403; the fix is candidate-host rotation + one warm-up
//     retry (the first request pulls the object hot), NOT a custom UA.
//  3. CDN hosts are a candidate SET, never a single host: the same file can
//     be 206 on cdn101 at 12.96 MB/s and 997 B/s on cdn102.

const LIZHI_UA = "okhttp/4.12.0";
// vodapi honours pageSize up to at least 100 (verified live 2026-11-13:
// pageSize=100 returns 100 items). 100/page keeps a 1000+ episode catalogue
// at ~11 requests; at 30/page the same show needed 36 requests in 8
// sequential batches (~30s+) and the detail view routinely timed out
// before first paint — the "怡楽播客列表加载不出来" bug.
const LIZHI_PAGE_SIZE = 100;
const LIZHI_MAX_PAGES = 12;

/** Audio CDN candidate hosts, fastest first (recipe package.json serving table). */
const LIZHI_AUDIO_HOSTS = [
  "cdn101.lizhi.fm",
  "cdn102.lizhi.fm",
  "cdn.gzlzfm.com",
  "cdn101.gzlzfm.com",
];
/** Image CDN candidate hosts (same serving table, image entries). */
const LIZHI_IMAGE_HOSTS = ["cdnimg101.lizhi.fm", "cdnimg102.lizhi.fm"];

/** Verified per-episode audio paths for the two lookup-table exceptions in the recipe. */
const LIZHI_URL_LOOKUP: Record<string, string> = {
  "3148742517918644742": "https://cdn101.lizhi.fm/audio/2025/06/09/3148742517918644742_hd.mp3",
  "3139438145274548742": "https://cdn101.lizhi.fm/audio/2025/04/20/3139438145274548742_hd.mp3",
};

interface LizhiItem {
  userInfo?: { name?: string; photo?: string; userId?: string; audioNum?: number | string };
  voiceInfo?: {
    voiceId?: string;
    name?: string;
    imageUrl?: string;
    duration?: number | string;
    createTime?: number | string;
  };
  voicePlayProperty?: { trackUrl?: string };
  voiceDetailProperty?: { text?: string };
  voiceExProperty?: { voicePrice?: number | string };
}

/** mapping.capture: pull the /audio_cover/YYYY/MM/DD/ date out of the cover URL. */
function lizhiCoverDay(imageUrl: string | undefined): string | null {
  if (!imageUrl) return null;
  const m = imageUrl.match(/audio_cover\/([0-9]{4}\/[0-9]{2}\/[0-9]{2})\//);
  return m?.[1] ?? null;
}

/**
 * mapping.firstOf for enclosure_url:
 * trackUrl → CDN template built from the cover date → verified lookup table.
 */
function lizhiEnclosureUrl(item: LizhiItem): string | null {
  const trackUrl = item.voicePlayProperty?.trackUrl;
  if (trackUrl && /^https?:\/\//i.test(trackUrl)) return trackUrl;
  const voiceId = item.voiceInfo?.voiceId;
  if (!voiceId) return null;
  const day = lizhiCoverDay(item.voiceInfo?.imageUrl);
  if (day) return `https://cdn101.lizhi.fm/audio/${day}/${voiceId}_hd.mp3`;
  return LIZHI_URL_LOOKUP[voiceId] ?? null;
}

function lizhiPublishedAt(raw: number | string | undefined): string | null {
  if (raw == null) return null;
  const n = typeof raw === "number" ? raw : Number(raw);
  if (Number.isFinite(n) && n > 0) {
    // vodapi createTime is epoch seconds (verified live).
    const d = new Date(n < 1e12 ? n * 1000 : n);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  const d = new Date(String(raw));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function mapLizhiEpisode(item: LizhiItem): EpisodeOut | null {
  const voiceId = item.voiceInfo?.voiceId;
  const audioUrl = lizhiEnclosureUrl(item);
  if (!voiceId || !audioUrl) return null;
  const durRaw = item.voiceInfo?.duration;
  const dur = typeof durRaw === "number" ? durRaw : Number(durRaw);
  const priceRaw = item.voiceExProperty?.voicePrice;
  const price = typeof priceRaw === "number" ? priceRaw : Number(priceRaw);
  const desc = item.voiceDetailProperty?.text;
  // Episode covers arrive on cdnimg101.gzlzfm.com, whose host occasionally
  // 403s images; the recipe serving table swaps it to cdnimg101.lizhi.fm.
  const rawCover = item.voiceInfo?.imageUrl;
  const artworkUrl = rawCover
    ? rawCover.replace("cdnimg101.gzlzfm.com", "cdnimg101.lizhi.fm")
    : null;
  return {
    episodeKey: `lizhi:${voiceId}`,
    title: (item.voiceInfo?.name ?? "未命名单集").slice(0, 300),
    audioUrl,
    artworkUrl,
    publishedAt: lizhiPublishedAt(item.voiceInfo?.createTime),
    durationSec: Number.isFinite(dur) && dur > 0 ? Math.round(dur) : null,
    description: desc ? stripHtml(desc).slice(0, 1200) : null,
    paid: Number.isFinite(price) && price > 0,
  };
}

/**
 * Fetches a Lizhi user's episodes via vodapi with increment pagination.
 * Stops at the first short/empty page; hard cap = recipe maxPages.
 */
async function fetchLizhiPage(userId: string, page: number): Promise<LizhiItem[]> {
  const url = `https://m.lizhi.fm/vodapi/user/${encodeURIComponent(userId)}?pageNo=${page}&pageSize=${LIZHI_PAGE_SIZE}`;
  // One retry with a per-attempt timeout: a single flaky or hung page used
  // to either stall the whole catalogue load or silently truncate it
  // (the caller treats a failed page as end-of-list).
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": LIZHI_UA },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) throw new Error(`荔枝接口返回 ${res.status}`);
      const data = (await res.json()) as { data?: LizhiItem[] };
      return Array.isArray(data.data) ? data.data : [];
    } catch (err) {
      lastErr = err;
      if (attempt === 0) await sleep(600);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("荔枝接口请求失败");
}

async function fetchLizhiUser(
  userId: string,
  maxPages: number,
): Promise<{ podcast: PodcastOut; episodes: EpisodeOut[] }> {
  const episodes: EpisodeOut[] = [];
  let head: LizhiItem | null = null;
  const pages = Math.max(1, Math.min(maxPages, LIZHI_MAX_PAGES));
  // Pages are fetched in parallel batches of 6 (order preserved) so a full
  // back-catalogue — some shows have 1000+ episodes — loads in a couple of
  // round-trips instead of dozens of sequential ones. Pagination still
  // stops at the first short/empty page, exactly as the recipe prescribes.
  let stop = false;
  for (let base = 1; base <= pages && !stop; base += 6) {
    const batchPages: number[] = [];
    for (let p = base; p < Math.min(base + 6, pages + 1); p++) batchPages.push(p);
    const results = await Promise.all(
      batchPages.map(async (p) => {
        try {
          return await fetchLizhiPage(userId, p);
        } catch (err) {
          if (p === 1) throw err;
          return [] as LizhiItem[];
        }
      }),
    );
    for (const items of results) {
      if (items.length === 0) {
        stop = true;
        break;
      }
      if (!head) head = items[0] ?? null;
      for (const item of items) {
        const ep = mapLizhiEpisode(item);
        if (ep) episodes.push(ep);
      }
      if (items.length < LIZHI_PAGE_SIZE) {
        stop = true;
        break;
      }
    }
  }
  const author = head?.userInfo?.name ?? "";
  const totalRaw = head?.userInfo?.audioNum;
  const total = typeof totalRaw === "number" ? totalRaw : Number(totalRaw);
  const podcast: PodcastOut = {
    podcastKey: `lizhi:${userId}`,
    appleId: null,
    title: author || "荔枝用户",
    author,
    artworkUrl: head?.userInfo?.photo ?? null,
    feedUrl: null,
    genre: "荔枝 FM",
    description: null,
    source: "lizhi",
    country: "CN",
    // audioNum is the only real total vodapi reports (and it is often 0);
    // never pass off one page's episode count as the show's total.
    trackCount: Number.isFinite(total) && total > 0 ? total : null,
  };
  return { podcast, episodes };
}

/** Extracts the numeric Lizhi user id from a raw id or a lizhi.fm/user/<id> URL. */
function parseLizhiUserId(input: string): string | null {
  const t = input.trim();
  const urlMatch = t.match(/lizhi\.fm\/user\/(\d+)/i);
  if (urlMatch?.[1]) return urlMatch[1];
  if (/^\d{3,}$/.test(t)) return t;
  return null;
}

// ---------- Lizhi mirror table (verified platform mirrors) ----------
//
// Some shows publish first (and most completely) on Lizhi FM; their Apple /
// RSS feed is a delayed syndication. Verified live 2026-11-13:
//   怡楽播客 — Apple id 1523249117, RSS https://s2.proxy.wavpub.com/yeelokradio.xml
//   RSS newest: 981.都爱看点儿综艺 (2026-11-05), 882 items total.
//   Lizhi user 2513816802261356588 (https://www.lizhi.fm/user/2513816802261356588)
//   newest: 983.也曾认为自己是天选之子 (2026-11-12), 982 (2026-11-08) —
//   a full week ahead of the RSS feed. For mirrored shows, episode lists are
//   merged: Lizhi episodes win on title match, RSS/iTunes fill the archive.
const LIZHI_MIRRORS: Record<string, { userId: string; title: string; aliases: string[] }> = {
  // aliases cover the simplified-Chinese spelling users actually type.
  "1523249117": { userId: "2513816802261356588", title: "怡楽播客", aliases: ["怡乐播客"] },
};

function lizhiMirrorFor(args: {
  appleId?: string | null;
  title?: string | null;
}): { userId: string; title: string } | null {
  if (args.appleId) {
    const byId = LIZHI_MIRRORS[args.appleId];
    if (byId) return byId;
  }
  if (args.title) {
    const t = args.title.replace(/\s+/g, "");
    for (const m of Object.values(LIZHI_MIRRORS)) {
      if (m.title.replace(/\s+/g, "") === t) return m;
    }
  }
  return null;
}

function normalizeTitleKey(title: string): string {
  return title.replace(/[\s　]+/g, "").toLowerCase();
}

/** Merges two episode lists: primary (fresher source) wins title collisions. */
function mergeEpisodes(primary: EpisodeOut[], secondary: EpisodeOut[]): EpisodeOut[] {
  const seen = new Set<string>();
  const out: EpisodeOut[] = [];
  for (const ep of [...primary, ...secondary]) {
    const key = normalizeTitleKey(ep.title);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(ep);
  }
  out.sort((a, b) => {
    const ta = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
    const tb = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
    return tb - ta;
  });
  return out;
}

/**
 * For a mirrored show, fetches Lizhi episodes and merges them ahead of the
 * Apple/RSS list. Any Lizhi failure falls back to the base list untouched.
 */
async function mergeLizhiMirror(
  base: EpisodeOut[],
  mirror: { userId: string; title: string },
  maxPages: number,
): Promise<EpisodeOut[]> {
  try {
    const { episodes } = await fetchLizhiUser(mirror.userId, maxPages);
    if (episodes.length === 0) return base;
    return mergeEpisodes(episodes, base);
  } catch {
    return base;
  }
}

// ---------- Playback byte ladder (播放字节四级阶梯) ----------
//
// Playback URLs are always resolved at play time, never trusted as stored:
//  1. Local archive — bytes this server already archived (owned blob).
//  2. Netdisk binding — keyed `platform:id`; no netdisk is connected to this
//     artifact, so the tier exists structurally and always falls through.
//  3. Official provider / serving policy — for hosts in the policy table the
//     origin host is swapped across the candidate set (fastest first).
//  4. Origin fallback — the normalized direct URL as stored.
// The action layer cannot stream proxy bytes (actions are JSON RPC), so
// policy-tier URLs are returned as an ordered candidate list plus a
// `warmRetry` flag: the client rotates candidates on error and retries a
// 403'd candidate once — the recipe-proven warm-up for cold CDN objects.

interface ServingPolicy {
  match: string;
  hosts: string[];
}

const SERVING_POLICIES: ServingPolicy[] = [
  { match: ".lizhi.fm", hosts: LIZHI_AUDIO_HOSTS },
  { match: "cdnimg101.gzlzfm.com", hosts: LIZHI_IMAGE_HOSTS },
  { match: "cdnimg101.lizhi.fm", hosts: LIZHI_IMAGE_HOSTS },
  { match: "cdnimg102.lizhi.fm", hosts: LIZHI_IMAGE_HOSTS },
];

function servingPolicyFor(url: string): ServingPolicy | null {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
  for (const p of SERVING_POLICIES) {
    if (host === p.match || host.endsWith(p.match)) return p;
  }
  return null;
}

/** Ordered playback candidates for a URL: policy hosts first (deduped), origin last. */
function playbackCandidates(originUrl: string): string[] {
  const policy = servingPolicyFor(originUrl);
  if (!policy) return [originUrl];
  let parsed: URL;
  try {
    parsed = new URL(originUrl);
  } catch {
    return [originUrl];
  }
  const out: string[] = [];
  const seen = new Set<string>();
  for (const h of policy.hosts) {
    const u = new URL(originUrl);
    u.protocol = "https:";
    u.hostname = h;
    const s = u.toString();
    if (!seen.has(s)) {
      seen.add(s);
      out.push(s);
    }
  }
  if (!seen.has(originUrl)) out.push(originUrl);
  void parsed;
  return out;
}

/** Deterministic blob key for an archived episode (tier 1 + offline staging). */
function archiveBlobKey(episodeKey: string): string {
  let h = 5381;
  for (let i = 0; i < episodeKey.length; i++) h = ((h << 5) + h + episodeKey.charCodeAt(i)) >>> 0;
  return `audio-archive/${h.toString(16)}`;
}

const MAX_ARCHIVE_BYTES = 200 * 1024 * 1024;

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetches full audio bytes through the ladder: archive candidates in order,
 * one warm-up retry per candidate on 403/412 (cold-object behaviour), no
 * custom UA upstream (recipe rule 2). Throws a readable error when every
 * candidate fails.
 */
async function fetchAudioThroughLadder(
  originUrl: string,
): Promise<{ bytes: Uint8Array; contentType: string; viaUrl: string }> {
  const candidates = playbackCandidates(originUrl);
  const failures: string[] = [];
  for (const candidate of candidates) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch(candidate);
        if (res.ok) {
          const buf = new Uint8Array(await res.arrayBuffer());
          if (buf.byteLength === 0) throw new Error("上游返回了空文件");
          if (buf.byteLength > MAX_ARCHIVE_BYTES) {
            throw new Error(`单集太大（${Math.round(buf.byteLength / 1024 / 1024)} MB），超过 200 MB 上限`);
          }
          return {
            bytes: buf,
            contentType: res.headers.get("content-type") ?? "audio/mpeg",
            viaUrl: candidate,
          };
        }
        failures.push(`${new URL(candidate).hostname} ${res.status}`);
        // Cold objects 403 on first touch and warm up from that very request.
        if ((res.status === 403 || res.status === 412) && attempt === 0) {
          await sleep(1200);
          continue;
        }
        break;
      } catch (err) {
        if (err instanceof Error && err.message.includes("超过")) throw err;
        failures.push(`${new URL(candidate).hostname} ${err instanceof Error ? err.message : "网络错误"}`);
        break;
      }
    }
  }
  throw new Error(`所有音频来源都取不到字节（${failures.slice(0, 4).join("；")}）`);
}

async function runRefresh(ctx: Ctx): Promise<{ checked: number; newEpisodes: number }> {
  const db = ctx.db<typeof schema>();
  const favorites = await db.select().from(schema.favoritePodcasts);
  let newEpisodes = 0;
  for (const fav of favorites) {
    let episodes: EpisodeOut[] = [];
    try {
      episodes = await fetchEpisodesFor(fav);
    } catch {
      continue;
    }
    if (episodes.length === 0) continue;
    const existing = await db
      .select()
      .from(schema.latestEpisodes)
      .where(eq(schema.latestEpisodes.podcastKey, fav.podcastKey));
    const known = new Set(existing.map((e) => e.episodeKey));
    const firstSync = existing.length === 0;
    for (const ep of episodes) {
      if (known.has(ep.episodeKey)) continue;
      await db
        .insert(schema.latestEpisodes)
        .values({
          podcastKey: fav.podcastKey,
          episodeKey: ep.episodeKey,
          title: ep.title,
          publishedAt: ep.publishedAt,
          isNew: firstSync ? 0 : 1,
        })
        .onConflictDoNothing();
      if (!firstSync) newEpisodes += 1;
    }
  }
  await db
    .insert(schema.refreshState)
    .values({ id: 1, lastRefreshedAt: new Date() })
    .onConflictDoUpdate({
      target: schema.refreshState.id,
      set: { lastRefreshedAt: new Date() },
    });
  return { checked: favorites.length, newEpisodes };
}

// ---------- episode-list cache ----------
//
// Opening a show fans out to slow upstreams (a full Lizhi catalogue is ~11
// vodapi pages at ~4 s each, plus the iTunes lookup) — an uncached open
// took ~10 s, every time. Resolved lists change at most a few times a day,
// so they are cached in-process: 10 minutes fresh, then served stale while
// one background refresh runs (stale-while-revalidate, 2 h horizon).
// Errors are never cached, so the detail view's retry always re-fetches.

const EPISODES_FRESH_MS = 10 * 60_000;
const EPISODES_STALE_MS = 2 * 3_600_000;

interface EpisodesArgs {
  podcastKey?: string | null;
  appleId?: string | null;
  feedUrl?: string | null;
  country: string;
  title?: string;
  author?: string;
  artworkUrl?: string | null;
}

interface EpisodesResult {
  podcast: PodcastOut | null;
  episodes: EpisodeOut[];
  error: string | null;
}

const episodeListCache = new Map<string, { at: number; result: EpisodesResult }>();
const episodeListInflight = new Map<string, Promise<EpisodesResult>>();

async function loadEpisodesUncached(args: EpisodesArgs): Promise<EpisodesResult> {
    try {
      if (args.podcastKey?.startsWith("lizhi:")) {
        const userId = args.podcastKey.slice("lizhi:".length);
        const { podcast, episodes } = await fetchLizhiUser(userId, LIZHI_MAX_PAGES);
        if (args.title) podcast.title = args.title;
        if (args.author) podcast.author = args.author;
        if (args.artworkUrl) podcast.artworkUrl = args.artworkUrl;
        podcast.trackCount = episodes.length;
        return {
          podcast,
          episodes: episodes.slice(0, 1200),
          error: episodes.length === 0 ? "这个荔枝用户暂时没有可播放的单集" : null,
        };
      }
      if (args.appleId) {
        // Mirrored shows: start the Lizhi catalogue fetch NOW, in parallel
        // with the iTunes lookup below — serialising the two was half the
        // detail view's load time.
        const earlyMirror = lizhiMirrorFor({ appleId: args.appleId, title: args.title });
        const lizhiPrefetch = earlyMirror
          ? fetchLizhiUser(earlyMirror.userId, LIZHI_MAX_PAGES).catch(() => null)
          : null;
        const mergePrefetched = async (base: EpisodeOut[]): Promise<EpisodeOut[]> => {
          if (!lizhiPrefetch) return base;
          const r = await lizhiPrefetch;
          if (!r || r.episodes.length === 0) return base;
          return mergeEpisodes(r.episodes, base);
        };
        let result = await lookupEpisodes(args.appleId, args.country).catch(() => null);
        if (!result || result.episodes.length === 0) {
          const alt = args.country === "US" ? "CN" : "US";
          const retry = await lookupEpisodes(args.appleId, alt).catch(() => null);
          if (retry && (retry.episodes.length > 0 || !result)) result = retry;
        }
        if (result && result.episodes.length > 0) {
          const podcast = result.podcast ?? {
            podcastKey: `itunes:${args.appleId}`,
            appleId: args.appleId,
            title: args.title ?? "未命名播客",
            author: args.author ?? "",
            artworkUrl: args.artworkUrl ?? null,
            feedUrl: args.feedUrl ?? null,
            genre: null,
            description: null,
            source: "itunes" as const,
            country: args.country,
            trackCount: null,
          };
          if (!podcast.feedUrl && args.feedUrl) podcast.feedUrl = args.feedUrl;
          const mirror = lizhiMirrorFor({ appleId: args.appleId, title: podcast.title });
          if (mirror) {
            const merged = lizhiPrefetch
              ? await mergePrefetched(result.episodes)
              : await mergeLizhiMirror(result.episodes, mirror, LIZHI_MAX_PAGES);
            podcast.trackCount = merged.length;
            return { podcast, episodes: merged.slice(0, 1200), error: null };
          }
          return { podcast, episodes: result.episodes, error: null };
        }
        if (args.feedUrl) {
          const xml = await fetchText(args.feedUrl);
          const rss = parseRss(xml, args.feedUrl);
          const rssPodcast: PodcastOut = {
            podcastKey: `itunes:${args.appleId}`,
            appleId: args.appleId,
            title: args.title ?? rss.title,
            author: args.author ?? rss.author,
            artworkUrl: args.artworkUrl ?? rss.imageUrl,
            feedUrl: args.feedUrl,
            genre: null,
            description: rss.description,
            source: "itunes" as const,
            country: args.country,
            trackCount: null,
          };
          const mirror = lizhiMirrorFor({ appleId: args.appleId, title: rssPodcast.title });
          if (mirror) {
            const merged = lizhiPrefetch
              ? await mergePrefetched(rss.episodes)
              : await mergeLizhiMirror(rss.episodes, mirror, LIZHI_MAX_PAGES);
            rssPodcast.trackCount = merged.length;
            return {
              podcast: rssPodcast,
              episodes: merged.slice(0, 1200),
              error: merged.length === 0 ? "这个节目暂时没有可播放的单集" : null,
            };
          }
          return {
            podcast: rssPodcast,
            episodes: rss.episodes,
            error: rss.episodes.length === 0 ? "这个节目暂时没有可播放的单集" : null,
          };
        }
        return {
          podcast: result?.podcast ?? null,
          episodes: [],
          error: "没能取到这个节目的单集列表",
        };
      }
      if (args.feedUrl) {
        const xml = await fetchText(args.feedUrl);
        const rss = parseRss(xml, args.feedUrl);
        return {
          podcast: {
            podcastKey: `rss:${args.feedUrl}`,
            appleId: null,
            title: rss.title,
            author: rss.author,
            artworkUrl: rss.imageUrl,
            feedUrl: args.feedUrl,
            genre: null,
            description: rss.description,
            source: "rss" as const,
            country: args.country,
            trackCount: null,
          },
          episodes: rss.episodes,
          error: null,
        };
      }
      return { podcast: null, episodes: [], error: "缺少节目信息" };
    } catch (err) {
      return {
        podcast: null,
        episodes: [],
        error: err instanceof Error ? err.message : "加载失败",
      };
    }
}

export const Actions = {
  getDiscover: defineAction({
    description: "Fetches the Apple Podcasts top chart for the discovery home.",
    request: z.object({
      country: z.enum(["CN", "US"]).default("CN"),
    }),
    response: z.object({
      podcasts: z.array(podcastShape),
      error: z.string().nullable(),
    }),
    async handler(_ctx, args) {
      try {
        const url = `https://itunes.apple.com/${args.country.toLowerCase()}/rss/toppodcasts/limit=25/json`;
        const data = (await fetchJson(url)) as {
          feed?: { entry?: unknown[] };
        };
        const entries = (data.feed?.entry ?? []) as Array<{
          "im:name"?: { label?: string };
          "im:artist"?: { label?: string };
          "im:image"?: Array<{ label?: string }>;
          id?: { attributes?: { "im:id"?: string } };
          category?: { attributes?: { label?: string } };
        }>;
        const podcasts: PodcastOut[] = [];
        for (const e of entries) {
          const id = e.id?.attributes?.["im:id"];
          const name = e["im:name"]?.label;
          if (!id || !name) continue;
          const images = e["im:image"] ?? [];
          podcasts.push({
            podcastKey: `itunes:${id}`,
            appleId: id,
            title: name,
            author: e["im:artist"]?.label ?? "",
            artworkUrl: images[images.length - 1]?.label ?? null,
            feedUrl: null,
            genre: e.category?.attributes?.label ?? null,
            description: null,
            source: "itunes",
            country: args.country,
            trackCount: null,
          });
        }
        return { podcasts, error: null };
      } catch (err) {
        return {
          podcasts: [],
          error: err instanceof Error ? err.message : "榜单加载失败",
        };
      }
    },
  }),

  searchPodcasts: defineAction({
    description: "Searches Apple Podcasts by keyword in the chosen storefront.",
    request: z.object({
      term: z.string().min(1).max(100),
      country: z.enum(["CN", "US"]).default("CN"),
    }),
    response: z.object({
      podcasts: z.array(podcastShape),
      error: z.string().nullable(),
    }),
    async handler(_ctx, args) {
      try {
        const url = `https://itunes.apple.com/search?term=${encodeURIComponent(args.term)}&media=podcast&limit=30&country=${args.country}`;
        const data = (await fetchJson(url)) as { results?: ItunesPodcastRaw[] };
        const podcasts = (data.results ?? [])
          .filter((r) => r.collectionId != null)
          .map((r) => mapItunesPodcast(r, args.country));
        // Search source is no longer Apple-only: shows with a verified Lizhi
        // mirror also surface as a 荔枝 FM result (their freshest source),
        // ahead of the lagging Apple entry for the same show. A mirror
        // matches when Apple returned the show itself, or the term matches
        // the show title / a spelling alias (simplified vs traditional).
        const termKey = args.term.replace(/\s+/g, "");
        for (const [appleId, mirror] of Object.entries(LIZHI_MIRRORS)) {
          const names = [mirror.title, ...mirror.aliases].map((n) => n.replace(/\s+/g, ""));
          const matched =
            podcasts.some((p) => p.appleId === appleId) ||
            names.some((n) => n.includes(termKey) || termKey.includes(n));
          if (!matched) continue;
          try {
            const { podcast } = await fetchLizhiUser(mirror.userId, 1);
            if (!podcasts.some((p) => p.podcastKey === podcast.podcastKey)) {
              podcasts.unshift({ ...podcast, title: mirror.title, author: mirror.title });
            }
          } catch {
            // Mirror lookup is best-effort; Apple results still stand.
          }
        }
        return { podcasts, error: null };
      } catch (err) {
        return {
          podcasts: [],
          error: err instanceof Error ? err.message : "搜索失败",
        };
      }
    },
  }),

  getPodcastEpisodes: defineAction({
    description: "Loads a podcast's details and playable episode list via iTunes lookup with RSS fallback.",
    request: z.object({
      podcastKey: z.string().nullable().optional(),
      appleId: z.string().nullable().optional(),
      feedUrl: z.string().nullable().optional(),
      country: z.string().default("CN"),
      title: z.string().optional(),
      author: z.string().optional(),
      artworkUrl: z.string().nullable().optional(),
    }),
    response: z.object({
      podcast: podcastShape.nullable(),
      episodes: z.array(episodeShape),
      error: z.string().nullable(),
    }),
    async handler(_ctx, args) {
      const key = [args.podcastKey ?? "", args.appleId ?? "", args.feedUrl ?? "", args.country].join("|");
      const now = Date.now();
      const hit = episodeListCache.get(key);
      if (hit && now - hit.at < EPISODES_FRESH_MS) return hit.result;
      if (hit && now - hit.at < EPISODES_STALE_MS) {
        // Stale-while-revalidate: serve the cached list instantly and
        // refresh it in the background for the next open.
        if (!episodeListInflight.has(key)) {
          const p = loadEpisodesUncached(args)
            .then((r) => {
              if (!r.error) episodeListCache.set(key, { at: Date.now(), result: r });
              return r;
            })
            .finally(() => {
              episodeListInflight.delete(key);
            });
          episodeListInflight.set(key, p);
          void p.catch(() => undefined);
        }
        return hit.result;
      }
      const result = await loadEpisodesUncached(args);
      if (!result.error) episodeListCache.set(key, { at: Date.now(), result });
      return result;
    },
  }),

  addRssPodcast: defineAction({
    description: "Adds a podcast from a user-supplied RSS feed URL to favorites.",
    request: z.object({ feedUrl: z.string().url().max(2000) }),
    response: z.object({
      podcast: podcastShape.nullable(),
      episodeCount: z.number(),
      error: z.string().nullable(),
    }),
    async handler(ctx, args) {
      if (!/^https?:\/\//i.test(args.feedUrl)) {
        return { podcast: null, episodeCount: 0, error: "只支持 http(s) 的 RSS 地址" };
      }
      try {
        const xml = await fetchText(args.feedUrl);
        const rss = parseRss(xml, args.feedUrl);
        if (!rss.title || rss.title === "未命名播客") {
          return { podcast: null, episodeCount: 0, error: "这个地址不像一个播客 RSS" };
        }
        const podcastKey = `rss:${args.feedUrl}`;
        const db = ctx.db<typeof schema>();
        await db
          .insert(schema.favoritePodcasts)
          .values({
            podcastKey,
            appleId: null,
            title: rss.title,
            author: rss.author,
            artworkUrl: rss.imageUrl,
            feedUrl: args.feedUrl,
            genre: null,
            description: rss.description,
            source: "rss",
            country: "CN",
          })
          .onConflictDoNothing();
        // Seed the update snapshot so only future episodes count as new.
        for (const ep of rss.episodes.slice(0, 30)) {
          await db
            .insert(schema.latestEpisodes)
            .values({
              podcastKey,
              episodeKey: ep.episodeKey,
              title: ep.title,
              publishedAt: ep.publishedAt,
              isNew: 0,
            })
            .onConflictDoNothing();
        }
        ctx.invalidateQueries();
        return {
          podcast: {
            podcastKey,
            appleId: null,
            title: rss.title,
            author: rss.author,
            artworkUrl: rss.imageUrl,
            feedUrl: args.feedUrl,
            genre: null,
            description: rss.description,
            source: "rss" as const,
            country: "CN",
            trackCount: null,
          },
          episodeCount: rss.episodes.length,
          error: null,
        };
      } catch (err) {
        return {
          podcast: null,
          episodeCount: 0,
          error: err instanceof Error ? `订阅失败：${err.message}` : "订阅失败",
        };
      }
    },
  }),

  listFavorites: defineAction({
    description: "Lists favorited podcasts with their unseen new-episode counts.",
    request: z.object({}),
    response: z.object({
      favorites: z.array(
        podcastShape.extend({
          newCount: z.number(),
          createdAt: z.string(),
        }),
      ),
      lastRefreshedAt: z.string().nullable(),
    }),
    async handler(ctx) {
      const db = ctx.db<typeof schema>();
      const rows = await db
        .select()
        .from(schema.favoritePodcasts)
        .orderBy(desc(schema.favoritePodcasts.createdAt));
      const fresh = await db
        .select()
        .from(schema.latestEpisodes)
        .where(eq(schema.latestEpisodes.isNew, 1));
      const counts = new Map<string, number>();
      for (const f of fresh) counts.set(f.podcastKey, (counts.get(f.podcastKey) ?? 0) + 1);
      const stateRows = await db.select().from(schema.refreshState);
      return {
        favorites: rows.map((r) => ({
          podcastKey: r.podcastKey,
          appleId: r.appleId,
          title: r.title,
          author: r.author,
          artworkUrl: r.artworkUrl,
          feedUrl: r.feedUrl,
          genre: r.genre,
          description: r.description,
          source: r.source,
          country: r.country,
          trackCount: null,
          newCount: counts.get(r.podcastKey) ?? 0,
          createdAt: r.createdAt.toISOString(),
        })),
        lastRefreshedAt: stateRows[0]?.lastRefreshedAt?.toISOString() ?? null,
      };
    },
  }),

  toggleFavorite: defineAction({
    description: "Adds a podcast to favorites, or removes it if already favorited.",
    request: z.object({ podcast: podcastShape }),
    response: z.object({ favorited: z.boolean() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const p = args.podcast;
      const existing = await db
        .select()
        .from(schema.favoritePodcasts)
        .where(eq(schema.favoritePodcasts.podcastKey, p.podcastKey));
      if (existing.length > 0) {
        await db.batch([
          db
            .delete(schema.favoritePodcasts)
            .where(eq(schema.favoritePodcasts.podcastKey, p.podcastKey)),
          db
            .delete(schema.latestEpisodes)
            .where(eq(schema.latestEpisodes.podcastKey, p.podcastKey)),
        ]);
        ctx.invalidateQueries();
        return { favorited: false };
      }
      await db
        .insert(schema.favoritePodcasts)
        .values({
          podcastKey: p.podcastKey,
          appleId: p.appleId,
          title: p.title,
          author: p.author,
          artworkUrl: p.artworkUrl,
          feedUrl: p.feedUrl,
          genre: p.genre,
          description: p.description,
          source: p.source,
          country: p.country,
        })
        .onConflictDoNothing();
      // Seed snapshot with current episodes so only later ones count as new.
      try {
        const episodes = await fetchEpisodesFor(p);
        for (const ep of episodes.slice(0, 30)) {
          await db
            .insert(schema.latestEpisodes)
            .values({
              podcastKey: p.podcastKey,
              episodeKey: ep.episodeKey,
              title: ep.title,
              publishedAt: ep.publishedAt,
              isNew: 0,
            })
            .onConflictDoNothing();
        }
      } catch {
        // Seeding is best-effort; refresh will establish the baseline.
      }
      ctx.invalidateQueries();
      return { favorited: true };
    },
  }),

  markPodcastSeen: defineAction({
    description: "Clears the new-episode badge for one favorited podcast.",
    request: z.object({ podcastKey: z.string() }),
    response: z.object({ ok: z.literal(true) }),
    async handler(ctx, args): Promise<{ ok: true }> {
      const db = ctx.db<typeof schema>();
      await db
        .update(schema.latestEpisodes)
        .set({ isNew: 0 })
        .where(
          and(
            eq(schema.latestEpisodes.podcastKey, args.podcastKey),
            eq(schema.latestEpisodes.isNew, 1),
          ),
        );
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),

  refreshSubscriptions: defineAction({
    description: "Refreshes all favorited podcasts and counts genuinely new episodes.",
    request: z.object({}),
    response: z.object({
      checked: z.number(),
      newEpisodes: z.number(),
      refreshedAt: z.string(),
    }),
    async handler(ctx) {
      const result = await runRefresh(ctx);
      ctx.invalidateQueries();
      return { ...result, refreshedAt: new Date().toISOString() };
    },
  }),

  listBookmarks: defineAction({
    description: "Lists bookmarked episodes (稍后再听), newest first.",
    request: z.object({}),
    response: z.object({
      bookmarks: z.array(
        z.object({
          episodeKey: z.string(),
          podcastKey: z.string().nullable(),
          podcastTitle: z.string(),
          episodeTitle: z.string(),
          audioUrl: z.string(),
          artworkUrl: z.string().nullable(),
          publishedAt: z.string().nullable(),
          durationSec: z.number().nullable(),
          createdAt: z.string(),
        }),
      ),
    }),
    async handler(ctx) {
      const db = ctx.db<typeof schema>();
      const rows = await db
        .select()
        .from(schema.episodeBookmarks)
        .orderBy(desc(schema.episodeBookmarks.createdAt));
      return {
        bookmarks: rows.map((r) => ({
          episodeKey: r.episodeKey,
          podcastKey: r.podcastKey,
          podcastTitle: r.podcastTitle,
          episodeTitle: r.episodeTitle,
          audioUrl: r.audioUrl,
          artworkUrl: r.artworkUrl,
          publishedAt: r.publishedAt,
          durationSec: r.durationSec,
          createdAt: r.createdAt.toISOString(),
        })),
      };
    },
  }),

  toggleBookmark: defineAction({
    description: "Bookmarks an episode for later, or removes the bookmark if present.",
    request: episodeInput,
    response: z.object({ bookmarked: z.boolean() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const existing = await db
        .select()
        .from(schema.episodeBookmarks)
        .where(eq(schema.episodeBookmarks.episodeKey, args.episodeKey));
      if (existing.length > 0) {
        await db
          .delete(schema.episodeBookmarks)
          .where(eq(schema.episodeBookmarks.episodeKey, args.episodeKey));
        ctx.invalidateQueries();
        return { bookmarked: false };
      }
      await db
        .insert(schema.episodeBookmarks)
        .values({
          episodeKey: args.episodeKey,
          podcastKey: args.podcastKey ?? null,
          podcastTitle: args.podcastTitle,
          episodeTitle: args.episodeTitle,
          audioUrl: args.audioUrl,
          artworkUrl: args.artworkUrl ?? null,
          description: args.description ?? null,
          publishedAt: args.publishedAt ?? null,
          durationSec: args.durationSec ?? null,
        })
        .onConflictDoNothing();
      ctx.invalidateQueries();
      return { bookmarked: true };
    },
  }),

  saveProgress: defineAction({
    description: "Saves playback position for an episode so it can be resumed.",
    request: episodeInput.extend({
      positionSec: z.number().min(0),
      durationSec: z.number().min(0),
      completed: z.boolean().default(false),
    }),
    response: z.object({ ok: z.literal(true) }),
    async handler(ctx, args): Promise<{ ok: true }> {
      const db = ctx.db<typeof schema>();
      await db
        .insert(schema.playbackProgress)
        .values({
          episodeKey: args.episodeKey,
          podcastKey: args.podcastKey ?? null,
          podcastTitle: args.podcastTitle,
          episodeTitle: args.episodeTitle,
          audioUrl: args.audioUrl,
          artworkUrl: args.artworkUrl ?? null,
          positionSec: args.positionSec,
          durationSec: args.durationSec,
          completed: args.completed ? 1 : 0,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: schema.playbackProgress.episodeKey,
          set: {
            positionSec: args.positionSec,
            durationSec: args.durationSec,
            completed: args.completed ? 1 : 0,
            updatedAt: new Date(),
          },
        });
      return { ok: true };
    },
  }),

  listProgress: defineAction({
    description: "Lists playback progress: in-progress episodes for continue listening, plus finished history.",
    request: z.object({}),
    response: z.object({
      inProgress: z.array(
        z.object({
          episodeKey: z.string(),
          podcastKey: z.string().nullable(),
          podcastTitle: z.string(),
          episodeTitle: z.string(),
          audioUrl: z.string(),
          artworkUrl: z.string().nullable(),
          positionSec: z.number(),
          durationSec: z.number(),
          updatedAt: z.string(),
        }),
      ),
      finished: z.array(
        z.object({
          episodeKey: z.string(),
          podcastTitle: z.string(),
          episodeTitle: z.string(),
          audioUrl: z.string(),
          artworkUrl: z.string().nullable(),
          durationSec: z.number(),
          updatedAt: z.string(),
        }),
      ),
      progressByKey: z.record(
        z.string(),
        z.object({ positionSec: z.number(), durationSec: z.number(), completed: z.boolean() }),
      ),
    }),
    async handler(ctx) {
      const db = ctx.db<typeof schema>();
      const rows = await db
        .select()
        .from(schema.playbackProgress)
        .orderBy(desc(schema.playbackProgress.updatedAt))
        .limit(200);
      const progressByKey: Record<
        string,
        { positionSec: number; durationSec: number; completed: boolean }
      > = {};
      for (const r of rows) {
        progressByKey[r.episodeKey] = {
          positionSec: r.positionSec,
          durationSec: r.durationSec,
          completed: r.completed === 1,
        };
      }
      const inProgress = rows
        .filter((r) => r.completed !== 1 && r.positionSec > 5)
        .slice(0, 20)
        .map((r) => ({
          episodeKey: r.episodeKey,
          podcastKey: r.podcastKey,
          podcastTitle: r.podcastTitle,
          episodeTitle: r.episodeTitle,
          audioUrl: r.audioUrl,
          artworkUrl: r.artworkUrl,
          positionSec: r.positionSec,
          durationSec: r.durationSec,
          updatedAt: r.updatedAt.toISOString(),
        }));
      const finished = rows
        .filter((r) => r.completed === 1)
        .slice(0, 30)
        .map((r) => ({
          episodeKey: r.episodeKey,
          podcastTitle: r.podcastTitle,
          episodeTitle: r.episodeTitle,
          audioUrl: r.audioUrl,
          artworkUrl: r.artworkUrl,
          durationSec: r.durationSec,
          updatedAt: r.updatedAt.toISOString(),
        }));
      return { inProgress, finished, progressByKey };
    },
  }),

  getLibraryCounts: defineAction({
    description: "Returns counts and favorite keys for badges and favorite-state checks.",
    request: z.object({}),
    response: z.object({
      favoriteKeys: z.array(z.string()),
      bookmarkKeys: z.array(z.string()),
      favoriteCount: z.number(),
      bookmarkCount: z.number(),
      newEpisodeTotal: z.number(),
    }),
    async handler(ctx) {
      const db = ctx.db<typeof schema>();
      const favs = await db
        .select({ podcastKey: schema.favoritePodcasts.podcastKey })
        .from(schema.favoritePodcasts);
      const bms = await db
        .select({ episodeKey: schema.episodeBookmarks.episodeKey })
        .from(schema.episodeBookmarks);
      const fresh = await db
        .select({ podcastKey: schema.latestEpisodes.podcastKey })
        .from(schema.latestEpisodes)
        .where(
          and(
            eq(schema.latestEpisodes.isNew, 1),
            inArray(
              schema.latestEpisodes.podcastKey,
              favs.length > 0 ? favs.map((f) => f.podcastKey) : ["__none__"],
            ),
          ),
        );
      return {
        favoriteKeys: favs.map((f) => f.podcastKey),
        bookmarkKeys: bms.map((b) => b.episodeKey),
        favoriteCount: favs.length,
        bookmarkCount: bms.length,
        newEpisodeTotal: fresh.length,
      };
    },
  }),

  addLizhiPodcast: defineAction({
    description: "Subscribes to a Lizhi FM user (by user id or lizhi.fm/user URL) via the vodapi collection recipe.",
    request: z.object({ userIdOrUrl: z.string().min(1).max(500) }),
    response: z.object({
      podcast: podcastShape.nullable(),
      episodeCount: z.number(),
      error: z.string().nullable(),
    }),
    async handler(ctx, args) {
      const userId = parseLizhiUserId(args.userIdOrUrl);
      if (!userId) {
        return {
          podcast: null,
          episodeCount: 0,
          error: "没认出荔枝用户 id：粘贴 lizhi.fm/user/数字 这样的主页地址，或直接填数字 id",
        };
      }
      try {
        const { podcast, episodes } = await fetchLizhiUser(userId, 3);
        if (episodes.length === 0) {
          return { podcast: null, episodeCount: 0, error: "这个荔枝用户没有取到单集，可能 id 不对或对方没有公开音频" };
        }
        const db = ctx.db<typeof schema>();
        await db
          .insert(schema.favoritePodcasts)
          .values({
            podcastKey: podcast.podcastKey,
            appleId: null,
            title: podcast.title,
            author: podcast.author,
            artworkUrl: podcast.artworkUrl,
            feedUrl: null,
            genre: podcast.genre,
            description: null,
            source: "lizhi",
            country: "CN",
          })
          .onConflictDoNothing();
        // Seed the update snapshot so only future episodes count as new.
        for (const ep of episodes.slice(0, 30)) {
          await db
            .insert(schema.latestEpisodes)
            .values({
              podcastKey: podcast.podcastKey,
              episodeKey: ep.episodeKey,
              title: ep.title,
              publishedAt: ep.publishedAt,
              isNew: 0,
            })
            .onConflictDoNothing();
        }
        ctx.invalidateQueries();
        return { podcast, episodeCount: episodes.length, error: null };
      } catch (err) {
        return {
          podcast: null,
          episodeCount: 0,
          error: err instanceof Error ? `订阅失败：${err.message}` : "订阅失败",
        };
      }
    },
  }),

  resolvePlayback: defineAction({
    description: "Resolves an episode's playable URL at play time through the byte ladder: archive first, then serving-policy candidates, then origin.",
    request: z.object({
      episodeKey: z.string().min(1),
      audioUrl: z.string().min(1),
    }),
    response: z.object({
      kind: z.enum(["archive", "direct"]),
      src: z.string(),
      candidates: z.array(z.string()),
      warmRetry: z.boolean(),
    }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      // Tier 1: local archive (owned blob) wins over every remote source.
      const archived = await db
        .select()
        .from(schema.episodeArchives)
        .where(eq(schema.episodeArchives.episodeKey, args.episodeKey));
      const row = archived[0];
      if (row) {
        const url = await ctx.blobs.getUrl(row.blobKey);
        return { kind: "archive" as const, src: url, candidates: [url], warmRetry: false };
      }
      // Tier 2 (netdisk binding) has no connected source in this artifact and
      // falls through. Tier 3/4: serving-policy candidates, origin last.
      const candidates = playbackCandidates(args.audioUrl);
      return {
        kind: "direct" as const,
        src: candidates[0] ?? args.audioUrl,
        candidates,
        warmRetry: servingPolicyFor(args.audioUrl) != null,
      };
    },
  }),

  prepareDownload: defineAction({
    description: "Fetches an episode's audio bytes through the byte ladder into the server archive so the client can pull them on-device for offline listening.",
    request: episodeInput,
    response: z.object({
      ok: z.boolean(),
      fetchUrl: z.string().nullable(),
      sizeBytes: z.number(),
      error: z.string().nullable(),
    }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const blobKey = archiveBlobKey(args.episodeKey);
      const existing = await db
        .select()
        .from(schema.episodeArchives)
        .where(eq(schema.episodeArchives.episodeKey, args.episodeKey));
      const existingRow = existing[0];
      if (existingRow) {
        return {
          ok: true,
          fetchUrl: await ctx.blobs.getUrl(existingRow.blobKey),
          sizeBytes: existingRow.sizeBytes,
          error: null,
        };
      }
      try {
        const { bytes, contentType } = await fetchAudioThroughLadder(args.audioUrl);
        await ctx.blobs.put(blobKey, bytes, { contentType });
        await db
          .insert(schema.episodeArchives)
          .values({
            episodeKey: args.episodeKey,
            podcastKey: args.podcastKey ?? null,
            podcastTitle: args.podcastTitle,
            episodeTitle: args.episodeTitle,
            originUrl: args.audioUrl,
            artworkUrl: args.artworkUrl ?? null,
            durationSec: args.durationSec ?? null,
            sizeBytes: bytes.byteLength,
            blobKey,
          })
          .onConflictDoNothing();
        ctx.invalidateQueries();
        return {
          ok: true,
          fetchUrl: await ctx.blobs.getUrl(blobKey),
          sizeBytes: bytes.byteLength,
          error: null,
        };
      } catch (err) {
        return {
          ok: false,
          fetchUrl: null,
          sizeBytes: 0,
          error: err instanceof Error ? err.message : "下载备料失败",
        };
      }
    },
  }),

  listArchives: defineAction({
    description: "Lists server-archived episodes (tier 1 of the byte ladder) with sizes.",
    request: z.object({}),
    response: z.object({
      archives: z.array(
        z.object({
          episodeKey: z.string(),
          podcastKey: z.string().nullable(),
          podcastTitle: z.string(),
          episodeTitle: z.string(),
          originUrl: z.string(),
          artworkUrl: z.string().nullable(),
          durationSec: z.number().nullable(),
          sizeBytes: z.number(),
          createdAt: z.string(),
        }),
      ),
    }),
    async handler(ctx) {
      const db = ctx.db<typeof schema>();
      const rows = await db
        .select()
        .from(schema.episodeArchives)
        .orderBy(desc(schema.episodeArchives.createdAt));
      return {
        archives: rows.map((r) => ({
          episodeKey: r.episodeKey,
          podcastKey: r.podcastKey,
          podcastTitle: r.podcastTitle,
          episodeTitle: r.episodeTitle,
          originUrl: r.originUrl,
          artworkUrl: r.artworkUrl,
          durationSec: r.durationSec,
          sizeBytes: r.sizeBytes,
          createdAt: r.createdAt.toISOString(),
        })),
      };
    },
  }),

  removeArchive: defineAction({
    description: "Removes an episode from the server archive (deletes the stored audio blob).",
    request: z.object({ episodeKey: z.string().min(1) }),
    response: z.object({ ok: z.literal(true) }),
    async handler(ctx, args): Promise<{ ok: true }> {
      const db = ctx.db<typeof schema>();
      const rows = await db
        .select()
        .from(schema.episodeArchives)
        .where(eq(schema.episodeArchives.episodeKey, args.episodeKey));
      const row = rows[0];
      if (row) {
        await ctx.blobs.delete(row.blobKey).catch(() => undefined);
        await db
          .delete(schema.episodeArchives)
          .where(eq(schema.episodeArchives.episodeKey, args.episodeKey));
      }
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),
} satisfies ActionsModule;
