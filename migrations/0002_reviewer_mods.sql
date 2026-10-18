-- 審核者負責的模組；審核者沒有任何一列時可審核全部模組，管理員不受限制
CREATE TABLE reviewer_mods (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mod_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, mod_id)
);
