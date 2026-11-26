// revenueSources/{YYYY-MM}: each channel's revenue by source (YouTube Studio's "Revenue source"
// exports), saved when an admin builds the month's report in รายได้ → Monthly ACC → รายงาน Revenue
// source. Read by YouTube Revenue (e.g. Shorts Feed ads per channel). USD, as in the files.
import { collection, doc, getDocs, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { ChannelSources } from "@/lib/dashboard/revenueSourceReport";

export interface RevenueSourceMonth {
  month: string;
  channels: ChannelSources[];
  savedAt: string;
  savedBy: string;
  /** How many Revenue source files the report was built from. */
  files: number;
}

export async function saveRevenueSourceMonth(month: string, channels: ChannelSources[], files: number, savedBy: string): Promise<void> {
  // Firestore refuses undefined: a JSON round trip drops it.
  const plain = JSON.parse(JSON.stringify({ month, channels, files, savedBy, savedAt: new Date().toISOString() }));
  await setDoc(doc(db, "revenueSources", month), plain);
}

/** Every month saved; empty when none (or not readable without the revenue permission). */
export async function loadRevenueSourceMonths(): Promise<RevenueSourceMonth[]> {
  try {
    const snap = await getDocs(collection(db, "revenueSources"));
    return snap.docs.map((d) => d.data() as RevenueSourceMonth).filter((m) => m.month && Array.isArray(m.channels));
  } catch {
    return [];
  }
}
