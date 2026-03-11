CREATE TABLE IF NOT EXISTS voicemail_urgency_keyword_similarities (
  voicemail_id TEXT NOT NULL,
  urgency_keyword_id INTEGER NOT NULL,
  similarity_score REAL NOT NULL,
  urgency_keyword_snapshot TEXT NOT NULL,
  urgency_level_snapshot TEXT NOT NULL,
  PRIMARY KEY (voicemail_id, urgency_keyword_id),
  FOREIGN KEY (voicemail_id) REFERENCES structured_voicemails(voicemail_id),
  FOREIGN KEY (urgency_keyword_id) REFERENCES urgency_keywords(id)
);

CREATE TABLE IF NOT EXISTS voicemail_intent_classifications (
  voicemail_id TEXT NOT NULL,
  intent_id INTEGER NOT NULL,
  classification_score REAL NOT NULL,
  intent_label_snapshot TEXT NOT NULL,
  PRIMARY KEY (voicemail_id, intent_id),
  FOREIGN KEY (voicemail_id) REFERENCES structured_voicemails(voicemail_id),
  FOREIGN KEY (intent_id) REFERENCES intents(id)
);
