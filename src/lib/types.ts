import type { ObjectId } from "mongodb";

export type Role = "doctor" | "admin";

export interface UserDoc {
  _id: ObjectId;
  fullName: string;
  email: string;
  passwordHash: string;
  role: Role;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface PatientDoc {
  _id: ObjectId;
  fullName: string;
  fullNameLower: string;
  dateOfBirth: string | null; // YYYY-MM-DD
  externalPatientId: string | null;
  createdBy: ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export const APPOINTMENT_STATUSES = ["draft", "recording", "processing", "review", "completed", "archived"] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

export type SpeechLanguage = "ru" | "kk" | "auto";

export interface AppointmentDoc {
  _id: ObjectId;
  patientId: ObjectId;
  doctorId: ObjectId;
  patientName: string; // денормализовано для списков и поиска
  reason: string | null;
  language: SpeechLanguage;
  status: AppointmentStatus;
  startedAt: Date | null;
  endedAt: Date | null;
  consentId: ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

export type ConsentStatus = "obtained" | "declined" | "revoked";

export interface ConsentDoc {
  _id: ObjectId;
  appointmentId: ObjectId;
  consentType: string;
  consentTextVersion: string;
  method: "verbal" | "written";
  status: ConsentStatus;
  obtainedAt: Date;
  obtainedBy: ObjectId;
  note: string | null;
}

export type RecordingStatus = "recording" | "processing" | "ready" | "partial";

export interface RecordingDoc {
  _id: ObjectId;
  appointmentId: ObjectId;
  storageKey: string; // gridfs:<bucket>/<recordingId>
  durationSeconds: number;
  format: string;
  status: RecordingStatus;
  segmentsCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export type SegmentStatus = "pending" | "done" | "failed";

export interface SegmentDoc {
  _id: ObjectId;
  recordingId: ObjectId;
  appointmentId: ObjectId;
  seq: number;
  source: "microphone" | "upload";
  audioFileId: ObjectId;
  mimeType: string;
  size: number;
  durationSeconds: number;
  status: SegmentStatus;
  text: string;
  error: string | null;
  attempts: number;
  createdAt: Date;
  updatedAt: Date;
}

export type TranscriptStatus = "empty" | "in_progress" | "ready" | "partial";

export interface TranscriptDoc {
  _id: ObjectId;
  appointmentId: ObjectId;
  recordingId: ObjectId | null;
  text: string;
  language: SpeechLanguage;
  status: TranscriptStatus;
  provider: string;
  isEdited: boolean;
  editedBy: ObjectId | null;
  editedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface TemplateField {
  key: string;
  label: string;
  description: string;
  required: boolean;
  multiline: boolean;
}

export interface DocumentTemplateDoc {
  _id: ObjectId;
  name: string;
  documentType: string;
  description: string;
  fields: TemplateField[];
  version: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * filled — заполнено ИИ, есть подтверждающая цитата;
 * uncertain — сведения неоднозначны, требуется проверка врачом;
 * missing — сведений в транскрипции нет, поле пустое;
 * confirmed — проверено/исправлено врачом.
 */
export type FieldStatus = "filled" | "uncertain" | "missing" | "confirmed";

export interface DocumentFieldValue {
  value: string;
  status: FieldStatus;
  evidence: string | null;
}

export const DOCUMENT_STATUSES = ["draft", "generated", "review", "approved"] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

export interface MedicalDocumentDoc {
  _id: ObjectId;
  appointmentId: ObjectId;
  templateId: ObjectId;
  templateName: string;
  templateVersion: number;
  documentType: string;
  fields: TemplateField[]; // снимок полей шаблона на момент генерации
  content: Record<string, DocumentFieldValue>;
  status: DocumentStatus;
  model: string | null;
  generatedAt: Date | null;
  reviewedBy: ObjectId | null;
  reviewedAt: Date | null;
  approvedBy: ObjectId | null;
  approvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ArchiveDoc {
  _id: ObjectId;
  appointmentId: ObjectId;
  doctorId: ObjectId;
  patientName: string;
  archivedBy: ObjectId;
  archivedAt: Date;
  archiveStatus: "archived";
}
