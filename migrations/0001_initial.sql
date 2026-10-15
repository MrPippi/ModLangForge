CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  display_name TEXT NOT NULL,
  minecraft_name TEXT,
  minecraft_uuid TEXT,
  minecraft_verified INTEGER NOT NULL DEFAULT 0,
  role TEXT NOT NULL DEFAULT 'contributor' CHECK (role IN ('admin', 'reviewer', 'contributor')),
  public INTEGER NOT NULL DEFAULT 1,
  banned INTEGER NOT NULL DEFAULT 0,
  session_version INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE identities (
  provider TEXT NOT NULL CHECK (provider IN ('github', 'discord', 'minecraft')),
  provider_user_id TEXT NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id),
  username TEXT,
  linked_at TEXT NOT NULL,
  PRIMARY KEY (provider, provider_user_id)
);

CREATE TABLE publish_batches (
  id INTEGER PRIMARY KEY,
  commit_sha TEXT,
  created_by INTEGER NOT NULL REFERENCES users(id),
  suggestion_count INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE suggestions (
  id INTEGER PRIMARY KEY,
  mod_id TEXT NOT NULL,
  key TEXT NOT NULL,
  base_target TEXT,
  proposed TEXT NOT NULL,
  note TEXT,
  format_warning INTEGER NOT NULL DEFAULT 0,
  author_user_id INTEGER REFERENCES users(id),
  author_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected', 'superseded', 'conflict', 'published')),
  reviewer_id INTEGER REFERENCES users(id),
  review_note TEXT,
  batch_id INTEGER REFERENCES publish_batches(id),
  created_at TEXT NOT NULL,
  reviewed_at TEXT
);
CREATE INDEX idx_suggestions_status_mod ON suggestions (status, mod_id);
CREATE INDEX idx_suggestions_mod_key ON suggestions (mod_id, key);
CREATE INDEX idx_suggestions_author ON suggestions (author_user_id);

CREATE TABLE mod_status_changes (
  id INTEGER PRIMARY KEY,
  mod_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('partial', 'reviewed')),
  created_by INTEGER NOT NULL REFERENCES users(id),
  batch_id INTEGER REFERENCES publish_batches(id),
  created_at TEXT NOT NULL
);

CREATE TABLE rate_events (
  subject TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_rate_events_subject ON rate_events (subject, created_at);

CREATE TABLE blocked_subjects (
  subject TEXT PRIMARY KEY,
  reason TEXT,
  created_at TEXT NOT NULL
);
