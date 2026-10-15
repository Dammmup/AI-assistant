import { GridFSBucket, MongoClient, type Db } from "mongodb";
import type {
  AppointmentDoc,
  ArchiveDoc,
  ConsentDoc,
  DocumentTemplateDoc,
  MedicalDocumentDoc,
  PatientDoc,
  RecordingDoc,
  SegmentDoc,
  TranscriptDoc,
  UserDoc,
} from "./types";
import { ensureSetup } from "./setup";

type Cache = { client?: Promise<MongoClient>; setup?: Promise<void> };
const g = globalThis as unknown as { __mongo?: Cache };
const cache: Cache = (g.__mongo ??= {});

function getClient(): Promise<MongoClient> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("Не задана переменная окружения MONGODB_URI");
  if (!cache.client) {
    cache.client = new MongoClient(uri, { maxPoolSize: 10 }).connect().catch((err) => {
      cache.client = undefined;
      throw err;
    });
  }
  return cache.client;
}

export async function getDb(): Promise<Db> {
  const client = await getClient();
  const db = client.db(process.env.MONGODB_DB || "medscribe");
  if (!cache.setup) {
    cache.setup = ensureSetup(db).catch((err) => {
      cache.setup = undefined;
      throw err;
    });
  }
  await cache.setup;
  return db;
}

export async function collections() {
  const db = await getDb();
  return {
    db,
    users: db.collection<UserDoc>("users"),
    patients: db.collection<PatientDoc>("patients"),
    appointments: db.collection<AppointmentDoc>("appointments"),
    consents: db.collection<ConsentDoc>("consents"),
    recordings: db.collection<RecordingDoc>("recordings"),
    segments: db.collection<SegmentDoc>("recording_segments"),
    transcripts: db.collection<TranscriptDoc>("transcripts"),
    templates: db.collection<DocumentTemplateDoc>("document_templates"),
    documents: db.collection<MedicalDocumentDoc>("medical_documents"),
    archive: db.collection<ArchiveDoc>("archive"),
    audio: new GridFSBucket(db, { bucketName: "audio" }),
  };
}
