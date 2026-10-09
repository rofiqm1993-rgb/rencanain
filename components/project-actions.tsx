"use client";

import { useState, type FormEvent } from "react";
import { Pencil, Trash2 } from "lucide-react";
import type { Project } from "@/lib/prd";
import { userError } from "@/lib/user-errors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

export default function ProjectActions({ project, disabled, onUpdate, onDelete }: {
  project: Project;
  disabled: boolean;
  onUpdate: (title: string, summary: string) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState(project.prd.title);
  const [summary, setSummary] = useState(project.prd.summary);
  const [error, setError] = useState("");

  function openEditor() {
    setTitle(project.prd.title);
    setSummary(project.prd.summary);
    setError("");
    setEditing(true);
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const nextTitle = title.trim(), nextSummary = summary.trim();
    if (!nextTitle || !nextSummary) { setError("Judul dan ringkasan wajib diisi."); return; }
    setBusy(true); setError("");
    try { await onUpdate(nextTitle, nextSummary); setEditing(false); }
    catch (cause) { setError(userError(cause, "save")); }
    finally { setBusy(false); }
  }
  async function remove() {
    if (busy) return;
    setBusy(true); setError("");
    try { await onDelete(); setDeleting(false); }
    catch (cause) { setError(userError(cause, "save")); }
    finally { setBusy(false); }
  }

  return <>
    <div className="project-actions">
      <Button variant="outline" disabled={disabled} onClick={openEditor}><Pencil size={16} /> Edit detail</Button>
      <Button variant="outline" disabled={disabled} onClick={() => { setError(""); setDeleting(true); }}><Trash2 size={16} /> Hapus proyek</Button>
    </div>
    <Dialog open={editing} onOpenChange={open => { if (!busy) setEditing(open); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Edit detail proyek</DialogTitle><DialogDescription>Ubah judul dan ringkasan tanpa menghapus dokumen atau progres tugas.</DialogDescription></DialogHeader>
        <form className="project-edit-form" onSubmit={event => void save(event)}>
          <label>Judul proyek<Input autoFocus required maxLength={160} value={title} onChange={event => setTitle(event.target.value)} disabled={busy} /></label>
          <label>Ringkasan<Textarea required maxLength={3000} rows={5} value={summary} onChange={event => setSummary(event.target.value)} disabled={busy} /></label>
          {error && <p className="project-action-error" role="alert">{error}</p>}
          <DialogFooter><Button type="button" variant="outline" disabled={busy} onClick={() => setEditing(false)}>Batal</Button><Button type="submit" disabled={busy || !title.trim() || !summary.trim()}>{busy ? "Menyimpan…" : "Simpan perubahan"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
    <AlertDialog open={deleting} onOpenChange={open => { if (!busy) setDeleting(open); }}>
      <AlertDialogContent>
        <AlertDialogHeader><AlertDialogTitle>Hapus proyek ini?</AlertDialogTitle><AlertDialogDescription>“{project.prd.title}” beserta PRD dan checklist-nya akan dihapus permanen dari ruang kerja ini. Tindakan ini tidak dapat dibatalkan.</AlertDialogDescription></AlertDialogHeader>
        {error && <p className="project-action-error" role="alert">{error}</p>}
        <AlertDialogFooter><AlertDialogCancel disabled={busy}>Batal</AlertDialogCancel><Button variant="destructive" disabled={busy} onClick={() => void remove()}>{busy ? "Menghapus…" : "Ya, hapus proyek"}</Button></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>;
}
