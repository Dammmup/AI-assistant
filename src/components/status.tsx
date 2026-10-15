import { APPOINTMENT_STATUS_LABEL, DOCUMENT_STATUS_LABEL, FIELD_STATUS_LABEL } from "@/lib/labels";
import type { AppointmentStatus, DocumentStatus, FieldStatus } from "@/lib/types";
import { Badge, type Tone } from "./ui";

const APPT_TONE: Record<AppointmentStatus, Tone> = {
  draft: "gray",
  recording: "red",
  processing: "blue",
  review: "yellow",
  completed: "green",
  archived: "violet",
};
const DOC_TONE: Record<DocumentStatus, Tone> = { draft: "gray", generated: "blue", review: "yellow", approved: "green" };
const FIELD_TONE: Record<FieldStatus, Tone> = { filled: "brand", uncertain: "yellow", missing: "gray", confirmed: "green" };

export const AppointmentStatusBadge = ({ status }: { status: AppointmentStatus }) => (
  <Badge tone={APPT_TONE[status]}>{APPOINTMENT_STATUS_LABEL[status]}</Badge>
);
export const DocumentStatusBadge = ({ status }: { status: DocumentStatus }) => (
  <Badge tone={DOC_TONE[status]}>{DOCUMENT_STATUS_LABEL[status]}</Badge>
);
export const FieldStatusBadge = ({ status, title }: { status: FieldStatus; title?: string }) => (
  <Badge tone={FIELD_TONE[status]} title={title}>
    {FIELD_STATUS_LABEL[status]}
  </Badge>
);
