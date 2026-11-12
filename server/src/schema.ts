import { integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const favoritePodcasts = sqliteTable("favorite_podcasts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  podcastKey: text("podcast_key").notNull().unique(),
  appleId: text("apple_id"),
  title: text("title").notNull(),
  author: text("author").notNull().default(""),
  artworkUrl: text("artwork_url"),
  feedUrl: text("feed_url"),
  genre: text("genre"),
  description: text("description"),
  source: text("source", { enum: ["itunes", "rss", "lizhi"] }).notNull().default("itunes"),
  country: text("country").notNull().default("CN"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const episodeBookmarks = sqliteTable("episode_bookmarks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  episodeKey: text("episode_key").notNull().unique(),
  podcastKey: text("podcast_key"),
  podcastTitle: text("podcast_title").notNull().default(""),
  episodeTitle: text("episode_title").notNull(),
  audioUrl: text("audio_url").notNull(),
  artworkUrl: text("artwork_url"),
  description: text("description"),
  publishedAt: text("published_at"),
  durationSec: integer("duration_sec"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const playbackProgress = sqliteTable("playback_progress", {
  episodeKey: text("episode_key").primaryKey(),
  podcastKey: text("podcast_key"),
  podcastTitle: text("podcast_title").notNull().default(""),
  episodeTitle: text("episode_title").notNull(),
  audioUrl: text("audio_url").notNull(),
  artworkUrl: text("artwork_url"),
  positionSec: real("position_sec").notNull().default(0),
  durationSec: real("duration_sec").notNull().default(0),
  completed: integer("completed").notNull().default(0),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const latestEpisodes = sqliteTable(
  "latest_episodes",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    podcastKey: text("podcast_key").notNull(),
    episodeKey: text("episode_key").notNull(),
    title: text("title").notNull().default(""),
    publishedAt: text("published_at"),
    isNew: integer("is_new").notNull().default(0),
    seenAt: integer("seen_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [uniqueIndex("latest_episodes_podcast_episode").on(t.podcastKey, t.episodeKey)],
);

export const refreshState = sqliteTable("refresh_state", {
  id: integer("id").primaryKey(),
  lastRefreshedAt: integer("last_refreshed_at", { mode: "timestamp_ms" }),
});

/**
 * Server-side audio archive — tier 1 of the playback byte ladder.
 * Rows are created only by the explicit prepareDownload action (the server
 * fetches the bytes through the ladder and stores them as an owned blob);
 * the client then pulls the blob into on-device IndexedDB for offline play.
 */
export const episodeArchives = sqliteTable("episode_archives", {
  episodeKey: text("episode_key").primaryKey(),
  podcastKey: text("podcast_key"),
  podcastTitle: text("podcast_title").notNull().default(""),
  episodeTitle: text("episode_title").notNull(),
  originUrl: text("origin_url").notNull(),
  artworkUrl: text("artwork_url"),
  durationSec: integer("duration_sec"),
  sizeBytes: integer("size_bytes").notNull().default(0),
  blobKey: text("blob_key").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});
