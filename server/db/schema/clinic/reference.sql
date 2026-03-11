CREATE TABLE IF NOT EXISTS clinics (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS gps (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  clinic_id INTEGER NOT NULL,
  specialty TEXT NOT NULL,
  FOREIGN KEY (clinic_id) REFERENCES clinics(id)
);

CREATE TABLE IF NOT EXISTS patients (
  id INTEGER PRIMARY KEY,
  full_name TEXT NOT NULL,
  date_of_birth TEXT NOT NULL,
  phone TEXT NOT NULL,
  clinic_id INTEGER NOT NULL,
  FOREIGN KEY (clinic_id) REFERENCES clinics(id)
);

CREATE TABLE IF NOT EXISTS patient_gp_relationships (
  patient_id INTEGER NOT NULL,
  gp_id INTEGER NOT NULL,
  relationship_type TEXT NOT NULL,
  is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0, 1)),
  PRIMARY KEY (patient_id, gp_id),
  FOREIGN KEY (patient_id) REFERENCES patients(id),
  FOREIGN KEY (gp_id) REFERENCES gps(id)
);
