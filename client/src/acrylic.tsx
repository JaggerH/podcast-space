/*
 * Acrylic UI components — ported from JaggerH/acrylic-ui
 * (https://github.com/JaggerH/acrylic-ui), registry/acrylic/*.
 *
 * Adapted to this artifact's runtime: the repo's Radix / lucide-react /
 * class-variance-authority dependencies are replaced with plain React +
 * inline SVG glyphs in the same geometry, and all styling runs on the
 * --acr-* tokens in theme.css. Component anatomy, class strings, sizes,
 * and material choices follow the registry sources:
 *   audio-player.tsx — capsule frosted transport + now-playing group
 *   item.tsx         — Item / ItemMedia / ItemContent / ItemTitle / …
 *   card.tsx         — frosted surface card
 *   slider.tsx       — macOS 26 slider geometry (see .acr-range in theme.css)
 *   searchbar.tsx    — rounded-full search field, over-glass variant
 *   button.tsx       — macOS push-button variants on the spring tokens
 */

import * as React from "react";

export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

/* ---------------- icons (lucide geometry, inline) ---------------- */

type IconProps = React.SVGProps<SVGSVGElement> & { size?: number };

function strokeIcon(paths: React.ReactNode) {
  return function Icon({ size = 24, ...props }: IconProps) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
        {...props}
      >
        {paths}
      </svg>
    );
  };
}

export const SearchIcon = strokeIcon(
  <>
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.3-4.3" />
  </>,
);
export const XIcon = strokeIcon(
  <>
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </>,
);
export const ChevronRightIcon = strokeIcon(<path d="m9 18 6-6-6-6" />);
export const ChevronUpIcon = strokeIcon(<path d="m18 15-6-6-6 6" />);
export const ChevronDownIcon = strokeIcon(<path d="m6 9 6 6 6-6" />);
export const ChevronLeftIcon = strokeIcon(<path d="m15 18-6-6 6-6" />);
export const HeartIcon = strokeIcon(
  <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />,
);
export const BookmarkIcon = strokeIcon(
  <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" />,
);
export const ListMusicIcon = strokeIcon(
  <>
    <path d="M21 15V6" />
    <path d="M18.5 18a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />
    <path d="M12 12H3" />
    <path d="M16 6H3" />
    <path d="M12 18H3" />
  </>,
);
export const RotateCcwIcon = strokeIcon(
  <>
    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
    <path d="M3 3v5h5" />
  </>,
);
export const RotateCwIcon = strokeIcon(
  <>
    <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
    <path d="M21 3v5h-5" />
  </>,
);
export const RefreshIcon = strokeIcon(
  <>
    <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
    <path d="M21 3v5h-5" />
    <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
    <path d="M8 16H3v5" />
  </>,
);
export const CompassIcon = strokeIcon(
  <>
    <circle cx="12" cy="12" r="10" />
    <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
  </>,
);
export const RssIcon = strokeIcon(
  <>
    <path d="M4 11a9 9 0 0 1 9 9" />
    <path d="M4 4a16 16 0 0 1 16 16" />
    <line x1="4" x2="4.01" y1="20" y2="20" />
  </>,
);
export const DownloadIcon = strokeIcon(
  <>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" x2="12" y1="15" y2="3" />
  </>,
);
export const CheckIcon = strokeIcon(<path d="M20 6 9 17l-5-5" />);
export const MoonIcon = strokeIcon(
  <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />,
);
export const TrashIcon = strokeIcon(
  <>
    <path d="M3 6h18" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
    <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </>,
);

export function PlayIcon({ size = 24, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <polygon points="6 3 20 12 6 21 6 3" />
    </svg>
  );
}
export function PauseIcon({ size = 24, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <rect x="5" y="4" width="4.5" height="16" rx="1" />
      <rect x="14.5" y="4" width="4.5" height="16" rx="1" />
    </svg>
  );
}
export function SkipBackIcon({ size = 24, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      <polygon points="19 20 9 12 19 4 19 20" />
      <line x1="5" x2="5" y1="19" y2="5" />
    </svg>
  );
}
export function SkipForwardIcon({ size = 24, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      <polygon points="5 4 15 12 5 20 5 4" />
      <line x1="19" x2="19" y1="5" y2="19" />
    </svg>
  );
}

/* ---------------- ScrollingText (from audio-player.tsx) ---------------- */

const MARQUEE_GAP = 32;
const MARQUEE_SPEED = 40;

export function ScrollingText({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const viewportRef = React.useRef<HTMLDivElement>(null);
  const trackRef = React.useRef<HTMLDivElement>(null);
  const [scroll, setScroll] = React.useState(false);

  React.useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const track = trackRef.current;
    if (!viewport || !track) return;
    let anim: Animation | undefined;
    const measure = () => {
      anim?.cancel();
      anim = undefined;
      const copy = track.firstElementChild as HTMLElement | null;
      const textWidth = copy?.scrollWidth ?? 0;
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const overflowing = !reduce && textWidth > viewport.clientWidth + 1;
      setScroll(overflowing);
      if (!overflowing) return;
      const shift = textWidth + MARQUEE_GAP;
      anim = track.animate(
        [{ transform: "translateX(0)" }, { transform: `translateX(-${shift}px)` }],
        { duration: (shift / MARQUEE_SPEED) * 1000, iterations: Infinity, easing: "linear" },
      );
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(viewport);
    return () => {
      ro.disconnect();
      anim?.cancel();
    };
  }, [children]);

  return (
    <div ref={viewportRef} className={cn("overflow-hidden", className)}>
      <div ref={trackRef} className={cn("flex whitespace-nowrap", scroll && "w-max will-change-transform")}>
        <span className={cn("min-w-0", !scroll && "truncate")}>{children}</span>
        {scroll && (
          <span aria-hidden className="shrink-0" style={{ paddingLeft: MARQUEE_GAP }}>
            {children}
          </span>
        )}
      </div>
    </div>
  );
}

/* ---------------- Card (from card.tsx) ---------------- */

export const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { interactive?: boolean }
>(({ className, interactive = false, ...props }, ref) => (
  <div
    ref={ref}
    data-slot="card"
    className={cn(
      "relative isolate rounded-xl bg-[var(--acr-surface)] backdrop-blur-xl",
      "transition-[translate,background-color] [transition-timing-function:var(--acr-spring-default)] [transition-duration:var(--acr-spring-default-duration)]",
      interactive &&
        "hover:-translate-y-px hover:bg-[var(--acr-surface-hover)] " +
          "before:pointer-events-none before:absolute before:inset-0 before:-z-10 before:rounded-xl " +
          "before:shadow-[0_12px_28px_rgba(0,0,0,0.28)] before:opacity-0 " +
          "before:transition-opacity before:[transition-timing-function:var(--acr-spring-default)] before:[transition-duration:var(--acr-spring-default-duration)] hover:before:opacity-100",
      className,
    )}
    {...props}
  />
));
Card.displayName = "Card";

/* ---------------- Item family (from item.tsx) ---------------- */

type ItemVariant = "default" | "outline" | "muted";
type ItemSize = "default" | "sm" | "xs";

export function Item({
  className,
  variant = "default",
  size = "default",
  selected,
  ...props
}: React.ComponentProps<"div"> & { variant?: ItemVariant; size?: ItemSize; selected?: boolean }) {
  return (
    <div
      data-slot="item"
      data-variant={variant}
      data-size={size}
      data-selected={selected || undefined}
      className={cn(
        "group/item flex min-w-0 items-center gap-3 rounded-[10px] text-left outline-none",
        "has-data-[slot=item-header]:flex-wrap has-data-[slot=item-footer]:flex-wrap",
        "data-[selected=true]:bg-[var(--primary)] data-[selected=true]:text-[var(--primary-foreground)]",
        variant === "outline" && "bg-[var(--acr-surface)] backdrop-blur-xl",
        variant === "muted" && "bg-[var(--acr-card-nested)]",
        size === "default" && "p-3",
        size === "sm" && "gap-2 rounded-[8px] px-2.5 py-2",
        size === "xs" && "gap-2 rounded-[7px] px-2 py-1.5",
        className,
      )}
      {...props}
    />
  );
}

export function ItemMedia({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<"div"> & { variant?: "default" | "icon" | "image" | "avatar" }) {
  return (
    <div
      data-slot="item-media"
      data-variant={variant}
      className={cn(
        "flex shrink-0 items-center justify-center rounded-[8px] text-[var(--muted-foreground)]",
        "group-data-[size=sm]/item:rounded-[6px] group-data-[size=xs]/item:rounded-[5px]",
        "group-data-[selected=true]/item:text-[var(--primary-foreground)]/85",
        variant === "default" && "size-10 group-data-[size=sm]/item:size-8 group-data-[size=xs]/item:size-7",
        variant === "icon" &&
          "size-10 bg-[var(--acr-card-nested)] group-data-[selected=true]/item:bg-white/15 group-data-[size=sm]/item:size-8 group-data-[size=xs]/item:size-7",
        variant === "image" &&
          "size-12 overflow-hidden bg-[var(--acr-card-nested)] group-data-[selected=true]/item:bg-white/15 group-data-[size=sm]/item:size-10 group-data-[size=xs]/item:size-8 [&>img]:size-full [&>img]:object-cover",
        variant === "avatar" &&
          "size-10 rounded-full bg-transparent group-data-[size=sm]/item:size-8 group-data-[size=xs]/item:size-7",
        className,
      )}
      {...props}
    />
  );
}

export function ItemContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="item-content" className={cn("min-w-0 flex-1", className)} {...props} />;
}

export function ItemTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="item-title"
      className={cn(
        // Wrap instead of single-line truncate: on phones a truncated title
        // hides most of the episode name (user report). These lists are not
        // virtualized, so a taller item is fine.
        "break-words text-[13px] font-medium leading-snug text-[var(--foreground)] group-data-[size=sm]/item:text-[12px] group-data-[size=xs]/item:text-[11px]",
        "group-data-[selected=true]/item:text-[var(--primary-foreground)]",
        className,
      )}
      {...props}
    />
  );
}

export function ItemDescription({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="item-description"
      className={cn(
        "line-clamp-2 text-[12px] leading-snug text-[var(--muted-foreground)] group-data-[size=sm]/item:text-[11px] group-data-[size=xs]/item:text-[10px]",
        "group-data-[selected=true]/item:text-[var(--primary-foreground)]/80",
        className,
      )}
      {...props}
    />
  );
}

export function ItemMeta({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="item-meta"
      className={cn(
        "shrink-0 whitespace-nowrap text-[11px] leading-snug text-[var(--muted-foreground)] group-data-[size=xs]/item:text-[10px]",
        "group-data-[selected=true]/item:text-[var(--primary-foreground)]/80",
        className,
      )}
      {...props}
    />
  );
}

export function ItemActions({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="item-actions"
      className={cn(
        "flex shrink-0 items-center justify-end gap-1",
        "group-data-[selected=true]/item:text-[var(--primary-foreground)]/80",
        className,
      )}
      {...props}
    />
  );
}

export function ItemFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="item-footer"
      className={cn(
        "flex basis-full items-center gap-2 pt-1 text-[12px] text-[var(--muted-foreground)] group-data-[size=sm]/item:text-[11px] group-data-[size=xs]/item:text-[10px]",
        "group-data-[selected=true]/item:text-[var(--primary-foreground)]/80",
        className,
      )}
      {...props}
    />
  );
}

export function ItemGroup({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="item-group" className={cn("flex flex-col gap-2", className)} {...props} />;
}

export function ItemSeparator({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="item-separator"
      role="separator"
      className={cn("h-px bg-[var(--acr-border)]", className)}
      {...props}
    />
  );
}

/* ---------------- Button (from button.tsx) ---------------- */

type ButtonVariant = "default" | "secondary" | "destructive" | "neutral" | "ghost" | "link";
type ButtonSize = "mini" | "small" | "medium" | "large" | "xl";

const buttonVariantClasses: Record<ButtonVariant, string> = {
  default: "bg-[var(--primary)] text-[var(--primary-foreground)] shadow-sm hover:brightness-110 active:brightness-95",
  secondary: "bg-[var(--primary)]/10 text-[var(--primary)] hover:bg-[var(--primary)]/15 active:bg-[var(--primary)]/20",
  destructive: "bg-[var(--destructive)]/25 text-[var(--destructive)] hover:bg-[var(--destructive)]/35 active:bg-[var(--destructive)]/45",
  neutral: "bg-[var(--acr-chip)] text-[var(--foreground)] hover:bg-[var(--acr-chip-hover)]",
  ghost: "bg-transparent text-[var(--foreground)] hover:bg-[var(--acr-chip)] active:bg-[var(--acr-chip-hover)]",
  link: "bg-transparent text-[var(--primary)] hover:underline hover:underline-offset-4 active:opacity-80 active:scale-100",
};
const buttonSizeClasses: Record<ButtonSize, string> = {
  mini: "h-4 gap-1 rounded-[4px] px-[7px] text-[10px]",
  small: "h-5 gap-1 rounded-[5px] px-[10px] text-[11px]",
  medium: "h-6 gap-1 rounded-[6px] px-4 text-[13px]",
  large: "h-7 gap-1 rounded-[14px] px-4 text-[13px]",
  xl: "h-9 gap-1 rounded-[18px] px-4 text-[13px]",
};
const buttonIconSizeClasses: Record<ButtonSize, string> = {
  mini: "size-4",
  small: "size-5",
  medium: "size-6",
  large: "size-7",
  xl: "size-9",
};

export function Button({
  className,
  variant = "default",
  size = "medium",
  icon = false,
  type = "button",
  ...props
}: React.ComponentProps<"button"> & { variant?: ButtonVariant; size?: ButtonSize; icon?: boolean }) {
  return (
    <button
      type={type}
      data-slot="button"
      data-variant={variant}
      data-size={size}
      data-icon={icon || undefined}
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap font-medium outline-none",
        "transition-[background-color,box-shadow,filter,opacity,scale] [transition-timing-function:var(--acr-spring-default)] [transition-duration:var(--acr-spring-default-duration)] active:scale-[0.97]",
        "focus-visible:ring-2 focus-visible:ring-[var(--ring)]/50 disabled:pointer-events-none disabled:opacity-40",
        buttonVariantClasses[variant],
        buttonSizeClasses[size],
        icon && cn("rounded-full p-0", buttonIconSizeClasses[size]),
        className,
      )}
      {...props}
    />
  );
}

/* ---------------- Badge ---------------- */

export function Badge({
  className,
  tone = "primary",
  ...props
}: React.ComponentProps<"span"> & { tone?: "primary" | "chip" | "destructive" | "warning" }) {
  return (
    <span
      data-slot="badge"
      className={cn(
        "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold leading-tight",
        tone === "primary" && "bg-[var(--primary)] text-[var(--primary-foreground)]",
        tone === "chip" && "bg-[var(--acr-chip)] font-medium text-[var(--muted-foreground)]",
        tone === "destructive" && "bg-[var(--destructive)] text-white",
        tone === "warning" && "bg-[var(--acr-orange)] text-white",
        className,
      )}
      {...props}
    />
  );
}

/* ---------------- Searchbar (from searchbar.tsx, over-glass) ---------------- */

export const Searchbar = React.forwardRef<
  HTMLInputElement,
  Omit<React.ComponentProps<"input">, "size"> & { onClear?: () => void }
>(({ className, onClear, value, onChange, disabled, ...props }, ref) => {
  const hasContent = typeof value === "string" && value !== "";
  return (
    <div
      data-slot="searchbar"
      data-variant="over-glass"
      className={cn(
        "relative flex h-11 w-full min-w-0 items-center rounded-full border border-transparent bg-[var(--acr-chip)] outline-none backdrop-blur-xl",
        "transition-[background-color,border-color,box-shadow] [transition-timing-function:var(--acr-spring-default)] [transition-duration:var(--acr-spring-default-duration)]",
        "hover:bg-[var(--acr-chip-hover)] focus-within:border-[var(--ring)] focus-within:ring-[3px] focus-within:ring-[var(--ring)]/25",
        disabled && "cursor-not-allowed opacity-50",
        className,
      )}
    >
      <SearchIcon size={16} className="pointer-events-none absolute left-3.5 text-[var(--muted-foreground)]" />
      <input
        ref={ref}
        type="text"
        value={value}
        onChange={onChange}
        disabled={disabled}
        className="h-full w-full border-0 bg-transparent p-0 pl-10 pr-10 text-[15px] text-[var(--foreground)] outline-none placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-0 [&::-webkit-search-cancel-button]:hidden [&::-webkit-search-decoration]:hidden [&::-webkit-search-cancel-button]:appearance-none [&::-webkit-search-decoration]:appearance-none"
        style={{ minHeight: 44 }}
        {...props}
      />
      {hasContent && !disabled && (
        <button
          type="button"
          aria-label="清除搜索"
          onClick={onClear}
          className="absolute right-2 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-full bg-[var(--muted-foreground)]/30 text-[var(--background)] transition-[background-color,scale] hover:bg-[var(--muted-foreground)]/45 active:scale-90"
          style={{ minHeight: 24 }}
        >
          <XIcon size={12} />
        </button>
      )}
    </div>
  );
});
Searchbar.displayName = "Searchbar";

/* ---------------- Segmented control (macOS button-group) ---------------- */

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="inline-flex items-center gap-0.5 rounded-full bg-[var(--acr-chip)] p-0.5 backdrop-blur-xl"
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(o.value)}
            className={cn(
              "rounded-full px-3.5 text-[13px] transition-[background-color,color] [transition-timing-function:var(--acr-spring-default)] [transition-duration:var(--acr-spring-default-duration)]",
              active
                ? "bg-[var(--acr-button-group-control)] font-semibold text-[var(--foreground)] shadow-sm"
                : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]",
            )}
            style={{ minHeight: 30 }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/* ---------------- AudioPlayer (from audio-player.tsx, bar variant) ---------------- */

export interface AudioPlayerTrack {
  title: string;
  artist?: string;
  cover?: string | null;
}

export interface AudioPlayerLabels {
  previous: string;
  play: string;
  pause: string;
  next: string;
  nowPlaying: string;
  /** `mini` only — label of the cover/title button that opens the player
   *  details. `{title}` is substituted with the track title. */
  openNowPlaying: string;
}

const DEFAULT_LABELS: AudioPlayerLabels = {
  previous: "Previous track",
  play: "Play",
  pause: "Pause",
  next: "Next track",
  nowPlaying: "Now playing",
  openNowPlaying: "Open now playing: {title}",
};

const TOOL =
  "flex size-9 shrink-0 items-center justify-center rounded-full text-[var(--foreground)]/70 transition-colors hover:bg-[var(--acr-hover)] hover:text-[var(--foreground)] disabled:pointer-events-none disabled:opacity-30";

export function fmtClock(s: number): string {
  if (!Number.isFinite(s) || s < 0) s = 0;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = Math.floor(s % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
  return `${m}:${String(r).padStart(2, "0")}`;
}

export function AudioPlayer({
  variant = "bar",
  onOpen,
  track,
  playing = false,
  currentTime = 0,
  duration = 0,
  hasPrev = false,
  hasNext = false,
  onPrev,
  onNext,
  onToggle,
  onSeek,
  onOpenInfo,
  infoExpanded = false,
  actions,
  labels,
  className,
}: {
  /** layout: the full transport bar (default), or the compact `mini` chip —
   *  cover + title/artist + play/pause + seek rail, no prev/next/actions. */
  variant?: "bar" | "mini";
  /** `mini` only — tapping the cover/title group (opens the player details) */
  onOpen?: () => void;
  track?: AudioPlayerTrack | null;
  playing?: boolean;
  currentTime?: number;
  duration?: number;
  hasPrev?: boolean;
  hasNext?: boolean;
  onPrev?: () => void;
  onNext?: () => void;
  onToggle?: () => void;
  onSeek?: (seconds: number) => void;
  /** tapping the cover/title group toggles the expanded panel */
  onOpenInfo?: () => void;
  infoExpanded?: boolean;
  actions?: React.ReactNode;
  labels?: Partial<AudioPlayerLabels>;
  className?: string;
}) {
  const l = { ...DEFAULT_LABELS, ...labels };
  const pct = track && duration ? (currentTime / duration) * 100 : 0;
  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!track || !duration || !onSeek) return;
    const r = e.currentTarget.getBoundingClientRect();
    onSeek(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * duration);
  };

  // ===== mini variant — compact chip (registry audio-player.tsx): cover +
  // title/artist as one button, play/pause, seek rail on the bottom edge.
  // Dressed in the floating capsule material so it lifts off the backdrop
  // like the bar does. Renders nothing when idle. =====
  if (variant === "mini") {
    if (!track) return null;
    return (
      <div
        data-slot="audio-player"
        data-variant="mini"
        className={cn(
          "relative flex w-full min-w-0 items-center gap-2 rounded-full",
          "bg-[var(--acr-panel)] px-2.5 pb-3 pt-2 backdrop-blur-xl",
          "shadow-[0_0_0_1px_rgba(190,190,190,0.16),0_16px_48px_rgba(0,0,0,0.45)]",
          className,
        )}
      >
        <button
          type="button"
          onClick={onOpen}
          aria-expanded={infoExpanded}
          aria-label={l.openNowPlaying.replace("{title}", track.title || l.nowPlaying)}
          className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
          style={{ minHeight: 36 }}
        >
          {track.cover ? (
            <img src={track.cover} alt="" className="size-9 shrink-0 rounded-md object-cover shadow-sm" />
          ) : (
            <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-[var(--acr-chip)] text-[var(--muted-foreground)]">
              <ListMusicIcon size={16} />
            </span>
          )}
          <span className="min-w-0 flex-1">
            <ScrollingText className="text-[13px] font-semibold leading-tight text-[var(--foreground)]">
              {track.title || l.nowPlaying}
            </ScrollingText>
            {track.artist && (
              <ScrollingText className="text-[11px] leading-tight text-[var(--muted-foreground)]">
                {track.artist}
              </ScrollingText>
            )}
          </span>
          <span aria-hidden className="shrink-0 text-[var(--muted-foreground)]">
            {infoExpanded ? <ChevronDownIcon size={14} /> : <ChevronUpIcon size={14} />}
          </span>
        </button>
        <button
          type="button"
          onClick={onToggle}
          aria-label={playing ? l.pause : l.play}
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--acr-chip)] text-[var(--foreground)] transition-all hover:bg-[var(--acr-chip-hover)]"
          style={{ minHeight: 36 }}
        >
          {playing ? <PauseIcon size={17} /> : <PlayIcon size={17} className="translate-x-px" />}
        </button>
        <div
          onClick={seek}
          role="slider"
          aria-label="播放进度"
          aria-valuemin={0}
          aria-valuemax={Math.round(duration)}
          aria-valuenow={Math.round(currentTime)}
          aria-valuetext={`${fmtClock(currentTime)} / ${fmtClock(duration)}`}
          className="absolute inset-x-3 bottom-1 h-[3px] cursor-pointer overflow-hidden rounded-full bg-[var(--acr-chip)]"
        >
          <div className="h-full rounded-full bg-[var(--foreground)]/70" style={{ width: `${pct}%` }} />
        </div>
      </div>
    );
  }

  return (
    <div
      data-slot="audio-player"
      className={cn(
        "relative inline-flex w-full max-w-3xl items-center gap-1.5 rounded-full",
        "bg-[var(--acr-panel)] px-3 py-2 backdrop-blur-xl",
        "shadow-[0_0_0_1px_rgba(190,190,190,0.16),0_16px_48px_rgba(0,0,0,0.45)]",
        className,
      )}
    >
      {/* transport — always visible */}
      <button type="button" onClick={onPrev} disabled={!hasPrev} aria-label={l.previous} className={TOOL} style={{ minHeight: 36 }}>
        <SkipBackIcon size={16} />
      </button>
      <button
        type="button"
        onClick={onToggle}
        disabled={!track}
        aria-label={playing ? l.pause : l.play}
        className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--acr-chip)] text-[var(--foreground)] transition-all hover:scale-105 hover:bg-[var(--acr-chip-hover)] disabled:pointer-events-none disabled:opacity-30"
        style={{ minHeight: 40 }}
      >
        {playing ? <PauseIcon size={20} /> : <PlayIcon size={20} className="translate-x-px" />}
      </button>
      <button type="button" onClick={onNext} disabled={!hasNext} aria-label={l.next} className={TOOL} style={{ minHeight: 36 }}>
        <SkipForwardIcon size={16} />
      </button>

      {/* now-playing info group — cover + title/artist + seek rail on its bottom edge */}
      {track ? (
        <div className="relative mx-1.5 flex min-w-0 flex-1 items-center gap-2.5 rounded-2xl bg-[var(--acr-chip)] px-2 pb-2.5 pt-1.5">
          <button
            type="button"
            onClick={onOpenInfo}
            aria-expanded={infoExpanded}
            aria-label={`${track.title || l.nowPlaying}，${infoExpanded ? "收起详情" : "展开详情"}`}
            className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
            style={{ minHeight: 40 }}
          >
            {track.cover ? (
              <img src={track.cover} alt="" className="size-9 shrink-0 rounded-md object-cover shadow-sm" />
            ) : (
              <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-[var(--acr-chip)] text-[var(--muted-foreground)]">
                <ListMusicIcon size={16} />
              </span>
            )}
            <span className="min-w-0 flex-1">
              <ScrollingText className="text-[13px] font-semibold leading-tight text-[var(--foreground)]">
                {track.title || l.nowPlaying}
              </ScrollingText>
              {track.artist && (
                <ScrollingText className="text-[11px] leading-tight text-[var(--muted-foreground)]">
                  {track.artist}
                </ScrollingText>
              )}
            </span>
            <span aria-hidden className="shrink-0 text-[var(--muted-foreground)]">
              {infoExpanded ? <ChevronDownIcon size={14} /> : <ChevronUpIcon size={14} />}
            </span>
          </button>
          <span className="shrink-0 font-mono text-[10px] tabular-nums text-[var(--muted-foreground)]">
            {fmtClock(currentTime)}/{fmtClock(duration)}
          </span>
          <div
            onClick={seek}
            role="slider"
            aria-label="播放进度"
            aria-valuemin={0}
            aria-valuemax={Math.round(duration)}
            aria-valuenow={Math.round(currentTime)}
            aria-valuetext={`${fmtClock(currentTime)} / ${fmtClock(duration)}`}
            className="absolute inset-x-2 bottom-1 h-[3px] cursor-pointer overflow-hidden rounded-full bg-[var(--acr-chip)]"
          >
            <div className="h-full rounded-full bg-[var(--foreground)]/70" style={{ width: `${pct}%` }} />
          </div>
        </div>
      ) : (
        <div className="mx-1.5 flex-1" />
      )}

      {actions}
    </div>
  );
}
