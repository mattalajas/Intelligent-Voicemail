# Intelligent Voicemail

Prototype voicemail triage app for Harbour to Sunset GP.

## Run

Requirements:
- `Node.js 20+`
- `npm`

Install:

```bash
npm install
```

Run the full app:

```bash
npm run dev
```

This starts:
- Vite frontend on `http://localhost:5173`
- Express API on `http://localhost:3001`
- SQLite database at `server/db/data/voicemail.sqlite`

Production build:

```bash
npm run build
```

Run the API only:

```bash
npm start
```

## Database

The backend uses SQLite and bootstraps from the schema files in `server/db/schema/` plus seed data in `server/db/seeds/`.

On server startup, `initDatabase()`:
- creates the schema if needed
- applies compatibility updates for older local databases
- seeds reference, raw voicemail, structured voicemail, admin, and classifier lookup data

Primary table groups:

### Clinic reference
- `clinics`
- `gps`
- `patients`
- `patient_gp_relationships`

### Clinic-configured model data
- `queues`
- `intents`
- `intent_queue_routes`
- `urgency_keywords`
- `patient_urgency_markers`

### Voicemail data
- `raw_voicemails`
  - initial/raw record
  - fields: phone number, transcription, clinic id, time received, patient name if matched
- `structured_voicemails`
  - enriched voicemail record used by the app
  - fields include patient linkage, transcript confidence, summary, reason for call, and recommended steps

### AI lookup data
- `voicemail_intent_classifications`
- `voicemail_urgency_keyword_similarities`

### Admin workflow state
- `voicemail_admin_states`
  - grouped by caller phone number
  - stores queue ownership, status, and admin notes

## Data model notes

- The inbox groups voicemails by `caller_phone`.
- Admin state is inherited across all voicemails under the same number.
- Intent is multi-classified, but the highest above-threshold label is used as the primary intent.
- Urgency comes from:
  1. GP patient urgency marker, if present
  2. Urgency keyword similarity
  3. otherwise `Unknown`
- If the AI transcript is unavailable, the backend automatically falls back to:
  - `Retry AI transcription. If still unavailable, play the recording for manual review.`

## API

### Inbox and voicemail detail
- `GET /api/voicemails`
- `PATCH /api/voicemails/:id`
- `GET /api/raw-voicemails`
- `GET /api/voicemails/:voicemailId/intents`
- `GET /api/voicemails/:voicemailId/urgency`
- `GET /api/voicemails/:voicemailId/structured-transcription`
- `GET /api/phone-numbers/:phoneNumber/structured-transcriptions`

### Intents
- `GET /api/intents`
- `POST /api/intents`
- `PATCH /api/intents/:id`

Optional query params:
- `includeInactive=true`

### Queues and routing
- `GET /api/queues`
- `POST /api/queues`
- `GET /api/intent-queue-routes`
- `PUT /api/intent-queue-routes`

### Urgency configuration
- `GET /api/urgency-keywords`
- `POST /api/urgency-keywords`
- `PATCH /api/urgency-keywords/:id`
- `GET /api/patient-urgency-markers`
- `PUT /api/patient-urgency-markers`

## Recreate the SQLite database

If you want a clean local rebuild:

1. stop the running API/dev server
2. delete:
   - `server/db/data/voicemail.sqlite`
   - `server/db/data/voicemail.sqlite-wal`
   - `server/db/data/voicemail.sqlite-shm`
3. start the app again with `npm run dev` or `npm start`

The database will be recreated from the current schema and seed data.
