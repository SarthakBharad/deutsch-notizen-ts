import { notFound } from "next/navigation";

import { NotePage } from "@/components/NotePage";
import { findLevel, findNote, library } from "@/lib/library";

export const dynamicParams = false;

export function generateStaticParams() {
  return library.levels.flatMap((level) =>
    level.notes.map((note) => ({ level: level.slug, note: note.slug })),
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ level: string; note: string }>;
}) {
  const { level, note } = await params;
  const found = findNote(level, note);
  return { title: found ? `${found.title} · ${found.level}` : "Deutsch Notizen" };
}

export default async function Page({
  params,
}: {
  params: Promise<{ level: string; note: string }>;
}) {
  const { level: levelSlug, note: noteSlug } = await params;
  const level = findLevel(levelSlug);
  const note = findNote(levelSlug, noteSlug);
  if (!level || !note) notFound();

  return <NotePage level={level} note={note} />;
}
