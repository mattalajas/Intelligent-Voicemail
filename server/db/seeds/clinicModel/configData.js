export const queues = [
  { id: 1, name: "Emergency Review", clinicId: null, isSystem: 1, defaultOwnerLabel: "Nurse triage" },
  { id: 2, name: "Clinical Triage", clinicId: null, isSystem: 1, defaultOwnerLabel: "Nurse triage" },
  { id: 3, name: "Same-Day Appointments", clinicId: null, isSystem: 1, defaultOwnerLabel: "Front desk" },
  { id: 4, name: "Prescription Requests", clinicId: null, isSystem: 1, defaultOwnerLabel: "GP review" },
  { id: 5, name: "GP Callbacks", clinicId: null, isSystem: 1, defaultOwnerLabel: "Front desk" },
  { id: 6, name: "Admin Requests", clinicId: null, isSystem: 1, defaultOwnerLabel: "Front desk" },
  { id: 7, name: "Needs Review", clinicId: null, isSystem: 1, defaultOwnerLabel: "Front desk" },
  { id: 8, name: "Test Results", clinicId: null, isSystem: 1, defaultOwnerLabel: "Nurse triage" },
];

export const intents = [
  { id: 1, label: "Symptom concern", clinicId: null, isSystem: 1, isActive: 1 },
  { id: 2, label: "Medication reaction", clinicId: null, isSystem: 1, isActive: 1 },
  { id: 3, label: "Doctor callback", clinicId: null, isSystem: 1, isActive: 1 },
  { id: 4, label: "Appointment request", clinicId: null, isSystem: 1, isActive: 1 },
  { id: 5, label: "Prescription request", clinicId: null, isSystem: 1, isActive: 1 },
  { id: 6, label: "Test results query", clinicId: null, isSystem: 1, isActive: 1 },
  { id: 7, label: "General callback", clinicId: null, isSystem: 1, isActive: 1 },
  { id: 8, label: "Administrative request", clinicId: null, isSystem: 1, isActive: 1 },
  { id: 9, label: "Referral follow-up", clinicId: 3, isSystem: 0, isActive: 1 },
];

export const intentQueueRoutes = [
  { clinicId: 1, intentId: 1, queueId: 1 },
  { clinicId: 1, intentId: 2, queueId: 2 },
  { clinicId: 1, intentId: 3, queueId: 5 },
  { clinicId: 1, intentId: 4, queueId: 3 },
  { clinicId: 1, intentId: 5, queueId: 4 },
  { clinicId: 1, intentId: 6, queueId: 8 },
  { clinicId: 1, intentId: 7, queueId: 7 },
  { clinicId: 1, intentId: 8, queueId: 6 },
  { clinicId: 2, intentId: 1, queueId: 1 },
  { clinicId: 2, intentId: 2, queueId: 2 },
  { clinicId: 2, intentId: 3, queueId: 5 },
  { clinicId: 2, intentId: 4, queueId: 3 },
  { clinicId: 2, intentId: 5, queueId: 4 },
  { clinicId: 2, intentId: 6, queueId: 8 },
  { clinicId: 2, intentId: 7, queueId: 7 },
  { clinicId: 2, intentId: 8, queueId: 6 },
  { clinicId: 3, intentId: 1, queueId: 1 },
  { clinicId: 3, intentId: 2, queueId: 2 },
  { clinicId: 3, intentId: 3, queueId: 5 },
  { clinicId: 3, intentId: 4, queueId: 3 },
  { clinicId: 3, intentId: 5, queueId: 4 },
  { clinicId: 3, intentId: 6, queueId: 8 },
  { clinicId: 3, intentId: 7, queueId: 7 },
  { clinicId: 3, intentId: 8, queueId: 6 },
];

export const urgencyKeywords = [
  { id: 1, clinicId: null, urgency: "Critical", keyword: "chest pain", isSystem: 1, isActive: 1 },
  { id: 2, clinicId: null, urgency: "Critical", keyword: "short of breath", isSystem: 1, isActive: 1 },
  { id: 3, clinicId: null, urgency: "Critical", keyword: "light-headed", isSystem: 1, isActive: 1 },
  { id: 4, clinicId: null, urgency: "High", keyword: "rash", isSystem: 1, isActive: 1 },
  { id: 5, clinicId: null, urgency: "High", keyword: "high fever", isSystem: 1, isActive: 1 },
  { id: 6, clinicId: null, urgency: "High", keyword: "worse", isSystem: 1, isActive: 1 },
  { id: 7, clinicId: null, urgency: "Normal", keyword: "prescription", isSystem: 1, isActive: 1 },
  { id: 8, clinicId: null, urgency: "Normal", keyword: "test results", isSystem: 1, isActive: 1 },
  { id: 9, clinicId: null, urgency: "Low", keyword: "medical certificate", isSystem: 1, isActive: 1 },
  { id: 10, clinicId: 1, urgency: "Critical", keyword: "trouble breathing", isSystem: 0, isActive: 1 },
  { id: 11, clinicId: 3, urgency: "High", keyword: "spreading", isSystem: 0, isActive: 1 },
  { id: 12, clinicId: 2, urgency: "High", keyword: "same day", isSystem: 0, isActive: 1 },
  { id: 13, clinicId: 2, urgency: "High", keyword: "infant", isSystem: 0, isActive: 1 },
];

export const patientUrgencyMarkers = [
  {
    id: 1,
    patientId: 5,
    gpId: 3,
    urgency: "High",
    note: "Escalate any callback requests because of recent medication side effects and unstable blood pressure.",
    isActive: 1,
  },
  {
    id: 2,
    patientId: 8,
    gpId: 2,
    urgency: "Critical",
    note: "Infant with recent hospital presentation.",
    isActive: 1,
  },
];
