DROP TABLE IF EXISTS entries;
--> statement-breakpoint
CREATE TABLE favorite_podcasts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  podcast_key TEXT NOT NULL UNIQUE,
  apple_id TEXT,
  title TEXT NOT NULL,
  author TEXT NOT NULL DEFAULT '',
  artwork_url TEXT,
  feed_url TEXT,
  genre TEXT,
  description TEXT,
  source TEXT NOT NULL DEFAULT 'itunes',
  country TEXT NOT NULL DEFAULT 'CN',
  created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE episode_bookmarks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  episode_key TEXT NOT NULL UNIQUE,
  podcast_key TEXT,
  podcast_title TEXT NOT NULL DEFAULT '',
  episode_title TEXT NOT NULL,
  audio_url TEXT NOT NULL,
  artwork_url TEXT,
  description TEXT,
  published_at TEXT,
  duration_sec INTEGER,
  created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE playback_progress (
  episode_key TEXT PRIMARY KEY,
  podcast_key TEXT,
  podcast_title TEXT NOT NULL DEFAULT '',
  episode_title TEXT NOT NULL,
  audio_url TEXT NOT NULL,
  artwork_url TEXT,
  position_sec REAL NOT NULL DEFAULT 0,
  duration_sec REAL NOT NULL DEFAULT 0,
  completed INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE latest_episodes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  podcast_key TEXT NOT NULL,
  episode_key TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  published_at TEXT,
  is_new INTEGER NOT NULL DEFAULT 0,
  seen_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX latest_episodes_podcast_episode ON latest_episodes (podcast_key, episode_key);
--> statement-breakpoint
CREATE TABLE refresh_state (
  id INTEGER PRIMARY KEY,
  last_refreshed_at INTEGER
);
