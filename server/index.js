import cors from "cors";
import express from "express";
import { randomUUID } from "node:crypto";
import { extname, join } from "node:path";
import { unlinkSync, writeFileSync } from "node:fs";
import { analyzeAudioBufferWithGemini, analyzeAudioWithGemini } from "./ai/geminiTranscription.js";
import {
  audioDir,
  createUploadedVoicemailTranscript,
  createIntent,
  createQueue,
  createUrgencyKeyword,
  getGeminiVoicemailTaxonomy,
  getStoredAudioPathForVoicemail,
  getIntentQueueRoutes,
  getIntents,
  getPatientUrgencyMarkers,
  getQueues,
  getRawVoicemails,
  getStructuredVoicemailTranscriptionsByPhone,
  getUrgencyKeywords,
  getVoicemailIntentClassification,
  getStructuredVoicemailTranscription,
  getVoicemailUrgencyClassification,
  getVoicemails,
  initDatabase,
  reseedDatabase,
  refreshVoicemailTranscript,
  updateIntent,
  updateUrgencyKeyword,
  upsertPatientUrgencyMarker,
  updateVoicemail,
  upsertIntentQueueRoute,
} from "./db/database.js";

const app = express();
const port = Number(process.env.PORT || 3001);
const db = initDatabase();
const enableTestApi = process.env.ENABLE_TEST_API === "1";

const mimeExtensions = {
  "audio/mpeg": ".mp3",
  "audio/mp3": ".mp3",
  "audio/mp4": ".m4a",
  "audio/x-m4a": ".m4a",
  "audio/aac": ".aac",
  "audio/wav": ".wav",
  "audio/x-wav": ".wav",
  "audio/webm": ".webm",
  "audio/ogg": ".ogg",
  "audio/ogg;codecs=opus": ".ogg",
};

function sanitizeFileStem(fileName) {
  const rawStem = String(fileName || "")
    .replace(/\.[^./\\]+$/, "")
    .trim()
    .toLowerCase();
  const sanitizedStem = rawStem.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return sanitizedStem || "voicemail";
}

function getAudioExtension(mimeType, displayName) {
  const normalizedMimeType = String(mimeType || "").trim().toLowerCase();
  const normalizedExtension = extname(String(displayName || "")).toLowerCase();

  if (mimeExtensions[normalizedMimeType]) {
    return mimeExtensions[normalizedMimeType];
  }

  if (normalizedExtension) {
    return normalizedExtension;
  }

  return ".bin";
}

function saveUploadedAudioFile(audioBytes, mimeType, displayName) {
  const fileStem = sanitizeFileStem(displayName);
  const extension = getAudioExtension(mimeType, displayName);
  const fileName = `${new Date().toISOString().replace(/[:.]/g, "-")}-${fileStem}-${randomUUID()}${extension}`;
  const absoluteFilePath = join(audioDir, fileName);
  writeFileSync(absoluteFilePath, audioBytes);
  return fileName;
}

app.use(cors());
app.use(express.json());
app.use("/media/voicemails", express.static(audioDir));

if (enableTestApi) {
  app.post("/api/test/reseed", (_req, res) => {
    reseedDatabase(db);
    res.json({ ok: true });
  });
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/voicemails", (_req, res) => {
  res.json({ items: getVoicemails(db) });
});

app.get("/api/raw-voicemails", (_req, res) => {
  res.json({ items: getRawVoicemails(db) });
});

app.post("/api/transcriptions/gemini", async (req, res) => {
  try {
    const clinicId = Number(req.body?.clinicId);
    const taxonomy = Number.isInteger(clinicId) && clinicId > 0 ? getGeminiVoicemailTaxonomy(db, clinicId) : { intents: [], urgencyKeywords: [] };
    const item = await analyzeAudioWithGemini({
      audioPath: req.body?.audioPath,
      mimeType: req.body?.mimeType,
      model: req.body?.model,
      prompt: req.body?.prompt,
      displayName: req.body?.displayName,
      intents: taxonomy.intents,
      urgencyKeywords: taxonomy.urgencyKeywords,
    });
    res.json({ item });
  } catch (error) {
    res.status(400).json({ error: error.message || "Unable to analyze audio with Gemini" });
  }
});

app.post(
  "/api/transcriptions/gemini-upload",
  express.raw({ type: ["audio/*", "application/octet-stream"], limit: "25mb" }),
  async (req, res) => {
    try {
      const mimeType = String(req.headers["content-type"] || "").split(";")[0].trim();
      const displayNameHeader = req.headers["x-file-name"];
      const displayName =
        String(req.query.displayName || displayNameHeader || "uploaded-audio").trim() || "uploaded-audio";
      const model = req.query.model ? String(req.query.model).trim() : undefined;
      const prompt = req.query.prompt ? String(req.query.prompt) : undefined;

      if (!mimeType) {
        res.status(400).json({ error: "Audio Content-Type is required" });
        return;
      }

      if (!req.body || req.body.length === 0) {
        res.status(400).json({ error: "Audio file body is required" });
        return;
      }

      const audioFilePath = saveUploadedAudioFile(req.body, mimeType, displayName);
      const clinicId = Number(req.query.clinicId);
      const taxonomy = getGeminiVoicemailTaxonomy(db, clinicId);

      try {
        const item = await analyzeAudioBufferWithGemini({
          audioBytes: req.body,
          mimeType,
          model,
          prompt,
          displayName,
          intents: taxonomy.intents,
          urgencyKeywords: taxonomy.urgencyKeywords,
        });

        const saved = createUploadedVoicemailTranscript(db, {
          callerPhone: req.query.callerPhone,
          clinicId,
          transcript: item.transcript,
          summary: item.summary,
          reasonForCall: item.reasonForCall,
          recommendedSteps: item.recommendedNextSteps,
          intentScores: item.intents,
          urgencyKeywordScores: item.urgencyKeywords,
          audioFilePath,
        });

        res.json({ item: saved.item, transcription: item, voicemailId: saved.voicemailId });
      } catch (error) {
        try {
          unlinkSync(join(audioDir, audioFilePath));
        } catch {
          // Ignore cleanup failures; the request error is the important signal.
        }
        throw error;
      }
    } catch (error) {
      res.status(400).json({ error: error.message || "Unable to upload and transcribe audio with Gemini" });
    }
  },
);

app.post("/api/voicemails/:voicemailId/retranscribe", async (req, res) => {
  try {
    const storedAudio = getStoredAudioPathForVoicemail(db, req.params.voicemailId);
    if (!storedAudio) {
      res.status(404).json({ error: "Saved voicemail audio not found" });
      return;
    }

    const taxonomy = getGeminiVoicemailTaxonomy(db, storedAudio.clinicId);
    const item = await analyzeAudioWithGemini({
      audioPath: join(audioDir, storedAudio.audioFilePath),
      model: req.body?.model,
      prompt: req.body?.prompt,
      displayName: storedAudio.audioFilePath,
      intents: taxonomy.intents,
      urgencyKeywords: taxonomy.urgencyKeywords,
    });

    const saved = refreshVoicemailTranscript(db, req.params.voicemailId, {
      transcript: item.transcript,
      summary: item.summary,
      reasonForCall: item.reasonForCall,
      recommendedSteps: item.recommendedNextSteps,
      intentScores: item.intents,
      urgencyKeywordScores: item.urgencyKeywords,
    });

    res.json({ item: saved.item, transcription: item, voicemailId: saved.voicemailId });
  } catch (error) {
    const statusCode = error.message === "Stored voicemail audio not found" ? 404 : 400;
    res.status(statusCode).json({ error: error.message || "Unable to retranscribe voicemail audio with Gemini" });
  }
});

app.get("/api/voicemails/:voicemailId/intents", (req, res) => {
  const item = getVoicemailIntentClassification(db, req.params.voicemailId);

  if (!item) {
    res.status(404).json({ error: "Voicemail not found" });
    return;
  }

  res.json({ item });
});

app.get("/api/voicemails/:voicemailId/urgency", (req, res) => {
  const item = getVoicemailUrgencyClassification(db, req.params.voicemailId);

  if (!item) {
    res.status(404).json({ error: "Voicemail not found" });
    return;
  }

  res.json({ item });
});

app.get("/api/voicemails/:voicemailId/structured-transcription", (req, res) => {
  const item = getStructuredVoicemailTranscription(db, req.params.voicemailId);

  if (!item) {
    res.status(404).json({ error: "Voicemail not found" });
    return;
  }

  res.json({ item });
});

app.get("/api/phone-numbers/:phoneNumber/structured-transcriptions", (req, res) => {
  const phoneNumber = String(req.params.phoneNumber || "").trim();

  if (!phoneNumber) {
    res.status(400).json({ error: "Phone number is required" });
    return;
  }

  const items = getStructuredVoicemailTranscriptionsByPhone(db, phoneNumber);
  res.json({
    phoneNumber,
    count: items.length,
    items,
  });
});

app.get("/api/intents", (req, res) => {
  const includeInactive = req.query.includeInactive === "true" || req.query.includeInactive === "1";
  res.json({ items: getIntents(db, { includeInactive }) });
});

app.post("/api/intents", (req, res) => {
  try {
    const item = createIntent(db, req.body?.label, req.body?.clinicId ?? null);
    res.status(201).json({ item });
  } catch (error) {
    res.status(400).json({ error: error.message || "Unable to create intent" });
  }
});

app.patch("/api/intents/:id", (req, res) => {
  try {
    const item = updateIntent(db, Number(req.params.id), req.body ?? {});
    res.json({ item });
  } catch (error) {
    const statusCode = error.message === "Intent not found" ? 404 : 400;
    res.status(statusCode).json({ error: error.message || "Unable to update intent" });
  }
});

app.get("/api/queues", (_req, res) => {
  res.json({ items: getQueues(db) });
});

app.post("/api/queues", (req, res) => {
  try {
    const item = createQueue(db, req.body ?? {});
    res.status(201).json({ item });
  } catch (error) {
    res.status(400).json({ error: error.message || "Unable to create queue" });
  }
});

app.get("/api/intent-queue-routes", (_req, res) => {
  res.json({ items: getIntentQueueRoutes(db) });
});

app.put("/api/intent-queue-routes", (req, res) => {
  try {
    const item = upsertIntentQueueRoute(db, req.body ?? {});
    res.json({ item });
  } catch (error) {
    res.status(400).json({ error: error.message || "Unable to save intent queue route" });
  }
});

app.get("/api/urgency-keywords", (req, res) => {
  const includeInactive = req.query.includeInactive === "true" || req.query.includeInactive === "1";
  res.json({ items: getUrgencyKeywords(db, { includeInactive }) });
});

app.post("/api/urgency-keywords", (req, res) => {
  try {
    const item = createUrgencyKeyword(db, req.body ?? {});
    res.status(201).json({ item });
  } catch (error) {
    res.status(400).json({ error: error.message || "Unable to create urgency keyword" });
  }
});

app.patch("/api/urgency-keywords/:id", (req, res) => {
  try {
    const item = updateUrgencyKeyword(db, Number(req.params.id), req.body ?? {});
    res.json({ item });
  } catch (error) {
    const statusCode = error.message === "Urgency keyword not found" ? 404 : 400;
    res.status(statusCode).json({ error: error.message || "Unable to update urgency keyword" });
  }
});

app.get("/api/patient-urgency-markers", (_req, res) => {
  res.json({ items: getPatientUrgencyMarkers(db) });
});

app.put("/api/patient-urgency-markers", (req, res) => {
  try {
    const item = upsertPatientUrgencyMarker(db, req.body ?? {});
    res.json({ item });
  } catch (error) {
    res.status(400).json({ error: error.message || "Unable to save patient urgency marker" });
  }
});

app.patch("/api/voicemails/:id", (req, res) => {
  try {
    const item = updateVoicemail(db, req.params.id, req.body ?? {});

    if (!item) {
      res.status(404).json({ error: "Voicemail not found" });
      return;
    }

    res.json({ item });
  } catch (error) {
    res.status(400).json({ error: error.message || "Unable to update voicemail" });
  }
});

app.listen(port, () => {
  console.log(`SQLite voicemail API listening on http://localhost:${port}`);
});
