import type { ObjectId } from "mongodb";
import { collections } from "./db";
import type { AppointmentDTO, DocumentDTO, TemplateDTO } from "./dto";
import type { AppointmentDoc, DocumentTemplateDoc, MedicalDocumentDoc } from "./types";

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);
const STALE_MS = 2 * 60_000;

export function templateDTO(t: DocumentTemplateDoc): TemplateDTO {
  return {
    id: t._id.toHexString(),
    name: t.name,
    documentType: t.documentType,
    description: t.description,
    fields: t.fields,
    version: t.version,
    isActive: t.isActive,
  };
}

export function documentDTO(d: MedicalDocumentDoc, names: Map<string, string>): DocumentDTO {
  return {
    id: d._id.toHexString(),
    templateId: d.templateId.toHexString(),
    templateName: d.templateName,
    templateVersion: d.templateVersion,
    documentType: d.documentType,
    fields: d.fields,
    content: d.content,
    status: d.status,
    model: d.model,
    generatedAt: iso(d.generatedAt),
    reviewedByName: d.reviewedBy ? (names.get(d.reviewedBy.toHexString()) ?? null) : null,
    reviewedAt: iso(d.reviewedAt),
    approvedByName: d.approvedBy ? (names.get(d.approvedBy.toHexString()) ?? null) : null,
    approvedAt: iso(d.approvedAt),
    updatedAt: d.updatedAt.toISOString(),
  };
}

async function userNames(ids: (ObjectId | null | undefined)[]) {
  const { users } = await collections();
  const unique = [...new Map(ids.filter(Boolean).map((id) => [id!.toHexString(), id!])).values()];
  const list = unique.length ? await users.find({ _id: { $in: unique } }, { projection: { fullName: 1 } }).toArray() : [];
  return new Map(list.map((u) => [u._id.toHexString(), u.fullName]));
}

export async function appointmentDTO(appt: AppointmentDoc): Promise<AppointmentDTO> {
  const c = await collections();
  const [patient, consent, recording, segments, transcript, documents, archived] = await Promise.all([
    c.patients.findOne({ _id: appt.patientId }),
    appt.consentId ? c.consents.findOne({ _id: appt.consentId }) : null,
    c.recordings.findOne({ appointmentId: appt._id }),
    c.segments.find({ appointmentId: appt._id }, { sort: { seq: 1 } }).toArray(),
    c.transcripts.findOne({ appointmentId: appt._id }),
    c.documents.find({ appointmentId: appt._id }, { sort: { createdAt: 1 } }).toArray(),
    c.archive.findOne({ appointmentId: appt._id }),
  ]);
  const names = await userNames([
    appt.doctorId,
    consent?.obtainedBy,
    ...documents.flatMap((d) => [d.reviewedBy, d.approvedBy]),
  ]);
  const now = Date.now();
  return {
    id: appt._id.toHexString(),
    patient: {
      id: appt.patientId.toHexString(),
      fullName: patient?.fullName ?? appt.patientName,
      dateOfBirth: patient?.dateOfBirth ?? null,
      externalPatientId: patient?.externalPatientId ?? null,
    },
    doctorName: names.get(appt.doctorId.toHexString()) ?? "",
    reason: appt.reason,
    language: appt.language,
    status: appt.status,
    startedAt: iso(appt.startedAt),
    endedAt: iso(appt.endedAt),
    createdAt: appt.createdAt.toISOString(),
    updatedAt: appt.updatedAt.toISOString(),
    consent: consent
      ? {
          id: consent._id.toHexString(),
          consentType: consent.consentType,
          consentTextVersion: consent.consentTextVersion,
          method: consent.method,
          status: consent.status,
          obtainedAt: consent.obtainedAt.toISOString(),
          obtainedByName: names.get(consent.obtainedBy.toHexString()) ?? "",
          note: consent.note,
        }
      : null,
    recording: recording
      ? {
          id: recording._id.toHexString(),
          durationSeconds: recording.durationSeconds,
          format: recording.format,
          status: recording.status,
          segmentsCount: recording.segmentsCount,
        }
      : null,
    segments: segments.map((s) => ({
      id: s._id.toHexString(),
      seq: s.seq,
      source: s.source,
      status: s.status,
      text: s.text,
      error: s.error,
      durationSeconds: s.durationSeconds,
      stale: s.status === "pending" && now - s.updatedAt.getTime() > STALE_MS,
    })),
    transcript: transcript
      ? {
          id: transcript._id.toHexString(),
          text: transcript.text,
          language: transcript.language,
          status: transcript.status,
          provider: transcript.provider,
          isEdited: transcript.isEdited,
          editedAt: iso(transcript.editedAt),
          updatedAt: transcript.updatedAt.toISOString(),
        }
      : null,
    documents: documents.map((d) => documentDTO(d, names)),
    archivedAt: iso(archived?.archivedAt),
  };
}
