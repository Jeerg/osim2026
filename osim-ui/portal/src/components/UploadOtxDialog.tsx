/**
 * UploadOtxDialog — Modal für OTX-Upload (Plan 01-07 Task 5).
 *
 * UX-Flow:
 *  1. User klickt "Modell hochladen" in /models → Dialog öffnet.
 *  2. File-Input (accept=".otx") + Name-Input (Default: filename ohne Ext.).
 *  3. Submit ruft useUploadOtx-Mutation; on success → toast + navigate
 *     auf /models/{id} (Workspace).
 *  4. Error-Toast (kommt aus useUploadOtx.onError) + Dialog bleibt offen
 *     damit der User korrigieren kann (z.B. größere Datei rejected mit 413).
 */

import { useState, type ChangeEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

import { useUploadOtx } from "@/api/models";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

export interface UploadOtxDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function UploadOtxDialog({ open, onOpenChange }: UploadOtxDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const uploadMutation = useUploadOtx();
  const navigate = useNavigate();

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    if (f && !name) {
      // Default-Name aus Dateiname ohne .otx-Extension
      setName(f.name.replace(/\.otx$/i, ""));
    }
  }

  function handleClose(newOpen: boolean) {
    if (!newOpen) {
      // Reset bei Close
      setFile(null);
      setName("");
    }
    onOpenChange(newOpen);
  }

  function handleSubmit() {
    if (!file) {
      toast.error("Bitte eine OTX-Datei auswählen.");
      return;
    }
    const finalName = name.trim() || file.name.replace(/\.otx$/i, "");
    uploadMutation.mutate(
      { file, name: finalName },
      {
        onSuccess: (data) => {
          toast.success(`Modell "${data.model.name}" hochgeladen`);
          handleClose(false);
          void navigate({
            to: "/models/$id",
            params: { id: data.model.id },
          });
        },
        // onError ist bereits in useUploadOtx mit toast.error verdrahtet.
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent data-testid="upload-otx-dialog">
        <DialogHeader>
          <DialogTitle>Modell hochladen</DialogTitle>
          <DialogDescription>
            Wählen Sie eine OTX-Datei. Der Server parst sie und legt das Modell
            in Ihrer Bibliothek ab.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <label
              htmlFor="upload-otx-file"
              className="text-sm font-medium text-foreground"
            >
              OTX-Datei
            </label>
            <Input
              id="upload-otx-file"
              type="file"
              accept=".otx"
              onChange={handleFileChange}
              disabled={uploadMutation.isPending}
            />
          </div>

          <div className="space-y-2">
            <label
              htmlFor="upload-otx-name"
              className="text-sm font-medium text-foreground"
            >
              Modell-Name
            </label>
            <Input
              id="upload-otx-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Mein Modell"
              disabled={uploadMutation.isPending}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleClose(false)}
            disabled={uploadMutation.isPending}
          >
            Abbrechen
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!file || uploadMutation.isPending}
          >
            {uploadMutation.isPending ? "Lade hoch..." : "Hochladen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
