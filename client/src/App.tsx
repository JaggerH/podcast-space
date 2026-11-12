import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
useCallback,
useEffect,
useLayoutEffect,
useMemo,
useRef,
useState,
type CSSProperties,
type ReactNode,
} from "react";
import { api, type ApiResponse } from "./api";
import {
AudioPlayer,
Badge, BookmarkIcon, Button,
Card,
CheckIcon,
ChevronLeftIcon, CompassIcon, DownloadIcon,
HeartIcon,
Item,
ItemActions,
ItemContent,
ItemDescription,
ItemFooter,
ItemGroup,
ItemMedia,
ItemTitle,
ListMusicIcon,
MoonIcon,
PauseIcon,
PlayIcon,
RefreshIcon,
RotateCcwIcon,
RotateCwIcon,
Searchbar,
TrashIcon,
XIcon,
cn,
fmtClock
} from "./acrylic";
import {
getOfflineBlob,
listOfflineMeta,
putOfflineEpisode,
removeOfflineEpisode,
type OfflineMeta,
} from "./offline";

type Podcast = ApiResponse<typeof api, "getDiscover">["podcasts"][number];
type Episode = ApiResponse<typeof api, "getPodcastEpisodes">["episodes"][number];
type Favorite = ApiResponse<typeof api, "listFavorites">["favorites"][number];
type Bookmark = ApiResponse<typeof api, "listBookmarks">["bookmarks"][number];
type ProgressMap = ApiResponse<typeof api, "listProgress">["progressByKey"];
type InProgress = ApiResponse<typeof api, "listProgress">["inProgress"][number];

interface PlayingEpisode {
  episodeKey: string;
  podcastKey: string | null;
  podcastTitle: string;
  episodeTitle: string;
  audioUrl: string;
  artworkUrl: string | null;
  description: string | null;
  durationSec: number | null;
  /** Source-side paid marker (display only, never gates playback). */
  paid?: boolean;
}

type SleepTimerMode = "off" | "15" | "30" | "60" | "episode";

function fmtBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0 MB";
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

type Tab = "discover" | "library" | "later";
type Country = "CN" | "US";

// ---------- helpers ----------

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("zh-CN", { month: "short", day: "numeric", year: "numeric" });
}

function timeAgo(iso: string): string {
  const d = new Date(iso).getTime();
  const diff = Date.now() - d;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "刚刚";
  if (mins < 60) return `${mins} 分钟前`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} 小时前`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days} 天前`;
  return fmtDate(iso);
}

/* Fallback tiles tint with the macOS system-color spectrum */
const TILE_COLORS = ["#0088ff", "#6155f5", "#cb30e0", "#ff8d28", "#34c759", "#00c3d0"];

function tileColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return TILE_COLORS[h % TILE_COLORS.length] ?? (TILE_COLORS[0] as string);
}

function Artwork({
  url,
  title,
  size,
  rounded = 8,
}: {
  url: string | null;
  title: string;
  size: number;
  rounded?: number;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);
  if (!url || failed) {
    return (
      <div
        aria-hidden
        className="flex shrink-0 items-center justify-center font-bold text-white"
        style={{
          width: size,
          height: size,
          borderRadius: rounded,
          background: tileColor(title),
          fontSize: size * 0.42,
        }}
      >
        {title.slice(0, 1) || "播"}
      </div>
    );
  }
  return (
    <img
      src={url}
      alt={`${title} 封面`}
      loading="lazy"
      onError={() => setFailed(true)}
      className="shrink-0 object-cover"
      style={{ width: size, height: size, borderRadius: rounded }}
    />
  );
}

function GhostIconBtn({
  label,
  onClick,
  active,
  children,
}: {
  label: string;
  onClick: (e: React.MouseEvent) => void;
  active?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-[var(--acr-hover)]",
        active ? "text-[var(--primary)]" : "text-[var(--muted-foreground)]",
      )}
      style={{ minHeight: 36 }}
    >
      {children}
    </button>
  );
}

function PlayRoundBtn({
  label,
  isCurrent,
  isPlaying,
  onClick,
}: {
  label: string;
  isCurrent: boolean;
  isPlaying: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={cn(
        "flex size-10 shrink-0 items-center justify-center rounded-full transition-all hover:scale-105",
        isCurrent
          ? "bg-[var(--primary)] text-[var(--primary-foreground)]"
          : "bg-[var(--acr-chip)] text-[var(--foreground)] hover:bg-[var(--acr-chip-hover)]",
      )}
      style={{ minHeight: 40 }}
    >
      {isCurrent && isPlaying ? <PauseIcon size={17} /> : <PlayIcon size={17} className="translate-x-px" />}
    </button>
  );
}

function ProgressRail({ pct }: { pct: number }) {
  return (
    <div className="h-[3px] w-full overflow-hidden rounded-full bg-[var(--acr-chip)]">
      <div className="h-full rounded-full bg-[var(--primary)]" style={{ width: `${pct}%` }} />
    </div>
  );
}

function DownloadBtn({
  title,
  downloaded,
  progress,
  onDownload,
}: {
  title: string;
  downloaded: boolean;
  /** undefined = idle; null = server is preparing bytes; number = pull % on-device */
  progress: number | null | undefined;
  onDownload: () => void;
}) {
  if (downloaded) {
    return (
      <span
        className="flex size-9 shrink-0 items-center justify-center rounded-full text-[var(--acr-green)]"
        role="img"
        aria-label={`${title} 已下载，可离线听`}
        title="已下载，可离线听"
        style={{ minHeight: 36 }}
      >
        <CheckIcon size={17} />
      </span>
    );
  }
  const busy = progress !== undefined;
  return (
    <GhostIconBtn
      label={busy ? `正在下载 ${title}` : `下载 ${title} 供离线听`}
      onClick={(e) => {
        e.stopPropagation();
        if (!busy) onDownload();
      }}
    >
      {busy ? (
        <span className="text-[10px] font-semibold tabular-nums">
          {progress == null ? "备料" : `${Math.round(progress)}%`}
        </span>
      ) : (
        <DownloadIcon size={17} />
      )}
    </GhostIconBtn>
  );
}

/** Episode descriptions can arrive with light HTML / entities — flatten to
 * one readable text run for the card-style mobile rows. */
function plainText(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

// ---------- podcast detail: stream-style track table (L2) ----------

/** Desktop keeps the compact 57px table row; phones switch to the tall
 * card row (Lizhi-style, per the user's reference screenshot) so episode
 * titles wrap in full instead of truncating to one line. */
const TRACK_ROW_H = 57;

/** Weighted display width: CJK/full-width glyphs count 1, ASCII ~0.55 —
 * matches how the mixed titles/descriptions actually wrap. */
function textUnits(s: string): number {
  let n = 0;
  for (const ch of s) n += (ch.codePointAt(0) ?? 0) > 0xff ? 1 : 0.55;
  return n;
}

/**
 * Phone card rows are VARIABLE height — exactly as tall as their content,
 * never a fixed slot. (The fixed 180px slot was the recurring spacing bug:
 * a 1-line-title card's content is ~146px, so every short card carried a
 * ~34px dead band under its meta row, and the list read as loose/uneven
 * no matter where the meta row was pinned.) Geometry mirrors the row
 * markup: py-3 (12+12), top block = max(76px cover, title 22px/line +
 * description mt-1.5 6px + 20px/line, max 2 lines), meta row mt-2.5 (10)
 * + 36px buttons. These estimates only seed the virtualization offsets;
 * rendered rows measure themselves and correct the offsets (see rowEls).
 */
function estimateMobileRowH(ep: Episode): number {
  const titleLines = Math.max(1, Math.ceil(textUnits(ep.title) / 13));
  const desc = plainText(ep.description);
  const descLines = desc && desc !== ep.title ? Math.min(2, Math.ceil(textUnits(desc) / 15)) : 0;
  const textH = titleLines * 22 + (descLines > 0 ? 6 + descLines * 20 : 0);
  return 24 + Math.max(76, textH) + 10 + 36;
}

function PodcastDetail({
  target,
  onClose,
  onPlay,
  currentKey,
  isPlaying,
  favoriteKeys,
  bookmarkKeys,
  progressByKey,
  offlineKeys,
  downloadProgress,
  downloadError,
  onDownload,
  playerActive,
}: {
  target: Podcast;
  onClose: () => void;
  onPlay: (ep: PlayingEpisode, context?: PlayingEpisode[]) => void;
  currentKey: string | null;
  isPlaying: boolean;
  /** True while the floating player capsule is on screen (list needs
   * bottom clearance for it; without it the list only needs a small tail). */
  playerActive: boolean;
  favoriteKeys: Set<string>;
  bookmarkKeys: Set<string>;
  progressByKey: ProgressMap;
  offlineKeys: Set<string>;
  downloadProgress: Map<string, number | null>;
  downloadError: string | null;
  onDownload: (ep: PlayingEpisode) => void;
}) {
  const queryClient = useQueryClient();
  const detail = useQuery({
    queryKey: ["episodes", target.podcastKey, target.appleId, target.feedUrl],
    // Episode lists change a few times a day at most: keep the resolved
    // list fresh for 10 min so reopening a show is instant instead of
    // re-running the ~10 s upstream fetch (the server caches likewise).
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
    queryFn: () =>
      api.getPodcastEpisodes({
        podcastKey: target.podcastKey,
        appleId: target.appleId,
        feedUrl: target.feedUrl,
        country: target.country,
        title: target.title,
        author: target.author,
        artworkUrl: target.artworkUrl,
      }),
  });

  const favMutation = useMutation({
    mutationFn: async (p: Podcast) => api.toggleFavorite({ podcast: p }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["favorites"] });
      void queryClient.invalidateQueries({ queryKey: ["counts"] });
    },
  });

  const bookmarkMutation = useMutation({
    mutationFn: async (ep: Episode & { podcast: Podcast }) =>
      api.toggleBookmark({
        episodeKey: ep.episodeKey,
        podcastKey: ep.podcast.podcastKey,
        podcastTitle: ep.podcast.title,
        episodeTitle: ep.title,
        audioUrl: ep.audioUrl,
        artworkUrl: ep.podcast.artworkUrl,
        description: ep.description,
        publishedAt: ep.publishedAt,
        durationSec: ep.durationSec,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["bookmarks"] });
      void queryClient.invalidateQueries({ queryKey: ["counts"] });
    },
  });

  const podcast = detail.data?.podcast ?? target;
  const episodes = detail.data?.episodes ?? [];
  const isFav = favoriteKeys.has(podcast.podcastKey);
  const totalCount = Math.max(podcast.trackCount ?? 0, episodes.length);

  const [listTerm, setListTerm] = useState("");
  const [multi, setMulti] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [menuOpen, setMenuOpen] = useState(false);
  const [showDesc, setShowDesc] = useState(false);

  const filtered = useMemo(() => {
    const t = listTerm.trim().toLowerCase();
    if (!t) return episodes;
    return episodes.filter((ep) => ep.title.toLowerCase().includes(t));
  }, [episodes, listTerm]);

  const toPlaying = useCallback(
    (ep: Episode): PlayingEpisode => ({
      episodeKey: ep.episodeKey,
      podcastKey: podcast.podcastKey,
      podcastTitle: podcast.title,
      episodeTitle: ep.title,
      audioUrl: ep.audioUrl,
      artworkUrl: ep.artworkUrl ?? podcast.artworkUrl,
      description: ep.description,
      durationSec: ep.durationSec,
      paid: ep.paid,
    }),
    [podcast],
  );

  // --- phone vs desktop row format: <720px uses the tall card rows ---
  const [isNarrow, setIsNarrow] = useState<boolean>(
    () => typeof window !== "undefined" && window.innerWidth < 720,
  );
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 719px)");
    const onChange = () => setIsNarrow(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  // --- variable row heights: desktops are a fixed 57px; phone cards are
  // as tall as their content. Rendered phone rows measure themselves into
  // `measuredHeights` (keyed by episode), estimates cover the rest. ---
  const [measuredHeights, setMeasuredHeights] = useState<ReadonlyMap<string, number>>(new Map());
  const measuredRef = useRef<ReadonlyMap<string, number>>(measuredHeights);
  const rowEls = useRef(new Map<string, HTMLDivElement>());
  useLayoutEffect(() => {
    if (!isNarrow) return;
    let changed = false;
    const next = new Map(measuredRef.current);
    rowEls.current.forEach((el, key) => {
      const h = el.offsetHeight;
      if (h > 0 && Math.abs((next.get(key) ?? -1) - h) > 1) {
        next.set(key, h);
        changed = true;
      }
    });
    if (changed) {
      measuredRef.current = next;
      setMeasuredHeights(next);
    }
  });

  // Prefix offsets over the variable row heights: rowOffsets[i] is the
  // top edge of row i; the last entry is the total list height.
  const rowOffsets = useMemo(() => {
    const arr: number[] = [0];
    for (const ep of filtered) {
      const h = isNarrow
        ? (measuredHeights.get(ep.episodeKey) ?? estimateMobileRowH(ep))
        : TRACK_ROW_H;
      arr.push((arr[arr.length - 1] ?? 0) + h);
    }
    return arr;
  }, [filtered, isNarrow, measuredHeights]);
  const totalRowH = rowOffsets[rowOffsets.length - 1] ?? 0;

  // --- virtualized track table: only the visible slice is mounted ---
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewH, setViewH] = useState(640);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => setViewH(el.clientHeight || 640);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    setScrollTop(0);
    scrollRef.current?.scrollTo({ top: 0 });
    setSelected(new Set());
  }, [listTerm, target.podcastKey, isNarrow]);
  // One-shot: when the list first loads with the playing episode inside,
  // centre it (stream contract §1.2 — never follow afterwards).
  const scrolledForRef = useRef<string | null>(null);
  useEffect(() => {
    if (!currentKey || episodes.length === 0) return;
    const marker = `${target.podcastKey}:${currentKey}`;
    if (scrolledForRef.current === marker) return;
    const idx = filtered.findIndex((ep) => ep.episodeKey === currentKey);
    if (idx < 0) return;
    scrolledForRef.current = marker;
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = Math.max(0, (rowOffsets[idx] ?? 0) - el.clientHeight / 2);
      setScrollTop(el.scrollTop);
    }
  }, [currentKey, episodes.length, filtered, target.podcastKey, rowOffsets]);

  // Window over the variable offsets: first row whose bottom edge is
  // below scrollTop (binary search), then rows until the viewport plus
  // overscan is covered; ±6 rows of overscan on both sides.
  let startIdx = 0;
  {
    let lo = 0;
    let hi = filtered.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if ((rowOffsets[mid + 1] ?? 0) <= scrollTop) lo = mid + 1;
      else hi = mid;
    }
    startIdx = Math.max(0, lo - 6);
  }
  let endIdx = startIdx;
  while (endIdx < filtered.length && (rowOffsets[endIdx] ?? 0) - scrollTop < viewH) endIdx++;
  endIdx = Math.min(filtered.length, endIdx + 6);
  const slice = filtered.slice(startIdx, endIdx);

  const toggleSelect = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const bulkBookmark = useMutation({
    mutationFn: async (eps: Episode[]) => {
      for (const ep of eps) {
        if (bookmarkKeys.has(ep.episodeKey)) continue;
        await api.toggleBookmark({
          episodeKey: ep.episodeKey,
          podcastKey: podcast.podcastKey,
          podcastTitle: podcast.title,
          episodeTitle: ep.title,
          audioUrl: ep.audioUrl,
          artworkUrl: ep.artworkUrl ?? podcast.artworkUrl,
          description: ep.description,
          publishedAt: ep.publishedAt,
          durationSec: ep.durationSec,
        });
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["bookmarks"] });
      void queryClient.invalidateQueries({ queryKey: ["counts"] });
      setSelected(new Set());
      setMulti(false);
    },
  });

  const selectedEps = filtered.filter((ep) => selected.has(ep.episodeKey));

  return (
    <div className="fixed inset-0 z-40">
      <div aria-hidden className="acr-backdrop absolute inset-0" />
      <div
        className="relative flex h-full flex-col"
        style={{ background: "var(--background)", backdropFilter: "blur(28px) saturate(1.5)", WebkitBackdropFilter: "blur(28px) saturate(1.5)" }}
      >
        {/* --- L2 header: back + cover + title/count + list tools --- */}
        {/* The Muse shell draws its own header (artifact title + back)
            over the top of the page; on phones this in-flow header needs
            clearance beyond the safe-area inset, otherwise the shell's
            back button and this one read as a duplicated pair. */}
        <div
          className="mx-auto w-full max-w-6xl shrink-0 px-3 pt-safe sm:px-5"
          style={isNarrow ? { paddingTop: "calc(env(safe-area-inset-top, 0px) + 52px)" } : undefined}
        >
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2 py-3">
            <button
              type="button"
              onClick={onClose}
              aria-label="返回"
              className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--acr-chip)] text-[var(--foreground)] transition-colors hover:bg-[var(--acr-chip-hover)]"
              style={{ minHeight: 40 }}
            >
              <ChevronLeftIcon size={18} />
            </button>
            <Artwork url={podcast.artworkUrl} title={podcast.title} size={48} rounded={10} />
            <div className="min-w-0">
              <h2 className="font-display truncate text-[17px] font-bold leading-tight text-[var(--foreground)]">
                {podcast.title}
              </h2>
              <p className="text-[12px] text-[var(--muted-foreground)]">
                {detail.isPending ? "正在加载单集…" : `${totalCount} 首`}
                {podcast.source === "lizhi" ? " · 荔枝 FM" : ""}
              </p>
            </div>
            <div className="order-last flex w-full flex-wrap items-center gap-2 min-[720px]:order-none min-[720px]:ml-auto min-[720px]:w-auto">
              <div className="min-w-0 flex-1 min-[720px]:w-52 min-[720px]:flex-none">
                <Searchbar
                  id="episode-list-search"
                  type="search"
                  aria-label="搜索本列表"
                  value={listTerm}
                  onChange={(e) => setListTerm(e.target.value)}
                  onClear={() => setListTerm("")}
                  placeholder="搜索本列表"
                />
              </div>
              <Button
                variant="default"
                size="xl"
                className="px-4"
                disabled={filtered.length === 0}
                onClick={() => {
                  const first = filtered[0];
                  if (first) onPlay(toPlaying(first), filtered.map(toPlaying));
                }}
              >
                <PlayIcon size={13} />
                播放全部
              </Button>
              <Button
                variant={multi ? "default" : "neutral"}
                size="xl"
                aria-pressed={multi}
                className="px-4 backdrop-blur-xl"
                onClick={() => {
                  setMulti(!multi);
                  setSelected(new Set());
                }}
              >
                多选
              </Button>
              <div className="relative">
                <Button
                  variant="neutral"
                  size="xl"
                  aria-label="更多操作"
                  aria-expanded={menuOpen}
                  className="px-3.5 backdrop-blur-xl"
                  onClick={() => setMenuOpen(!menuOpen)}
                >
                  ···
                </Button>
                {menuOpen && (
                  <div className="absolute right-0 top-[calc(100%+6px)] z-20 w-44 rounded-xl bg-[var(--acr-panel)] p-1.5 shadow-[0_0_0_1px_rgba(190,190,190,0.16),0_16px_40px_rgba(0,0,0,0.35)] backdrop-blur-xl">
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 rounded-lg px-3 text-left text-[13px] text-[var(--foreground)] transition-colors hover:bg-[var(--acr-hover)]"
                      style={{ minHeight: 40 }}
                      onClick={() => {
                        favMutation.mutate(podcast);
                        setMenuOpen(false);
                      }}
                    >
                      <HeartIcon size={15} fill={isFav ? "currentColor" : "none"} />
                      {isFav ? "取消收藏节目" : "收藏节目"}
                    </button>
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 rounded-lg px-3 text-left text-[13px] text-[var(--foreground)] transition-colors hover:bg-[var(--acr-hover)]"
                      style={{ minHeight: 40 }}
                      onClick={() => {
                        setShowDesc(!showDesc);
                        setMenuOpen(false);
                      }}
                    >
                      <ListMusicIcon size={15} />
                      {showDesc ? "收起节目简介" : "节目简介"}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {showDesc && podcast.description && (
            <Card className="mb-2 p-4">
              <p className="text-[13px] leading-relaxed text-[var(--foreground)]">{podcast.description}</p>
              <p className="mt-1.5 text-[12px] text-[var(--muted-foreground)]">
                {podcast.author}
                {podcast.genre ? ` · ${podcast.genre}` : ""}
              </p>
            </Card>
          )}

          {multi && (
            <div className="mb-2 flex flex-wrap items-center gap-2 rounded-xl bg-[var(--acr-chip)] px-3 py-2 backdrop-blur-xl">
              <span className="text-[13px] text-[var(--foreground)]">已选 {selected.size} 集</span>
              <Button
                variant="default"
                size="large"
                className="px-3.5"
                disabled={selected.size === 0 || bulkBookmark.isPending}
                onClick={() => bulkBookmark.mutate(selectedEps)}
              >
                {bulkBookmark.isPending ? "加入中…" : "加入稍后再听"}
              </Button>
              <Button
                variant="neutral"
                size="large"
                className="px-3.5"
                disabled={selected.size === 0}
                onClick={() => selectedEps.forEach((ep) => onDownload(toPlaying(ep)))}
              >
                下载所选
              </Button>
              <Button
                variant="ghost"
                size="large"
                className="px-3"
                onClick={() => {
                  setMulti(false);
                  setSelected(new Set());
                }}
              >
                取消多选
              </Button>
            </div>
          )}

          {downloadError && (
            <p role="alert" className="mb-2 text-[13px] text-[var(--destructive)]">
              {downloadError}
            </p>
          )}

          {/* table header — secondary columns collapse on narrow screens */}
          <div
            aria-hidden
            className="hidden items-center gap-3 border-b border-[var(--acr-border)] px-2 pb-1.5 text-[12px] text-[var(--muted-foreground)] min-[720px]:flex"
          >
            <span className="w-8 shrink-0 text-center">#</span>
            <span className="min-w-0 flex-1">标题</span>
            <span className="hidden w-40 shrink-0 truncate min-[900px]:block">专辑</span>
            <span className="w-9 shrink-0 text-center">喜欢</span>
            <span className="w-9 shrink-0" />
            <span className="w-12 shrink-0 text-right">时长</span>
          </div>
        </div>

        {/* --- virtualized track rows --- */}
        <div
          ref={scrollRef}
          className="scrollbar-mac min-h-0 flex-1 overflow-y-auto overscroll-contain"
          onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
        >
          <div
            className="mx-auto w-full max-w-6xl px-3 sm:px-5"
            style={{ paddingBottom: playerActive ? (isNarrow ? 176 : 124) : isNarrow ? 120 : 40 }}
          >
            {detail.isPending && (
              <p className="py-10 text-center text-[13px] text-[var(--muted-foreground)]">正在取单集列表…</p>
            )}
            {detail.data?.error && episodes.length === 0 && (
              <Card className="mt-4 p-6 text-center">
                <p className="text-[13px] text-[var(--muted-foreground)]">{detail.data.error}</p>
                <Button variant="neutral" size="large" onClick={() => void detail.refetch()} className="mt-3">
                  重试
                </Button>
              </Card>
            )}
            {detail.isError && episodes.length === 0 && (
              <Card className="mt-4 p-6 text-center">
                <p className="text-[13px] text-[var(--muted-foreground)]">
                  单集列表没能加载出来，可能是网络慢或来源接口超时。
                </p>
                <Button variant="neutral" size="large" onClick={() => void detail.refetch()} className="mt-3">
                  重试
                </Button>
              </Card>
            )}
            {!detail.isPending && episodes.length > 0 && filtered.length === 0 && (
              <p className="py-10 text-center text-[13px] text-[var(--muted-foreground)]">
                本列表里没有匹配「{listTerm}」的单集。
              </p>
            )}
            {filtered.length > 0 && (
              <div style={{ paddingTop: rowOffsets[startIdx] ?? 0 }}>
                <div style={{ paddingBottom: Math.max(0, totalRowH - (rowOffsets[endIdx] ?? 0)) }}>
                  {slice.map((ep, i) => {
                    const idx = startIdx + i;
                    const prog = progressByKey[ep.episodeKey];
                    const isCurrent = currentKey === ep.episodeKey;
                    const bookmarked = bookmarkKeys.has(ep.episodeKey);
                    const checked = selected.has(ep.episodeKey);
                    // Resume position is never displayed (user: 续播即可，
                    // 不用显示听到几分几分) — playback still seeks to the
                    // saved position via the progress store. Only the
                    // 已听完 status is shown.
                    const progressNote = prog?.completed ? "已听完" : "";
                    const rowActivate = () => {
                      if (multi) toggleSelect(ep.episodeKey);
                      else onPlay(toPlaying(ep), filtered.map(toPlaying));
                    };
                    const rowKeyDown = (e: React.KeyboardEvent) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        rowActivate();
                      }
                    };
                    if (isNarrow) {
                      // Phone format (user's Lizhi reference): card row —
                      // 76px cover, title wraps in full (never truncated),
                      // description excerpt, then a FULL-WIDTH meta row
                      // under everything (duration · date · progress, with
                      // heart/download at the right edge). The meta row is
                      // strictly single-line: every item is nowrap/shrink-0
                      // (the progress note ellipsizes only as a last
                      // resort). Inside the old narrow text column the meta
                      // items could not fit, so the progress note wrapped
                      // character-by-character ("听/到/0:34" stacked
                      // vertically) and the row overflowed its slot.
                      // The row itself is natural height (no fixed slot):
                      // it measures itself into the virtualization offsets
                      // via the ref below, so short cards stay compact and
                      // long titles simply make a taller card.
                      const desc = plainText(ep.description);
                      return (
                        <div
                          key={ep.episodeKey}
                          ref={(el) => {
                            if (el) rowEls.current.set(ep.episodeKey, el);
                            else rowEls.current.delete(ep.episodeKey);
                          }}
                          role="button"
                          tabIndex={0}
                          aria-label={`${multi ? "选择" : "播放"} ${ep.title}`}
                          aria-pressed={multi ? checked : undefined}
                          onClick={rowActivate}
                          onKeyDown={rowKeyDown}
                          className={cn(
                            "flex cursor-pointer flex-col overflow-hidden border-b px-1 py-3",
                            isCurrent
                              ? "border-transparent bg-[var(--primary)] text-[var(--primary-foreground)]"
                              : "border-[var(--acr-border-soft)] text-[var(--foreground)]",
                          )}
                        >
                          <div className="flex items-start gap-3">
                            {multi && (
                              <span
                                aria-hidden
                                className={cn(
                                  "mt-1 flex size-6 shrink-0 items-center justify-center rounded-[7px] border",
                                  checked
                                    ? "border-[var(--primary)] bg-[var(--primary)] text-white"
                                    : "border-[var(--acr-border)] bg-[var(--acr-field)]",
                                )}
                              >
                                {checked && <CheckIcon size={14} />}
                              </span>
                            )}
                            <Artwork url={ep.artworkUrl ?? podcast.artworkUrl} title={ep.title} size={76} rounded={10} />
                            <div className="flex min-w-0 flex-1 flex-col">
                              <div className="flex items-start gap-1.5">
                                <span className="min-w-0 flex-1 break-words text-[16px] font-semibold leading-[1.35]">
                                  {ep.title}
                                </span>
                                {ep.paid && (
                                  <Badge tone="warning" className="mt-0.5 shrink-0">
                                    付费
                                  </Badge>
                                )}
                              </div>
                              {desc && desc !== ep.title && (
                                <p
                                  className={cn(
                                    "mt-1.5 line-clamp-2 break-words text-[13px] leading-[1.5]",
                                    isCurrent ? "text-[var(--primary-foreground)]/85" : "text-[var(--muted-foreground)]",
                                  )}
                                >
                                  {desc}
                                </p>
                              )}
                            </div>
                            {!multi && (
                              <button
                                type="button"
                                aria-label={`${isCurrent && isPlaying ? "暂停" : "播放"} ${ep.title}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onPlay(toPlaying(ep), filtered.map(toPlaying));
                                }}
                                className={cn(
                                  "flex size-12 shrink-0 items-center justify-center self-center rounded-full shadow-sm transition-transform active:scale-95",
                                  isCurrent
                                    ? "bg-white text-[var(--primary)]"
                                    : "bg-[var(--acr-chip)] text-[var(--foreground)]",
                                )}
                                style={{ minHeight: 48 }}
                              >
                                {isCurrent && isPlaying ? (
                                  <PauseIcon size={19} />
                                ) : (
                                  <PlayIcon size={19} className="translate-x-px" />
                                )}
                              </button>
                            )}
                          </div>
                          <div
                            className={cn(
                              "mt-2.5 flex flex-nowrap items-center gap-x-2 text-[12px]",
                              isCurrent ? "text-[var(--primary-foreground)]/85" : "text-[var(--muted-foreground)]",
                            )}
                          >
                            <span className="shrink-0 whitespace-nowrap tabular-nums">{ep.durationSec ? fmtClock(ep.durationSec) : "--:--"}</span>
                            {ep.publishedAt && <span className="shrink-0 whitespace-nowrap">{fmtDate(ep.publishedAt)}</span>}
                            {progressNote && <span className="min-w-0 truncate">· {progressNote}</span>}
                            {offlineKeys.has(ep.episodeKey) && (
                              <span className="flex shrink-0 items-center gap-0.5 whitespace-nowrap">
                                <CheckIcon size={12} />
                                已下载
                              </span>
                            )}
                            <span className="ml-auto flex shrink-0 items-center" onClick={(e) => e.stopPropagation()}>
                              <button
                                type="button"
                                aria-label={bookmarked ? `取消稍后再听 ${ep.title}` : `稍后再听 ${ep.title}`}
                                aria-pressed={bookmarked}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  bookmarkMutation.mutate({ ...ep, podcast });
                                }}
                                className={cn(
                                  "flex size-9 items-center justify-center rounded-full transition-colors",
                                  isCurrent
                                    ? "text-[var(--primary-foreground)] hover:bg-white/15"
                                    : bookmarked
                                      ? "text-[var(--primary)]"
                                      : "text-[var(--muted-foreground)] hover:bg-[var(--acr-hover)]",
                                )}
                                style={{ minHeight: 36 }}
                              >
                                <HeartIcon size={17} fill={bookmarked ? "currentColor" : "none"} />
                              </button>
                              <DownloadBtn
                                title={ep.title}
                                downloaded={offlineKeys.has(ep.episodeKey)}
                                progress={downloadProgress.get(ep.episodeKey)}
                                onDownload={() => onDownload(toPlaying(ep))}
                              />
                            </span>
                          </div>
                        </div>
                      );
                    }
                    return (
                      <div
                        key={ep.episodeKey}
                        role="button"
                        tabIndex={0}
                        aria-label={`${multi ? "选择" : "播放"} ${ep.title}`}
                        aria-pressed={multi ? checked : undefined}
                        onClick={() => {
                          if (multi) toggleSelect(ep.episodeKey);
                          else onPlay(toPlaying(ep), filtered.map(toPlaying));
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            if (multi) toggleSelect(ep.episodeKey);
                            else onPlay(toPlaying(ep), filtered.map(toPlaying));
                          }
                        }}
                        className={cn(
                          "flex cursor-pointer items-center gap-3 border-b px-2",
                          isCurrent
                            ? "border-transparent bg-[var(--primary)] text-[var(--primary-foreground)]"
                            : "border-[var(--acr-border-soft)] text-[var(--foreground)] hover:bg-[var(--acr-hover)]",
                        )}
                        style={{ height: TRACK_ROW_H }}
                      >
                        <span
                          aria-hidden
                          className={cn(
                            "flex w-8 shrink-0 items-center justify-center text-[13px] tabular-nums",
                            isCurrent ? "text-[var(--primary-foreground)]" : "text-[var(--muted-foreground)]",
                          )}
                        >
                          {multi ? (
                            <span
                              className={cn(
                                "flex size-5 items-center justify-center rounded-[6px] border",
                                checked
                                  ? "border-[var(--primary)] bg-[var(--primary)] text-white"
                                  : "border-[var(--acr-border)] bg-[var(--acr-field)]",
                              )}
                            >
                              {checked && <CheckIcon size={13} />}
                            </span>
                          ) : isCurrent ? (
                            isPlaying ? <PauseIcon size={12} /> : <PlayIcon size={12} />
                          ) : (
                            idx + 1
                          )}
                        </span>
                        <Artwork url={ep.artworkUrl ?? podcast.artworkUrl} title={ep.title} size={40} rounded={7} />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5">
                            <span className="truncate text-[14px] font-medium leading-tight">{ep.title}</span>
                            {ep.paid && <Badge tone="warning" className="shrink-0">付费</Badge>}
                            {offlineKeys.has(ep.episodeKey) && (
                              <span className={cn("shrink-0", isCurrent ? "text-[var(--primary-foreground)]" : "text-[var(--acr-green)]")}>
                                <CheckIcon size={13} />
                              </span>
                            )}
                          </span>
                          <span
                            className={cn(
                              "mt-0.5 block truncate text-[11px] leading-tight",
                              isCurrent ? "text-[var(--primary-foreground)]/80" : "text-[var(--muted-foreground)]",
                            )}
                          >
                            {podcast.title}
                            {ep.publishedAt ? ` · ${fmtDate(ep.publishedAt)}` : ""}
                            {prog?.completed ? " · 已听完" : ""}
                          </span>
                        </span>
                        <span
                          className={cn(
                            "hidden w-40 shrink-0 truncate text-[13px] min-[900px]:block",
                            isCurrent ? "text-[var(--primary-foreground)]/85" : "text-[var(--muted-foreground)]",
                          )}
                        >
                          {podcast.title}
                        </span>
                        <span className="flex w-9 shrink-0 items-center justify-center">
                          <button
                            type="button"
                            aria-label={bookmarked ? `取消稍后再听 ${ep.title}` : `稍后再听 ${ep.title}`}
                            aria-pressed={bookmarked}
                            onClick={(e) => {
                              e.stopPropagation();
                              bookmarkMutation.mutate({ ...ep, podcast });
                            }}
                            className={cn(
                              "flex size-9 items-center justify-center rounded-full transition-colors",
                              isCurrent
                                ? "text-[var(--primary-foreground)] hover:bg-white/15"
                                : bookmarked
                                  ? "text-[var(--primary)]"
                                  : "text-[var(--muted-foreground)] hover:bg-[var(--acr-hover)]",
                            )}
                            style={{ minHeight: 36 }}
                          >
                            <HeartIcon size={17} fill={bookmarked ? "currentColor" : "none"} />
                          </button>
                        </span>
                        <span className="flex w-9 shrink-0 items-center justify-center" onClick={(e) => e.stopPropagation()}>
                          <DownloadBtn
                            title={ep.title}
                            downloaded={offlineKeys.has(ep.episodeKey)}
                            progress={downloadProgress.get(ep.episodeKey)}
                            onDownload={() => onDownload(toPlaying(ep))}
                          />
                        </span>
                        <span
                          className={cn(
                            "w-12 shrink-0 text-right text-[13px] tabular-nums",
                            isCurrent ? "text-[var(--primary-foreground)]" : "text-[var(--muted-foreground)]",
                          )}
                        >
                          {ep.durationSec ? fmtClock(ep.durationSec) : "--:--"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- channel cover cards (stream L1 grid) ----------

function CoverImage({ url, title }: { url: string | null; title: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);
  if (!url || failed) {
    return (
      <div
        aria-hidden
        className="flex h-full w-full items-center justify-center font-bold text-white"
        style={{ background: tileColor(title), fontSize: 44 }}
      >
        {title.slice(0, 1) || "播"}
      </div>
    );
  }
  return (
    <img
      src={url}
      alt={`${title} 封面`}
      loading="lazy"
      onError={() => setFailed(true)}
      className="h-full w-full object-cover"
    />
  );
}

function CoverCard({
  podcast,
  badge,
  onOpen,
  onRemove,
}: {
  podcast: Podcast;
  badge?: number;
  onOpen: (p: Podcast) => void;
  onRemove?: (p: Podcast) => void;
}) {
  return (
    <div className="group relative">
      <button
        type="button"
        onClick={() => onOpen(podcast)}
        aria-label={`打开节目 ${podcast.title}`}
        className="relative block aspect-square w-full overflow-hidden rounded-[14px] shadow-[0_8px_24px_rgba(0,0,0,0.22)] transition-transform [transition-timing-function:var(--acr-spring-default)] active:scale-[0.98]"
        style={{ minHeight: 44 }}
      >
        <CoverImage url={podcast.artworkUrl} title={podcast.title} />
        {podcast.source === "lizhi" && (
          <span className="absolute right-2 top-2 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur-sm">
            荔枝 FM
          </span>
        )}
        {podcast.source === "rss" && (
          <span className="absolute right-2 top-2 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur-sm">
            RSS
          </span>
        )}
        <span
          aria-hidden
          className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/35 to-transparent px-2.5 pb-2 pt-8 text-left text-[14px] font-bold leading-snug text-white"
        >
          <span className="line-clamp-2">{podcast.title}</span>
        </span>
        <span
          aria-hidden
          className="absolute inset-0 hidden items-center justify-center bg-black/25 opacity-0 transition-opacity group-hover:flex group-hover:opacity-100"
        >
          <span className="flex size-12 items-center justify-center rounded-full bg-white/90 text-black shadow-lg">
            <PlayIcon size={20} className="translate-x-px" />
          </span>
        </span>
      </button>
      {badge != null && badge > 0 && (
        <span className="absolute -left-1 -top-1 z-10 flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--destructive)] px-1.5 text-[11px] font-bold text-white shadow">
          {badge}
        </span>
      )}
      {onRemove && (
        <button
          type="button"
          aria-label={`取消收藏 ${podcast.title}`}
          onClick={() => onRemove(podcast)}
          className="absolute -right-1 -top-1 z-10 flex size-8 items-center justify-center rounded-full bg-[var(--acr-panel)] text-[var(--foreground)] shadow-[0_0_0_1px_rgba(190,190,190,0.2),0_4px_12px_rgba(0,0,0,0.3)] backdrop-blur-xl transition-colors hover:bg-[var(--acr-surface-hover)]"
          style={{ minHeight: 32 }}
        >
          <XIcon size={14} />
        </button>
      )}
    </div>
  );
}

function PodcastGrid({
  podcasts,
  badges,
  onOpen,
  onRemove,
}: {
  podcasts: Podcast[];
  badges?: Map<string, number>;
  onOpen: (p: Podcast) => void;
  onRemove?: (p: Podcast) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 min-[560px]:grid-cols-3 min-[900px]:grid-cols-4 min-[1200px]:grid-cols-5">
      {podcasts.map((p) => (
        <CoverCard
          key={p.podcastKey}
          podcast={p}
          badge={badges?.get(p.podcastKey)}
          onOpen={onOpen}
          onRemove={onRemove}
        />
      ))}
    </div>
  );
}

// ---------- main app ----------

const SPEEDS = [1, 1.25, 1.5, 2, 0.75];

export function App() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("discover");
  const [country] = useState<Country>("CN");
  const [term, setTerm] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [detailTarget, setDetailTarget] = useState<Podcast | null>(null);

  // Phone vs wide layout (<720px): the floating dock exists only on phones
  // and the player capsule floats higher there, so page bottom clearance
  // is computed per branch instead of one padded constant for both.
  const [isNarrow, setIsNarrow] = useState<boolean>(
    () => typeof window !== "undefined" && window.innerWidth < 720,
  );
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 719px)");
    const onChange = () => setIsNarrow(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // player state
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [nowPlaying, setNowPlaying] = useState<PlayingEpisode | null>(null);
  const [queue, setQueue] = useState<PlayingEpisode[]>([]);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speedIdx, setSpeedIdx] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [playerError, setPlayerError] = useState<string | null>(null);
  const [playerNotice, setPlayerNotice] = useState<string | null>(null);
  const nowRef = useRef<PlayingEpisode | null>(null);
  const posRef = useRef(0);
  const durRef = useRef(0);
  const pendingSeekRef = useRef<number | null>(null);

  // byte-ladder playback state: ordered candidate URLs for the current track
  const candidatesRef = useRef<string[]>([]);
  const candidateIdxRef = useRef(0);
  const warmRetriedRef = useRef(false);
  const objectUrlRef = useRef<string | null>(null);

  // offline (on-device) state
  const [offlineList, setOfflineList] = useState<OfflineMeta[]>([]);
  const [downloadProgress, setDownloadProgress] = useState<Map<string, number | null>>(new Map());
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const offlineKeys = new Set(offlineList.map((m) => m.episodeKey));

  // sleep timer state
  const [sleepMode, setSleepMode] = useState<SleepTimerMode>("off");
  const [sleepRemaining, setSleepRemaining] = useState<number | null>(null);
  const sleepDeadlineRef = useRef<number | null>(null);
  const sleepModeRef = useRef<SleepTimerMode>("off");
  sleepModeRef.current = sleepMode;

  const counts = useQuery({ queryKey: ["counts"], queryFn: () => api.getLibraryCounts({}) });
  const favorites = useQuery({ queryKey: ["favorites"], queryFn: () => api.listFavorites({}) });
  const bookmarks = useQuery({ queryKey: ["bookmarks"], queryFn: () => api.listBookmarks({}) });
  const progress = useQuery({ queryKey: ["progress"], queryFn: () => api.listProgress({}) });
  const discover = useQuery({
    queryKey: ["discover", country],
    queryFn: () => api.getDiscover({ country }),
    enabled: submitted === "",
  });
  const search = useQuery({
    queryKey: ["search", submitted, country],
    queryFn: () => api.searchPodcasts({ term: submitted, country }),
    enabled: submitted !== "",
  });

  const favoriteKeys = new Set(counts.data?.favoriteKeys ?? []);
  const bookmarkKeys = new Set(counts.data?.bookmarkKeys ?? []);
  const progressByKey: ProgressMap = progress.data?.progressByKey ?? {};
  const inProgress = progress.data?.inProgress ?? [];
  const finished = progress.data?.finished ?? [];

  const refreshOffline = useCallback(async () => {
    try {
      setOfflineList(await listOfflineMeta());
    } catch {
      setOfflineList([]);
    }
  }, []);

  useEffect(() => {
    void refreshOffline();
  }, [refreshOffline]);

  const saveProgressNow = useCallback(async (completed = false) => {
    const np = nowRef.current;
    if (!np) return;
    const dur = durRef.current || np.durationSec || 0;
    const pos = posRef.current;
    const done = completed || (dur > 0 && pos >= dur - 5);
    try {
      await api.saveProgress({
        episodeKey: np.episodeKey,
        podcastKey: np.podcastKey,
        podcastTitle: np.podcastTitle,
        episodeTitle: np.episodeTitle,
        audioUrl: np.audioUrl,
        artworkUrl: np.artworkUrl,
        positionSec: pos,
        durationSec: dur,
        completed: done,
      });
      void queryClient.invalidateQueries({ queryKey: ["progress"] });
    } catch {
      // Progress saving is best-effort; playback continues regardless.
    }
  }, [queryClient]);

  const playEpisode = useCallback(
    (ep: PlayingEpisode, startAt?: number, context?: PlayingEpisode[]) => {
      const audio = audioRef.current;
      if (nowRef.current?.episodeKey === ep.episodeKey && audio) {
        if (audio.paused) void audio.play().catch(() => setPlayerError("播放失败，音频源可能不可用"));
        else audio.pause();
        return;
      }
      void saveProgressNow();
      if (context && context.length > 0) setQueue(context);
      else setQueue([ep]);
      const saved = progressByKey[ep.episodeKey];
      let start = startAt;
      if (start == null && saved && !saved.completed && saved.positionSec > 5) {
        start = saved.durationSec > 0 && saved.positionSec >= saved.durationSec - 15 ? 0 : saved.positionSec;
      }
      pendingSeekRef.current = start && start > 0 ? start : null;
      nowRef.current = ep;
      setNowPlaying(ep);
      setPlayerError(null);
      setPlayerNotice(null);
      setPosition(start && start > 0 ? start : 0);
      setDuration(ep.durationSec ?? 0);
      posRef.current = start && start > 0 ? start : 0;
      durRef.current = ep.durationSec ?? 0;
    },
    [progressByKey, saveProgressNow],
  );

  // queue neighbours for the player's prev/next transport
  const queueIdx = nowPlaying ? queue.findIndex((q) => q.episodeKey === nowPlaying.episodeKey) : -1;
  const prevEp = queueIdx > 0 ? queue[queueIdx - 1] : undefined;
  const nextEp = queueIdx >= 0 && queueIdx < queue.length - 1 ? queue[queueIdx + 1] : undefined;

  // Load new source + autoplay when the episode changes. The URL is always
  // resolved at play time through the byte ladder — never the stored raw
  // link: on-device offline copy first, then the server archive, then the
  // serving-policy candidate hosts, with the origin URL as final fallback.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !nowPlaying) return;
    let cancelled = false;
    const ep = nowPlaying;
    const startPlayback = async () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
      candidatesRef.current = [];
      candidateIdxRef.current = 0;
      warmRetriedRef.current = false;
      // Tier 0 (device): an on-device offline copy plays with no network.
      try {
        const blob = await getOfflineBlob(ep.episodeKey);
        if (cancelled) return;
        if (blob) {
          const objUrl = URL.createObjectURL(blob);
          objectUrlRef.current = objUrl;
          candidatesRef.current = [objUrl];
          audio.src = objUrl;
          audio.playbackRate = SPEEDS[speedIdx] ?? 1;
          void audio.play().catch(() => {
            if (!cancelled) {
              setPlaying(false);
              setPlayerError("本地离线副本没能播放，可以删掉重新下载。");
            }
          });
          return;
        }
      } catch {
        // IndexedDB unavailable — fall through to the network ladder.
      }
      // Tiers 1/3/4 via the server resolver.
      let src = ep.audioUrl;
      let candidates = [ep.audioUrl];
      try {
        const resolved = await api.resolvePlayback({ episodeKey: ep.episodeKey, audioUrl: ep.audioUrl });
        src = resolved.src;
        candidates = resolved.candidates.length > 0 ? resolved.candidates : [src];
      } catch {
        // Resolver unreachable — fall back to the origin URL directly.
      }
      if (cancelled) return;
      candidatesRef.current = candidates;
      audio.src = src;
      audio.playbackRate = SPEEDS[speedIdx] ?? 1;
      void audio.play().catch(() => {
        if (!cancelled) {
          setPlaying(false);
          setPlayerError("这集音频没能开始播放，可能是音频源暂时不可用，可以换一集或稍后再试。");
        }
      });
    };
    void startPlayback();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nowPlaying?.episodeKey]);

  // Periodic progress save while playing
  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => void saveProgressNow(), 12000);
    return () => clearInterval(t);
  }, [playing, saveProgressNow]);

  // Sleep timer countdown: ticks once a second while a deadline is armed;
  // at zero it pauses playback and disarms. Switching tracks keeps the timer.
  useEffect(() => {
    if (sleepRemaining == null) return;
    const t = setInterval(() => {
      const deadline = sleepDeadlineRef.current;
      if (deadline == null) return;
      const left = Math.max(0, Math.round((deadline - Date.now()) / 1000));
      setSleepRemaining(left);
      if (left <= 0) {
        clearInterval(t);
        sleepDeadlineRef.current = null;
        setSleepRemaining(null);
        setSleepMode("off");
        audioRef.current?.pause();
        setPlayerNotice("定时关闭：时间到，已停止播放。");
      }
    }, 1000);
    return () => clearInterval(t);
  }, [sleepRemaining != null]);

  const setSleepTimer = (mode: SleepTimerMode) => {
    setSleepMode(mode);
    if (mode === "off" || mode === "episode") {
      sleepDeadlineRef.current = null;
      setSleepRemaining(null);
      return;
    }
    const mins = Number(mode);
    sleepDeadlineRef.current = Date.now() + mins * 60 * 1000;
    setSleepRemaining(mins * 60);
  };

  // Offline download: the server first pulls the bytes through the ladder
  // into its archive (tier 1), then this device pulls the blob into
  // IndexedDB. Progress: null = server preparing, number = on-device pull %.
  const startDownload = useCallback(
    async (ep: PlayingEpisode) => {
      setDownloadError(null);
      setDownloadProgress((prev) => new Map(prev).set(ep.episodeKey, null));
      try {
        const prepared = await api.prepareDownload({
          episodeKey: ep.episodeKey,
          podcastKey: ep.podcastKey,
          podcastTitle: ep.podcastTitle,
          episodeTitle: ep.episodeTitle,
          audioUrl: ep.audioUrl,
          artworkUrl: ep.artworkUrl,
          durationSec: ep.durationSec ?? null,
        });
        if (!prepared.ok || !prepared.fetchUrl) {
          throw new Error(prepared.error ?? "下载备料失败");
        }
        setDownloadProgress((prev) => new Map(prev).set(ep.episodeKey, 0));
        const res = await fetch(prepared.fetchUrl);
        if (!res.ok) throw new Error(`拉取音频失败（${res.status}）`);
        let blob: Blob;
        const total = Number(res.headers.get("content-length") ?? 0) || prepared.sizeBytes;
        if (res.body && typeof res.body.getReader === "function") {
          const reader = res.body.getReader();
          const chunks: BlobPart[] = [];
          let received = 0;
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) {
              chunks.push(value as BlobPart);
              received += value.byteLength;
              if (total > 0) {
                const pct = Math.min(100, (received / total) * 100);
                setDownloadProgress((prev) => new Map(prev).set(ep.episodeKey, pct));
              }
            }
          }
          blob = new Blob(chunks, { type: res.headers.get("content-type") ?? "audio/mpeg" });
        } else {
          blob = await res.blob();
        }
        await putOfflineEpisode(
          {
            episodeKey: ep.episodeKey,
            podcastKey: ep.podcastKey,
            podcastTitle: ep.podcastTitle,
            episodeTitle: ep.episodeTitle,
            audioUrl: ep.audioUrl,
            artworkUrl: ep.artworkUrl,
            durationSec: ep.durationSec ?? null,
            sizeBytes: blob.size,
            downloadedAt: Date.now(),
          },
          blob,
        );
        await refreshOffline();
      } catch (err) {
        setDownloadError(
          err instanceof Error ? `「${ep.episodeTitle}」下载失败：${err.message}` : `「${ep.episodeTitle}」下载失败`,
        );
      } finally {
        setDownloadProgress((prev) => {
          const next = new Map(prev);
          next.delete(ep.episodeKey);
          return next;
        });
      }
    },
    [refreshOffline],
  );

  const deleteOffline = useCallback(
    async (meta: OfflineMeta) => {
      await removeOfflineEpisode(meta.episodeKey).catch(() => undefined);
      void api.removeArchive({ episodeKey: meta.episodeKey }).catch(() => undefined);
      await refreshOffline();
    },
    [refreshOffline],
  );

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio || !nowPlaying) return;
    if (audio.paused) void audio.play().catch(() => setPlayerError("播放失败，音频源可能不可用"));
    else audio.pause();
  };

  const seekBy = (delta: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    const max = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : Infinity;
    audio.currentTime = Math.max(0, Math.min(max, audio.currentTime + delta));
  };

  const seekTo = (sec: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = sec;
    posRef.current = sec;
    setPosition(sec);
  };

  const cycleSpeed = () => {
    const next = (speedIdx + 1) % SPEEDS.length;
    setSpeedIdx(next);
    if (audioRef.current) audioRef.current.playbackRate = SPEEDS[next] ?? 1;
  };

  const openPodcast = (p: Podcast) => {
    setDetailTarget(p);
    if (favoriteKeys.has(p.podcastKey)) {
      void api.markPodcastSeen({ podcastKey: p.podcastKey }).then(() => {
        void queryClient.invalidateQueries({ queryKey: ["favorites"] });
        void queryClient.invalidateQueries({ queryKey: ["counts"] });
      });
    }
  };

  const refreshMutation = useMutation({
    mutationFn: async () => api.refreshSubscriptions({}),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["favorites"] });
      void queryClient.invalidateQueries({ queryKey: ["counts"] });
    },
  });

  const rssMutation = useMutation({
    mutationFn: async (feedUrl: string) => api.addRssPodcast({ feedUrl }),
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ["favorites"] });
      void queryClient.invalidateQueries({ queryKey: ["counts"] });
      if (data.podcast) {
        setRssUrl("");
        openPodcast(data.podcast);
      }
    },
  });
  const [rssUrl, setRssUrl] = useState("");

  const lizhiMutation = useMutation({
    mutationFn: async (input: string) => api.addLizhiPodcast({ userIdOrUrl: input }),
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ["favorites"] });
      void queryClient.invalidateQueries({ queryKey: ["counts"] });
      if (data.podcast) {
        setLizhiInput("");
        openPodcast(data.podcast);
      }
    },
  });
  const [lizhiInput, setLizhiInput] = useState("");

  const favRemove = useMutation({
    mutationFn: async (p: Podcast) => api.toggleFavorite({ podcast: p }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["favorites"] });
      void queryClient.invalidateQueries({ queryKey: ["counts"] });
    },
  });

  const bookmarkRemove = useMutation({
    mutationFn: async (b: Bookmark) =>
      api.toggleBookmark({
        episodeKey: b.episodeKey,
        podcastTitle: b.podcastTitle,
        episodeTitle: b.episodeTitle,
        audioUrl: b.audioUrl,
        artworkUrl: b.artworkUrl,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["bookmarks"] });
      void queryClient.invalidateQueries({ queryKey: ["counts"] });
    },
  });

  const showSearch = submitted !== "";
  const listPodcasts = showSearch ? search.data?.podcasts ?? [] : discover.data?.podcasts ?? [];
  const listLoading = showSearch ? search.isPending : discover.isPending;
  const listError = showSearch ? search.data?.error : discover.data?.error;

  // Bottom clearance for the fixed chrome, measured from the actual
  // geometry: phone dock ≈ 66px + 10px float gap; the phone player is the
  // mini chip ≈ 56px (wide screens keep the ≈ 68px capsule), floating at
  // bottom 84px on phones (above the dock) and 12px on wide screens.
  // (Previously a flat 190/72 plus a separate 76px spacer div
  // double-counted the dock, leaving a ~150–265px void under the content
  // on phones — the "上下间距不对" report.)
  let bottomPad = isNarrow ? 92 : 64;
  if (nowPlaying) bottomPad = isNarrow ? (expanded ? 468 : 184) : expanded ? 400 : 124;
  const [queueOpen, setQueueOpen] = useState(false);
  const seekPct = duration > 0 ? Math.min(100, (position / duration) * 100) : 0;

  return (
    <div className="relative min-h-screen text-[var(--foreground)]">
      {/* Acrylic Backdrop + frosted veil */}
      <div aria-hidden className="acr-backdrop fixed inset-0" />
      <div
        aria-hidden
        className="fixed inset-0"
        style={{ background: "var(--background)", backdropFilter: "blur(30px) saturate(1.5)", WebkitBackdropFilter: "blur(30px) saturate(1.5)" }}
      />

      <audio
        ref={audioRef}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => {
          setPlaying(false);
          void saveProgressNow();
        }}
        onTimeUpdate={(e) => {
          const t = e.currentTarget.currentTime;
          posRef.current = t;
          setPosition(t);
        }}
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration;
          if (Number.isFinite(d) && d > 0) {
            durRef.current = d;
            setDuration(d);
          }
          if (pendingSeekRef.current != null) {
            e.currentTarget.currentTime = pendingSeekRef.current;
            pendingSeekRef.current = null;
          }
        }}
        onEnded={() => {
          setPlaying(false);
          void saveProgressNow(true);
          // Sleep timer "播完本集": stop here instead of advancing.
          if (sleepModeRef.current === "episode") {
            setSleepRemaining(null);
            sleepDeadlineRef.current = null;
            setPlayerNotice("定时关闭：本集播完，已停止播放。");
            return;
          }
          // Auto-advance along the queue the user is looking at.
          const np = nowRef.current;
          if (!np) return;
          const idx = queue.findIndex((q) => q.episodeKey === np.episodeKey);
          const next = idx >= 0 ? queue[idx + 1] : undefined;
          if (next) playEpisode(next, 0, queue);
        }}
        onError={(e) => {
          const audio = e.currentTarget;
          if (!nowRef.current) return;
          // Ignore errors from an empty src (initial mount / track switch).
          if (!audio.src) return;
          const candidates = candidatesRef.current;
          const mediaErr = audio.error;
          // MEDIA_ERR_SRC_NOT_SUPPORTED (4) on a policy host usually means a
          // cold CDN object: one warm-up retry of the same URL, then rotate
          // to the next candidate host (recipe rule: 403 is about object
          // temperature, not the UA).
          if (
            mediaErr?.code === 4 &&
            !warmRetriedRef.current &&
            candidates.length > 0 &&
            !audio.src.startsWith("blob:")
          ) {
            warmRetriedRef.current = true;
            const resumeAt = posRef.current;
            setTimeout(() => {
              if (!nowRef.current) return;
              audio.src = candidates[candidateIdxRef.current] ?? nowRef.current.audioUrl;
              audio.load();
              if (resumeAt > 0) pendingSeekRef.current = resumeAt;
              void audio.play().catch(() => undefined);
            }, 1200);
            return;
          }
          const nextIdx = candidateIdxRef.current + 1;
          if (nextIdx < candidates.length) {
            candidateIdxRef.current = nextIdx;
            warmRetriedRef.current = false;
            const resumeAt = posRef.current;
            audio.src = candidates[nextIdx] as string;
            audio.load();
            if (resumeAt > 0) pendingSeekRef.current = resumeAt;
            void audio.play().catch(() => undefined);
            return;
          }
          setPlaying(false);
          setPlayerError(
            mediaErr?.code === 4
              ? "音频源拒绝了播放（源站 403/格式不支持），所有候选线路都试过了，可以稍后再试或先下载。"
              : "音频加载失败，可能是音频源暂时不可用。",
          );
        }}
      />

      {/* Stream-style page chrome: title + global search, then underline tabs */}
      <header className="relative mx-auto w-full max-w-6xl px-3 pt-safe sm:px-5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 pt-3">
          <form
            className="order-last flex w-full items-center gap-2 min-[720px]:order-none min-[720px]:ml-auto min-[720px]:w-auto min-[720px]:flex-1 min-[720px]:max-w-md"
            onSubmit={(e) => {
              e.preventDefault();
              setSubmitted(term.trim());
              setTab("discover");
            }}
          >
            <div className="min-w-0 flex-1">
              <Searchbar
                id="podcast-search"
                type="search"
                aria-label="搜索播客"
                value={term}
                onChange={(e) => {
                  setTerm(e.target.value);
                  if (e.target.value.trim() === "") setSubmitted("");
                }}
                onClear={() => {
                  setTerm("");
                  setSubmitted("");
                }}
                placeholder="搜索播客 / 主播"
              />
            </div>
          </form>
        </div>
        <nav aria-label="主导航" className="mt-2 hidden items-center gap-1 overflow-x-auto border-b border-[var(--acr-border)] min-[720px]:flex">
          {(
            [
              { key: "discover", label: "内容" },
              { key: "library", label: "收藏", badge: counts.data?.newEpisodeTotal ?? 0 },
              { key: "later", label: "稍后再听", badge: 0 },
            ] as Array<{ key: Tab; label: string; badge?: number }>
          ).map((t) => {
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                aria-label={t.label}
                aria-current={active ? "page" : undefined}
                onClick={() => setTab(t.key)}
                className={cn(
                  "relative shrink-0 px-3.5 pb-2.5 pt-1.5 text-[15px] transition-colors",
                  active ? "font-semibold text-[var(--primary)]" : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]",
                )}
                style={{ minHeight: 44 }}
              >
                {t.label}
                {t.badge != null && t.badge > 0 && (
                  <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--destructive)] px-1 text-[10px] font-bold text-white">
                    {t.badge}
                  </span>
                )}
                {active && <span aria-hidden className="absolute inset-x-2.5 -bottom-px h-[2.5px] rounded-full bg-[var(--primary)]" />}
              </button>
            );
          })}
        </nav>
      </header>

      <main className="relative mx-auto w-full max-w-6xl px-3 sm:px-5" style={{ paddingBottom: bottomPad }}>
        {tab === "discover" && (
          <section>
            {inProgress.length > 0 && !showSearch && (
              <div className="pt-4">
                <h2 className="text-[17px] font-semibold [letter-spacing:var(--text-title2-tracking)]">继续收听</h2>
                <Card className="mt-2 p-2">
                  <ItemGroup className="gap-1">
                    {inProgress.slice(0, 1).map((item: InProgress) => {
                      const pct = item.durationSec > 0 ? Math.round((item.positionSec / item.durationSec) * 100) : 0;
                      return (
                        <button
                          key={item.episodeKey}
                          type="button"
                          aria-label={`继续收听 ${item.episodeTitle}`}
                          onClick={() =>
                            playEpisode(
                              {
                                episodeKey: item.episodeKey,
                                podcastKey: item.podcastKey,
                                podcastTitle: item.podcastTitle,
                                episodeTitle: item.episodeTitle,
                                audioUrl: item.audioUrl,
                                artworkUrl: item.artworkUrl,
                                description: null,
                                durationSec: item.durationSec || null,
                              },
                              item.positionSec,
                            )
                          }
                          className="block w-full rounded-[10px] text-left transition-colors hover:bg-[var(--acr-hover)]"
                          style={{ minHeight: 64 }}
                        >
                          <Item className="bg-transparent">
                            <ItemMedia variant="image">
                              <Artwork url={item.artworkUrl} title={item.podcastTitle} size={48} rounded={8} />
                            </ItemMedia>
                            <ItemContent>
                              <ItemTitle>{item.episodeTitle}</ItemTitle>
                              <ItemDescription className="line-clamp-1">
                                {item.podcastTitle} · {timeAgo(item.updatedAt)}
                              </ItemDescription>
                            </ItemContent>
                            <span
                              aria-hidden
                              className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--acr-chip)] text-[var(--foreground)]"
                            >
                              <PlayIcon size={15} className="translate-x-px" />
                            </span>
                            <ItemFooter>
                              <ProgressRail pct={pct} />
                            </ItemFooter>
                          </Item>
                        </button>
                      );
                    })}
                  </ItemGroup>
                </Card>
              </div>
            )}

            {!showSearch && (favorites.data?.favorites.length ?? 0) > 0 && (
              <div className="pt-4">
                <h2 className="text-[17px] font-semibold [letter-spacing:var(--text-title2-tracking)]">我的收藏</h2>
                <div className="mt-2.5">
                  <PodcastGrid
                    podcasts={favorites.data?.favorites ?? []}
                    badges={new Map((favorites.data?.favorites ?? []).map((f) => [f.podcastKey, f.newCount]))}
                    onOpen={openPodcast}
                  />
                </div>
              </div>
            )}

            <h2 className="mt-6 text-[17px] font-semibold [letter-spacing:var(--text-title2-tracking)]">
              {showSearch ? `“${submitted}”的搜索结果` : "播客"}
              {!showSearch && (
                <span className="ml-2 text-[12px] font-normal text-[var(--muted-foreground)]">
                  {country === "CN" ? "热门榜 · 中国区" : "热门榜 · 美国区"}
                </span>
              )}
            </h2>
            {listLoading && <p className="py-8 text-center text-[13px] text-[var(--muted-foreground)]">加载中…</p>}
            {listError && listPodcasts.length === 0 && (
              <Card className="mt-3 p-6 text-center">
                <p className="text-[13px] text-[var(--muted-foreground)]">榜单暂时取不到（{listError}）</p>
                <Button
                  variant="neutral"
                  size="large"
                  onClick={() => void (showSearch ? search.refetch() : discover.refetch())}
                  className="mt-3"
                >
                  重试
                </Button>
              </Card>
            )}
            {!listLoading && !listError && listPodcasts.length === 0 && (
              <p className="py-8 text-center text-[13px] text-[var(--muted-foreground)]">没有找到相关播客，换个词试试。</p>
            )}
            <div className="mt-3">
              <PodcastGrid podcasts={listPodcasts} onOpen={openPodcast} />
            </div>
          </section>
        )}

        {tab === "library" && (
          <section className="pt-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 text-[22px] font-bold [letter-spacing:var(--text-title1-tracking)]">
                我的收藏
                {counts.data && counts.data.newEpisodeTotal > 0 && (
                  <Badge tone="destructive">{counts.data.newEpisodeTotal} 集更新</Badge>
                )}
              </h2>
              <Button
                variant="neutral"
                size="large"
                onClick={() => refreshMutation.mutate()}
                disabled={refreshMutation.isPending}
                className="backdrop-blur-xl"
              >
                <RefreshIcon size={13} />
                {refreshMutation.isPending ? "检查中…" : "检查更新"}
              </Button>
            </div>
            {favorites.data?.lastRefreshedAt && (
              <p className="mt-1 text-[11px] text-[var(--muted-foreground)]">
                上次检查：{timeAgo(favorites.data.lastRefreshedAt)}
              </p>
            )}
            {refreshMutation.data && (
              <p className="mt-1 text-[11px] text-[var(--primary)]">
                刚检查了 {refreshMutation.data.checked} 个节目，
                {refreshMutation.data.newEpisodes > 0
                  ? `有 ${refreshMutation.data.newEpisodes} 集新内容`
                  : "暂时没有新单集"}
              </p>
            )}

            {favorites.isPending && <p className="py-8 text-center text-[13px] text-[var(--muted-foreground)]">加载中…</p>}
            {favorites.data && favorites.data.favorites.length === 0 && (
              <Card className="mt-4 p-8 text-center">
                <p className="text-[13px] text-[var(--muted-foreground)]">还没有收藏的节目。</p>
                <p className="mt-1 text-[13px] text-[var(--muted-foreground)]">去内容页点开一个节目，在节目页右上角「···」菜单里点“收藏节目”就会出现在这里。</p>
                <Button variant="default" size="xl" onClick={() => setTab("discover")} className="mt-4 px-6">
                  去发现
                </Button>
              </Card>
            )}
            <div className="mt-3">
              <PodcastGrid
                podcasts={favorites.data?.favorites ?? []}
                badges={new Map((favorites.data?.favorites ?? []).map((f) => [f.podcastKey, f.newCount]))}
                onOpen={openPodcast}
                onRemove={(f) => favRemove.mutate(f)}
              />
            </div>

            <div className="mt-8">
              <h3 className="text-[17px] font-semibold [letter-spacing:var(--text-title2-tracking)]">添加订阅</h3>
              <p className="mt-1 text-[12px] text-[var(--muted-foreground)]">不在苹果播客里的节目，可以用 RSS 地址或荔枝 FM 用户直接订阅。</p>

              <Card className="mt-3 p-4">
                <h4 className="flex items-center gap-1.5 text-[13px] font-semibold">
                  <ListMusicIcon size={14} className="text-[var(--muted-foreground)]" />
                  用 RSS 地址订阅
                </h4>
                <p className="mt-1 text-[12px] leading-relaxed text-[var(--muted-foreground)]">
                  把节目的 RSS 地址粘进来就能订阅和收听。
                </p>
                <form
                  className="mt-3 flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const u = rssUrl.trim();
                    if (u) rssMutation.mutate(u);
                  }}
                >
                  <label htmlFor="rss-url" className="sr-only">RSS 地址</label>
                  <input
                    id="rss-url"
                    type="url"
                    inputMode="url"
                    value={rssUrl}
                    onChange={(e) => setRssUrl(e.target.value)}
                    placeholder="https://…/feed.xml"
                    className="h-11 min-w-0 flex-1 rounded-[10px] border border-[var(--acr-input-border)] bg-[var(--acr-input)] px-3 text-[13px] text-[var(--foreground)] outline-none backdrop-blur-xl placeholder:text-[var(--muted-foreground)] focus:border-[var(--ring)] focus:ring-[3px] focus:ring-[var(--ring)]/25"
                    style={{ minHeight: 44 }}
                  />
                  <Button type="submit" variant="default" size="xl" disabled={rssMutation.isPending} className="px-4">
                    {rssMutation.isPending ? "订阅中…" : "订阅"}
                  </Button>
                </form>
                {rssMutation.data?.error && (
                  <p className="mt-2 text-[13px] text-[var(--destructive)]">{rssMutation.data.error}</p>
                )}
              </Card>

              <Card className="mt-4 p-4">
                <h4 className="flex items-center gap-1.5 text-[13px] font-semibold">
                  <ListMusicIcon size={14} className="text-[var(--muted-foreground)]" />
                  订阅荔枝 FM 用户
                </h4>
                <p className="mt-1 text-[12px] leading-relaxed text-[var(--muted-foreground)]">
                  粘贴荔枝用户主页地址（lizhi.fm/user/数字）或直接填用户 id，就能订阅 TA 的全部音频。数据走荔枝 App 的 vodapi 采集，播放走候选 CDN 线路自动切换。
                </p>
                <form
                  className="mt-3 flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const u = lizhiInput.trim();
                    if (u) lizhiMutation.mutate(u);
                  }}
                >
                  <label htmlFor="lizhi-user" className="sr-only">荔枝用户主页地址或 id</label>
                  <input
                    id="lizhi-user"
                    type="text"
                    inputMode="url"
                    value={lizhiInput}
                    onChange={(e) => setLizhiInput(e.target.value)}
                    placeholder="https://www.lizhi.fm/user/… 或数字 id"
                    className="h-11 min-w-0 flex-1 rounded-[10px] border border-[var(--acr-input-border)] bg-[var(--acr-input)] px-3 text-[13px] text-[var(--foreground)] outline-none backdrop-blur-xl placeholder:text-[var(--muted-foreground)] focus:border-[var(--ring)] focus:ring-[3px] focus:ring-[var(--ring)]/25"
                    style={{ minHeight: 44 }}
                  />
                  <Button type="submit" variant="default" size="xl" disabled={lizhiMutation.isPending} className="px-4">
                    {lizhiMutation.isPending ? "订阅中…" : "订阅"}
                  </Button>
                </form>
                {lizhiMutation.data?.error && (
                  <p className="mt-2 text-[13px] text-[var(--destructive)]">{lizhiMutation.data.error}</p>
                )}
              </Card>
            </div>
          </section>
        )}

        {tab === "later" && (
          <section className="pt-4">
            <h2 className="text-[22px] font-bold [letter-spacing:var(--text-title1-tracking)]">稍后再听</h2>
            {bookmarks.isPending && <p className="py-8 text-center text-[13px] text-[var(--muted-foreground)]">加载中…</p>}
            {bookmarks.data && bookmarks.data.bookmarks.length === 0 && (
              <Card className="mt-4 p-8 text-center">
                <p className="text-[13px] text-[var(--muted-foreground)]">还没有存下的单集。</p>
                <p className="mt-1 text-[13px] text-[var(--muted-foreground)]">在节目单集列表里点书签图标，想稍后听的单集就会存到这里。</p>
              </Card>
            )}
            <ItemGroup className="mt-3">
              {(bookmarks.data?.bookmarks ?? []).map((b: Bookmark) => {
                const prog = progressByKey[b.episodeKey];
                const isCurrent = nowPlaying?.episodeKey === b.episodeKey;
                const pct =
                  prog && prog.durationSec > 0
                    ? Math.min(100, Math.round((prog.positionSec / prog.durationSec) * 100))
                    : 0;
                const context: PlayingEpisode[] = (bookmarks.data?.bookmarks ?? []).map((x) => ({
                  episodeKey: x.episodeKey,
                  podcastKey: x.podcastKey,
                  podcastTitle: x.podcastTitle,
                  episodeTitle: x.episodeTitle,
                  audioUrl: x.audioUrl,
                  artworkUrl: x.artworkUrl,
                  description: null,
                  durationSec: x.durationSec,
                }));
                return (
                  <Item key={b.episodeKey} variant="outline" selected={isCurrent}>
                    <PlayRoundBtn
                      label={`播放 ${b.episodeTitle}`}
                      isCurrent={isCurrent}
                      isPlaying={isCurrent && playing}
                      onClick={() =>
                        playEpisode(
                          {
                            episodeKey: b.episodeKey,
                            podcastKey: b.podcastKey,
                            podcastTitle: b.podcastTitle,
                            episodeTitle: b.episodeTitle,
                            audioUrl: b.audioUrl,
                            artworkUrl: b.artworkUrl,
                            description: null,
                            durationSec: b.durationSec,
                          },
                          undefined,
                          context,
                        )
                      }
                    />
                    <ItemContent>
                      <ItemTitle>{b.episodeTitle}</ItemTitle>
                      <p className="mt-0.5 text-[11px] leading-snug text-[var(--muted-foreground)] group-data-[selected=true]/item:text-[var(--primary-foreground)]/80">
                        {b.podcastTitle}
                        {b.publishedAt ? ` · ${fmtDate(b.publishedAt)}` : ""}
                        {b.durationSec ? ` · ${fmtClock(b.durationSec)}` : ""}
                        {prog?.completed ? " · 已听完" : ""}
                        {offlineKeys.has(b.episodeKey) ? " · 已下载" : ""}
                      </p>
                    </ItemContent>
                    <ItemActions>
                      <DownloadBtn
                        title={b.episodeTitle}
                        downloaded={offlineKeys.has(b.episodeKey)}
                        progress={downloadProgress.get(b.episodeKey)}
                        onDownload={() =>
                          void startDownload({
                            episodeKey: b.episodeKey,
                            podcastKey: b.podcastKey,
                            podcastTitle: b.podcastTitle,
                            episodeTitle: b.episodeTitle,
                            audioUrl: b.audioUrl,
                            artworkUrl: b.artworkUrl,
                            description: null,
                            durationSec: b.durationSec,
                          })
                        }
                      />
                      <GhostIconBtn label={`移出稍后再听 ${b.episodeTitle}`} onClick={() => bookmarkRemove.mutate(b)}>
                        <XIcon size={16} />
                      </GhostIconBtn>
                    </ItemActions>
                    {pct > 0 && prog && !prog.completed && (
                      <ItemFooter>
                        <ProgressRail pct={pct} />
                      </ItemFooter>
                    )}
                  </Item>
                );
              })}
            </ItemGroup>

            <div className="mt-8">
              <h3 className="flex items-center gap-2 text-[17px] font-semibold [letter-spacing:var(--text-title2-tracking)]">
                离线单集
                {offlineList.length > 0 && (
                  <span className="text-[12px] font-normal text-[var(--muted-foreground)]">
                    {offlineList.length} 集 · 共 {fmtBytes(offlineList.reduce((s, m) => s + m.sizeBytes, 0))}
                  </span>
                )}
              </h3>
              <p className="mt-1 text-[12px] leading-relaxed text-[var(--muted-foreground)]">
                下载好的单集存在这台设备上：先打开这个页面，再断网/开飞行模式也能照常播放。注意页面本身需要先加载出来，完全关掉页面后在无网时重新打开目前做不到。
              </p>
              {downloadError && (
                <p className="mt-2 text-[13px] text-[var(--destructive)]">{downloadError}</p>
              )}
              {offlineList.length === 0 && (
                <p className="mt-3 text-[13px] text-[var(--muted-foreground)]">
                  还没有下载的单集。在任意节目的单集列表或「稍后再听」里点下载图标就会存到这里。
                </p>
              )}
              <ItemGroup className="mt-3">
                {offlineList.map((m) => {
                  const isCurrent = nowPlaying?.episodeKey === m.episodeKey;
                  const context: PlayingEpisode[] = offlineList.map((x) => ({
                    episodeKey: x.episodeKey,
                    podcastKey: x.podcastKey,
                    podcastTitle: x.podcastTitle,
                    episodeTitle: x.episodeTitle,
                    audioUrl: x.audioUrl,
                    artworkUrl: x.artworkUrl,
                    description: null,
                    durationSec: x.durationSec,
                  }));
                  return (
                    <Item key={m.episodeKey} variant="outline" selected={isCurrent}>
                      <PlayRoundBtn
                        label={`离线播放 ${m.episodeTitle}`}
                        isCurrent={isCurrent}
                        isPlaying={isCurrent && playing}
                        onClick={() =>
                          playEpisode(
                            {
                              episodeKey: m.episodeKey,
                              podcastKey: m.podcastKey,
                              podcastTitle: m.podcastTitle,
                              episodeTitle: m.episodeTitle,
                              audioUrl: m.audioUrl,
                              artworkUrl: m.artworkUrl,
                              description: null,
                              durationSec: m.durationSec,
                            },
                            undefined,
                            context,
                          )
                        }
                      />
                      <ItemContent>
                        <ItemTitle>{m.episodeTitle}</ItemTitle>
                        <p className="mt-0.5 text-[11px] leading-snug text-[var(--muted-foreground)] group-data-[selected=true]/item:text-[var(--primary-foreground)]/80">
                          {m.podcastTitle}
                          {m.durationSec ? ` · ${fmtClock(m.durationSec)}` : ""} · {fmtBytes(m.sizeBytes)} ·{" "}
                          {new Date(m.downloadedAt).toLocaleDateString("zh-CN")} 下载
                        </p>
                      </ItemContent>
                      <ItemActions>
                        <GhostIconBtn label={`删除离线单集 ${m.episodeTitle}`} onClick={() => void deleteOffline(m)}>
                          <TrashIcon size={16} />
                        </GhostIconBtn>
                      </ItemActions>
                    </Item>
                  );
                })}
              </ItemGroup>
            </div>

            {finished.length > 0 && (
              <div className="mt-8">
                <h3 className="text-[13px] font-semibold text-[var(--muted-foreground)]">已听完</h3>
                <ItemGroup className="mt-2">
                  {finished.map((f) => (
                    <Item key={f.episodeKey} variant="outline" size="sm">
                      <ItemMedia variant="image">
                        <Artwork url={f.artworkUrl} title={f.podcastTitle} size={40} rounded={6} />
                      </ItemMedia>
                      <ItemContent>
                        <ItemTitle>{f.episodeTitle}</ItemTitle>
                        <ItemDescription className="line-clamp-1">
                          {f.podcastTitle} · {timeAgo(f.updatedAt)}听完
                        </ItemDescription>
                      </ItemContent>
                      <ItemActions>
                        <GhostIconBtn
                          label={`再听一次 ${f.episodeTitle}`}
                          onClick={() =>
                            playEpisode(
                              {
                                episodeKey: f.episodeKey,
                                podcastKey: null,
                                podcastTitle: f.podcastTitle,
                                episodeTitle: f.episodeTitle,
                                audioUrl: f.audioUrl,
                                artworkUrl: f.artworkUrl,
                                description: null,
                                durationSec: f.durationSec || null,
                              },
                              0,
                            )
                          }
                        >
                          <RotateCcwIcon size={16} />
                        </GhostIconBtn>
                      </ItemActions>
                    </Item>
                  ))}
                </ItemGroup>
              </div>
            )}
          </section>
        )}
      </main>

      {/* Mobile bottom dock — iOS-style floating frosted capsule with the
          three views; on wider screens the top underline tabs take over. */}
      <nav
        aria-label="主导航"
        className="fixed inset-x-0 bottom-0 z-40 flex justify-center px-3 min-[720px]:hidden"
        style={{ paddingBottom: "calc(10px + env(safe-area-inset-bottom, 0px))" }}
      >
        <div className="flex items-center gap-1 rounded-full bg-[var(--acr-panel)] p-1.5 shadow-[0_0_0_1px_rgba(190,190,190,0.16),0_12px_36px_rgba(0,0,0,0.28)] backdrop-blur-xl">
          {(
            [
              { key: "discover", label: "内容", icon: <CompassIcon size={19} />, badge: 0 },
              { key: "library", label: "收藏", icon: <HeartIcon size={19} />, badge: counts.data?.newEpisodeTotal ?? 0 },
              { key: "later", label: "稍后再听", icon: <BookmarkIcon size={19} />, badge: 0 },
            ] as Array<{ key: Tab; label: string; icon: ReactNode; badge: number }>
          ).map((t) => {
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                aria-label={t.label}
                aria-current={active ? "page" : undefined}
                onClick={() => setTab(t.key)}
                className={cn(
                  "relative flex items-center gap-1.5 rounded-full px-4 py-2 text-[13px] transition-colors",
                  active
                    ? "bg-[var(--primary)] font-semibold text-[var(--primary-foreground)]"
                    : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]",
                )}
                style={{ minHeight: 44 }}
              >
                {t.icon}
                {t.label}
                {t.badge > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--destructive)] px-1 text-[10px] font-bold text-white">
                    {t.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </nav>

      {/* Acrylic AudioPlayer — centred floating capsule, stream-style */}
      {nowPlaying && (
        <div className="fixed inset-x-0 bottom-[calc(84px+env(safe-area-inset-bottom,0px))] z-50 min-[720px]:bottom-[calc(12px+env(safe-area-inset-bottom,0px))]">
          <div className="mx-auto max-w-3xl px-3">
            {playerNotice && !playerError && (
              <p
                role="status"
                className="mb-2 rounded-full bg-[var(--acr-chip)] px-4 py-2 text-[12px] text-[var(--foreground)] backdrop-blur-xl"
              >
                {playerNotice}
              </p>
            )}
            {playerError && (
              <p className="mb-2 rounded-full bg-[var(--destructive)]/15 px-4 py-2 text-[12px] text-[var(--destructive)] backdrop-blur-xl">
                {playerError}
              </p>
            )}
            {isNarrow ? (
              <AudioPlayer
                variant="mini"
                track={{
                  title: nowPlaying.episodeTitle,
                  artist: nowPlaying.podcastTitle,
                  cover: nowPlaying.artworkUrl,
                }}
                playing={playing}
                currentTime={position}
                duration={duration || nowPlaying.durationSec || 0}
                onToggle={togglePlay}
                onSeek={seekTo}
                onOpen={() => setExpanded(!expanded)}
                infoExpanded={expanded}
                labels={{ openNowPlaying: "展开播放详情：{title}" }}
              />
            ) : (
              <AudioPlayer
                track={{
                  title: nowPlaying.episodeTitle,
                  artist: nowPlaying.podcastTitle,
                  cover: nowPlaying.artworkUrl,
                }}
                playing={playing}
                currentTime={position}
                duration={duration || nowPlaying.durationSec || 0}
                hasPrev={!!prevEp}
                hasNext={!!nextEp}
                onPrev={() => prevEp && playEpisode(prevEp, 0, queue)}
                onNext={() => nextEp && playEpisode(nextEp, 0, queue)}
                onToggle={togglePlay}
                onSeek={seekTo}
                onOpenInfo={() => setExpanded(!expanded)}
                infoExpanded={expanded}
                labels={{ previous: "上一集", play: "播放", pause: "暂停", next: "下一集", nowPlaying: "正在播放" }}
                actions={
                  <button
                    type="button"
                    aria-label="播放队列"
                    aria-expanded={queueOpen}
                    onClick={() => setQueueOpen(!queueOpen)}
                    className="flex size-9 shrink-0 items-center justify-center rounded-full text-[var(--foreground)]/70 transition-colors hover:bg-[var(--acr-hover)] hover:text-[var(--foreground)]"
                    style={{ minHeight: 36 }}
                  >
                    <ListMusicIcon size={17} />
                  </button>
                }
              />
            )}
            {expanded && (
              <div className="mt-2 rounded-[20px] bg-[var(--acr-panel)] px-4 pb-4 pt-2 shadow-[0_0_0_1px_rgba(190,190,190,0.16),0_16px_48px_rgba(0,0,0,0.45)] backdrop-blur-xl">
                <div className="flex items-center gap-3">
                  <span className="w-10 shrink-0 font-mono text-[10px] tabular-nums text-[var(--muted-foreground)]">
                    {fmtClock(position)}
                  </span>
                  <label htmlFor="seek-bar" className="sr-only">播放进度</label>
                  <input
                    id="seek-bar"
                    type="range"
                    aria-label="播放进度"
                    className="acr-range min-w-0 flex-1"
                    min={0}
                    max={Math.max(duration, 1)}
                    step={1}
                    value={Math.min(position, Math.max(duration, 1))}
                    style={{ "--acr-fill": `${seekPct}%` } as CSSProperties}
                    onChange={(e) => seekTo(Number(e.target.value))}
                  />
                  <span className="w-10 shrink-0 text-right font-mono text-[10px] tabular-nums text-[var(--muted-foreground)]">
                    {fmtClock(duration || nowPlaying.durationSec || 0)}
                  </span>
                </div>
                {isNarrow && (
                  <div className="mt-1 flex items-center justify-center">
                    <Button
                      variant="ghost"
                      size="large"
                      aria-label="播放队列"
                      aria-expanded={queueOpen}
                      onClick={() => setQueueOpen(!queueOpen)}
                    >
                      <ListMusicIcon size={14} />
                      播放队列
                    </Button>
                  </div>
                )}
                <div className="mt-1 flex items-center justify-center gap-1.5">
                  <Button variant="ghost" size="large" aria-label="后退 30 秒" onClick={() => seekBy(-30)}>
                    <RotateCcwIcon size={14} />
                    30s
                  </Button>
                  <Button variant="ghost" size="large" aria-label="后退 15 秒" onClick={() => seekBy(-15)}>
                    <RotateCcwIcon size={14} />
                    15s
                  </Button>
                  <Button
                    variant="neutral"
                    size="large"
                    aria-label={`倍速，当前 ${SPEEDS[speedIdx]} 倍`}
                    onClick={cycleSpeed}
                    className="px-4 font-semibold"
                  >
                    {SPEEDS[speedIdx]}×
                  </Button>
                  <Button variant="ghost" size="large" aria-label="前进 15 秒" onClick={() => seekBy(15)}>
                    15s
                    <RotateCwIcon size={14} />
                  </Button>
                  <Button variant="ghost" size="large" aria-label="前进 30 秒" onClick={() => seekBy(30)}>
                    30s
                    <RotateCwIcon size={14} />
                  </Button>
                </div>
                <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5">
                  <span className="flex items-center gap-1 text-[12px] text-[var(--muted-foreground)]">
                    <MoonIcon size={13} />
                    定时关闭
                  </span>
                  {(
                    [
                      { mode: "off", label: "不定时" },
                      { mode: "15", label: "15 分钟" },
                      { mode: "30", label: "30 分钟" },
                      { mode: "60", label: "60 分钟" },
                      { mode: "episode", label: "播完本集" },
                    ] as Array<{ mode: SleepTimerMode; label: string }>
                  ).map((opt) => (
                    <Button
                      key={opt.mode}
                      variant={sleepMode === opt.mode ? "default" : "neutral"}
                      size="medium"
                      aria-pressed={sleepMode === opt.mode}
                      aria-label={`定时关闭：${opt.label}`}
                      onClick={() => setSleepTimer(opt.mode)}
                      className="px-3"
                    >
                      {opt.label}
                    </Button>
                  ))}
                  {sleepRemaining != null && (
                    <span className="text-[12px] tabular-nums text-[var(--primary)]" role="status">
                      还剩 {fmtClock(sleepRemaining)} 停止
                    </span>
                  )}
                  {sleepMode === "episode" && (
                    <span className="text-[12px] text-[var(--muted-foreground)]" role="status">
                      本集播完后停止
                    </span>
                  )}
                </div>
                {nowPlaying.description && (
                  <p className="scrollbar-mac mt-2 max-h-32 overflow-y-auto text-[13px] leading-relaxed text-[var(--foreground)]/85">
                    {nowPlaying.description}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Queue drawer — right sheet on desktop, near-full sheet on phones */}
      {queueOpen && nowPlaying && (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            aria-label="关闭播放队列"
            className="absolute inset-0 h-full w-full cursor-default bg-[var(--acr-overlay)]"
            style={{ minHeight: 0 }}
            onClick={() => setQueueOpen(false)}
          />
          <aside
            aria-label="播放队列"
            className="absolute bottom-0 right-0 top-0 flex w-[86vw] max-w-sm flex-col bg-[var(--acr-panel)] shadow-[0_0_0_1px_rgba(190,190,190,0.16),-16px_0_48px_rgba(0,0,0,0.4)] backdrop-blur-xl"
          >
            <div className="flex items-center justify-between gap-2 px-4 pb-2 pt-safe">
              <h2 className="pt-2 text-[16px] font-semibold text-[var(--foreground)]">
                播放列表
                <span className="ml-1.5 text-[12px] font-normal text-[var(--muted-foreground)]">{queue.length} 集</span>
              </h2>
              <button
                type="button"
                aria-label="关闭"
                onClick={() => setQueueOpen(false)}
                className="mt-2 flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--acr-chip)] text-[var(--foreground)] transition-colors hover:bg-[var(--acr-chip-hover)]"
                style={{ minHeight: 36 }}
              >
                <XIcon size={16} />
              </button>
            </div>
            <div className="scrollbar-mac min-h-0 flex-1 overflow-y-auto px-2 pb-6">
              {queue.map((q) => {
                const isCurrent = q.episodeKey === nowPlaying.episodeKey;
                return (
                  <button
                    key={q.episodeKey}
                    type="button"
                    aria-label={`播放 ${q.episodeTitle}`}
                    aria-current={isCurrent || undefined}
                    onClick={() => {
                      playEpisode(q, 0, queue);
                      setQueueOpen(false);
                    }}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-[10px] px-2 py-2 text-left transition-colors",
                      isCurrent ? "bg-[var(--primary)] text-[var(--primary-foreground)]" : "hover:bg-[var(--acr-hover)]",
                    )}
                    style={{ minHeight: 56 }}
                  >
                    <Artwork url={q.artworkUrl} title={q.episodeTitle} size={40} rounded={7} />
                    <span className="min-w-0 flex-1">
                      <span className="block break-words text-[13px] font-medium leading-snug">{q.episodeTitle}</span>
                      <span
                        className={cn(
                          "mt-0.5 block truncate text-[11px] leading-tight",
                          isCurrent ? "text-[var(--primary-foreground)]/80" : "text-[var(--muted-foreground)]",
                        )}
                      >
                        {q.podcastTitle}
                      </span>
                    </span>
                    {isCurrent && (playing ? <PauseIcon size={13} /> : <PlayIcon size={13} />)}
                    <span
                      className={cn(
                        "shrink-0 text-[12px] tabular-nums",
                        isCurrent ? "text-[var(--primary-foreground)]/85" : "text-[var(--muted-foreground)]",
                      )}
                    >
                      {q.durationSec ? fmtClock(q.durationSec) : ""}
                    </span>
                  </button>
                );
              })}
              {queue.length === 0 && (
                <p className="px-3 py-8 text-center text-[13px] text-[var(--muted-foreground)]">队列是空的。</p>
              )}
            </div>
          </aside>
        </div>
      )}

      {detailTarget && (
        <PodcastDetail
          target={detailTarget}
          onClose={() => setDetailTarget(null)}
          onPlay={(ep, context) => playEpisode(ep, undefined, context)}
          currentKey={nowPlaying?.episodeKey ?? null}
          isPlaying={playing}
          favoriteKeys={favoriteKeys}
          bookmarkKeys={bookmarkKeys}
          progressByKey={progressByKey}
          offlineKeys={offlineKeys}
          downloadProgress={downloadProgress}
          downloadError={downloadError}
          onDownload={(ep) => void startDownload(ep)}
          playerActive={nowPlaying != null}
        />
      )}
    </div>
  );
}
