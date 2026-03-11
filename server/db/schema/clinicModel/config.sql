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

CREATE TABLE IF NOT EXISTS patient_urgency_markers (
  id INTEGER PRIMARY KEY,
  patient_id INTEGER NOT NULL,
  gp_id INTEGER NOT NULL,
  urgency TEXT NOT NULL,
  note TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  UNIQUE(patient_id, gp_id),
  FOREIGN KEY (patient_id) REFERENCES patients(id),
  FOREIGN KEY (gp_id) REFERENCES gps(id)
);
