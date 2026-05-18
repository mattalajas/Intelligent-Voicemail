CREATE TABLE IF NOT EXISTS raw_voicemails (
  caller_phone TEXT NOT NULL,
  transcription TEXT NOT NULL,
  clinic_id INTEGER NOT NULL,
  received_at TEXT NOT NULL,
  patient_name TEXT,
  audio_file_path TEXT,
  UNIQUE (caller_phone, clinic_id, received_at),
  FOREIGN KEY (clinic_id) REFERENCES clinics(id)
);

CREATE INDEX IF NOT EXISTS idx_raw_voicemails_phone
ON raw_voicemails (caller_phone);

CREATE INDEX IF NOT EXISTS idx_raw_voicemails_clinic_received
ON raw_voicemails (clinic_id, received_at DESC);
