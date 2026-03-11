export const clinics = [
  { id: 1, name: "Harbour Central" },
  { id: 2, name: "Harbour South" },
  { id: 3, name: "Sunset West" },
];

export const gps = [
  { id: 1, name: "Dr Priya Nair", clinicId: 1, specialty: "Family medicine" },
  { id: 2, name: "Dr Aria Chen", clinicId: 2, specialty: "Family medicine" },
  { id: 3, name: "Dr Lee", clinicId: 3, specialty: "Family medicine" },
  { id: 4, name: "Dr Hannah Cole", clinicId: 3, specialty: "Women's health" },
  { id: 5, name: "Dr Mason Reid", clinicId: 1, specialty: "Respiratory medicine" },
];

export const patients = [
  { id: 1, fullName: "Mark Davis", phone: "021 555 018", clinicId: 1 },
  { id: 2, fullName: "Sarah Thompson", phone: "027 555 223", clinicId: 3 },
  { id: 3, fullName: "Noah Patel", phone: "022 555 401", clinicId: 2 },
  { id: 4, fullName: "Emily Chen", phone: "021 555 772", clinicId: 1 },
  { id: 5, fullName: "James Wilson", phone: "020 555 119", clinicId: 3 },
  { id: 6, fullName: "Olivia Brown", phone: "021 555 642", clinicId: 2 },
  { id: 7, fullName: "Ava Singh", phone: "027 555 937", clinicId: 3 },
  { id: 8, fullName: "Mia Carter", phone: "029 555 884", clinicId: 2 },
];

export const patientGpRelationships = [
  { patientId: 1, gpId: 1, relationshipType: "primary", isPrimary: 1 },
  { patientId: 1, gpId: 5, relationshipType: "care_team", isPrimary: 0 },
  { patientId: 2, gpId: 3, relationshipType: "primary", isPrimary: 1 },
  { patientId: 3, gpId: 2, relationshipType: "primary", isPrimary: 1 },
  { patientId: 4, gpId: 1, relationshipType: "primary", isPrimary: 1 },
  { patientId: 5, gpId: 3, relationshipType: "primary", isPrimary: 1 },
  { patientId: 6, gpId: 2, relationshipType: "primary", isPrimary: 1 },
  { patientId: 7, gpId: 4, relationshipType: "primary", isPrimary: 1 },
  { patientId: 8, gpId: 2, relationshipType: "primary", isPrimary: 1 },
  { patientId: 7, gpId: 3, relationshipType: "covering", isPrimary: 0 },
];
