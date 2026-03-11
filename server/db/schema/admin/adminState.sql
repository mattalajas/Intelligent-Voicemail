CREATE TABLE IF NOT EXISTS voicemail_admin_states (
  caller_phone TEXT PRIMARY KEY,
  queue_id INTEGER NOT NULL,
  assigned_gp_id INTEGER,
  owner_label TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('New', 'In Progress', 'Resolved')),
  status_note TEXT,
  status_note_type TEXT CHECK (status_note_type IN ('progress', 'resolution') OR status_note_type IS NULL),
  updated_at TEXT NOT NULL,
  FOREIGN KEY (queue_id) REFERENCES queues(id),
  FOREIGN KEY (assigned_gp_id) REFERENCES gps(id)
);
