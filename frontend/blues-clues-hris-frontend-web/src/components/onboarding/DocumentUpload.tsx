"use client";

import { useState } from "react";
import { uploadDocument } from "@/lib/onboardingApi";
import { AlertCircle, Upload, FileText, X, History, FileUp, ExternalLink, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { DocumentItem, DocumentSubmission, Remark } from "@/types/onboarding.types";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { StatusIcon } from "./shared/StatusIcon";
import { StatusBadge } from "./shared/StatusBadge";
import { RemarksSection } from "./shared/RemarksSection";
import { formatFileSize, validateFile } from "./shared/utils";
import { toast } from "sonner";

interface DocumentUploadProps {
  documents: DocumentItem[];
  remarks: Remark[];
  onUpdate: (docs: DocumentItem[]) => void;
}

const ALLOWED_FILE_TYPES = new Set(["application/pdf"]);

export function DocumentUpload({ documents, remarks, onUpdate }: Readonly<DocumentUploadProps>) {
  const [uploadErrors, setUploadErrors] = useState<Record<string, string>>({});
  const [pendingFiles, setPendingFiles] = useState<Record<string, File>>({});
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const awaitingReviewCount = documents.filter((d) => d.status === "submitted" || d.status === "for-review").length;

  const hasPending = (id: string) => !!pendingFiles[id];

  const realFileUrl = (doc: DocumentItem) => {
    const current = doc.files[0];
    if (current?.file_url && !current.submission_id.startsWith("preview-")) {
      return current.file_url;
    }

    const fallback = doc.upload_history
      .slice()
      .reverse()
      .find((f) => !!f.file_url && !f.submission_id.startsWith("preview-"));

    return fallback?.file_url || null;
  };

  const handleFileSelect = (onboardingItemId: string, event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const error = validateFile(file, ALLOWED_FILE_TYPES, "Only PDF files are allowed.");
    if (error) {
      setUploadErrors((prev) => ({ ...prev, [onboardingItemId]: error }));
      event.target.value = "";
      return;
    }

    setUploadErrors((prev) => ({ ...prev, [onboardingItemId]: "" }));
    setPendingFiles((prev) => ({ ...prev, [onboardingItemId]: file }));

    const preview: DocumentSubmission = {
      submission_id: `preview-${Date.now()}`,
      onboarding_item_id: onboardingItemId,
      file_url: "",
      file_name: file.name,
      file_size_bytes: file.size,
      file_type: file.type,
      is_proof_of_receipt: false,
      status: "uploaded",
      uploaded_at: new Date().toISOString(),
    };

    onUpdate(
      documents.map((doc) =>
        doc.onboarding_item_id === onboardingItemId
          ? { ...doc, files: [preview], status: "pending" as const }
          : doc,
      ),
    );

    event.target.value = "";
  };

  const handleCancelStaged = (onboardingItemId: string) => {
    setPendingFiles((prev) => {
      const next = { ...prev };
      delete next[onboardingItemId];
      return next;
    });

    onUpdate(
      documents.map((doc) => {
        if (doc.onboarding_item_id !== onboardingItemId) return doc;
        const last = doc.upload_history.at(-1) ?? null;

        const restoredStatus = last
          ? last.status === "approved"
            ? "approved"
            : last.status === "rejected"
              ? "rejected"
              : "submitted"
          : "pending";

        return {
          ...doc,
          files: last ? [last] : [],
          status: restoredStatus,
        };
      }),
    );
  };

  const handleSubmit = async (onboardingItemId: string) => {
    const file = pendingFiles[onboardingItemId];
    if (!file) return;

    setUploading((prev) => ({ ...prev, [onboardingItemId]: true }));

    try {
      const submission = await uploadDocument(onboardingItemId, file, false);

      setPendingFiles((prev) => {
        const next = { ...prev };
        delete next[onboardingItemId];
        return next;
      });

      onUpdate(
        documents.map((doc) =>
          doc.onboarding_item_id === onboardingItemId
            ? {
                ...doc,
                files: [submission],
                upload_history: [...doc.upload_history, submission],
                status: "submitted" as const,
              }
            : doc,
        ),
      );
      toast.success(`"${submission.file_name}" uploaded. Waiting for HR approval.`);
    } catch (error: any) {
      setUploadErrors((prev) => ({
        ...prev,
        [onboardingItemId]: error?.message || "Upload failed. Please try again.",
      }));
    } finally {
      setUploading((prev) => ({ ...prev, [onboardingItemId]: false }));
    }
  };

  const triggerFileInput = (id: string) => {
    document.getElementById(`file-${id}`)?.click();
  };

  return (
    <div className="space-y-4">
      {documents.length === 0 && (
        <p className="text-sm text-slate-400 py-8 text-center">No documents assigned.</p>
      )}

      <Alert className="border-blue-200 bg-blue-50">
        <AlertCircle className="size-4 text-blue-600" />
        <AlertDescription className="text-xs text-blue-900">
          After you submit a file, it is locked while HR reviews it. You can edit or reupload only if HR rejects the document.
        </AlertDescription>
      </Alert>

      {awaitingReviewCount > 0 && (
        <Alert className="border-amber-200 bg-amber-50">
          <AlertCircle className="size-4 text-amber-600" />
          <AlertDescription className="text-xs text-amber-900">
            {awaitingReviewCount} document{awaitingReviewCount > 1 ? "s are" : " is"} submitted and waiting for HR approval.
          </AlertDescription>
        </Alert>
      )}

      {documents.map((doc) => {
        const id = doc.onboarding_item_id;
        const isPending = hasPending(id);
        const fileUrl = realFileUrl(doc);
        const isRejected = doc.status === "rejected";
        const canReupload = !isPending && isRejected;
        const isLocked = !isPending && !isRejected && ["submitted", "for-review", "approved"].includes(doc.status);
        const isAwaitingReview = !isPending && (doc.status === "submitted" || doc.status === "for-review");

        return (
          <div key={id} className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            <div className="flex items-start justify-between gap-3 px-5 py-4">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-medium text-slate-800 text-sm">{doc.title}</span>
                  {doc.is_required && <span className="text-red-500 text-xs font-bold">*</span>}
                </div>
                {doc.description && <p className="text-xs text-slate-500 mt-0.5">{doc.description}</p>}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <StatusIcon status={doc.status} />
                <StatusBadge status={doc.status} />
              </div>
            </div>

            {isRejected && (
              <div className="mx-5 mb-3 rounded-lg bg-red-50 border border-red-200 px-4 py-2.5">
                <p className="text-xs text-red-700 font-medium">This document was rejected. Please upload a corrected version.</p>
              </div>
            )}

            <div className="flex items-center justify-between gap-3 px-5 py-3 bg-slate-50 border-t border-slate-100">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                {doc.files[0] ? (
                  <>
                    <FileText className="size-4 text-blue-500 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm text-slate-700 truncate">{doc.files[0].file_name}</p>
                      <p className="text-xs text-slate-400">{formatFileSize(doc.files[0].file_size_bytes)}</p>
                    </div>
                    {fileUrl && (
                      <a
                        href={fileUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="shrink-0 inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800 hover:underline transition-colors ml-1"
                      >
                        <ExternalLink className="size-3" />View
                      </a>
                    )}
                  </>
                ) : (
                  <span className="text-sm text-slate-400">No file uploaded yet</span>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {isPending && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7"
                      onClick={() => handleCancelStaged(id)}
                      disabled={uploading[id]}
                    >
                      <X className="size-3 mr-1" />Cancel
                    </Button>
                    <Button size="sm" className="h-7" onClick={() => handleSubmit(id)} disabled={uploading[id]}>
                      {uploading[id] ? "Uploading..." : "Submit"}
                    </Button>
                  </>
                )}

                {!isPending && doc.status === "pending" && (
                  <>
                    <Button variant="outline" size="sm" className="h-7" onClick={() => triggerFileInput(id)}>
                      <Upload className="size-3 mr-1" />Upload
                    </Button>
                    <input
                      id={`file-${id}`}
                      type="file"
                      className="hidden"
                      accept=".pdf"
                      onChange={(e) => handleFileSelect(id, e)}
                    />
                  </>
                )}

                {canReupload && (
                  <>
                    <Button variant="outline" size="sm" className="h-7" onClick={() => triggerFileInput(id)}>
                      <FileUp className="size-3 mr-1" />Reupload
                    </Button>
                    <input
                      id={`file-${id}`}
                      type="file"
                      className="hidden"
                      accept=".pdf"
                      onChange={(e) => handleFileSelect(id, e)}
                    />
                  </>
                )}

                {isLocked && (
                  <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                    <Lock className="size-3.5" />
                    {isAwaitingReview ? "Waiting for HR approval" : "Locked for HR review"}
                  </span>
                )}

                {doc.upload_history.length > 0 && (
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-7 px-2 text-slate-400 hover:text-slate-600">
                        <History className="size-3.5" />
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-lg">
                      <DialogHeader>
                        <DialogTitle>Upload History - {doc.title}</DialogTitle>
                        <DialogDescription>All previous submissions for this document</DialogDescription>
                      </DialogHeader>
                      <ScrollArea className="max-h-80">
                        <div className="space-y-2 pr-2">
                          {doc.upload_history.slice().reverse().map((file, i) => (
                            <div
                              key={file.submission_id}
                              className="flex items-center gap-3 px-3 py-2.5 bg-slate-50 rounded-lg border border-slate-100"
                            >
                              <FileText className="size-5 text-blue-500 shrink-0" />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">{file.file_name}</p>
                                <p className="text-xs text-slate-500">
                                  {formatFileSize(file.file_size_bytes)} - {new Date(file.uploaded_at).toLocaleString()}
                                  {i === 0 && <Badge className="ml-2 text-[10px] py-0 h-4">Latest</Badge>}
                                </p>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <StatusBadge status={file.status} />
                                {file.file_url && (
                                  <a href={file.file_url} target="_blank" rel="noreferrer" className="text-blue-600 hover:text-blue-800">
                                    <ExternalLink className="size-3.5" />
                                  </a>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    </DialogContent>
                  </Dialog>
                )}
              </div>
            </div>

            {uploadErrors[id] && (
              <div className="px-5 pb-3">
                <Alert variant="destructive" className="py-2">
                  <AlertCircle className="size-3.5" />
                  <AlertDescription className="text-xs">{uploadErrors[id]}</AlertDescription>
                </Alert>
              </div>
            )}
          </div>
        );
      })}

      <RemarksSection remarks={remarks} />

      <div className="text-xs text-slate-500 bg-slate-50 p-3 rounded-lg border border-slate-100">
        <strong>File requirements:</strong> PDF only - Max 10 MB - One file per document.
        Submitted documents are locked until HR review is completed.
      </div>
    </div>
  );
}
