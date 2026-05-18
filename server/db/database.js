import Database from "better-sqlite3";
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  INTENT_CLASSIFICATION_THRESHOLD,
  PROTOTYPE_VOICEMAIL_MODEL,
  runPrototypeVoicemailModel,
  scoreToConfidenceLabel,
} from "../ai/prototypeVoicemailModel.js";
import {
  clinics,
  demoReferenceTime,
  gps,
  intentQueueRoutes,
  intents,
  patientGpRelationships,
  patientUrgencyMarkers,
  patients,
  queues,
  rawVoicemails,
  structuredVoicemails,
  urgencyKeywords,
  voicemailAdminStates,
  voicemailIntentClassifications,
  voicemailUrgencyKeywordSimilarities,
} from "./seedData.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = process.env.VOICEMAIL_DATA_DIR
  ? path.resolve(process.cwd(), process.env.VOICEMAIL_DATA_DIR)
  : path.join(__dirname, "data");
const audioDir = path.join(dataDir, "audio");
const dbPath = process.env.VOICEMAIL_DB_PATH
  ? path.resolve(process.cwd(), process.env.VOICEMAIL_DB_PATH)
  : path.join(dataDir, "voicemail.sqlite");
const schemaPaths = [
  path.join(__dirname, "schema", "clinic", "reference.sql"),
  path.join(__dirname, "schema", "clinicModel", "config.sql"),
  path.join(__dirname, "schema", "voicemail", "raw.sql"),
  path.join(__dirname, "schema", "voicemail", "structured.sql"),
  path.join(__dirname, "schema", "ai", "proxyLookup.sql"),
  path.join(__dirname, "schema", "admin", "adminState.sql"),
];
const schemaSql = schemaPaths.map((schemaFilePath) => readFileSync(schemaFilePath, "utf8")).join("\n\n");
const standardIntentLabels = new Set(intents.filter((item) => item.clinicId == null).map((item) => item.label));
const URGENCY_KEYWORD_SIMILARITY_THRESHOLD = 0.6;
const urgencyRank = {
  Critical: 0,
  High: 1,
  Normal: 2,
  Low: 3,
  Unknown: 4,
};
const lowConfidenceScoreByIntentId = {
  1: 0.11,
  2: 0.09,
  3: 0.1,
  4: 0.08,
  5: 0.07,
  6: 0.08,
  7: 0.12,
  8: 0.06,
  9: 0.05,
};
const lowUrgencySimilarityScoreByUrgency = {
  Critical: 0.12,
  High: 0.1,
  Normal: 0.08,
  Low: 0.06,
};

function toAudioUrl(audioFilePath) {
  const normalizedAudioFilePath = String(audioFilePath || "").trim();
  if (!normalizedAudioFilePath) {
    return null;
  }

  const encodedSegments = normalizedAudioFilePath
    .replace(/\\/g, "/")
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment));

  return encodedSegments.length ? `/media/voicemails/${encodedSegments.join("/")}` : null;
}

function ensureDataDir() {
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }
  if (!existsSync(audioDir)) {
    mkdirSync(audioDir, { recursive: true });
  }
}

function clearStoredAudioFiles() {
  if (!existsSync(audioDir)) {
    return;
  }

  readdirSync(audioDir, { withFileTypes: true }).forEach((entry) => {
    if (!entry.isFile()) {
      return;
    }

    unlinkSync(path.join(audioDir, entry.name));
  });
}

function getColumnNames(db, tableName) {
  return new Set(
    db
      .prepare(`PRAGMA table_info(${tableName})`)
      .all()
      .map((column) => column.name),
  );
}

function ensureReferenceCompatibility(db) {
  const patientColumns = getColumnNames(db, "patients");
  if (!patientColumns.has("date_of_birth")) {
    db.exec(`
      ALTER TABLE patients
      ADD COLUMN date_of_birth TEXT NOT NULL DEFAULT '1900-01-01'
    `);
  }
}

function ensureVoicemailStorageCompatibility(db) {
  const rawVoicemailColumns = getColumnNames(db, "raw_voicemails");
  if (!rawVoicemailColumns.has("audio_file_path")) {
    db.exec(`
      ALTER TABLE raw_voicemails
      ADD COLUMN audio_file_path TEXT
    `);
  }

  const structuredVoicemailColumns = getColumnNames(db, "structured_voicemails");
  if (!structuredVoicemailColumns.has("audio_file_path")) {
    db.exec(`
      ALTER TABLE structured_voicemails
      ADD COLUMN audio_file_path TEXT
    `);
  }
}

function ensureTaxonomyCompatibility(db) {
  const intentColumns = getColumnNames(db, "intents");
  if (!intentColumns.has("is_active")) {
    db.exec(`
      ALTER TABLE intents
      ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1
    `);
  }

  const urgencyKeywordColumns = getColumnNames(db, "urgency_keywords");
  if (!urgencyKeywordColumns.has("is_active")) {
    db.exec(`
      ALTER TABLE urgency_keywords
      ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1
    `);
  }

  const intentClassificationColumns = getColumnNames(db, "voicemail_intent_classifications");
  if (!intentClassificationColumns.has("intent_label_snapshot")) {
    db.exec(`
      ALTER TABLE voicemail_intent_classifications
      ADD COLUMN intent_label_snapshot TEXT NOT NULL DEFAULT ''
    `);
  }

  const urgencySimilarityColumns = getColumnNames(db, "voicemail_urgency_keyword_similarities");
  if (!urgencySimilarityColumns.has("urgency_keyword_snapshot")) {
    db.exec(`
      ALTER TABLE voicemail_urgency_keyword_similarities
      ADD COLUMN urgency_keyword_snapshot TEXT NOT NULL DEFAULT ''
    `);
  }
  if (!urgencySimilarityColumns.has("urgency_level_snapshot")) {
    db.exec(`
      ALTER TABLE voicemail_urgency_keyword_similarities
      ADD COLUMN urgency_level_snapshot TEXT NOT NULL DEFAULT ''
    `);
  }

  db.exec(`
    UPDATE intents
    SET is_active = COALESCE(is_active, 1)
  `);
  db.exec(`
    UPDATE urgency_keywords
    SET is_active = COALESCE(is_active, 1)
  `);
  db.exec(`
    UPDATE voicemail_intent_classifications
    SET intent_label_snapshot = COALESCE(
      NULLIF(intent_label_snapshot, ''),
      (SELECT label FROM intents WHERE id = intent_id),
      'Unknown'
    )
  `);
  db.exec(`
    UPDATE voicemail_urgency_keyword_similarities
    SET
      urgency_keyword_snapshot = COALESCE(
        NULLIF(urgency_keyword_snapshot, ''),
        (SELECT keyword FROM urgency_keywords WHERE id = urgency_keyword_id),
        'unknown'
      ),
      urgency_level_snapshot = COALESCE(
        NULLIF(urgency_level_snapshot, ''),
        (SELECT urgency FROM urgency_keywords WHERE id = urgency_keyword_id),
        'Unknown'
      )
  `);
}

function ensureAdminStateCompatibility(db) {
  const adminStateColumns = getColumnNames(db, "voicemail_admin_states");
  if (!adminStateColumns.has("urgency_override")) {
    db.exec(`
      ALTER TABLE voicemail_admin_states
      ADD COLUMN urgency_override TEXT
      CHECK (urgency_override IN ('Critical', 'High', 'Normal', 'Low', 'Unknown') OR urgency_override IS NULL)
    `);
  }
  if (!adminStateColumns.has("is_archived")) {
    db.exec(`
      ALTER TABLE voicemail_admin_states
      ADD COLUMN is_archived INTEGER NOT NULL DEFAULT 0 CHECK (is_archived IN (0, 1))
    `);
  }
}

function defaultIntentClassificationScore(voicemailId, intentId) {
  const checksum = Array.from(voicemailId).reduce((sum, character) => sum + character.charCodeAt(0), 0);
  const variation = ((checksum + intentId * 17) % 4) * 0.01;
  const baseScore = lowConfidenceScoreByIntentId[intentId] ?? 0.05;
  return Number(Math.max(0.01, baseScore - variation).toFixed(2));
}

function defaultUrgencySimilarityScore(voicemailId, urgencyKeywordId, urgency) {
  const checksum = Array.from(voicemailId).reduce((sum, character) => sum + character.charCodeAt(0), 0);
  const variation = ((checksum + urgencyKeywordId * 13) % 5) * 0.01;
  const baseScore = lowUrgencySimilarityScoreByUrgency[urgency] ?? 0.05;
  return Number(Math.max(0.01, baseScore - variation).toFixed(2));
}

function insertSeedData(db) {
  const insertClinic = db.prepare("INSERT OR IGNORE INTO clinics (id, name) VALUES (@id, @name)");
  const insertGp = db.prepare("INSERT OR IGNORE INTO gps (id, name, clinic_id, specialty) VALUES (@id, @name, @clinicId, @specialty)");
  const insertPatient = db.prepare(`
    INSERT INTO patients (id, full_name, date_of_birth, phone, clinic_id)
    VALUES (@id, @fullName, @dateOfBirth, @phone, @clinicId)
    ON CONFLICT(id) DO UPDATE SET
      full_name = excluded.full_name,
      date_of_birth = excluded.date_of_birth,
      phone = excluded.phone,
      clinic_id = excluded.clinic_id
  `);
  const insertRelationship = db.prepare(
    "INSERT OR IGNORE INTO patient_gp_relationships (patient_id, gp_id, relationship_type, is_primary) VALUES (@patientId, @gpId, @relationshipType, @isPrimary)",
  );
  const insertQueue = db.prepare(`
    INSERT INTO queues (id, name, clinic_id, is_system, default_owner_label)
    VALUES (@id, @name, @clinicId, @isSystem, @defaultOwnerLabel)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      clinic_id = excluded.clinic_id,
      is_system = excluded.is_system,
      default_owner_label = excluded.default_owner_label
  `);
  const insertIntent = db.prepare(`
    INSERT INTO intents (id, label, clinic_id, is_system, is_active)
    VALUES (@id, @label, @clinicId, @isSystem, @isActive)
    ON CONFLICT(id) DO UPDATE SET
      label = excluded.label,
      clinic_id = excluded.clinic_id,
      is_system = excluded.is_system,
      is_active = excluded.is_active
  `);
  const insertIntentQueueRoute = db.prepare(`
    INSERT INTO intent_queue_routes (clinic_id, intent_id, queue_id)
    VALUES (@clinicId, @intentId, @queueId)
    ON CONFLICT(clinic_id, intent_id) DO UPDATE SET
      queue_id = excluded.queue_id
  `);
  const insertUrgencyKeyword = db.prepare(`
    INSERT INTO urgency_keywords (id, clinic_id, urgency, keyword, is_system, is_active)
    VALUES (@id, @clinicId, @urgency, @keyword, @isSystem, @isActive)
    ON CONFLICT(id) DO UPDATE SET
      clinic_id = excluded.clinic_id,
      urgency = excluded.urgency,
      keyword = excluded.keyword,
      is_system = excluded.is_system,
      is_active = excluded.is_active
  `);
  const insertPatientUrgencyMarker = db.prepare(`
    INSERT INTO patient_urgency_markers (id, patient_id, gp_id, urgency, note, is_active)
    VALUES (@id, @patientId, @gpId, @urgency, @note, @isActive)
    ON CONFLICT(id) DO UPDATE SET
      patient_id = excluded.patient_id,
      gp_id = excluded.gp_id,
      urgency = excluded.urgency,
      note = excluded.note,
      is_active = excluded.is_active
  `);
  const insertStructuredVoicemail = db.prepare(`
    INSERT INTO structured_voicemails (
      voicemail_id,
      patient_id,
      caller_name,
      caller_phone,
      clinic_id,
      received_at,
      audio_file_path,
      transcription,
      transcription_confidence,
      transcription_summary,
      reason_for_call,
      recommended_steps
    ) VALUES (
      @voicemailId,
      @patientId,
      @callerName,
      @callerPhone,
      @clinicId,
      @receivedAt,
      @audioFilePath,
      @transcription,
      @transcriptionConfidence,
      @transcriptionSummary,
      @reasonForCall,
      @recommendedSteps
    )
    ON CONFLICT(voicemail_id) DO UPDATE SET
      patient_id = excluded.patient_id,
      caller_name = excluded.caller_name,
      caller_phone = excluded.caller_phone,
      clinic_id = excluded.clinic_id,
      received_at = excluded.received_at,
      audio_file_path = excluded.audio_file_path,
      transcription = excluded.transcription,
      transcription_confidence = excluded.transcription_confidence,
      transcription_summary = excluded.transcription_summary,
      reason_for_call = excluded.reason_for_call,
      recommended_steps = excluded.recommended_steps
  `);
  const insertRawVoicemail = db.prepare(`
    INSERT INTO raw_voicemails (
      caller_phone,
      transcription,
      clinic_id,
      received_at,
      patient_name,
      audio_file_path
    ) VALUES (
      @callerPhone,
      @transcription,
      @clinicId,
      @receivedAt,
      @patientName,
      @audioFilePath
    )
    ON CONFLICT(caller_phone, clinic_id, received_at) DO UPDATE SET
      transcription = excluded.transcription,
      patient_name = excluded.patient_name,
      audio_file_path = excluded.audio_file_path
  `);
  const insertVoicemailIntentClassification = db.prepare(`
    INSERT INTO voicemail_intent_classifications (voicemail_id, intent_id, classification_score, intent_label_snapshot)
    VALUES (@voicemailId, @intentId, @classificationScore, @intentLabelSnapshot)
    ON CONFLICT(voicemail_id, intent_id) DO UPDATE SET
      classification_score = excluded.classification_score,
      intent_label_snapshot = excluded.intent_label_snapshot
  `);
  const insertVoicemailUrgencyKeywordSimilarity = db.prepare(`
    INSERT INTO voicemail_urgency_keyword_similarities (
      voicemail_id, urgency_keyword_id, similarity_score, urgency_keyword_snapshot, urgency_level_snapshot
    )
    VALUES (@voicemailId, @urgencyKeywordId, @similarityScore, @urgencyKeywordSnapshot, @urgencyLevelSnapshot)
    ON CONFLICT(voicemail_id, urgency_keyword_id) DO UPDATE SET
      similarity_score = excluded.similarity_score,
      urgency_keyword_snapshot = excluded.urgency_keyword_snapshot,
      urgency_level_snapshot = excluded.urgency_level_snapshot
  `);
  const insertVoicemailAdminState = db.prepare(`
    INSERT INTO voicemail_admin_states (
      caller_phone, queue_id, assigned_gp_id, owner_label, status, is_archived, urgency_override, status_note, status_note_type, updated_at
    ) VALUES (
      @callerPhone, @queueId, @assignedGpId, @ownerLabel, @status, @isArchived, @urgencyOverride, @statusNote, @statusNoteType, @updatedAt
    )
    ON CONFLICT(caller_phone) DO UPDATE SET
      queue_id = excluded.queue_id,
      assigned_gp_id = excluded.assigned_gp_id,
      owner_label = excluded.owner_label,
      status = excluded.status,
      is_archived = excluded.is_archived,
      urgency_override = excluded.urgency_override,
      status_note = excluded.status_note,
      status_note_type = excluded.status_note_type,
      updated_at = excluded.updated_at
  `);

  const seed = db.transaction(() => {
    clinics.forEach((row) => insertClinic.run(row));
    gps.forEach((row) => insertGp.run(row));
    patients.forEach((row) => insertPatient.run(row));
    patientGpRelationships.forEach((row) => insertRelationship.run(row));
    queues.forEach((row) => insertQueue.run(row));
    intents.forEach((row) => insertIntent.run(row));
    intentQueueRoutes.forEach((row) => insertIntentQueueRoute.run(row));
    urgencyKeywords.forEach((row) => insertUrgencyKeyword.run(row));
    patientUrgencyMarkers.forEach((row) => insertPatientUrgencyMarker.run(row));
    rawVoicemails.forEach((row) => insertRawVoicemail.run({ audioFilePath: null, ...row }));
    structuredVoicemails.forEach((row) => insertStructuredVoicemail.run({ audioFilePath: null, ...row }));
    voicemailIntentClassifications.forEach((row) => insertVoicemailIntentClassification.run(row));
    voicemailUrgencyKeywordSimilarities.forEach((row) => insertVoicemailUrgencyKeywordSimilarity.run(row));
    voicemailAdminStates.forEach((row) => insertVoicemailAdminState.run({ isArchived: 0, urgencyOverride: null, ...row }));
  });

  seed();
}

export function reseedDatabase(db) {
  const reset = db.transaction(() => {
    db.exec(`
      DELETE FROM voicemail_admin_states;
      DELETE FROM voicemail_urgency_keyword_similarities;
      DELETE FROM voicemail_intent_classifications;
      DELETE FROM raw_voicemails;
      DELETE FROM structured_voicemails;
      DELETE FROM patient_urgency_markers;
      DELETE FROM intent_queue_routes;
      DELETE FROM urgency_keywords;
      DELETE FROM intents;
      DELETE FROM queues;
      DELETE FROM patient_gp_relationships;
      DELETE FROM patients;
      DELETE FROM gps;
      DELETE FROM clinics;
    `);
    clearStoredAudioFiles();
    insertSeedData(db);
    syncIntentClassificationLookups(db);
    syncUrgencyKeywordSimilarityLookups(db);
  });

  reset();
}

function formatTimeLabel(isoString) {
  return new Date(isoString).toLocaleTimeString("en-NZ", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatAgeLabel(isoString) {
  const diffMs = new Date(demoReferenceTime) - new Date(isoString);
  const totalMinutes = Math.max(0, Math.round(diffMs / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) {
    return `${minutes}m ago`;
  }

  if (minutes === 0) {
    return `${hours}h ago`;
  }

  return `${hours}h ${minutes}m ago`;
}

function buildUrgencyKeywordSimilarityCandidates(row, similaritiesByVoicemail) {
  const allMatches = [...(similaritiesByVoicemail.get(row.id) ?? [])]
    .sort((a, b) => b.score - a.score || urgencyRank[a.urgency] - urgencyRank[b.urgency] || a.keyword.localeCompare(b.keyword));
  const qualifyingMatches = allMatches.filter((match) => match.score >= URGENCY_KEYWORD_SIMILARITY_THRESHOLD);

  return {
    allMatches,
    qualifyingMatches,
    highestSimilarityMatch: qualifyingMatches[0] ?? null,
  };
}

function classifyUrgency(row, similaritiesByVoicemail) {
  const urgencyCandidates = buildUrgencyKeywordSimilarityCandidates(row, similaritiesByVoicemail);
  const aboveThresholdMatches = urgencyCandidates.qualifyingMatches;

  if (aboveThresholdMatches.length === 0) {
    return {
      urgency: "Unknown",
      urgencySource: "no urgency signals",
      matchedUrgencyKeywords: [],
    };
  }

  const highestMatch = aboveThresholdMatches[0];

  return {
    urgency: highestMatch.urgency,
    urgencySource: "urgency keyword similarity",
    matchedUrgencyKeywords: aboveThresholdMatches.map((match) => ({
      keyword: match.keyword,
      urgency: match.urgency,
      score: match.score,
    })),
  };
}

function getTargetClinicIds(db, clinicId = null) {
  if (clinicId != null) {
    return [clinicId];
  }

  return db
    .prepare("SELECT DISTINCT clinic_id AS clinicId FROM structured_voicemails ORDER BY clinic_id ASC")
    .all()
    .map((row) => row.clinicId);
}

function getActiveIntentTaxonomyForClinic(db, clinicId) {
  return db
    .prepare(
      `
        SELECT id, label
        FROM intents
        WHERE is_active = 1
          AND (clinic_id IS NULL OR clinic_id = ?)
        ORDER BY is_system DESC, label ASC
      `,
    )
    .all(clinicId);
}

function getActiveUrgencyKeywordTaxonomyForClinic(db, clinicId) {
  return db
    .prepare(
      `
        SELECT id, keyword, urgency
        FROM urgency_keywords
        WHERE is_active = 1
          AND (clinic_id IS NULL OR clinic_id = ?)
        ORDER BY is_system DESC, keyword ASC
      `,
    )
    .all(clinicId);
}

function syncIntentClassificationLookups(db, clinicId = null) {
  const upsertClassification = db.prepare(`
    INSERT INTO voicemail_intent_classifications (
      voicemail_id, intent_id, classification_score, intent_label_snapshot
    ) VALUES (
      @voicemailId, @intentId, @classificationScore, @intentLabelSnapshot
    )
    ON CONFLICT(voicemail_id, intent_id) DO UPDATE SET
      classification_score = excluded.classification_score,
      intent_label_snapshot = excluded.intent_label_snapshot
  `);

  const sync = db.transaction((targetClinicIds) => {
    targetClinicIds.forEach((targetClinicId) => {
      const activeIntents = getActiveIntentTaxonomyForClinic(db, targetClinicId);

      const voicemailIds = db
        .prepare("SELECT voicemail_id AS voicemailId FROM structured_voicemails WHERE clinic_id = ? ORDER BY voicemail_id ASC")
        .all(targetClinicId);

      if (!activeIntents.length || !voicemailIds.length) {
        return;
      }

      const existingScores = db
        .prepare(
          `
            SELECT
              vic.voicemail_id AS voicemailId,
              vic.intent_id AS intentId,
              vic.classification_score AS score
            FROM voicemail_intent_classifications vic
            JOIN structured_voicemails sv ON sv.voicemail_id = vic.voicemail_id
            WHERE sv.clinic_id = ?
          `,
        )
        .all(targetClinicId)
        .reduce((map, row) => {
          map.set(`${row.voicemailId}:${row.intentId}`, row.score);
          return map;
        }, new Map());

      voicemailIds.forEach(({ voicemailId }) => {
        activeIntents.forEach((intent) => {
          upsertClassification.run({
            voicemailId,
            intentId: intent.id,
            classificationScore:
              existingScores.get(`${voicemailId}:${intent.id}`) ?? defaultIntentClassificationScore(voicemailId, intent.id),
            intentLabelSnapshot: intent.label,
          });
        });
      });
    });
  });

  sync(getTargetClinicIds(db, clinicId));
}

function syncUrgencyKeywordSimilarityLookups(db, clinicId = null) {
  const upsertSimilarity = db.prepare(`
    INSERT INTO voicemail_urgency_keyword_similarities (
      voicemail_id, urgency_keyword_id, similarity_score, urgency_keyword_snapshot, urgency_level_snapshot
    ) VALUES (
      @voicemailId, @urgencyKeywordId, @similarityScore, @urgencyKeywordSnapshot, @urgencyLevelSnapshot
    )
    ON CONFLICT(voicemail_id, urgency_keyword_id) DO UPDATE SET
      similarity_score = excluded.similarity_score,
      urgency_keyword_snapshot = excluded.urgency_keyword_snapshot,
      urgency_level_snapshot = excluded.urgency_level_snapshot
  `);

  const sync = db.transaction((targetClinicIds) => {
    targetClinicIds.forEach((targetClinicId) => {
      const activeUrgencyKeywords = getActiveUrgencyKeywordTaxonomyForClinic(db, targetClinicId);

      const voicemailIds = db
        .prepare("SELECT voicemail_id AS voicemailId FROM structured_voicemails WHERE clinic_id = ? ORDER BY voicemail_id ASC")
        .all(targetClinicId);

      if (!activeUrgencyKeywords.length || !voicemailIds.length) {
        return;
      }

      const existingScores = db
        .prepare(
          `
            SELECT
              vuks.voicemail_id AS voicemailId,
              vuks.urgency_keyword_id AS urgencyKeywordId,
              vuks.similarity_score AS score
            FROM voicemail_urgency_keyword_similarities vuks
            JOIN structured_voicemails sv ON sv.voicemail_id = vuks.voicemail_id
            WHERE sv.clinic_id = ?
          `,
        )
        .all(targetClinicId)
        .reduce((map, row) => {
          map.set(`${row.voicemailId}:${row.urgencyKeywordId}`, row.score);
          return map;
        }, new Map());

      voicemailIds.forEach(({ voicemailId }) => {
        activeUrgencyKeywords.forEach((urgencyKeyword) => {
          upsertSimilarity.run({
            voicemailId,
            urgencyKeywordId: urgencyKeyword.id,
            similarityScore:
              existingScores.get(`${voicemailId}:${urgencyKeyword.id}`) ??
              defaultUrgencySimilarityScore(voicemailId, urgencyKeyword.id, urgencyKeyword.urgency),
            urgencyKeywordSnapshot: urgencyKeyword.keyword,
            urgencyLevelSnapshot: urgencyKeyword.urgency,
          });
        });
      });
    });
  });

  sync(getTargetClinicIds(db, clinicId));
}

function normalizeBooleanInput(value) {
  if (typeof value === "boolean") {
    return value;
  }

  if (value === 1 || value === "1" || value === "true") {
    return true;
  }

  if (value === 0 || value === "0" || value === "false") {
    return false;
  }

  return null;
}

function getStructuredVoicemailRecord(db, voicemailId) {
  return db
    .prepare(
      `
        SELECT
          sv.voicemail_id AS voicemailId,
          sv.clinic_id AS clinicId,
          sv.patient_id AS patientId,
          COALESCE(p.full_name, sv.caller_name, 'Unknown caller') AS patientName,
          p.date_of_birth AS patientDateOfBirth,
          c.name AS clinicName,
          sv.caller_name AS callerName,
          sv.caller_phone AS callerPhone,
          sv.received_at AS receivedAt,
          sv.audio_file_path AS audioFilePath,
          ? AS model,
          sv.transcription AS transcription,
          sv.transcription_confidence AS transcriptionConfidence,
          sv.transcription_summary AS transcriptionSummary,
          sv.reason_for_call AS reasonForCall,
          sv.recommended_steps AS recommendedSteps
        FROM structured_voicemails sv
        JOIN clinics c ON c.id = sv.clinic_id
        LEFT JOIN patients p ON p.id = sv.patient_id
        WHERE sv.voicemail_id = ?
      `,
    )
    .get(PROTOTYPE_VOICEMAIL_MODEL, voicemailId);
}

export function getStoredAudioPathForVoicemail(db, voicemailId) {
  const record = getStructuredVoicemailRecord(db, voicemailId);
  const normalizedAudioFilePath = String(record?.audioFilePath || "").trim();

  if (!record || !normalizedAudioFilePath) {
    return null;
  }

  return {
    voicemailId: record.voicemailId,
    callerPhone: record.callerPhone,
    clinicId: record.clinicId,
    receivedAt: record.receivedAt,
    audioFilePath: normalizedAudioFilePath,
  };
}

export function getGeminiVoicemailTaxonomy(db, clinicId) {
  const normalizedClinicId = Number(clinicId);
  if (!Number.isInteger(normalizedClinicId) || normalizedClinicId <= 0) {
    throw new Error("Valid clinicId is required");
  }

  return {
    intents: getActiveIntentTaxonomyForClinic(db, normalizedClinicId).map((intent) => ({
      id: intent.id,
      label: intent.label,
    })),
    urgencyKeywords: getActiveUrgencyKeywordTaxonomyForClinic(db, normalizedClinicId).map((keyword) => ({
      id: keyword.id,
      keyword: keyword.keyword,
      urgency: keyword.urgency,
    })),
  };
}

function getVoicemailUrgencyContext(db, voicemailId) {
  const record = getStructuredVoicemailRecord(db, voicemailId);

  if (!record) {
    return null;
  }

  return {
    voicemailId: record.voicemailId,
    clinicId: record.clinicId,
    patientId: record.patientId,
    callerPhone: record.callerPhone,
    receivedAt: record.receivedAt,
    model: record.model,
    transcriptionConfidence: record.transcriptionConfidence,
  };
}

function buildIntentCandidates(row, classificationsByVoicemail) {
  const allCandidates = [...(classificationsByVoicemail.get(row.id) ?? [])].sort(
    (a, b) => b.score - a.score || a.label.localeCompare(b.label),
  );
  const fallbackCandidate = {
    intentId: null,
    label: "Unknown",
    score: 0,
  };
  const sortedCandidates = allCandidates.length ? allCandidates : [fallbackCandidate];
  const qualifyingCandidates = sortedCandidates.filter((candidate) => candidate.score >= INTENT_CLASSIFICATION_THRESHOLD);
  const highestCandidate = sortedCandidates[0] ?? fallbackCandidate;
  const primaryCandidate =
    qualifyingCandidates[0] ??
    {
      intentId: null,
      label: "Unknown",
      score: highestCandidate.score ?? 0,
    };

  return {
    allCandidates: sortedCandidates.map((candidate) => ({
      ...candidate,
      confidence: scoreToConfidenceLabel(candidate.score),
    })),
    primaryIntent: primaryCandidate,
    qualifyingIntents: qualifyingCandidates.map((candidate) => ({
      ...candidate,
      confidence: scoreToConfidenceLabel(candidate.score),
    })),
  };
}

function buildPreviousVoicemailInputs(row, rowsByPhone) {
  const callerRows = rowsByPhone.get(row.phone) ?? [];

  return callerRows
    .filter((candidate) => new Date(candidate.received_at) < new Date(row.received_at))
    .sort((a, b) => new Date(b.received_at) - new Date(a.received_at))
    .map((candidate) => ({
      voicemailId: candidate.id,
      transcript: candidate.transcript,
      metadata: {
        receivedAt: candidate.received_at,
        callerPhone: candidate.phone,
        location: candidate.location,
      },
      urgency: candidate.resolvedUrgency ?? candidate.urgency ?? "Unknown",
    }));
}

function buildVoicemailModelInput(row, rowsByPhone, intentCandidates, keywordUrgencySuggestion) {
  return {
    transcript: row.transcript,
    metadata: {
      voicemailId: row.id,
      receivedAt: row.received_at,
      callerPhone: row.phone,
      location: row.location,
    },
    previousVoicemails: buildPreviousVoicemailInputs(row, rowsByPhone),
    proxy: {
      reason: row.reason,
      summary: row.summary,
      nextStep: row.next_step,
      transcriptionConfidence: row.transcription_confidence,
    },
    intentCandidates: intentCandidates.allCandidates,
    fallbackIntent: {
      ...intentCandidates.primaryIntent,
      confidence: scoreToConfidenceLabel(intentCandidates.primaryIntent.score),
    },
    intentThreshold: INTENT_CLASSIFICATION_THRESHOLD,
    urgencySignals: {
      keywordSuggestion: keywordUrgencySuggestion,
      patientUrgencyMarker: row.patient_marker_urgency
        ? {
            urgency: row.patient_marker_urgency,
            gpName: row.patient_marker_gp_name,
            note: row.patient_marker_note,
          }
        : null,
    },
  };
}

function mapVoicemailRow(row) {
  const modelOutput = row.aiWorkflow.output;
  const transcript = row.transcript ?? "";
  const hasTranscriptSnapshot = transcript.trim().length > 0;
  const reason = modelOutput.reason?.trim() || "AI transcription unavailable. Review audio before triage.";
  const summary = modelOutput.summary?.trim() || "No structured summary available because the transcription model did not respond.";

  return {
    id: row.phone,
    latestVoicemailId: row.id,
    patient: row.patient_name,
    patientDateOfBirth: row.patient_date_of_birth,
    location: row.location,
    phone: row.phone,
    time: formatTimeLabel(row.received_at),
    age: formatAgeLabel(row.received_at),
    intent: modelOutput.intent,
    intents: modelOutput.intents ?? [],
    intentThreshold: INTENT_CLASSIFICATION_THRESHOLD,
    primaryIntentScore: modelOutput.primaryIntentScore,
    urgency: modelOutput.urgency,
    urgencySource: modelOutput.urgencySource,
    machineUrgency: row.machineSelectedUrgency,
    machineUrgencySource: row.machineSelectedUrgencySource,
    isUrgencyManuallyOverridden: row.isUrgencyManuallyOverridden,
    matchedUrgencyKeywords: modelOutput.matchedUrgencyKeywords,
    patientUrgencyMarker: modelOutput.patientUrgencyMarker,
    queue: row.queue,
    owner: row.owner_label,
    status: row.status,
    isArchived: Boolean(row.isArchived),
    intentConfidence: modelOutput.intentConfidence,
    transcriptionConfidence: modelOutput.transcriptionConfidence,
    reason,
    summary,
    nextStep: modelOutput.nextStep,
    resolutionNote: row.status_note ?? "",
    resolutionNoteType: row.status_note_type ?? null,
    transcript,
    audioUrl: toAudioUrl(row.audio_file_path),
    hasTranscriptSnapshot,
    patientDateOfBirth: row.patient_date_of_birth,
    primaryGp: row.primary_gp_name,
    assignedGp: row.assigned_gp_name,
    patientClinic: row.location,
    aiWorkflow: row.aiWorkflow,
  };
}

function buildHistoryEntry(row) {
  const modelOutput = row.aiWorkflow.output;
  const transcript = row.transcript ?? "";
  const hasTranscriptSnapshot = transcript.trim().length > 0;
  const reason = modelOutput.reason?.trim() || "AI transcription unavailable. Review audio before triage.";
  const summary = modelOutput.summary?.trim() || "No structured summary available because the transcription model did not respond.";

  return {
    voicemailId: row.id,
    receivedAt: row.received_at,
    time: formatTimeLabel(row.received_at),
    age: formatAgeLabel(row.received_at),
    intent: modelOutput.intent,
    intents: modelOutput.intents ?? [],
    intentThreshold: INTENT_CLASSIFICATION_THRESHOLD,
    primaryIntentScore: modelOutput.primaryIntentScore,
    queue: row.queue,
    urgency: modelOutput.urgency,
    urgencySource: modelOutput.urgencySource,
    machineUrgency: row.machineSelectedUrgency,
    machineUrgencySource: row.machineSelectedUrgencySource,
    isUrgencyManuallyOverridden: row.isUrgencyManuallyOverridden,
    matchedUrgencyKeywords: modelOutput.matchedUrgencyKeywords,
    patientUrgencyMarker: modelOutput.patientUrgencyMarker,
    status: row.status,
    isArchived: Boolean(row.isArchived),
    intentConfidence: modelOutput.intentConfidence,
    transcriptionConfidence: modelOutput.transcriptionConfidence,
    reason,
    summary,
    resolutionNote: row.status_note ?? "",
    resolutionNoteType: row.status_note_type ?? null,
    transcript,
    audioUrl: toAudioUrl(row.audio_file_path),
    hasTranscriptSnapshot,
    patientDateOfBirth: row.patient_date_of_birth,
    nextStep: modelOutput.nextStep,
    aiWorkflow: row.aiWorkflow,
  };
}

const urgencyOrder = {
  Critical: 0,
  High: 1,
  Normal: 2,
  Low: 3,
  Unknown: 4,
};

const statusOrder = {
  New: 0,
  "In Progress": 1,
  Resolved: 2,
};

function sortGroupedItems(a, b) {
  return (
    urgencyOrder[a.urgency] - urgencyOrder[b.urgency] ||
    statusOrder[a.status] - statusOrder[b.status] ||
    new Date(b.receivedAt) - new Date(a.receivedAt)
  );
}

function groupVoicemailRows(rows) {
  const groups = new Map();

  rows.forEach((row) => {
    const existing = groups.get(row.phone);
    const historyEntry = buildHistoryEntry(row);

    if (!existing) {
      const baseItem = mapVoicemailRow(row);
      groups.set(row.phone, {
        ...baseItem,
        receivedAt: row.received_at,
        callCount: 1,
        history: [historyEntry],
        historicalContext: "First voicemail from this number in the current inbox window.",
      });
      return;
    }

    existing.callCount += 1;
    existing.history.push(historyEntry);

    if (new Date(row.received_at) > new Date(existing.receivedAt)) {
      const latestItem = mapVoicemailRow(row);
      Object.assign(existing, {
        ...latestItem,
        receivedAt: row.received_at,
        callCount: existing.callCount,
        history: existing.history,
      });
    }
  });

  return [...groups.values()]
    .map((item) => {
      const history = [...item.history].sort((a, b) => new Date(b.receivedAt) - new Date(a.receivedAt));
      const latest = history[0];
      const previous = history[1];
      const historicalContext =
        history.length > 1
          ? `${history.length} calls from this number. Latest update at ${latest.time}${
              previous ? ` after an earlier message at ${previous.time}` : ""
            }.`
          : "First voicemail from this number in the current inbox window.";

      return {
        ...item,
        history,
        callCount: history.length,
        historicalContext,
      };
    })
    .sort(sortGroupedItems);
}

function getPrimaryGpForCaller(db, callerPhone) {
  return (
    db
      .prepare(
        `
          SELECT g.id, g.name
          FROM structured_voicemails sv
          JOIN patient_gp_relationships pgr ON pgr.patient_id = sv.patient_id AND pgr.is_primary = 1
          JOIN gps g ON g.id = pgr.gp_id
          WHERE sv.caller_phone = ?
          ORDER BY datetime(sv.received_at) DESC
          LIMIT 1
        `,
      )
      .get(callerPhone) ?? null
  );
}

function getLatestCallerContext(db, callerPhone) {
  return (
    db
      .prepare(
        `
          SELECT
            sv.caller_phone,
            sv.clinic_id,
            vas.queue_id,
            vas.assigned_gp_id,
            vas.is_archived,
            vas.urgency_override,
            vas.owner_label,
            vas.status,
            vas.status_note,
            vas.status_note_type
          FROM structured_voicemails sv
          LEFT JOIN voicemail_admin_states vas ON vas.caller_phone = sv.caller_phone
          WHERE sv.caller_phone = ?
          ORDER BY datetime(sv.received_at) DESC
          LIMIT 1
        `,
      )
      .get(callerPhone) ?? null
  );
}

function getQueueForClinicByName(db, clinicId, queueName) {
  return (
    db
      .prepare(
        `
          SELECT id, name, default_owner_label
          FROM queues
          WHERE name = ?
            AND (clinic_id = ? OR clinic_id IS NULL)
          ORDER BY CASE WHEN clinic_id = ? THEN 0 ELSE 1 END
          LIMIT 1
        `,
      )
      .get(queueName, clinicId, clinicId) ?? null
  );
}

function getQueueRouteForIntent(db, clinicId, intentId) {
  if (!clinicId || !intentId) {
    return null;
  }

  return (
    db
      .prepare(
        `
          SELECT
            q.id,
            q.name,
            q.default_owner_label
          FROM intent_queue_routes iqr
          JOIN queues q ON q.id = iqr.queue_id
          WHERE iqr.clinic_id = ? AND iqr.intent_id = ?
          LIMIT 1
        `,
      )
      .get(clinicId, intentId) ?? null
  );
}

function resolveQueueAssignment(db, callerPhone, queue) {
  if (!queue) {
    return {
      queueId: null,
      ownerLabel: "Front desk",
      assignedGpId: null,
    };
  }

  if (queue.name === "GP Callbacks") {
    const primaryGp = getPrimaryGpForCaller(db, callerPhone);
    return {
      queueId: queue.id,
      ownerLabel: primaryGp?.name ?? "Front desk",
      assignedGpId: primaryGp?.id ?? null,
    };
  }

  const gp = db.prepare("SELECT id FROM gps WHERE name = ?").get(queue.default_owner_label);
  return {
    queueId: queue.id,
    ownerLabel: queue.default_owner_label,
    assignedGpId: gp ? gp.id : null,
  };
}

function upsertVoicemailAdminState(db, callerPhone, state) {
  db.prepare(
    `
      INSERT INTO voicemail_admin_states (
        caller_phone, queue_id, assigned_gp_id, owner_label, status, is_archived, urgency_override, status_note, status_note_type, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(caller_phone) DO UPDATE SET
        queue_id = excluded.queue_id,
        assigned_gp_id = excluded.assigned_gp_id,
        owner_label = excluded.owner_label,
        status = excluded.status,
        is_archived = excluded.is_archived,
        urgency_override = excluded.urgency_override,
        status_note = excluded.status_note,
        status_note_type = excluded.status_note_type,
        updated_at = excluded.updated_at
  `,
  ).run(
    callerPhone,
    state.queueId,
    state.assignedGpId,
    state.ownerLabel,
    state.status,
    state.isArchived ? 1 : 0,
    state.urgencyOverride,
    state.statusNote,
    state.statusNoteType,
    state.updatedAt ?? new Date().toISOString(),
  );
}

function findPatientByPhoneAndClinic(db, callerPhone, clinicId) {
  return (
    db
      .prepare(
        `
          SELECT
            id,
            full_name AS fullName,
            clinic_id AS clinicId
          FROM patients
          WHERE phone = ? AND clinic_id = ?
          LIMIT 1
        `,
      )
      .get(callerPhone, clinicId) ?? null
  );
}

function generateVoicemailId() {
  return `VM-UP-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

export function initDatabase() {
  ensureDataDir();
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(schemaSql);
  ensureReferenceCompatibility(db);
  ensureVoicemailStorageCompatibility(db);
  ensureTaxonomyCompatibility(db);
  ensureAdminStateCompatibility(db);
  insertSeedData(db);
  syncIntentClassificationLookups(db);
  syncUrgencyKeywordSimilarityLookups(db);

  return db;
}

export function getRawVoicemails(db) {
  return db
    .prepare(
      `
        SELECT
          rv.caller_phone AS callerPhone,
          rv.transcription,
          rv.clinic_id AS clinicId,
          c.name AS clinicName,
          rv.received_at AS receivedAt,
          rv.patient_name AS patientName,
          rv.audio_file_path AS audioFilePath
        FROM raw_voicemails rv
        JOIN clinics c ON c.id = rv.clinic_id
        ORDER BY datetime(rv.received_at) DESC, rv.caller_phone ASC
      `,
    )
    .all()
    .map((row) => ({
      ...row,
      audioUrl: toAudioUrl(row.audioFilePath),
    }));
}

export function getVoicemails(db) {
  const urgencyKeywordSimilarities = db
    .prepare(
      `
        SELECT
          vuks.voicemail_id AS voicemailId,
          vuks.urgency_keyword_id AS urgencyKeywordId,
          vuks.urgency_keyword_snapshot AS keyword,
          vuks.urgency_level_snapshot AS urgency,
          vuks.similarity_score AS score
        FROM voicemail_urgency_keyword_similarities vuks
        JOIN urgency_keywords uk ON uk.id = vuks.urgency_keyword_id
        WHERE uk.is_active = 1
        ORDER BY vuks.voicemail_id, vuks.similarity_score DESC, vuks.urgency_keyword_snapshot ASC
      `,
    )
    .all();
  const similaritiesByVoicemail = urgencyKeywordSimilarities.reduce((map, row) => {
    const key = row.voicemailId;
    const current = map.get(key) ?? [];
    current.push({
      urgencyKeywordId: row.urgencyKeywordId,
      keyword: row.keyword,
      urgency: row.urgency,
      score: row.score,
    });
    map.set(key, current);
    return map;
  }, new Map());
  const intentClassifications = db
    .prepare(
      `
        SELECT
          vic.voicemail_id AS voicemailId,
          vic.intent_id AS intentId,
          vic.intent_label_snapshot AS label,
          vic.classification_score AS score
        FROM voicemail_intent_classifications vic
        JOIN intents i ON i.id = vic.intent_id
        WHERE i.is_active = 1
        ORDER BY vic.voicemail_id, vic.classification_score DESC, vic.intent_label_snapshot ASC
      `,
    )
    .all();
  const classificationsByVoicemail = intentClassifications.reduce((map, row) => {
    const current = map.get(row.voicemailId) ?? [];
    current.push({
      intentId: row.intentId,
      label: row.label,
      score: row.score,
    });
    map.set(row.voicemailId, current);
    return map;
  }, new Map());

  const rows = db.prepare(`
    SELECT
      sv.voicemail_id AS id,
      sv.clinic_id,
      sv.patient_id,
      COALESCE(p.full_name, sv.caller_name, 'Unknown caller') AS patient_name,
      p.date_of_birth AS patient_date_of_birth,
      c.name AS location,
      sv.caller_phone AS phone,
      sv.received_at,
      sv.audio_file_path,
      ? AS model_name,
      sv.reason_for_call AS reason,
      sv.transcription_summary AS summary,
      sv.recommended_steps AS next_step,
      sv.transcription_confidence,
      COALESCE(vas.status, 'New') AS status,
      COALESCE(vas.is_archived, 0) AS is_archived,
      vas.urgency_override,
      vas.status_note,
      vas.status_note_type,
      COALESCE(vas.owner_label, q.default_owner_label) AS owner_label,
      COALESCE(vas.queue_id, q.id) AS queue_id,
      q.name AS queue,
      vas.assigned_gp_id,
      sv.transcription AS transcript,
      agp.name AS assigned_gp_name,
      pgp.name AS primary_gp_name,
      pum.urgency AS patient_marker_urgency,
      pum.note AS patient_marker_note,
      mgp.name AS patient_marker_gp_name
    FROM structured_voicemails sv
    JOIN clinics c ON c.id = sv.clinic_id
    LEFT JOIN voicemail_admin_states vas ON vas.caller_phone = sv.caller_phone
    LEFT JOIN queues q ON q.id = vas.queue_id
    LEFT JOIN patients p ON p.id = sv.patient_id
    LEFT JOIN gps agp ON agp.id = vas.assigned_gp_id
    LEFT JOIN patient_gp_relationships pgr ON pgr.patient_id = p.id AND pgr.is_primary = 1
    LEFT JOIN gps pgp ON pgp.id = pgr.gp_id
    LEFT JOIN patient_urgency_markers pum ON pum.patient_id = p.id AND pum.is_active = 1
    LEFT JOIN gps mgp ON mgp.id = pum.gp_id
    ORDER BY
      CASE COALESCE(vas.status, 'New') WHEN 'New' THEN 0 WHEN 'In Progress' THEN 1 ELSE 2 END,
      datetime(sv.received_at) DESC
  `).all(PROTOTYPE_VOICEMAIL_MODEL);

  const rowsWithUrgencySignals = rows.map((row) => {
    const keywordUrgencySuggestion = classifyUrgency(row, similaritiesByVoicemail);
    const patientUrgencyMarker = row.patient_marker_urgency
      ? {
          urgency: row.patient_marker_urgency,
          gpName: row.patient_marker_gp_name,
          note: row.patient_marker_note,
        }
      : null;

    return {
      ...row,
      keywordUrgencySuggestion,
      machineSelectedUrgency: patientUrgencyMarker?.urgency ?? keywordUrgencySuggestion.urgency,
      machineSelectedUrgencySource: patientUrgencyMarker ? "patient urgency marker" : keywordUrgencySuggestion.urgencySource,
      resolvedUrgency: row.urgency_override ?? patientUrgencyMarker?.urgency ?? keywordUrgencySuggestion.urgency,
      patientUrgencyMarker,
      isArchived: Boolean(row.is_archived),
      isUrgencyManuallyOverridden: Boolean(row.urgency_override),
    };
  });

  const rowsByPhone = rowsWithUrgencySignals.reduce((map, row) => {
    const current = map.get(row.phone) ?? [];
    current.push(row);
    map.set(row.phone, current);
    return map;
  }, new Map());

  const classifiedRows = rowsWithUrgencySignals.map((row) => {
    const intentsForVoicemail = buildIntentCandidates(row, classificationsByVoicemail);
    const machineWorkflow = runPrototypeVoicemailModel(
      buildVoicemailModelInput(row, rowsByPhone, intentsForVoicemail, row.keywordUrgencySuggestion),
    );
    const aiWorkflow = {
      ...machineWorkflow,
      output: {
        ...machineWorkflow.output,
        urgency: row.resolvedUrgency,
        urgencySource: row.isUrgencyManuallyOverridden ? "manual staff override" : machineWorkflow.output.urgencySource,
      },
    };

    return {
      ...row,
      urgency: row.resolvedUrgency,
      aiWorkflow,
    };
  });

  return groupVoicemailRows(classifiedRows);
}

export function getVoicemailIntentClassification(db, voicemailId) {
  const voicemail = getVoicemailUrgencyContext(db, voicemailId);

  if (!voicemail) {
    return null;
  }

  const classificationRows = db
    .prepare(
      `
        SELECT
          vic.intent_id AS intentId,
          vic.intent_label_snapshot AS label,
          vic.classification_score AS score
        FROM voicemail_intent_classifications vic
        JOIN intents i ON i.id = vic.intent_id
        WHERE vic.voicemail_id = ? AND i.is_active = 1
        ORDER BY vic.classification_score DESC, vic.intent_label_snapshot ASC
      `,
    )
    .all(voicemailId);

  const intentCandidates = buildIntentCandidates(
    {
      id: voicemailId,
      transcription_confidence: voicemail.transcriptionConfidence,
    },
    new Map([[voicemailId, classificationRows]]),
  );

  return {
    voicemailId: voicemail.voicemailId,
    clinicId: voicemail.clinicId,
    callerPhone: voicemail.callerPhone,
    receivedAt: voicemail.receivedAt,
    model: voicemail.model,
    transcriptionConfidence: voicemail.transcriptionConfidence,
    threshold: INTENT_CLASSIFICATION_THRESHOLD,
    primaryIntent: {
      ...intentCandidates.primaryIntent,
      confidence: scoreToConfidenceLabel(intentCandidates.primaryIntent.score),
    },
    qualifyingIntents: intentCandidates.qualifyingIntents,
    classifications: intentCandidates.allCandidates,
  };
}

export function getVoicemailUrgencyClassification(db, voicemailId) {
  const voicemail = getVoicemailUrgencyContext(db, voicemailId);

  if (!voicemail) {
    return null;
  }

  const similarityRows = db
    .prepare(
      `
        SELECT
          vuks.urgency_keyword_id AS urgencyKeywordId,
          vuks.urgency_keyword_snapshot AS keyword,
          vuks.urgency_level_snapshot AS urgency,
          vuks.similarity_score AS score
        FROM voicemail_urgency_keyword_similarities vuks
        JOIN urgency_keywords uk ON uk.id = vuks.urgency_keyword_id
        WHERE vuks.voicemail_id = ? AND uk.is_active = 1
        ORDER BY vuks.similarity_score DESC, vuks.urgency_keyword_snapshot ASC
      `,
    )
    .all(voicemailId);

  const urgencyCandidates = buildUrgencyKeywordSimilarityCandidates(
    { id: voicemailId },
    new Map([
      [
        voicemailId,
        similarityRows.map((row) => ({
          urgencyKeywordId: row.urgencyKeywordId,
          keyword: row.keyword,
          urgency: row.urgency,
          score: row.score,
        })),
      ],
    ]),
  );

  const availableGpMarkers = voicemail.patientId
    ? db
        .prepare(
          `
            SELECT
              pum.id,
              pum.patient_id AS patientId,
              pum.gp_id AS gpId,
              g.name AS gpName,
              pum.urgency,
              pum.note,
              pum.is_active AS isActive
            FROM patient_urgency_markers pum
            JOIN gps g ON g.id = pum.gp_id
            WHERE pum.patient_id = ? AND pum.is_active = 1
            ORDER BY
              CASE pum.urgency
                WHEN 'Critical' THEN 0
                WHEN 'High' THEN 1
                WHEN 'Normal' THEN 2
                WHEN 'Low' THEN 3
                ELSE 4
              END,
              g.name ASC
          `,
        )
        .all(voicemail.patientId)
    : [];
  const patientUrgencyMarker = availableGpMarkers[0] ?? null;
  const keywordUrgencySuggestion = classifyUrgency(
    { id: voicemailId },
    new Map([[voicemailId, urgencyCandidates.allMatches]]),
  );
  const resolvedUrgency = patientUrgencyMarker?.urgency ?? keywordUrgencySuggestion.urgency;
  const urgencySource = patientUrgencyMarker ? "patient urgency marker" : keywordUrgencySuggestion.urgencySource;

  return {
    voicemailId: voicemail.voicemailId,
    clinicId: voicemail.clinicId,
    callerPhone: voicemail.callerPhone,
    receivedAt: voicemail.receivedAt,
    model: voicemail.model,
    transcriptionConfidence: voicemail.transcriptionConfidence,
    threshold: URGENCY_KEYWORD_SIMILARITY_THRESHOLD,
    selectedKeyword: urgencyCandidates.highestSimilarityMatch,
    qualifyingSimilarities: urgencyCandidates.qualifyingMatches,
    similarities: urgencyCandidates.allMatches,
    availableGpMarkers,
    patientUrgencyMarker,
    urgency: resolvedUrgency,
    urgencySource,
  };
}

export function getStructuredVoicemailTranscription(db, voicemailId) {
  const structuredVoicemail = getStructuredVoicemailRecord(db, voicemailId);

  if (!structuredVoicemail) {
    return null;
  }

  const intentClassification = getVoicemailIntentClassification(db, voicemailId);
  const urgencyClassification = getVoicemailUrgencyClassification(db, voicemailId);

  return {
    voicemailId: structuredVoicemail.voicemailId,
    patientId: structuredVoicemail.patientId,
    patientName: structuredVoicemail.patientName,
    patientDateOfBirth: structuredVoicemail.patientDateOfBirth,
    clinicId: structuredVoicemail.clinicId,
    clinicName: structuredVoicemail.clinicName,
    receivedAt: structuredVoicemail.receivedAt,
    callerPhone: structuredVoicemail.callerPhone,
    audioUrl: toAudioUrl(structuredVoicemail.audioFilePath),
    transcription: structuredVoicemail.transcription,
    transcriptionConfidence: structuredVoicemail.transcriptionConfidence,
    transcriptionSummary: structuredVoicemail.transcriptionSummary,
    reasonForCall: structuredVoicemail.reasonForCall,
    recommendedSteps: structuredVoicemail.recommendedSteps,
    model: structuredVoicemail.model,
    finalIntentLabel: intentClassification?.primaryIntent?.label ?? "Unknown",
    intentClassification: intentClassification
      ? {
          threshold: intentClassification.threshold,
          primaryIntent: intentClassification.primaryIntent,
          qualifyingIntents: intentClassification.qualifyingIntents,
          classifications: intentClassification.classifications,
        }
      : null,
    finalUrgencyLabel: urgencyClassification?.urgency ?? "Unknown",
    urgencyClassification: urgencyClassification
      ? {
          threshold: urgencyClassification.threshold,
          urgencySource: urgencyClassification.urgencySource,
          selectedKeyword: urgencyClassification.selectedKeyword,
          urgencyKeywords: urgencyClassification.similarities,
          qualifyingUrgencyKeywords: urgencyClassification.qualifyingSimilarities,
          gpMarkers: urgencyClassification.availableGpMarkers,
          patientUrgencyMarker: urgencyClassification.patientUrgencyMarker,
        }
      : null,
  };
}

export function getStructuredVoicemailTranscriptionsByPhone(db, callerPhone) {
  const normalizedCallerPhone = String(callerPhone || "").trim();

  if (!normalizedCallerPhone) {
    return [];
  }

  const voicemailIds = db
    .prepare(
      `
        SELECT voicemail_id AS voicemailId
        FROM structured_voicemails
        WHERE caller_phone = ?
        ORDER BY datetime(received_at) DESC, voicemail_id DESC
      `,
    )
    .all(normalizedCallerPhone)
    .map((row) => row.voicemailId);

  return voicemailIds
    .map((voicemailId) => getStructuredVoicemailTranscription(db, voicemailId))
    .filter(Boolean);
}

export function createUploadedVoicemailTranscript(
  db,
  {
    callerPhone,
    clinicId,
    transcript,
    summary,
    reasonForCall,
    recommendedSteps,
    intentScores = [],
    urgencyKeywordScores = [],
    audioFilePath = null,
    transcriptionConfidence = "Medium",
  } = {},
) {
  const normalizedCallerPhone = String(callerPhone || "").trim();
  const normalizedTranscript = String(transcript || "").trim();
  const normalizedClinicId = Number(clinicId);
  const normalizedAudioFilePath = audioFilePath == null ? null : String(audioFilePath).trim() || null;
  const normalizedConfidence = String(transcriptionConfidence || "Medium").trim();

  if (!normalizedCallerPhone) {
    throw new Error("callerPhone is required");
  }

  if (!Number.isInteger(normalizedClinicId) || normalizedClinicId <= 0) {
    throw new Error("clinicId is required");
  }

  if (!normalizedTranscript) {
    throw new Error("Transcript is required");
  }

  if (!["High", "Medium", "Low"].includes(normalizedConfidence)) {
    throw new Error("Valid transcription confidence is required");
  }

  const clinic = db.prepare("SELECT id, name FROM clinics WHERE id = ?").get(normalizedClinicId);
  if (!clinic) {
    throw new Error("Clinic not found");
  }

  const patient = findPatientByPhoneAndClinic(db, normalizedCallerPhone, normalizedClinicId);
  const receivedAt = new Date().toISOString();
  const voicemailId = generateVoicemailId();
  const normalizedSummary = String(summary || "").trim() || normalizedTranscript;
  const normalizedReasonForCall =
    String(reasonForCall || "").trim() || "Uploaded voicemail transcript awaiting review.";
  const normalizedRecommendedSteps =
    String(recommendedSteps || "").trim() || "Review transcript and route manually.";

  const insertRawVoicemail = db.prepare(`
    INSERT INTO raw_voicemails (
      caller_phone,
      transcription,
      clinic_id,
      received_at,
      patient_name,
      audio_file_path
    ) VALUES (?, ?, ?, ?, ?, ?)
  `);
  const insertStructuredVoicemail = db.prepare(`
    INSERT INTO structured_voicemails (
      voicemail_id,
      patient_id,
      caller_name,
      caller_phone,
      clinic_id,
      received_at,
      audio_file_path,
      transcription,
      transcription_confidence,
      transcription_summary,
      reason_for_call,
      recommended_steps
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertAdminState = db.prepare(`
    INSERT INTO voicemail_admin_states (
      caller_phone, queue_id, assigned_gp_id, owner_label, status, is_archived, urgency_override, status_note, status_note_type, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(caller_phone) DO NOTHING
  `);

  const write = db.transaction(() => {
    insertRawVoicemail.run(
      normalizedCallerPhone,
      normalizedTranscript,
      normalizedClinicId,
      receivedAt,
      patient?.fullName ?? null,
      normalizedAudioFilePath,
    );

    insertStructuredVoicemail.run(
      voicemailId,
      patient?.id ?? null,
      patient ? null : "Unknown caller",
      normalizedCallerPhone,
      normalizedClinicId,
      receivedAt,
      normalizedAudioFilePath,
      normalizedTranscript,
      normalizedConfidence,
      normalizedSummary,
      normalizedReasonForCall,
      normalizedRecommendedSteps,
    );

    insertAdminState.run(
      normalizedCallerPhone,
      7,
      null,
      "Front desk",
      "New",
      0,
      null,
      null,
      null,
      receivedAt,
    );
  });

  write();
  syncIntentClassificationLookups(db, normalizedClinicId);
  syncUrgencyKeywordSimilarityLookups(db, normalizedClinicId);
  persistGeminiVoicemailAnalysis(db, voicemailId, normalizedClinicId, {
    transcription: normalizedTranscript,
    transcriptionConfidence: normalizedConfidence,
    summary: normalizedSummary,
    reasonForCall: normalizedReasonForCall,
    recommendedSteps: normalizedRecommendedSteps,
    intentScores,
    urgencyKeywordScores,
  });
  reopenCallerForNewVoicemail(db, normalizedCallerPhone);

  const item = getVoicemails(db).find((entry) => entry.id === normalizedCallerPhone) ?? null;
  return {
    voicemailId,
    item,
  };
}

export function refreshVoicemailTranscript(
  db,
  voicemailId,
  {
    transcript,
    summary,
    reasonForCall,
    recommendedSteps,
    intentScores = [],
    urgencyKeywordScores = [],
    transcriptionConfidence = "Medium",
  } = {},
) {
  const normalizedVoicemailId = String(voicemailId || "").trim();
  const normalizedTranscript = String(transcript || "").trim();
  const normalizedConfidence = String(transcriptionConfidence || "Medium").trim();

  if (!normalizedVoicemailId) {
    throw new Error("voicemailId is required");
  }

  if (!normalizedTranscript) {
    throw new Error("Transcript is required");
  }

  if (!["High", "Medium", "Low"].includes(normalizedConfidence)) {
    throw new Error("Valid transcription confidence is required");
  }

  const current = getStoredAudioPathForVoicemail(db, normalizedVoicemailId);
  if (!current) {
    throw new Error("Stored voicemail audio not found");
  }

  persistGeminiVoicemailAnalysis(db, normalizedVoicemailId, current.clinicId, {
    transcription: normalizedTranscript,
    transcriptionConfidence: normalizedConfidence,
    summary,
    reasonForCall,
    recommendedSteps,
    intentScores,
    urgencyKeywordScores,
  });

  const item = getVoicemails(db).find((entry) => entry.id === current.callerPhone) ?? null;
  return {
    voicemailId: normalizedVoicemailId,
    item,
  };
}

function persistGeminiVoicemailAnalysis(
  db,
  voicemailId,
  clinicId,
  {
    transcription,
    transcriptionConfidence = "Medium",
    summary,
    reasonForCall,
    recommendedSteps,
    intentScores = [],
    urgencyKeywordScores = [],
  } = {},
) {
  const normalizedVoicemailId = String(voicemailId || "").trim();
  const normalizedClinicId = Number(clinicId);
  const normalizedTranscript = String(transcription || "").trim();
  const normalizedConfidence = String(transcriptionConfidence || "Medium").trim();
  const normalizedSummary = String(summary || "").trim() || normalizedTranscript;
  const normalizedReasonForCall = String(reasonForCall || "").trim() || "Reason for call unavailable.";
  const normalizedRecommendedSteps = String(recommendedSteps || "").trim() || "Review voicemail";

  if (!normalizedVoicemailId) {
    throw new Error("voicemailId is required");
  }

  if (!Number.isInteger(normalizedClinicId) || normalizedClinicId <= 0) {
    throw new Error("Valid clinicId is required");
  }

  if (!normalizedTranscript) {
    throw new Error("Transcript is required");
  }

  if (!["High", "Medium", "Low"].includes(normalizedConfidence)) {
    throw new Error("Valid transcription confidence is required");
  }

  const structuredVoicemail = getStructuredVoicemailRecord(db, normalizedVoicemailId);
  if (!structuredVoicemail) {
    throw new Error("Structured voicemail not found");
  }

  const taxonomy = getGeminiVoicemailTaxonomy(db, normalizedClinicId);

  const normalizedIntentScores = taxonomy.intents.map((intent) => {
    const matchedIntent = intentScores.find(
      (candidate) => String(candidate?.label || "").trim().toLowerCase() === intent.label.toLowerCase(),
    );

    return {
      intentId: intent.id,
      intentLabelSnapshot: intent.label,
      classificationScore: normalizeGeminiModelScore(matchedIntent?.score),
    };
  });

  const normalizedUrgencyKeywordScores = taxonomy.urgencyKeywords.map((keyword) => {
    const matchedKeyword = urgencyKeywordScores.find((candidate) => {
      const normalizedKeyword = String(candidate?.keyword || "").trim().toLowerCase();
      const normalizedUrgency = String(candidate?.urgency || "").trim();
      return normalizedKeyword === keyword.keyword.toLowerCase() && normalizedUrgency === keyword.urgency;
    });

    return {
      urgencyKeywordId: keyword.id,
      urgencyKeywordSnapshot: keyword.keyword,
      urgencyLevelSnapshot: keyword.urgency,
      similarityScore: normalizeGeminiModelScore(matchedKeyword?.score),
    };
  });

  const highestIntent = [...normalizedIntentScores].sort(
    (a, b) => b.classificationScore - a.classificationScore || a.intentLabelSnapshot.localeCompare(b.intentLabelSnapshot),
  )[0] ?? null;

  db.transaction(() => {
    db.prepare(
      `
        UPDATE structured_voicemails
        SET
          transcription = ?,
          transcription_confidence = ?,
          transcription_summary = ?,
          reason_for_call = ?,
          recommended_steps = ?
        WHERE voicemail_id = ?
      `,
    ).run(
      normalizedTranscript,
      normalizedConfidence,
      normalizedSummary,
      normalizedReasonForCall,
      normalizedRecommendedSteps,
      normalizedVoicemailId,
    );

    db.prepare(
      `
        UPDATE raw_voicemails
        SET transcription = ?
        WHERE caller_phone = ? AND clinic_id = ? AND received_at = ?
      `,
    ).run(normalizedTranscript, structuredVoicemail.callerPhone, normalizedClinicId, structuredVoicemail.receivedAt);

    const upsertIntent = db.prepare(
      `
        INSERT INTO voicemail_intent_classifications (
          voicemail_id, intent_id, classification_score, intent_label_snapshot
        ) VALUES (?, ?, ?, ?)
        ON CONFLICT(voicemail_id, intent_id) DO UPDATE SET
          classification_score = excluded.classification_score,
          intent_label_snapshot = excluded.intent_label_snapshot
      `,
    );

    normalizedIntentScores.forEach((intent) => {
      upsertIntent.run(
        normalizedVoicemailId,
        intent.intentId,
        intent.classificationScore,
        intent.intentLabelSnapshot,
      );
    });

    const upsertUrgencyKeyword = db.prepare(
      `
        INSERT INTO voicemail_urgency_keyword_similarities (
          voicemail_id, urgency_keyword_id, similarity_score, urgency_keyword_snapshot, urgency_level_snapshot
        ) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(voicemail_id, urgency_keyword_id) DO UPDATE SET
          similarity_score = excluded.similarity_score,
          urgency_keyword_snapshot = excluded.urgency_keyword_snapshot,
          urgency_level_snapshot = excluded.urgency_level_snapshot
      `,
    );

    normalizedUrgencyKeywordScores.forEach((keyword) => {
      upsertUrgencyKeyword.run(
        normalizedVoicemailId,
        keyword.urgencyKeywordId,
        keyword.similarityScore,
        keyword.urgencyKeywordSnapshot,
        keyword.urgencyLevelSnapshot,
      );
    });

    const currentAdminState = getLatestCallerContext(db, structuredVoicemail.callerPhone);
    const routedQueue = highestIntent ? getQueueRouteForIntent(db, normalizedClinicId, highestIntent.intentId) : null;
    const queueAssignment = resolveQueueAssignment(db, structuredVoicemail.callerPhone, routedQueue);

    upsertVoicemailAdminState(db, structuredVoicemail.callerPhone, {
      queueId: queueAssignment.queueId ?? currentAdminState?.queue_id ?? null,
      assignedGpId: queueAssignment.assignedGpId ?? currentAdminState?.assigned_gp_id ?? null,
      ownerLabel: queueAssignment.ownerLabel ?? currentAdminState?.owner_label ?? "Front desk",
      status: currentAdminState?.status ?? "New",
      isArchived: Boolean(currentAdminState?.is_archived),
      urgencyOverride: currentAdminState?.urgency_override ?? null,
      statusNote: currentAdminState?.status_note ?? "",
      statusNoteType: currentAdminState?.status_note_type ?? null,
      updatedAt: new Date().toISOString(),
    });
  })();
}

function normalizeGeminiModelScore(score) {
  const numericScore = Number(score);
  if (!Number.isFinite(numericScore)) {
    return 0;
  }

  if (numericScore <= 1) {
    return Math.max(0, Math.min(1, Number(numericScore.toFixed(2))));
  }

  return Math.max(0, Math.min(1, Number((numericScore / 100).toFixed(2))));
}

function reopenCallerForNewVoicemail(db, callerPhone) {
  const current = getLatestCallerContext(db, callerPhone);
  if (!current) {
    return;
  }

  upsertVoicemailAdminState(db, callerPhone, {
    queueId: current.queue_id,
    assignedGpId: current.assigned_gp_id,
    ownerLabel: current.owner_label ?? "Front desk",
    status: "New",
    isArchived: false,
    urgencyOverride: null,
    statusNote: "",
    statusNoteType: null,
    updatedAt: new Date().toISOString(),
  });
}

export function updateVoicemail(db, id, patch) {
  const current = getLatestCallerContext(db, id);
  if (!current) {
    return null;
  }

  let queueId = current.queue_id;
  let ownerLabel = patch.owner ?? current.owner_label;
  let assignedGpId = current.assigned_gp_id;
  let status = patch.status ?? current.status ?? "New";
  let isArchived = Boolean(current.is_archived);
  let urgencyOverride = current.urgency_override ?? null;
  let statusNote = patch.resolutionNote ?? current.status_note ?? "";
  let statusNoteType = current.status_note_type ?? null;

  if (patch.archive === true) {
    isArchived = true;
  } else if (patch.archive === false) {
    isArchived = false;
  }

  if (patch.revertUrgency === true) {
    urgencyOverride = null;
  } else if (patch.urgencyOverride != null) {
    const normalizedUrgency = String(patch.urgencyOverride).trim();
    if (!Object.hasOwn(urgencyRank, normalizedUrgency)) {
      throw new Error("Valid urgency override is required");
    }
    urgencyOverride = normalizedUrgency;
  }

  if (patch.status === "Resolved") {
    statusNote = String(patch.resolutionNote || "").trim();
    if (!statusNote) {
      throw new Error("Resolution note is required before resolving a voicemail");
    }
    statusNoteType = "resolution";
  } else if (patch.status === "In Progress") {
    statusNote = String(patch.resolutionNote || "").trim();
    if (!statusNote) {
      throw new Error("Progress note is required before moving a voicemail to in progress");
    }
    statusNoteType = "progress";
  } else if (patch.status === "New") {
    statusNote = "";
    statusNoteType = null;
  }

  if (patch.queue) {
    const queue = getQueueForClinicByName(db, current.clinic_id, patch.queue);
    if (!queue) {
      throw new Error(`Unknown queue: ${patch.queue}`);
    }
    if (!patch.owner) {
      const queueAssignment = resolveQueueAssignment(db, id, queue);
      queueId = queueAssignment.queueId;
      ownerLabel = queueAssignment.ownerLabel;
      assignedGpId = queueAssignment.assignedGpId;
    } else {
      queueId = queue.id;
    }
  }

  if (patch.owner && ownerLabel) {
    const gp = db.prepare("SELECT id FROM gps WHERE name = ?").get(ownerLabel);
    assignedGpId = gp ? gp.id : null;
  }

  upsertVoicemailAdminState(db, id, {
    queueId,
    assignedGpId,
    ownerLabel,
    status,
    isArchived,
    urgencyOverride,
    statusNote,
    statusNoteType,
    updatedAt: new Date().toISOString(),
  });

  return getVoicemails(db).find((item) => item.id === id) ?? null;
}

function getIntentById(db, id) {
  return db
    .prepare(
      `
        SELECT
          id,
          label,
          clinic_id AS clinicId,
          is_system AS isSystem,
          is_active AS isActive
        FROM intents
        WHERE id = ?
      `,
    )
    .get(id);
}

export function getIntents(db, { includeInactive = false } = {}) {
  return db
    .prepare(
      `
        SELECT
          id,
          label,
          clinic_id AS clinicId,
          is_system AS isSystem,
          is_active AS isActive
        FROM intents
        ${includeInactive ? "" : "WHERE is_active = 1"}
        ORDER BY is_system DESC, label ASC
      `,
    )
    .all();
}

export function createIntent(db, label, clinicId = null) {
  const normalizedLabel = String(label || "").trim();
  if (!normalizedLabel) {
    throw new Error("Intent label is required");
  }

  if (standardIntentLabels.has(normalizedLabel) && clinicId == null) {
    return db
      .prepare(`
        SELECT id, label, clinic_id AS clinicId, is_system AS isSystem, is_active AS isActive
        FROM intents
        WHERE label = ? AND clinic_id IS NULL
      `)
      .get(normalizedLabel);
  }

  const existing = db
    .prepare(
      `
        SELECT id
        FROM intents
        WHERE label = ? AND clinic_id IS ?
      `,
    )
    .get(normalizedLabel, clinicId);

  if (existing) {
    db.prepare("UPDATE intents SET is_active = 1 WHERE id = ?").run(existing.id);
  } else {
    db.prepare(
      `
        INSERT INTO intents (label, clinic_id, is_system, is_active)
        VALUES (?, ?, 0, 1)
      `,
    ).run(normalizedLabel, clinicId);
  }

  syncIntentClassificationLookups(db, clinicId);

  const item = db
    .prepare(
      `
        SELECT id
        FROM intents
        WHERE label = ? AND clinic_id IS ?
      `,
    )
    .get(normalizedLabel, clinicId);

  return item ? getIntentById(db, item.id) : null;
}

export function updateIntent(db, id, { label, isActive } = {}) {
  const current = getIntentById(db, id);
  if (!current) {
    throw new Error("Intent not found");
  }

  if (current.isSystem) {
    throw new Error("System intents cannot be edited");
  }

  const normalizedLabel = label == null ? current.label : String(label).trim();
  if (!normalizedLabel) {
    throw new Error("Intent label is required");
  }

  const normalizedIsActive = isActive == null ? current.isActive : normalizeBooleanInput(isActive);
  if (normalizedIsActive == null) {
    throw new Error("isActive must be a boolean");
  }

  db.prepare(
    `
      UPDATE intents
      SET label = ?, is_active = ?
      WHERE id = ?
    `,
  ).run(normalizedLabel, Number(normalizedIsActive), id);

  syncIntentClassificationLookups(db, current.clinicId);

  return getIntentById(db, id);
}

export function getQueues(db) {
  return db
    .prepare(
      `
        SELECT
          id,
          name,
          clinic_id AS clinicId,
          is_system AS isSystem,
          default_owner_label AS defaultOwnerLabel
        FROM queues
        ORDER BY is_system DESC, name ASC
      `,
    )
    .all();
}

export function createQueue(db, { name, clinicId = null, defaultOwnerLabel = "Front desk" }) {
  const normalizedName = String(name || "").trim();
  const normalizedOwner = String(defaultOwnerLabel || "").trim() || "Front desk";

  if (!normalizedName) {
    throw new Error("Queue name is required");
  }

  const existing =
    db
      .prepare(
        `
          SELECT id
          FROM queues
          WHERE name = ? AND (
            clinic_id IS ? OR (clinic_id IS NULL AND ? IS NULL)
          )
        `,
      )
      .get(normalizedName, clinicId, clinicId) ?? null;

  if (existing) {
    db.prepare("UPDATE queues SET default_owner_label = ?, clinic_id = COALESCE(clinic_id, ?) WHERE id = ?").run(
      normalizedOwner,
      clinicId,
      existing.id,
    );
  } else {
    db.prepare(
      `
        INSERT INTO queues (name, clinic_id, is_system, default_owner_label)
        VALUES (?, ?, 0, ?)
      `,
    ).run(normalizedName, clinicId, normalizedOwner);
  }

  return db
    .prepare(
      `
        SELECT
          id,
          name,
          clinic_id AS clinicId,
          is_system AS isSystem,
          default_owner_label AS defaultOwnerLabel
        FROM queues
        WHERE name = ? AND clinic_id IS ?
      `,
    )
    .get(normalizedName, clinicId);
}

export function getIntentQueueRoutes(db) {
  return db
    .prepare(
      `
        SELECT
          iqr.clinic_id AS clinicId,
          iqr.intent_id AS intentId,
          i.label AS intentLabel,
          iqr.queue_id AS queueId,
          q.name AS queueName
        FROM intent_queue_routes iqr
        JOIN intents i ON i.id = iqr.intent_id
        JOIN queues q ON q.id = iqr.queue_id
        ORDER BY iqr.clinic_id, i.label
      `,
    )
    .all();
}

export function upsertIntentQueueRoute(db, { clinicId, intentId, queueId }) {
  if (!clinicId || !intentId || !queueId) {
    throw new Error("clinicId, intentId, and queueId are required");
  }

  db.prepare(
    `
      INSERT INTO intent_queue_routes (clinic_id, intent_id, queue_id)
      VALUES (?, ?, ?)
      ON CONFLICT(clinic_id, intent_id) DO UPDATE SET
        queue_id = excluded.queue_id
    `,
  ).run(clinicId, intentId, queueId);

  return db
    .prepare(
      `
        SELECT
          iqr.clinic_id AS clinicId,
          iqr.intent_id AS intentId,
          i.label AS intentLabel,
          iqr.queue_id AS queueId,
          q.name AS queueName
        FROM intent_queue_routes iqr
        JOIN intents i ON i.id = iqr.intent_id
        JOIN queues q ON q.id = iqr.queue_id
        WHERE iqr.clinic_id = ? AND iqr.intent_id = ?
      `,
    )
    .get(clinicId, intentId);
}

function getUrgencyKeywordById(db, id) {
  return db
    .prepare(
      `
        SELECT
          id,
          clinic_id AS clinicId,
          urgency,
          keyword,
          is_system AS isSystem,
          is_active AS isActive
        FROM urgency_keywords
        WHERE id = ?
      `,
    )
    .get(id);
}

export function getUrgencyKeywords(db, { includeInactive = false } = {}) {
  return db
    .prepare(
      `
        SELECT
          id,
          clinic_id AS clinicId,
          urgency,
          keyword,
          is_system AS isSystem,
          is_active AS isActive
        FROM urgency_keywords
        ${includeInactive ? "" : "WHERE is_active = 1"}
        ORDER BY urgency, keyword
      `,
    )
    .all();
}

export function createUrgencyKeyword(db, { clinicId = null, urgency, keyword }) {
  const normalizedUrgency = String(urgency || "").trim();
  const normalizedKeyword = String(keyword || "").trim().toLowerCase();

  if (!normalizedUrgency || !Object.hasOwn(urgencyRank, normalizedUrgency)) {
    throw new Error("Valid urgency is required");
  }

  if (!normalizedKeyword) {
    throw new Error("Keyword is required");
  }

  const existing = db
    .prepare(
      `
        SELECT id
        FROM urgency_keywords
        WHERE clinic_id IS ? AND urgency = ? AND keyword = ?
      `,
    )
    .get(clinicId, normalizedUrgency, normalizedKeyword);

  if (existing) {
    db.prepare("UPDATE urgency_keywords SET is_active = 1 WHERE id = ?").run(existing.id);
  } else {
    db.prepare(
      `
        INSERT INTO urgency_keywords (clinic_id, urgency, keyword, is_system, is_active)
        VALUES (?, ?, ?, 0, 1)
      `,
    ).run(clinicId, normalizedUrgency, normalizedKeyword);
  }

  syncUrgencyKeywordSimilarityLookups(db, clinicId);

  const item = db
    .prepare(
      `
        SELECT id
        FROM urgency_keywords
        WHERE clinic_id IS ? AND urgency = ? AND keyword = ?
      `,
    )
    .get(clinicId, normalizedUrgency, normalizedKeyword);

  return item ? getUrgencyKeywordById(db, item.id) : null;
}

export function updateUrgencyKeyword(db, id, { urgency, keyword, isActive } = {}) {
  const current = getUrgencyKeywordById(db, id);
  if (!current) {
    throw new Error("Urgency keyword not found");
  }

  if (current.isSystem) {
    throw new Error("System urgency keywords cannot be edited");
  }

  const normalizedUrgency = urgency == null ? current.urgency : String(urgency).trim();
  const normalizedKeyword = keyword == null ? current.keyword : String(keyword).trim().toLowerCase();
  const normalizedIsActive = isActive == null ? current.isActive : normalizeBooleanInput(isActive);

  if (!normalizedUrgency || !Object.hasOwn(urgencyRank, normalizedUrgency)) {
    throw new Error("Valid urgency is required");
  }

  if (!normalizedKeyword) {
    throw new Error("Keyword is required");
  }

  if (normalizedIsActive == null) {
    throw new Error("isActive must be a boolean");
  }

  db.prepare(
    `
      UPDATE urgency_keywords
      SET urgency = ?, keyword = ?, is_active = ?
      WHERE id = ?
    `,
  ).run(normalizedUrgency, normalizedKeyword, Number(normalizedIsActive), id);

  syncUrgencyKeywordSimilarityLookups(db, current.clinicId);

  return getUrgencyKeywordById(db, id);
}

export function getPatientUrgencyMarkers(db) {
  return db
    .prepare(
      `
        SELECT
          pum.id,
          pum.patient_id AS patientId,
          p.full_name AS patientName,
          pum.gp_id AS gpId,
          g.name AS gpName,
          pum.urgency,
          pum.note,
          pum.is_active AS isActive
        FROM patient_urgency_markers pum
        JOIN patients p ON p.id = pum.patient_id
        JOIN gps g ON g.id = pum.gp_id
        ORDER BY p.full_name ASC
      `,
    )
    .all();
}

export function upsertPatientUrgencyMarker(db, { patientId, gpId, urgency, note = "", isActive = 1 }) {
  const normalizedUrgency = String(urgency || "").trim();
  if (!patientId || !gpId) {
    throw new Error("patientId and gpId are required");
  }

  if (!Object.hasOwn(urgencyRank, normalizedUrgency)) {
    throw new Error("Valid urgency is required");
  }

  db.prepare(
    `
      INSERT INTO patient_urgency_markers (patient_id, gp_id, urgency, note, is_active)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(patient_id, gp_id) DO UPDATE SET
        urgency = excluded.urgency,
        note = excluded.note,
        is_active = excluded.is_active
    `,
  ).run(patientId, gpId, normalizedUrgency, String(note || "").trim(), isActive ? 1 : 0);

  return db
    .prepare(
      `
        SELECT
          pum.id,
          pum.patient_id AS patientId,
          p.full_name AS patientName,
          pum.gp_id AS gpId,
          g.name AS gpName,
          pum.urgency,
          pum.note,
          pum.is_active AS isActive
        FROM patient_urgency_markers pum
        JOIN patients p ON p.id = pum.patient_id
        JOIN gps g ON g.id = pum.gp_id
        WHERE pum.patient_id = ? AND pum.gp_id = ?
      `,
    )
    .get(patientId, gpId);
}

export { audioDir, dbPath, schemaPaths, schemaSql };
