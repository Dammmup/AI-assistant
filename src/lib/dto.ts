import type {
  AppointmentStatus,
  DocumentFieldValue,
  DocumentStatus,
  RecordingStatus,
  SegmentStatus,
  SpeechLanguage,
  TemplateField,
  TranscriptStatus,
} from "./types";

export interface PatientDTO {
  id: string;
  fullName: string;
  dateOfBirth: string | null;
  externalPatientId: string | null;
}

export interface ConsentDTO {
  id: string;
  consentType: string;
  consentTextVersion: string;
  method: "verbal" | "written";
  status: "obtained" | "declined" | "revoked";
  obtainedAt: string;
  obtainedByName: string;
  note: string | null;
}

export interface SegmentDTO {
  id: string;
  seq: number;
  source: "microphone" | "upload";
  status: SegmentStatus;
  text: string;
  error: string | null;
  durationSeconds: number;
  stale: boolean;
}

export interface TranscriptDTO {
  id: string;
  text: string;
  language: SpeechLanguage;
  status: TranscriptStatus;
  provider: string;
  isEdited: boolean;
  editedAt: string | null;
  updatedAt: string;
}

export interface DocumentDTO {
  id: string;
  templateId: string;
  templateName: string;
  templateVersion: number;
  documentType: string;
  fields: TemplateField[];
  content: Record<string, DocumentFieldValue>;
  status: DocumentStatus;
  model: string | null;
  generatedAt: string | null;
  reviewedByName: string | null;
  reviewedAt: string | null;
  approvedByName: string | null;
  approvedAt: string | null;
  updatedAt: string;
}

export interface TemplateDTO {
  id: string;
  name: string;
  documentType: string;
  description: string;
  fields: TemplateField[];
  version: number;
  isActive: boolean;
}

export interface AppointmentDTO {
  id: string;
  patient: PatientDTO;
  doctorName: string;
  reason: string | null;
  language: SpeechLanguage;
  status: AppointmentStatus;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
  updatedAt: string;
  consent: ConsentDTO | null;
  recording: { id: string; durationSeconds: number; format: string; status: RecordingStatus; segmentsCount: number } | null;
  segments: SegmentDTO[];
  transcript: TranscriptDTO | null;
  documents: DocumentDTO[];
  archivedAt: string | null;
}

export interface AppointmentListItemDTO {
  id: string;
  patientName: string;
  reason: string | null;
  status: AppointmentStatus;
  createdAt: string;
  startedAt: string | null;
}
