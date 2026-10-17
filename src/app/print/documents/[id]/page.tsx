import { notFound } from "next/navigation";
import { ObjectId } from "mongodb";
import { requirePageUser } from "@/lib/auth";
import { collections } from "@/lib/db";
import { PrintButton } from "@/components/print-button";

const fmt = (d: Date | null | undefined) => (d ? d.toLocaleString("ru-RU", { dateStyle: "long", timeStyle: "short", timeZone: "Asia/Almaty" }) : "—");

export default async function PrintDocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageUser("doctor");
  const { id } = await params;
  if (!ObjectId.isValid(id)) notFound();
  const { documents, appointments, patients, users } = await collections();
  const doc = await documents.findOne({ _id: new ObjectId(id) });
  if (!doc) notFound();
  const appt = await appointments.findOne({ _id: doc.appointmentId, doctorId: user._id });
  if (!appt) notFound();
  const [patient, doctor] = await Promise.all([patients.findOne({ _id: appt.patientId }), users.findOne({ _id: appt.doctorId })]);
  const approved = doc.status === "approved";

  return (
    <main className="mx-auto max-w-3xl bg-white p-8 text-[15px] leading-relaxed print:p-0">
      <div className="no-print mb-6 flex justify-end">
        <PrintButton />
      </div>
      {!approved && (
        <div className="mb-6 rounded border-2 border-dashed border-red-400 p-3 text-center font-semibold text-[#8a2922]">
          ЧЕРНОВИК — документ не подтверждён врачом
        </div>
      )}
      {doctor?.organization && <p className="text-center text-[13px] tracking-wide text-ink-2">{doctor.organization}</p>}
      <h1 className="mt-2 text-center text-xl font-bold uppercase">{doc.templateName}</h1>
      <table className="mt-6 w-full text-sm">
        <tbody>
          <Row label="Пациент" value={patient?.fullName ?? appt.patientName} />
          {patient?.dateOfBirth && <Row label="Дата рождения" value={new Date(`${patient.dateOfBirth}T00:00:00`).toLocaleDateString("ru-RU")} />}
          {patient?.externalPatientId && <Row label="ID пациента" value={patient.externalPatientId} />}
          <Row label="Дата приёма" value={fmt(appt.startedAt ?? appt.createdAt)} />
          <Row label="Врач" value={[doctor?.fullName, doctor?.position].filter(Boolean).join(", ")} />
        </tbody>
      </table>
      <div className="mt-6 space-y-4">
        {doc.fields.map((f) => (
          <section key={f.key}>
            <h2 className="font-semibold">{f.label}</h2>
            <p className="whitespace-pre-wrap">{doc.content[f.key]?.value || "—"}</p>
          </section>
        ))}
      </div>
      <div className="mt-10 flex justify-between border-t pt-4 text-sm">
        <span>{approved ? `Подтверждено врачом: ${fmt(doc.approvedAt)}` : "Не подтверждено"}</span>
        <span>
          {doctor?.position || "Врач"} ____________________ / {doctor?.fullName}
        </span>
      </div>
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <tr>
      <td className="w-40 py-0.5 pr-4 align-top text-ink-2">{label}</td>
      <td className="py-0.5">{value}</td>
    </tr>
  );
}
