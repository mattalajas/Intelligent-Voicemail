CREATE TABLE IF NOT EXISTS proxy_ai_voicemail_outputs (
  voicemail_id TEXT PRIMARY KEY,
  model_name TEXT NOT NULL,
  reason TEXT NOT NULL,
  reason_confidence TEXT NOT NULL,
  summary TEXT NOT NULL,
  summary_confidence TEXT NOT NULL,
  next_step TEXT NOT NULL,
  next_step_confidence TEXT NOT NULL,
  urgency_fallback TEXT NOT NULL,
  FOREIGN KEY (voicemail_id) REFERENCES voicemail_messages(id)
);

CREATE TABLE IF NOT EXISTS voicemail_intent_classifications (
  voicemail_id TEXT NOT NULL,
  intent_id INTEGER NOT NULL,
  classification_score REAL NOT NULL,
  PRIMARY KEY (voicemail_id, intent_id),
  FOREIGN KEY (voicemail_id) REFERENCES voicemail_messages(id),
  FOREIGN KEY (intent_id) REFERENCES intents(id)
);
