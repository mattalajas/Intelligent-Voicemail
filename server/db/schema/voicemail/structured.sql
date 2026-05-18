CREATE TABLE IF NOT EXISTS structured_voicemails (
  voicemail_id TEXT PRIMARY KEY,
  patient_id INTEGER,
  caller_name TEXT,
  caller_phone TEXT NOT NULL,
  clinic_id INTEGER NOT NULL,
  received_at TEXT NOT NULL,
  audio_file_path TEXT,
  transcription TEXT NOT NULL,
  transcription_confidence TEXT NOT NULL CHECK (transcription_confidence IN ('High', 'Medium', 'Low')),
  transcription_summary TEXT NOT NULL,
  reason_for_call TEXT NOT NULL,
  recommended_steps TEXT NOT NULL,
  FOREIGN KEY (patient_id) REFERENCES patients(id),
  FOREIGN KEY (clinic_id) REFERENCES clinics(id)
);

CREATE INDEX IF NOT EXISTS idx_structured_voicemails_phone
ON structured_voicemails (caller_phone);

CREATE INDEX IF NOT EXISTS idx_structured_voicemails_clinic_received
ON structured_voicemails (clinic_id, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_structured_voicemails_patient
ON structured_voicemails (patient_id);
