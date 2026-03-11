import { patients } from "../clinic/referenceData.js";
import { structuredVoicemails } from "./structuredData.js";

const patientNameById = new Map(patients.map((patient) => [patient.id, patient.fullName]));

export const rawVoicemails = structuredVoicemails.map((voicemail) => ({
  callerPhone: voicemail.callerPhone,
  transcription: voicemail.transcription,
  clinicId: voicemail.clinicId,
  receivedAt: voicemail.receivedAt,
  patientName: voicemail.patientId ? (patientNameById.get(voicemail.patientId) ?? null) : null,
}));
