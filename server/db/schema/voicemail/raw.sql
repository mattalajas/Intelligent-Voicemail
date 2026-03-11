CREATE TABLE IF NOT EXISTS voicemail_messages (
  id TEXT PRIMARY KEY,
  patient_id INTEGER,
  caller_name TEXT,
  caller_phone TEXT NOT NULL,
  clinic_id INTEGER NOT NULL,
  received_at TEXT NOT NULL,
  transcript TEXT NOT NULL,
  FOREIGN KEY (patient_id) REFERENCES patients(id),
  FOREIGN KEY (clinic_id) REFERENCES clinics(id)
);
