PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS clinics (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS gps (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  clinic_id INTEGER NOT NULL,
  specialty TEXT NOT NULL,
  FOREIGN KEY (clinic_id) REFERENCES clinics(id)
);

CREATE TABLE IF NOT EXISTS patients (
  id INTEGER PRIMARY KEY,
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  clinic_id INTEGER NOT NULL,
  FOREIGN KEY (clinic_id) REFERENCES clinics(id)
);

CREATE TABLE IF NOT EXISTS patient_gp_relationships (
  patient_id INTEGER NOT NULL,
  gp_id INTEGER NOT NULL,
  relationship_type TEXT NOT NULL,
  is_primary INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (patient_id, gp_id),
  FOREIGN KEY (patient_id) REFERENCES patients(id),
  FOREIGN KEY (gp_id) REFERENCES gps(id)
);

CREATE TABLE IF NOT EXISTS queues (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  clinic_id INTEGER,
  is_system INTEGER NOT NULL DEFAULT 0,
  default_owner_label TEXT NOT NULL,
  UNIQUE(name, clinic_id),
  FOREIGN KEY (clinic_id) REFERENCES clinics(id)
);

CREATE TABLE IF NOT EXISTS intents (
  id INTEGER PRIMARY KEY,
  label TEXT NOT NULL,
  clinic_id INTEGER,
  is_system INTEGER NOT NULL DEFAULT 0,
  UNIQUE(label, clinic_id),
  FOREIGN KEY (clinic_id) REFERENCES clinics(id)
);

CREATE TABLE IF NOT EXISTS intent_queue_routes (
  clinic_id INTEGER NOT NULL,
  intent_id INTEGER NOT NULL,
  queue_id INTEGER NOT NULL,
  PRIMARY KEY (clinic_id, intent_id),
  FOREIGN KEY (clinic_id) REFERENCES clinics(id),
  FOREIGN KEY (intent_id) REFERENCES intents(id),
  FOREIGN KEY (queue_id) REFERENCES queues(id)
);

CREATE TABLE IF NOT EXISTS urgency_keywords (
  id INTEGER PRIMARY KEY,
  clinic_id INTEGER,
  urgency TEXT NOT NULL,
  keyword TEXT NOT NULL,
  is_system INTEGER NOT NULL DEFAULT 0,
  UNIQUE(clinic_id, urgency, keyword),
  FOREIGN KEY (clinic_id) REFERENCES clinics(id)
);

CREATE TABLE IF NOT EXISTS voicemail_intent_classifications (
  voicemail_id TEXT NOT NULL,
  intent_id INTEGER NOT NULL,
  classification_score REAL NOT NULL,
  PRIMARY KEY (voicemail_id, intent_id),
  FOREIGN KEY (voicemail_id) REFERENCES voicemails(id),
  FOREIGN KEY (intent_id) REFERENCES intents(id)
);

CREATE TABLE IF NOT EXISTS voicemails (
  id TEXT PRIMARY KEY,
  patient_id INTEGER,
  caller_name TEXT,
  caller_phone TEXT NOT NULL,
  clinic_id INTEGER NOT NULL,
  queue_id INTEGER NOT NULL,
  assigned_gp_id INTEGER,
  owner_label TEXT NOT NULL,
  received_at TEXT NOT NULL,
  intent TEXT NOT NULL,
  intent_id INTEGER,
  urgency TEXT NOT NULL,
  status TEXT NOT NULL,
  confidence TEXT NOT NULL,
  intent_confidence TEXT,
  summary_confidence TEXT,
  reason TEXT NOT NULL,
  summary TEXT NOT NULL,
  next_step TEXT NOT NULL,
  resolution_note TEXT,
  transcript TEXT NOT NULL,
  FOREIGN KEY (patient_id) REFERENCES patients(id),
  FOREIGN KEY (clinic_id) REFERENCES clinics(id),
  FOREIGN KEY (queue_id) REFERENCES queues(id),
  FOREIGN KEY (assigned_gp_id) REFERENCES gps(id),
  FOREIGN KEY (intent_id) REFERENCES intents(id)
);
