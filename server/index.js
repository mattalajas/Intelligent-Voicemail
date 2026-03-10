import cors from "cors";
import express from "express";
import {
  createIntent,
  createQueue,
  createUrgencyKeyword,
  getIntentQueueRoutes,
  getIntents,
  getPatientUrgencyMarkers,
  getQueues,
  getUrgencyKeywords,
  getVoicemails,
  initDatabase,
  upsertPatientUrgencyMarker,
  updateVoicemail,
  upsertIntentQueueRoute,
} from "./db/database.js";

const app = express();
const port = Number(process.env.PORT || 3001);
const db = initDatabase();

app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/voicemails", (_req, res) => {
  res.json({ items: getVoicemails(db) });
});

app.get("/api/intents", (_req, res) => {
  res.json({ items: getIntents(db) });
});

app.post("/api/intents", (req, res) => {
  try {
    const item = createIntent(db, req.body?.label, req.body?.clinicId ?? null);
    res.status(201).json({ item });
  } catch (error) {
    res.status(400).json({ error: error.message || "Unable to create intent" });
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

app.get("/api/urgency-keywords", (_req, res) => {
  res.json({ items: getUrgencyKeywords(db) });
});

app.post("/api/urgency-keywords", (req, res) => {
  try {
    const item = createUrgencyKeyword(db, req.body ?? {});
    res.status(201).json({ item });
  } catch (error) {
    res.status(400).json({ error: error.message || "Unable to create urgency keyword" });
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
