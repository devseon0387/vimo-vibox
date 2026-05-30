import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/session";
import {
  listAllNotes,
  listFolders,
  listNotesInFolder,
  listFileTree,
  readNote,
  readRawFile,
} from "@/lib/notes";
import { NotesPane } from "@/components/dev/NotesPane";
import { FilesPane } from "@/components/dev/FilesPane";

export const dynamic = "force-dynamic";

export default async function DevNotesPage({
  searchParams,
}: {
  searchParams: Promise<{
    view?: string;
    folder?: string;
    id?: string;
    path?: string;
  }>;
}) {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  if (session.role !== "admin") redirect("/");

  const params = await searchParams;
  const view = params.view === "files" ? "files" : "notes";

  if (view === "files") {
    const tree = await listFileTree();
    const file = params.path ? await readRawFile(params.path) : null;
    return (
      <FilesPane
        initialTree={tree}
        initialPath={params.path ?? null}
        initialFile={file}
      />
    );
  }

  const folders = await listFolders();
  const notes = params.folder
    ? await listNotesInFolder(params.folder)
    : await listAllNotes();
  const detail = params.id ? await readNote(params.id) : null;

  return (
    <NotesPane
      folders={folders}
      notes={notes}
      initialFolder={params.folder ?? null}
      initialId={params.id ?? null}
      initialDetail={detail}
    />
  );
}
