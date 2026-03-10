# Intelligent-Voicemail

## Run locally

1. `npm install`
2. `npm run dev`
3. Open the Vite URL shown in the terminal

This starts:
- the React frontend on Vite
- the Express API on `http://localhost:3001`
- a real SQLite database at `server/db/data/voicemail.sqlite`

## Database model

The backend uses a normalized SQLite schema with:
- `clinics`
- `gps`
- `intents`
- `patients`
- `patient_gp_relationships`
- `queues`
- `voicemails`

## Useful endpoints

- `GET /api/health`
- `GET /api/voicemails`
- `GET /api/intents`
- `POST /api/intents`
- `PATCH /api/voicemails/:id`
