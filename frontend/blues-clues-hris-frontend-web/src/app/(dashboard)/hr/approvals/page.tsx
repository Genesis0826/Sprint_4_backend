"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText, FilePen } from "lucide-react";
import HRDocumentApprovalsView from "@/components/approvals/HRDocumentApprovalsView";
import HRProfileChangeRequestsView from "@/components/onboarding/HRProfileChangeRequestsView";

export default function HRApprovalsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Approvals</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Review and action pending employee document submissions and profile change requests.
        </p>
      </div>

      <Tabs defaultValue="documents">
        <TabsList className="mb-4">
          <TabsTrigger value="documents" className="flex items-center gap-1.5">
            <FileText className="h-4 w-4" />
            Document Approvals
          </TabsTrigger>
          <TabsTrigger value="profile-changes" className="flex items-center gap-1.5">
            <FilePen className="h-4 w-4" />
            Profile Changes
          </TabsTrigger>
        </TabsList>

        <TabsContent value="documents">
          <HRDocumentApprovalsView />
        </TabsContent>

        <TabsContent value="profile-changes">
          <HRProfileChangeRequestsView />
        </TabsContent>
      </Tabs>
    </div>
  );
}
