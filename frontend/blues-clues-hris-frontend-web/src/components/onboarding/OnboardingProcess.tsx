import { useState, useEffect } from "react";
import { submitForReview } from "@/lib/onboardingApi";
import {
  Clock, AlertCircle, CheckCircle, XCircle,
  User as UserIcon, FileText, ClipboardList, Monitor, Lock,
  Briefcase, CalendarDays, ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DocumentUpload } from "./DocumentUpload";
import { TaskChecklist } from "./TaskChecklist";
import { EquipmentRequest } from "./EquipmentRequest";
import { ProfileSetup } from "./ProfileSetup";
import { HRForms } from "./HRForms";
import {
  OnboardingSession, DocumentItem, TaskItem, EquipmentItem,
  HRFormItem, ProfileData, OnboardingItemBase,
} from "@/types/onboarding.types";

interface OnboardingProcessProps {
  session: OnboardingSession;
  onUpdateSession: (session: OnboardingSession) => void;
  onComplete: () => void;
  userRole?: "employee" | "hr" | "admin";
}

export function OnboardingProcess({
  session,
  onUpdateSession,
  onComplete,
  userRole = "employee",
}: Readonly<OnboardingProcessProps>) {
  const [daysRemaining, setDaysRemaining] = useState(0);
  const [submittingForReview, setSubmittingForReview] = useState(false);

  const isEmployee = userRole === "employee";
  const documents = session.documents || [];
  const tasks = session.tasks || [];
  const equipment = session.equipment || [];
  const hrForms = session.hr_forms || [];
  const profileItems: OnboardingItemBase[] = session.profile_items || [];
  const displayTasks = isEmployee ? tasks.filter(t => t.type !== "video") : tasks;

  useEffect(() => {
    const deadline = new Date(session.deadline_date);
    const diff = deadline.getTime() - Date.now();
    setDaysRemaining(Math.ceil(diff / (1000 * 60 * 60 * 24)));
  }, [session.deadline_date]);

  // ── Progress counts ──────────────────────────────────────────────────────────
  const allItems = [...documents, ...displayTasks, ...equipment, ...hrForms, ...profileItems];
  const requiredItems = allItems.filter(i => i.is_required);
  const completedItems = requiredItems.filter(i => ["approved", "confirmed", "issued"].includes(i.status));
  const progress = requiredItems.length > 0
    ? Math.round((completedItems.length / requiredItems.length) * 100)
    : 0;

  const approvedCount = [
    ...documents.filter(d => d.status === "approved"),
    ...displayTasks.filter(t => t.status === "approved" || t.status === "confirmed"),
    ...equipment.filter(e => e.status === "approved" || e.status === "issued"),
    ...hrForms.filter(f => f.status === "approved"),
    ...profileItems.filter(p => p.status === "approved"),
  ].length;

  const underReviewCount = [
    ...documents.filter(d => d.status === "for-review"),
    ...displayTasks.filter(t => t.status === "for-review"),
    ...equipment.filter(e => e.status === "for-review"),
    ...hrForms.filter(f => f.status === "for-review" || f.status === "confirmed"),
    ...profileItems.filter(p => p.status === "confirmed"),
  ].length;

  const remainingCount = [
    ...profileItems.filter(p => p.status === "pending" || p.status === "rejected"),
    ...documents.filter(d => d.status === "pending" || d.status === "rejected"),
    ...displayTasks.filter(t => t.status === "pending" || t.status === "rejected"),
    ...equipment.filter(e => e.status === "pending" || e.status === "rejected"),
    ...hrForms.filter(f => f.status === "pending" || f.status === "rejected"),
  ].length;

  // ── Sequential step-unlock logic ─────────────────────────────────────────────
  // Each tab is visible only after the previous tab's required items are all HR-approved.
  const profileApproved = profileItems.some(i => i.status === "approved");

  const allRequired = (items: { is_required: boolean; status: string }[], doneStatuses: string[]) =>
    items.filter(i => i.is_required).length === 0 ||
    items.filter(i => i.is_required).every(i => doneStatuses.includes(i.status));

  const documentsAllApproved = allRequired(documents, ["approved"]);
  const formsAllApproved     = allRequired(hrForms,   ["approved"]);
  const tasksAllApproved     = allRequired(displayTasks, ["approved", "confirmed"]);
  const equipmentAllApproved = equipment.length === 0 || equipment.every(e => ["approved", "issued"].includes(e.status));

  const documentsUnlocked = profileApproved;
  const formsUnlocked     = profileApproved && documentsAllApproved;
  const tasksUnlocked     = profileApproved && documentsAllApproved && formsAllApproved;
  const equipmentUnlocked = profileApproved && documentsAllApproved && formsAllApproved && tasksAllApproved;
  const finalReady = progress === 100 && equipmentAllApproved;

  // ── Session update handlers ───────────────────────────────────────────────────
  const handleUpdateDocuments = (docs: DocumentItem[]) =>
    onUpdateSession({ ...session, documents: docs });
  const handleUpdateTasks = (t: TaskItem[]) =>
    onUpdateSession({ ...session, tasks: t });
  const handleUpdateEquipment = (eq: EquipmentItem[]) =>
    onUpdateSession({ ...session, equipment: eq });
  const handleUpdateHRForms = (forms: HRFormItem[]) =>
    onUpdateSession({ ...session, hr_forms: forms });
  const handleUpdateProfile = (profile: ProfileData) =>
    onUpdateSession({
      ...session,
      profile,
      profile_items: session.profile_items.map(item => ({ ...item, status: "confirmed" as const })),
    });

  const handleSubmitForReview = async () => {
    if (!finalReady) {
      if (!equipmentAllApproved) {
        alert("Please complete the Equipment step first before submitting for final review.");
        return;
      }
      alert("Please complete all required items before submitting for review");
      return;
    }
    setSubmittingForReview(true);
    try {
      await submitForReview(session.session_id);
      onUpdateSession({ ...session, status: "for-review" });
      alert("Your onboarding has been submitted for final review!");
      onComplete();
    } catch {
      alert("Failed to submit for review. Please try again.");
    } finally {
      setSubmittingForReview(false);
    }
  };

  // ── Deadline badge ────────────────────────────────────────────────────────────
  const deadlineBadge = () => {
    if (daysRemaining <= 0)
      return <span className="inline-flex items-center gap-1.5 text-xs font-semibold bg-red-100 text-red-700 border border-red-200 rounded-full px-3 py-1"><AlertCircle className="size-3" />Overdue</span>;
    if (daysRemaining <= 3)
      return <span className="inline-flex items-center gap-1.5 text-xs font-semibold bg-orange-100 text-orange-700 border border-orange-200 rounded-full px-3 py-1"><AlertCircle className="size-3" />{daysRemaining}d left — urgent</span>;
    if (daysRemaining <= 7)
      return <span className="inline-flex items-center gap-1.5 text-xs font-semibold bg-amber-100 text-amber-700 border border-amber-200 rounded-full px-3 py-1"><Clock className="size-3" />{daysRemaining} days left</span>;
    return null;
  };

  // ── Rejected items alert ──────────────────────────────────────────────────────
  const rejectedItems = [
    ...profileItems.filter(i => i.status === "rejected").map(i => ({ ...i, tab: "Profile" })),
    ...documents.filter(i => i.status === "rejected").map(i => ({ ...i, tab: "Documents" })),
    ...hrForms.filter(i => i.status === "rejected").map(i => ({ ...i, tab: "HR Forms" })),
    ...displayTasks.filter(i => i.status === "rejected").map(i => ({ ...i, tab: "Tasks" })),
    ...equipment.filter(i => i.status === "rejected").map(i => ({ ...i, tab: "Equipment" })),
  ];

  // ── Tab step definitions ──────────────────────────────────────────────────────
  const steps = [
    { value: "profile",   label: "Profile",    icon: UserIcon,     unlocked: true,              approved: profileApproved },
    { value: "documents", label: "Documents",  icon: FileText,     unlocked: documentsUnlocked, approved: documentsAllApproved && documentsUnlocked },
    { value: "forms",     label: "HR Forms",   icon: ClipboardList,unlocked: formsUnlocked,     approved: formsAllApproved && formsUnlocked },
    { value: "tasks",     label: "Tasks",      icon: CheckCircle,  unlocked: tasksUnlocked,     approved: tasksAllApproved && tasksUnlocked },
    { value: "equipment", label: "Equipment",  icon: Monitor,      unlocked: equipmentUnlocked, approved: equipmentAllApproved && equipmentUnlocked },
  ] as const;

  return (
    <div className="space-y-5">

      {/* ── Hero header ── */}
      <div className="bg-blue-900 rounded-2xl px-6 py-5 text-white shadow-md">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <div className="size-12 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
              <Briefcase className="size-6 text-white" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-blue-300 mb-0.5">Employee Onboarding</p>
              <h1 className="text-xl font-bold leading-tight">{session.assigned_position}</h1>
              <p className="text-blue-300 text-sm">{session.assigned_department}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {deadlineBadge()}
            <span className="inline-flex items-center gap-1.5 text-xs text-blue-200 bg-white/10 border border-white/20 rounded-full px-3 py-1">
              <CalendarDays className="size-3" />
              Due {new Date(session.deadline_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            </span>
          </div>
        </div>
      </div>

      {/* ── Rejected items alert ── */}
      {rejectedItems.length > 0 && (
        <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <XCircle className="size-4 text-red-600 shrink-0 mt-0.5" />
          <div className="text-sm text-red-800">
            <p className="font-semibold mb-1">Action required — {rejectedItems.length} item{rejectedItems.length > 1 ? "s" : ""} need{rejectedItems.length === 1 ? "s" : ""} attention:</p>
            <ul className="list-disc list-inside space-y-0.5">
              {rejectedItems.map(i => (
                <li key={i.onboarding_item_id}>
                  <span className="font-medium">{i.title}</span>
                  <span className="text-red-500 ml-1">({i.tab})</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* ── Progress card ── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold text-slate-700">Overall Progress</p>
          <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${progress === 100 ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
            {progress}% Complete
          </span>
        </div>
        <Progress value={progress} className="h-2.5 mb-3" />
        <div className="flex items-center gap-4 text-xs text-slate-500 flex-wrap">
          <span className="flex items-center gap-1.5"><CheckCircle className="size-3.5 text-emerald-500" />{approvedCount} approved</span>
          <span className="text-slate-200">•</span>
          <span className="flex items-center gap-1.5"><Clock className="size-3.5 text-amber-500" />{underReviewCount} under review</span>
          <span className="text-slate-200">•</span>
          <span className="flex items-center gap-1.5"><AlertCircle className="size-3.5 text-slate-400" />{remainingCount} remaining</span>
        </div>
      </div>

      {/* ── Main checklist ── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 pt-4 pb-2 border-b border-slate-100">
          <p className="text-sm font-semibold text-slate-800">Onboarding Checklist</p>
          <p className="text-xs text-slate-400 mt-0.5">Complete each section in order. The next step unlocks once HR approves the current one.</p>
        </div>

        <Tabs defaultValue="profile" className="w-full">
          {/* Step tab bar */}
          <div className="px-5 pt-3 pb-0">
            <TabsList className="flex h-auto gap-1 p-1 bg-slate-100 rounded-xl w-full">
              {steps.map(({ value, label, icon: Icon, unlocked, approved }, idx) => (
                <TabsTrigger
                  key={value}
                  value={value}
                  disabled={!unlocked}
                  className="flex flex-1 flex-col items-center gap-1 py-2 px-1 rounded-lg text-xs font-medium text-slate-500 disabled:opacity-50 disabled:cursor-not-allowed data-[state=active]:bg-white data-[state=active]:text-blue-700 data-[state=active]:shadow-sm data-[state=active]:font-semibold transition-all cursor-pointer"
                >
                  <span className="relative flex items-center justify-center">
                    {approved ? (
                      <span className="size-6 rounded-full bg-emerald-100 flex items-center justify-center">
                        <CheckCircle className="size-3.5 text-emerald-600" />
                      </span>
                    ) : !unlocked ? (
                      <span className="size-6 rounded-full bg-slate-200 flex items-center justify-center">
                        <Lock className="size-3 text-slate-400" />
                      </span>
                    ) : (
                      <span className="size-6 rounded-full bg-blue-50 flex items-center justify-center">
                        <Icon className="size-3.5 text-blue-600" />
                      </span>
                    )}
                  </span>
                  <span className="hidden sm:block truncate max-w-[60px] xl:max-w-none">{label}</span>
                  {!unlocked && idx > 0 && (
                    <span className="hidden md:block text-[9px] text-slate-400 font-normal">Step {idx}</span>
                  )}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <div className="p-5">
            {/* Profile */}
            <TabsContent value="profile" className="mt-0">
              <ProfileSetup
                profile={session.profile}
                sessionId={session.session_id}
                remarks={session.remarks}
                onUpdate={handleUpdateProfile}
                profileRejected={session.profile_items?.some(i => i.status === "rejected")}
                profileApproved={session.profile_items?.some(i => i.status === "approved")}
                profileConfirmed={session.profile_items?.some(i => i.status === "confirmed")}
              />
            </TabsContent>

            {/* Documents — locked overlay when not unlocked */}
            <TabsContent value="documents" className="mt-0">
              {!documentsUnlocked ? (
                <LockedStep label="Profile" />
              ) : (
                <DocumentUpload
                  documents={documents}
                  remarks={session.remarks.filter(r => r.tab_tag === "Documents")}
                  onUpdate={handleUpdateDocuments}
                />
              )}
            </TabsContent>

            {/* HR Forms */}
            <TabsContent value="forms" className="mt-0">
              {!formsUnlocked ? (
                <LockedStep label="Documents" />
              ) : (
                <HRForms
                  forms={hrForms}
                  remarks={session.remarks.filter(r => r.tab_tag === "Forms")}
                  onUpdate={handleUpdateHRForms}
                />
              )}
            </TabsContent>

            {/* Tasks */}
            <TabsContent value="tasks" className="mt-0">
              {!tasksUnlocked ? (
                <LockedStep label="HR Forms" />
              ) : (
                <TaskChecklist
                  tasks={displayTasks}
                  remarks={session.remarks.filter(r => r.tab_tag === "Tasks")}
                  onUpdateTasks={handleUpdateTasks}
                />
              )}
            </TabsContent>

            {/* Equipment */}
            <TabsContent value="equipment" className="mt-0">
              {!equipmentUnlocked ? (
                <LockedStep label="Tasks" />
              ) : (
                <EquipmentRequest
                  equipment={equipment}
                  remarks={session.remarks.filter(r => r.tab_tag === "Equipment")}
                  onUpdateEquipment={handleUpdateEquipment}
                />
              )}
            </TabsContent>
          </div>
        </Tabs>
      </div>

      {/* ── Submit for final review ── */}
      {progress === 100 && !equipmentAllApproved && session.status !== "for-review" && session.status !== "approved" && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-4 flex items-center gap-3">
          <AlertCircle className="size-4 text-amber-600 shrink-0" />
          <p className="text-xs text-amber-800">
            Finish the <strong>Equipment</strong> step first before you can submit for final HR review.
          </p>
        </div>
      )}
      {finalReady && session.status !== "for-review" && session.status !== "approved" && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-5 py-4 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <p className="font-semibold text-emerald-900 text-sm">Ready to Submit</p>
            <p className="text-xs text-emerald-700 mt-0.5">You&apos;ve completed all requirements. Submit for final HR review.</p>
          </div>
          <Button
            onClick={handleSubmitForReview}
            disabled={submittingForReview}
            className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm cursor-pointer"
          >
            <CheckCircle className="size-4 mr-2" />
            {submittingForReview ? "Submitting…" : "Submit for Final Review"}
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Locked step placeholder ───────────────────────────────────────────────────
function LockedStep({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
      <div className="size-14 rounded-full bg-slate-100 flex items-center justify-center">
        <Lock className="size-6 text-slate-400" />
      </div>
      <div>
        <p className="font-semibold text-slate-700">This step is locked</p>
        <p className="text-sm text-slate-500 mt-1 flex items-center justify-center gap-1">
          Complete and get <strong className="text-slate-700 mx-1">{label}</strong> approved by HR first
          <ChevronRight className="size-3.5" />
        </p>
      </div>
    </div>
  );
}
