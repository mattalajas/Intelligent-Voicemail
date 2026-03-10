import Database from "better-sqlite3";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  INTENT_CLASSIFICATION_THRESHOLD,
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
  urgencyKeywords,
  voicemails,
  voicemailIntentClassifications,
} from "./seedData.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.join(__dirname, "data");
const dbPath = path.join(dataDir, "voicemail.sqlite");
const schemaPath = path.join(__dirname, "schema.sql");
const schemaSql = readFileSync(schemaPath, "utf8");
const standardIntentLabels = new Set(intents.map((item) => item.label));
const urgencyRank = {
  Critical: 0,
  High: 1,
  Normal: 2,
  Low: 3,
  Unknown: 4,
};

const confidenceScoreByLabel = {
  High: 0.92,
  Medium: 0.74,
  Low: 0.55,
};

function ensureDataDir() {
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }
}

function insertSeedData(db) {
  const seededIntentLabelsById = new Map(intents.map((item) => [item.id, item.label]));
  const seededIntentClassificationsByVoicemail = voicemailIntentClassifications.reduce((map, row) => {
    const current = map.get(row.voicemailId) ?? [];
    current.push(row);
    map.set(row.voicemailId, current);
    return map;
  }, new Map());
  const insertClinic = db.prepare("INSERT OR IGNORE INTO clinics (id, name) VALUES (@id, @name)");
  const insertGp = db.prepare("INSERT OR IGNORE INTO gps (id, name, clinic_id, specialty) VALUES (@id, @name, @clinicId, @specialty)");
  const insertPatient = db.prepare(
    "INSERT OR IGNORE INTO patients (id, full_name, phone, clinic_id) VALUES (@id, @fullName, @phone, @clinicId)",
  );
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
    INSERT INTO intents (id, label, clinic_id, is_system)
    VALUES (@id, @label, @clinicId, @isSystem)
    ON CONFLICT(id) DO UPDATE SET
      label = excluded.label,
      clinic_id = excluded.clinic_id,
      is_system = excluded.is_system
  `);
  const insertIntentQueueRoute = db.prepare(`
    INSERT INTO intent_queue_routes (clinic_id, intent_id, queue_id)
    VALUES (@clinicId, @intentId, @queueId)
    ON CONFLICT(clinic_id, intent_id) DO UPDATE SET
      queue_id = excluded.queue_id
  `);
  const insertUrgencyKeyword = db.prepare(`
    INSERT INTO urgency_keywords (id, clinic_id, urgency, keyword, is_system)
    VALUES (@id, @clinicId, @urgency, @keyword, @isSystem)
    ON CONFLICT(id) DO UPDATE SET
      clinic_id = excluded.clinic_id,
      urgency = excluded.urgency,
      keyword = excluded.keyword,
      is_system = excluded.is_system
  `);
  const insertVoicemailIntentClassification = db.prepare(`
    INSERT INTO voicemail_intent_classifications (voicemail_id, intent_id, classification_score)
    VALUES (@voicemailId, @intentId, @classificationScore)
    ON CONFLICT(voicemail_id, intent_id) DO UPDATE SET
      classification_score = excluded.classification_score
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
  const insertVoicemail = db.prepare(`
    INSERT OR IGNORE INTO voicemails (
      id, patient_id, caller_name, caller_phone, clinic_id, queue_id, assigned_gp_id, owner_label,
      received_at, intent, intent_id, urgency, status, confidence, intent_confidence, summary_confidence, reason, summary, next_step, resolution_note, transcript
    ) VALUES (
      @id, @patientId, @callerName, @callerPhone, @clinicId, @queueId, @assignedGpId, @ownerLabel,
      @receivedAt, @intent, @intentId, @urgency, @status, @confidence, @intentConfidence, @summaryConfidence, @reason, @summary, @nextStep, @resolutionNote, @transcript
    )
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
    voicemails.forEach((row) => {
      const topIntentClassification =
        [...(seededIntentClassificationsByVoicemail.get(row.id) ?? [])].sort(
          (a, b) => b.classificationScore - a.classificationScore,
        )[0] ?? null;
      const intentLabel = row.intent ?? seededIntentLabelsById.get(topIntentClassification?.intentId) ?? "General callback";
      const intentId =
        db.prepare("SELECT id FROM intents WHERE label = ? AND clinic_id IS NULL").get(intentLabel)?.id ??
        topIntentClassification?.intentId ??
        null;
      const intentConfidence =
        row.intentConfidence ??
        row.confidence ??
        scoreToConfidenceLabel(topIntentClassification?.classificationScore ?? 0.5);
      const summaryConfidence = row.summaryConfidence ?? row.confidence ?? intentConfidence;
      const confidence = row.confidence ?? intentConfidence;

      insertVoicemail.run({
        ...row,
        intent: intentLabel,
        intentId,
        confidence,
        intentConfidence,
        summaryConfidence,
        resolutionNote: row.resolutionNote ?? row.resolution_note ?? null,
      });
    });
    voicemailIntentClassifications.forEach((row) => insertVoicemailIntentClassification.run(row));
  });

  seed();
}

function ensureQueueColumns(db) {
  const columns = db.prepare("PRAGMA table_info(queues)").all();
  const hasClinicId = columns.some((column) => column.name === "clinic_id");
  const hasIsSystem = columns.some((column) => column.name === "is_system");

  if (!hasClinicId) {
    db.exec("ALTER TABLE queues ADD COLUMN clinic_id INTEGER REFERENCES clinics(id)");
  }

  if (!hasIsSystem) {
    db.exec("ALTER TABLE queues ADD COLUMN is_system INTEGER NOT NULL DEFAULT 0");
  }
}

function ensureVoicemailIntentColumn(db) {
  const columns = db.prepare("PRAGMA table_info(voicemails)").all();
  const hasIntentId = columns.some((column) => column.name === "intent_id");
  if (!hasIntentId) {
    db.exec("ALTER TABLE voicemails ADD COLUMN intent_id INTEGER REFERENCES intents(id)");
  }
}

function ensureVoicemailConfidenceColumns(db) {
  const columns = db.prepare("PRAGMA table_info(voicemails)").all();
  const hasIntentConfidence = columns.some((column) => column.name === "intent_confidence");
  const hasSummaryConfidence = columns.some((column) => column.name === "summary_confidence");

  if (!hasIntentConfidence) {
    db.exec("ALTER TABLE voicemails ADD COLUMN intent_confidence TEXT");
  }

  if (!hasSummaryConfidence) {
    db.exec("ALTER TABLE voicemails ADD COLUMN summary_confidence TEXT");
  }
}

function ensureVoicemailResolutionNoteColumn(db) {
  const columns = db.prepare("PRAGMA table_info(voicemails)").all();
  const hasResolutionNote = columns.some((column) => column.name === "resolution_note");
  if (!hasResolutionNote) {
    db.exec("ALTER TABLE voicemails ADD COLUMN resolution_note TEXT");
  }
}

function ensurePatientUrgencyMarkersTable(db) {
  db.exec(`
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
    )
  `);
}

function backfillIntentIds(db) {
  db.prepare(
    `
      UPDATE voicemails
      SET intent_id = (
        SELECT id
        FROM intents
        WHERE intents.label = voicemails.intent
          AND intents.clinic_id IS NULL
        LIMIT 1
      )
      WHERE intent_id IS NULL
    `,
  ).run();
}

function backfillConfidenceColumns(db) {
  db.prepare(
    `
      UPDATE voicemails
      SET
        intent_confidence = COALESCE(intent_confidence, confidence),
        summary_confidence = COALESCE(summary_confidence, confidence)
    `,
  ).run();
}

function backfillIntentClassifications(db) {
  db.prepare(
    `
      INSERT INTO voicemail_intent_classifications (voicemail_id, intent_id, classification_score)
      SELECT
        v.id,
        v.intent_id,
        CASE COALESCE(v.intent_confidence, v.confidence)
          WHEN 'High' THEN 0.92
          WHEN 'Medium' THEN 0.74
          WHEN 'Low' THEN 0.55
          ELSE 0.5
        END
      FROM voicemails v
      WHERE v.intent_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1
          FROM voicemail_intent_classifications vic
          WHERE vic.voicemail_id = v.id
        )
    `,
  ).run();
}

function backfillQueueMetadata(db) {
  db.prepare(
    `
      UPDATE queues
      SET clinic_id = NULL, is_system = 1
      WHERE id IN (${queues.map((queue) => queue.id).join(", ")})
    `,
  ).run();
}

function confidenceLabelToScore(label) {
  return confidenceScoreByLabel[label] ?? 0.5;
}

function buildIntentCandidates(row, classificationsByVoicemail) {
  const storedCandidates = classificationsByVoicemail.get(row.id) ?? [];
  const fallbackCandidate =
    row.intent_id && !storedCandidates.some((candidate) => candidate.intentId === row.intent_id)
      ? [
          {
            intentId: row.intent_id,
            label: row.stored_intent_label,
            score: confidenceLabelToScore(row.intent_confidence ?? row.confidence),
          },
        ]
      : [];
  const allCandidates = [...storedCandidates, ...fallbackCandidate].sort(
    (a, b) => b.score - a.score || a.label.localeCompare(b.label),
  );
  const qualifyingCandidates = allCandidates.filter((candidate) => candidate.score >= INTENT_CLASSIFICATION_THRESHOLD);
  const primaryCandidate =
    qualifyingCandidates[0] ??
    allCandidates[0] ?? {
      intentId: row.intent_id,
      label: row.stored_intent_label,
      score: confidenceLabelToScore(row.intent_confidence ?? row.confidence),
    };

  return {
    allCandidates: allCandidates.map((candidate) => ({
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

function classifyUrgency(row, rulesByClinic) {
  const relevantRules = [...(rulesByClinic.get("system") ?? []), ...(rulesByClinic.get(String(row.clinic_id)) ?? [])];
  const searchableText = `${row.reason} ${row.summary} ${row.transcript}`.toLowerCase();
  const matches = relevantRules.filter((rule) => searchableText.includes(rule.keyword.toLowerCase()));

  if (matches.length === 0) {
    return {
      urgency: row.urgency,
      urgencySource: "seeded fallback",
      matchedUrgencyKeywords: [],
    };
  }

  const highestMatch = matches.reduce((best, current) =>
    urgencyRank[current.urgency] < urgencyRank[best.urgency] ? current : best,
  );

  return {
    urgency: highestMatch.urgency,
    urgencySource: "clinic keyword rules",
    matchedUrgencyKeywords: [...new Set(matches.map((match) => match.keyword))],
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
      urgency: candidate.urgency,
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
      reasonConfidence: row.summary_confidence ?? row.confidence,
      summary: row.summary,
      summaryConfidence: row.summary_confidence ?? row.confidence,
      nextStep: row.next_step,
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
  const modelOutput = row.aiWorkflow?.output ?? {
    reason: row.reason,
    reasonConfidence: row.summary_confidence ?? row.confidence,
    summary: row.summary,
    summaryConfidence: row.summary_confidence ?? row.confidence,
    intent: row.primary_intent,
    intents: row.qualifying_intents ?? [],
    intentConfidence: row.primary_intent_confidence,
    primaryIntentScore: row.primary_intent_score,
    urgency: row.urgency,
    urgencySource: "seeded fallback",
    matchedUrgencyKeywords: [],
    patientUrgencyMarker: null,
    nextStep: row.next_step,
  };

  return {
    id: row.phone,
    latestVoicemailId: row.id,
    patient: row.patient_name,
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
    matchedUrgencyKeywords: modelOutput.matchedUrgencyKeywords,
    patientUrgencyMarker: modelOutput.patientUrgencyMarker,
    queue: row.queue,
    owner: row.owner_label,
    status: row.status,
    intentConfidence: modelOutput.intentConfidence,
    summaryConfidence: modelOutput.summaryConfidence,
    reasonConfidence: modelOutput.reasonConfidence,
    reason: modelOutput.reason,
    summary: modelOutput.summary,
    nextStep: modelOutput.nextStep,
    resolutionNote: row.resolution_note ?? "",
    transcript: row.transcript,
    primaryGp: row.primary_gp_name,
    assignedGp: row.assigned_gp_name,
    patientClinic: row.location,
    aiWorkflow: row.aiWorkflow ?? null,
  };
}

function sortGroupedItems(a, b) {
  return (
    urgencyOrder[a.urgency] - urgencyOrder[b.urgency] ||
    statusOrder[a.status] - statusOrder[b.status] ||
    new Date(b.receivedAt) - new Date(a.receivedAt)
  );
}

function buildHistoryEntry(row) {
  const modelOutput = row.aiWorkflow?.output ?? {
    reason: row.reason,
    reasonConfidence: row.summary_confidence ?? row.confidence,
    summary: row.summary,
    summaryConfidence: row.summary_confidence ?? row.confidence,
    intent: row.primary_intent,
    intents: row.qualifying_intents ?? [],
    intentConfidence: row.primary_intent_confidence,
    primaryIntentScore: row.primary_intent_score,
    urgency: row.urgency,
    urgencySource: "seeded fallback",
    matchedUrgencyKeywords: [],
    patientUrgencyMarker: null,
    nextStep: row.next_step,
  };

  return {
    voicemailId: row.id,
    receivedAt: row.received_at,
    time: formatTimeLabel(row.received_at),
    age: formatAgeLabel(row.received_at),
    intent: modelOutput.intent,
    intents: modelOutput.intents ?? [],
    intentThreshold: INTENT_CLASSIFICATION_THRESHOLD,
    primaryIntentScore: modelOutput.primaryIntentScore,
    urgency: modelOutput.urgency,
    urgencySource: modelOutput.urgencySource,
    matchedUrgencyKeywords: modelOutput.matchedUrgencyKeywords,
    patientUrgencyMarker: modelOutput.patientUrgencyMarker,
    status: row.status,
    intentConfidence: modelOutput.intentConfidence,
    summaryConfidence: modelOutput.summaryConfidence,
    reasonConfidence: modelOutput.reasonConfidence,
    reason: modelOutput.reason,
    summary: modelOutput.summary,
    resolutionNote: row.resolution_note ?? "",
    transcript: row.transcript,
    nextStep: modelOutput.nextStep,
    aiWorkflow: row.aiWorkflow ?? null,
  };
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

    if (urgencyOrder[row.urgency] < urgencyOrder[existing.urgency]) {
      existing.urgency = row.urgency;
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
          FROM voicemails v
          JOIN patient_gp_relationships pgr ON pgr.patient_id = v.patient_id AND pgr.is_primary = 1
          JOIN gps g ON g.id = pgr.gp_id
          WHERE v.caller_phone = ?
          ORDER BY datetime(v.received_at) DESC
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

export function initDatabase() {
  ensureDataDir();
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.exec(schemaSql);
  ensureQueueColumns(db);
  ensureVoicemailIntentColumn(db);
  ensureVoicemailConfidenceColumns(db);
  ensureVoicemailResolutionNoteColumn(db);
  ensurePatientUrgencyMarkersTable(db);
  insertSeedData(db);
  backfillQueueMetadata(db);
  backfillIntentIds(db);
  backfillConfidenceColumns(db);
  backfillIntentClassifications(db);

  return db;
}

export function getVoicemails(db) {
  const urgencyRules = db
    .prepare(
      `
        SELECT clinic_id AS clinicId, urgency, keyword
        FROM urgency_keywords
        ORDER BY is_system DESC, keyword ASC
      `,
    )
    .all();
  const rulesByClinic = urgencyRules.reduce((map, rule) => {
    const key = rule.clinicId == null ? "system" : String(rule.clinicId);
    const current = map.get(key) ?? [];
    current.push(rule);
    map.set(key, current);
    return map;
  }, new Map());
  const intentClassifications = db
    .prepare(
      `
        SELECT
          vic.voicemail_id AS voicemailId,
          vic.intent_id AS intentId,
          i.label,
          vic.classification_score AS score
        FROM voicemail_intent_classifications vic
        JOIN intents i ON i.id = vic.intent_id
        ORDER BY vic.voicemail_id, vic.classification_score DESC, i.label ASC
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
      v.id,
      v.clinic_id,
      v.patient_id,
      v.intent_id,
      COALESCE(p.full_name, v.caller_name, 'Unknown caller') AS patient_name,
      c.name AS location,
      v.caller_phone AS phone,
      v.received_at,
      COALESCE(i.label, v.intent) AS stored_intent_label,
      v.urgency,
      q.name AS queue,
      v.owner_label,
      v.status,
      v.confidence,
      v.intent_confidence,
      v.summary_confidence,
      v.reason,
      v.summary,
      v.next_step,
      v.resolution_note,
      v.transcript,
      agp.name AS assigned_gp_name,
      pgp.name AS primary_gp_name,
      pum.urgency AS patient_marker_urgency,
      pum.note AS patient_marker_note,
      mgp.name AS patient_marker_gp_name
    FROM voicemails v
    JOIN clinics c ON c.id = v.clinic_id
    JOIN queues q ON q.id = v.queue_id
    LEFT JOIN intents i ON i.id = v.intent_id
    LEFT JOIN patients p ON p.id = v.patient_id
    LEFT JOIN gps agp ON agp.id = v.assigned_gp_id
    LEFT JOIN patient_gp_relationships pgr ON pgr.patient_id = p.id AND pgr.is_primary = 1
    LEFT JOIN gps pgp ON pgp.id = pgr.gp_id
    LEFT JOIN patient_urgency_markers pum ON pum.patient_id = p.id AND pum.is_active = 1
    LEFT JOIN gps mgp ON mgp.id = pum.gp_id
    ORDER BY
      CASE v.urgency WHEN 'Critical' THEN 0 WHEN 'High' THEN 1 WHEN 'Normal' THEN 2 WHEN 'Low' THEN 3 ELSE 4 END,
      CASE v.status WHEN 'New' THEN 0 WHEN 'In Progress' THEN 1 ELSE 2 END,
      datetime(v.received_at) DESC
  `).all();

  const rowsByPhone = rows.reduce((map, row) => {
    const current = map.get(row.phone) ?? [];
    current.push(row);
    map.set(row.phone, current);
    return map;
  }, new Map());

  const classifiedRows = rows.map((row) => {
    const intentsForVoicemail = buildIntentCandidates(row, classificationsByVoicemail);
    const keywordUrgencySuggestion = classifyUrgency(row, rulesByClinic);
    const aiWorkflow = runPrototypeVoicemailModel(
      buildVoicemailModelInput(row, rowsByPhone, intentsForVoicemail, keywordUrgencySuggestion),
    );

    return {
      ...row,
      primary_intent: intentsForVoicemail.primaryIntent.label,
      primary_intent_id: intentsForVoicemail.primaryIntent.intentId,
      primary_intent_score: intentsForVoicemail.primaryIntent.score,
      primary_intent_confidence: scoreToConfidenceLabel(intentsForVoicemail.primaryIntent.score),
      qualifying_intents: intentsForVoicemail.qualifyingIntents,
      aiWorkflow,
    };
  });

  return groupVoicemailRows(classifiedRows);
}

export function updateVoicemail(db, id, patch) {
  const currentRows = db.prepare("SELECT * FROM voicemails WHERE caller_phone = ? ORDER BY datetime(received_at) DESC").all(id);
  if (currentRows.length === 0) {
    return null;
  }

  const current = currentRows[0];

  let queueId = current.queue_id;
  let ownerLabel = patch.owner ?? current.owner_label;
  let assignedGpId = current.assigned_gp_id;
  let nextStep = patch.nextStep ?? current.next_step;
  let status = patch.status ?? current.status;
  let resolutionNote = patch.resolutionNote ?? current.resolution_note ?? "";

  if (patch.status === "Resolved") {
    resolutionNote = String(patch.resolutionNote || "").trim();
    if (!resolutionNote) {
      throw new Error("Resolution note is required before resolving a voicemail");
    }
  } else if (patch.status === "In Progress") {
    resolutionNote = String(patch.resolutionNote || "").trim();
    if (!resolutionNote) {
      throw new Error("Progress note is required before moving a voicemail to in progress");
    }
  } else if (patch.status === "New") {
    resolutionNote = "";
  }

  if (patch.queue) {
    const queue = getQueueForClinicByName(db, current.clinic_id, patch.queue);
    if (!queue) {
      throw new Error(`Unknown queue: ${patch.queue}`);
    }
    queueId = queue.id;
    if (!patch.owner) {
      if (patch.queue === "GP Callbacks") {
        const primaryGp = getPrimaryGpForCaller(db, id);
        ownerLabel = primaryGp?.name ?? "Front desk";
        assignedGpId = primaryGp?.id ?? null;
      } else {
        ownerLabel = queue.default_owner_label;
        const gp = db.prepare("SELECT id FROM gps WHERE name = ?").get(ownerLabel);
        assignedGpId = gp ? gp.id : null;
      }
    }
  }

  if (patch.owner && ownerLabel) {
    const gp = db.prepare("SELECT id FROM gps WHERE name = ?").get(ownerLabel);
    assignedGpId = gp ? gp.id : null;
  }

  db.prepare(
    `UPDATE voicemails
     SET queue_id = ?, owner_label = ?, assigned_gp_id = ?, next_step = ?, status = ?, resolution_note = ?
     WHERE caller_phone = ?`,
  ).run(queueId, ownerLabel, assignedGpId, nextStep, status, resolutionNote, id);

  return getVoicemails(db).find((item) => item.id === id) ?? null;
}

export function getIntents(db) {
  return db
    .prepare(
      `
        SELECT
          id,
          label,
          clinic_id AS clinicId,
          is_system AS isSystem
        FROM intents
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
    return db.prepare("SELECT id, label, clinic_id AS clinicId, is_system AS isSystem FROM intents WHERE label = ? AND clinic_id IS NULL").get(normalizedLabel);
  }

  const insert = db.prepare(
    `
      INSERT INTO intents (label, clinic_id, is_system)
      VALUES (?, ?, 0)
      ON CONFLICT(label, clinic_id) DO NOTHING
    `,
  );
  insert.run(normalizedLabel, clinicId);

  return db
    .prepare(
      `
        SELECT id, label, clinic_id AS clinicId, is_system AS isSystem
        FROM intents
        WHERE label = ? AND clinic_id IS ?
      `,
    )
    .get(normalizedLabel, clinicId);
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

export function getUrgencyKeywords(db) {
  return db
    .prepare(
      `
        SELECT
          id,
          clinic_id AS clinicId,
          urgency,
          keyword,
          is_system AS isSystem
        FROM urgency_keywords
        ORDER BY urgency, keyword
      `,
    )
    .all();
}

export function createUrgencyKeyword(db, { clinicId = null, urgency, keyword }) {
  const normalizedUrgency = String(urgency || "").trim();
  const normalizedKeyword = String(keyword || "").trim().toLowerCase();

  if (!normalizedUrgency || !urgencyRank.hasOwnProperty(normalizedUrgency)) {
    throw new Error("Valid urgency is required");
  }

  if (!normalizedKeyword) {
    throw new Error("Keyword is required");
  }

  db.prepare(
    `
      INSERT INTO urgency_keywords (clinic_id, urgency, keyword, is_system)
      VALUES (?, ?, ?, 0)
      ON CONFLICT(clinic_id, urgency, keyword) DO NOTHING
    `,
  ).run(clinicId, normalizedUrgency, normalizedKeyword);

  return db
    .prepare(
      `
        SELECT
          id,
          clinic_id AS clinicId,
          urgency,
          keyword,
          is_system AS isSystem
        FROM urgency_keywords
        WHERE clinic_id IS ? AND urgency = ? AND keyword = ?
      `,
    )
    .get(clinicId, normalizedUrgency, normalizedKeyword);
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

  if (!urgencyRank.hasOwnProperty(normalizedUrgency)) {
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

export { dbPath, schemaPath, schemaSql };
