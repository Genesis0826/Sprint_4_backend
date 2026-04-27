"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Check,
  DollarSign,
  FileText,
  Loader2,
  Lock,
  PlayCircle,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { SecondaryAuthModal } from "@/components/security/SecondaryAuthModal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getDirectorySnapshot, type DirectoryUser } from "@/lib/hrDirectoryApi";
import {
  assignEmployeeBenefit,
  createBenefitCatalogItem,
  getBenefitsCatalog,
  getEmployeeBenefits,
  getPayslipsForPeriod,
  getSalaryBaseline,
  getStatutoryIds,
  removeEmployeeBenefit,
  reviewPayslip,
  runPayrollCutoff,
  saveStatutoryIds,
  setSalaryBaseline,
  type BenefitCatalogItem,
  type ComputedPayslip,
  type EmployeeBenefitItem,
  type PayslipBreakdown,
  type PayrollRunResult,
  type SalaryBaseline,
  type StatutoryIds,
} from "@/lib/payrollApi";

const toCurrency = (value: number) =>
  new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 2,
  }).format(value);

const getStatusColor = (status: string) => {
  if (status === "released" || status === "Approved") return "bg-emerald-100 text-emerald-700";
  if (status === "processed") return "bg-sky-100 text-sky-700";
  if (status === "Correction Needed") return "bg-rose-100 text-rose-700";
  return "bg-amber-100 text-amber-700";
};

type StatutoryForm = {
  tin_number: string;
  sss_number: string;
  philhealth_number: string;
  pagibig_number: string;
};

export default function HRPayrollPage() {
  const [activeTab, setActiveTab] = useState("payroll-run");
  const [users, setUsers] = useState<DirectoryUser[]>([]);
  const employees = useMemo(() => users.filter((u) => !!u.employee_id), [users]);

  const [rows, setRows] = useState<ComputedPayslip[]>([]);
  const [loadingLedger, setLoadingLedger] = useState(false);
  const [locked, setLocked] = useState(true);
  const [authOpen, setAuthOpen] = useState(false);
  const [pendingLedgerPeriodId, setPendingLedgerPeriodId] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [cutoffStartDate, setCutoffStartDate] = useState(() => {
    const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10);
  });
  const [cutoffEndDate, setCutoffEndDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [payoutDate, setPayoutDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 5); return d.toISOString().slice(0, 10);
  });
  const [payrollResult, setPayrollResult] = useState<PayrollRunResult | null>(null);
  const [reviewingPayslipId, setReviewingPayslipId] = useState<string | null>(null);
  const [receiptPayslip, setReceiptPayslip] = useState<ComputedPayslip | null>(null);

  const [salaryUserId, setSalaryUserId] = useState<string>("");
  const [salaryLoading, setSalaryLoading] = useState(false);
  const [salarySaving, setSalarySaving] = useState(false);
  const [currentSalary, setCurrentSalary] = useState<SalaryBaseline | null>(null);
  const [basicSalary, setBasicSalary] = useState("");
  const [payFrequency, setPayFrequency] = useState<"monthly" | "semi-monthly">("monthly");
  const [salaryEffectiveDate, setSalaryEffectiveDate] = useState(() => new Date().toISOString().slice(0, 10));

  const [catalog, setCatalog] = useState<BenefitCatalogItem[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [benefitsUserId, setBenefitsUserId] = useState<string>("");
  const [employeeBenefits, setEmployeeBenefits] = useState<EmployeeBenefitItem[]>([]);
  const [employeeBenefitsLoading, setEmployeeBenefitsLoading] = useState(false);

  const [addCatalogOpen, setAddCatalogOpen] = useState(false);
  const [creatingCatalog, setCreatingCatalog] = useState(false);
  const [newBenefitName, setNewBenefitName] = useState("");
  const [newBenefitType, setNewBenefitType] = useState("allowance");
  const [newBenefitCustomType, setNewBenefitCustomType] = useState("");
  const [newBenefitTaxable, setNewBenefitTaxable] = useState(false);

  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [assigningBenefit, setAssigningBenefit] = useState(false);
  const [assignBenefitId, setAssignBenefitId] = useState("");
  const [assignAmount, setAssignAmount] = useState("");
  const [assignEffectiveDate, setAssignEffectiveDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [deletingMappingId, setDeletingMappingId] = useState<string | null>(null);

  const [statutoryUserId, setStatutoryUserId] = useState<string>("");
  const [statutoryLoading, setStatutoryLoading] = useState(false);
  const [statutorySaving, setStatutorySaving] = useState(false);
  const [statutoryData, setStatutoryData] = useState<StatutoryIds | null>(null);
  const [statutoryForm, setStatutoryForm] = useState<StatutoryForm>({
    tin_number: "",
    sss_number: "",
    philhealth_number: "",
    pagibig_number: "",
  });

  const loadUsers = async () => {
    try {
      const snapshot = await getDirectorySnapshot();
      setUsers(snapshot.users);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load users");
    }
  };

  const loadPayslipsForPeriod = async (periodId: string) => {
    setLoadingLedger(true);
    try {
      const data = await getPayslipsForPeriod(periodId);
      setRows(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load payslips");
    } finally {
      setLoadingLedger(false);
    }
  };

  const loadCatalog = async () => {
    setCatalogLoading(true);
    try {
      const data = await getBenefitsCatalog();
      setCatalog(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load benefits catalog");
    } finally {
      setCatalogLoading(false);
    }
  };

  const loadSalaryBaseline = async (userId: string) => {
    if (!userId) return;
    setSalaryLoading(true);
    try {
      const data = await getSalaryBaseline(userId);
      setCurrentSalary(data);
      if (data) {
        setBasicSalary(String(data.basic_salary));
        setPayFrequency(data.pay_frequency === "semi-monthly" ? "semi-monthly" : "monthly");
        setSalaryEffectiveDate(data.effective_date?.slice(0, 10) || new Date().toISOString().slice(0, 10));
      } else {
        setBasicSalary("");
        setPayFrequency("monthly");
        setSalaryEffectiveDate(new Date().toISOString().slice(0, 10));
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load salary baseline");
    } finally {
      setSalaryLoading(false);
    }
  };

  const loadEmployeeBenefits = async (userId: string) => {
    if (!userId) return;
    setEmployeeBenefitsLoading(true);
    try {
      const data = await getEmployeeBenefits(userId);
      setEmployeeBenefits(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load employee benefits");
      setEmployeeBenefits([]);
    } finally {
      setEmployeeBenefitsLoading(false);
    }
  };

  const loadStatutoryIds = async (userId: string) => {
    if (!userId) return;
    setStatutoryLoading(true);
    try {
      const data = await getStatutoryIds(userId);
      setStatutoryData(data);
      setStatutoryForm({
        tin_number: data?.tin_number ?? "",
        sss_number: data?.sss_number ?? "",
        philhealth_number: data?.philhealth_number ?? "",
        pagibig_number: data?.pagibig_number ?? "",
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load statutory IDs");
      setStatutoryData(null);
    } finally {
      setStatutoryLoading(false);
    }
  };

  useEffect(() => {
    void Promise.all([loadUsers(), loadCatalog()]);
  }, []);

  useEffect(() => {
    if (!salaryUserId && employees.length) setSalaryUserId(employees[0].user_id);
    if (!benefitsUserId && employees.length) setBenefitsUserId(employees[0].user_id);
    if (!statutoryUserId && employees.length) setStatutoryUserId(employees[0].user_id);
  }, [employees, salaryUserId, benefitsUserId, statutoryUserId]);

  useEffect(() => {
    if (salaryUserId) void loadSalaryBaseline(salaryUserId);
  }, [salaryUserId]);

  useEffect(() => {
    if (benefitsUserId) void loadEmployeeBenefits(benefitsUserId);
  }, [benefitsUserId]);

  useEffect(() => {
    if (statutoryUserId) void loadStatutoryIds(statutoryUserId);
  }, [statutoryUserId]);

  const totals = useMemo(
    () =>
      rows.reduce(
        (acc, row) => {
          acc.gross += Number(row.gross_pay);
          acc.deductions += Number(row.total_deductions);
          acc.net += Number(row.net_pay);
          return acc;
        },
        { gross: 0, deductions: 0, net: 0 },
      ),
    [rows],
  );

  const handleRunCutoff = async () => {
    if (!cutoffStartDate || !cutoffEndDate || !payoutDate) {
      toast.error("Please fill in all date fields.");
      return;
    }
    setRunning(true);
    try {
      const result = await runPayrollCutoff({
        cutoff_start_date: cutoffStartDate,
        cutoff_end_date: cutoffEndDate,
        payout_date: payoutDate,
      });
      setPayrollResult(result);
      setLocked(true);
      setRows([]);
      setPendingLedgerPeriodId(result.period_id);
      toast.success(
        `Payroll computed: ${result.computed} employees processed, ${result.skipped} skipped.`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to run payroll");
    } finally {
      setRunning(false);
    }
  };

  const handleReviewPayslip = async (
    payslipId: string,
    status: "Approved" | "Correction Needed",
  ) => {
    setReviewingPayslipId(payslipId);
    try {
      await reviewPayslip(payslipId, status);
      toast.success(`Payslip marked as ${status}.`);
      if (payrollResult?.period_id) {
        await loadPayslipsForPeriod(payrollResult.period_id);
      } else {
        setRows((prev) =>
          prev.map((row) =>
            row.payslip_id === payslipId ? { ...row, status } : row,
          ),
        );
        setReceiptPayslip((prev) =>
          prev?.payslip_id === payslipId ? { ...prev, status } : prev,
        );
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to review payslip");
    } finally {
      setReviewingPayslipId(null);
    }
  };

  const handleSaveSalary = async () => {
    if (!salaryUserId) {
      toast.error("Select an employee first.");
      return;
    }
    const parsed = Number(basicSalary);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      toast.error("Basic salary must be greater than 0.");
      return;
    }
    if (!salaryEffectiveDate) {
      toast.error("Effective date is required.");
      return;
    }

    setSalarySaving(true);
    try {
      await setSalaryBaseline({
        user_id: salaryUserId,
        pay_frequency: payFrequency,
        basic_salary: parsed,
        effective_date: salaryEffectiveDate,
      });
      toast.success("Salary baseline saved.");
      await loadSalaryBaseline(salaryUserId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save salary baseline");
    } finally {
      setSalarySaving(false);
    }
  };

  const handleCreateCatalogItem = async () => {
    if (!newBenefitName.trim()) {
      toast.error("Benefit name is required.");
      return;
    }
    const resolvedType =
      newBenefitType === "custom"
        ? newBenefitCustomType.trim()
        : newBenefitType;
    if (!resolvedType) {
      toast.error("Custom benefit type name is required.");
      return;
    }
    setCreatingCatalog(true);
    try {
      await createBenefitCatalogItem({
        benefit_name: newBenefitName.trim(),
        benefit_type: resolvedType,
        taxable: newBenefitTaxable,
      });
      toast.success("Benefit type added.");
      setAddCatalogOpen(false);
      setNewBenefitName("");
      setNewBenefitType("allowance");
      setNewBenefitCustomType("");
      setNewBenefitTaxable(false);
      await loadCatalog();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add benefit type");
    } finally {
      setCreatingCatalog(false);
    }
  };

  const handleAssignBenefit = async () => {
    if (!benefitsUserId) {
      toast.error("Select an employee first.");
      return;
    }
    if (!assignBenefitId) {
      toast.error("Select a benefit.");
      return;
    }
    const amount = Number(assignAmount);
    if (!Number.isFinite(amount) || amount < 0) {
      toast.error("Amount must be a valid number.");
      return;
    }
    if (!assignEffectiveDate) {
      toast.error("Effective date is required.");
      return;
    }

    setAssigningBenefit(true);
    try {
      await assignEmployeeBenefit({
        user_id: benefitsUserId,
        benefit_id: assignBenefitId,
        amount,
        effective_date: assignEffectiveDate,
      });
      toast.success("Benefit assigned.");
      setAssignDialogOpen(false);
      setAssignBenefitId("");
      setAssignAmount("");
      setAssignEffectiveDate(new Date().toISOString().slice(0, 10));
      await loadEmployeeBenefits(benefitsUserId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to assign benefit");
    } finally {
      setAssigningBenefit(false);
    }
  };

  const handleDeleteBenefit = async (mappingId: string) => {
    setDeletingMappingId(mappingId);
    try {
      await removeEmployeeBenefit(mappingId);
      toast.success("Benefit removed.");
      if (benefitsUserId) await loadEmployeeBenefits(benefitsUserId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove benefit");
    } finally {
      setDeletingMappingId(null);
    }
  };

  const handleSaveStatutory = async () => {
    if (!statutoryUserId) {
      toast.error("Select an employee first.");
      return;
    }
    setStatutorySaving(true);
    try {
      const saved = await saveStatutoryIds(statutoryUserId, {
        tin_number: statutoryForm.tin_number.trim() || undefined,
        sss_number: statutoryForm.sss_number.trim() || undefined,
        philhealth_number: statutoryForm.philhealth_number.trim() || undefined,
        pagibig_number: statutoryForm.pagibig_number.trim() || undefined,
      });
      setStatutoryData(saved);
      toast.success("Statutory IDs saved.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save statutory IDs");
    } finally {
      setStatutorySaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-[26px] border border-slate-200 bg-[linear-gradient(135deg,#0f172a_0%,#172554_52%,#134e4a_100%)] text-white px-8 py-10 shadow-sm">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/65 mb-2">HR Operations</p>
        <h1 className="text-2xl font-bold tracking-tight mb-1">Compensation & Benefits</h1>
        <p className="text-sm text-white/75 max-w-2xl">
          Manage payroll runs, salary baselines, employee benefits, and statutory IDs.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-2 lg:grid-cols-4">
          <TabsTrigger value="payroll-run">Payroll Run</TabsTrigger>
          <TabsTrigger value="salary-baselines">Salary Baselines</TabsTrigger>
          <TabsTrigger value="benefits">Benefits</TabsTrigger>
          <TabsTrigger value="statutory-ids">Statutory IDs</TabsTrigger>
        </TabsList>

        <TabsContent value="payroll-run" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-bold tracking-tight">Run Payroll Cutoff</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-3 md:grid-cols-3">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground">Cutoff Start Date</label>
                  <Input type="date" value={cutoffStartDate} onChange={(e) => setCutoffStartDate(e.target.value)} className="mt-1" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground">Cutoff End Date</label>
                  <Input type="date" value={cutoffEndDate} onChange={(e) => setCutoffEndDate(e.target.value)} className="mt-1" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground">Payout Date</label>
                  <Input type="date" value={payoutDate} onChange={(e) => setPayoutDate(e.target.value)} className="mt-1" />
                </div>
              </div>
              <div className="flex gap-2">
                <Button onClick={() => void handleRunCutoff()} disabled={running} className="h-10 px-4">
                  {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
                  Run Payroll
                </Button>
              </div>
              {payrollResult && (
                <div className="rounded-lg border bg-emerald-50 border-emerald-200 p-3 text-sm text-emerald-800">
                  Payroll complete — <strong>{payrollResult.computed}</strong> computed,{" "}
                  <strong>{payrollResult.skipped}</strong> skipped (no salary baseline).
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-muted-foreground">Gross Payroll</CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-bold">{toCurrency(totals.gross)}</CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-muted-foreground">Total Deductions</CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-bold">{toCurrency(totals.deductions)}</CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-muted-foreground">Net Payroll</CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-bold">{toCurrency(totals.net)}</CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg font-bold tracking-tight flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-primary" /> Payroll Ledger
              </CardTitle>
              {locked ? (
                <Button size="sm" className="h-8 px-3" onClick={() => setAuthOpen(true)}>
                  <Lock className="h-3.5 w-3.5" /> Unlock
                </Button>
              ) : (
                <Badge variant="secondary">Unlocked for this session</Badge>
              )}
            </CardHeader>
            <CardContent>
              {loadingLedger ? (
                <div className="min-h-45 flex items-center justify-center gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm">Loading payroll records...</span>
                </div>
              ) : locked ? (
                <div className="space-y-3">
                  {rows.length > 0 && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                      {rows.length} payslip{rows.length !== 1 ? "s" : ""} computed and ready. Unlock to view.
                    </div>
                  )}
                  <p className="text-sm text-muted-foreground">Unlock with secondary authentication to view compensation values.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {rows.map((row) => {
                    const empName = row.employee
                      ? `${row.employee.first_name} ${row.employee.last_name}`
                      : row.user_id;
                    const empId = row.employee?.employee_id ?? "";
                    const reviewing = reviewingPayslipId === row.payslip_id;
                    return (
                      <div key={row.payslip_id} className="border rounded-lg p-4 bg-muted/20">
                        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                          <div>
                            <p className="text-sm font-semibold">{empName}</p>
                            <p className="text-xs text-muted-foreground">{empId}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge className={getStatusColor(row.status as "draft" | "processed" | "released" | string)}>
                              {row.status}
                            </Badge>
                            <Badge variant="outline">Net {toCurrency(Number(row.net_pay))}</Badge>
                          </div>
                        </div>

                        <div className="mt-3 grid gap-2 sm:grid-cols-3 text-xs">
                          <div className="rounded-md border p-2 bg-background">Gross: {toCurrency(Number(row.gross_pay))}</div>
                          <div className="rounded-md border p-2 bg-background">Deductions: {toCurrency(Number(row.total_deductions))}</div>
                          <div className="rounded-md border p-2 bg-background">Net: {toCurrency(Number(row.net_pay))}</div>
                        </div>

                        <div className="mt-3 flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 px-3"
                            onClick={() => setReceiptPayslip(row)}
                          >
                            <FileText className="h-3.5 w-3.5" />
                            View Receipt
                          </Button>
                          {row.status === "Pending Review" && (
                            <>
                              <Button
                                size="sm"
                                className="bg-emerald-600 hover:bg-emerald-700 text-white h-8 px-3"
                                disabled={reviewing}
                                onClick={() => void handleReviewPayslip(row.payslip_id, "Approved")}
                              >
                                {reviewing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                                Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="border-rose-200 text-rose-700 hover:bg-rose-50 h-8 px-3"
                                disabled={reviewing}
                                onClick={() => void handleReviewPayslip(row.payslip_id, "Correction Needed")}
                              >
                                <X className="h-3.5 w-3.5" />
                                Correction Needed
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {rows.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Run a payroll cutoff above to compute payslips for all active employees.
                    </p>
                  ) : null}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="salary-baselines" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-bold tracking-tight">Salary Baselines</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Employee</p>
                <Select value={salaryUserId} onValueChange={setSalaryUserId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select employee" />
                  </SelectTrigger>
                  <SelectContent>
                    {employees.map((employee) => (
                      <SelectItem key={employee.user_id} value={employee.user_id}>
                        {employee.first_name} {employee.last_name} ({employee.employee_id})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {salaryLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading salary baseline...
                </div>
              ) : (
                <div className="rounded-lg border bg-muted/20 p-3 text-sm">
                  {currentSalary
                    ? `Current salary: ${toCurrency(Number(currentSalary.basic_salary))} (${currentSalary.pay_frequency}) effective ${new Date(currentSalary.effective_date).toLocaleDateString()}`
                    : "No current salary baseline set for this employee."}
                </div>
              )}

              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-1.5">
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Basic Salary (PHP)</p>
                  <Input
                    type="number"
                    min="0"
                    value={basicSalary}
                    onChange={(e) => setBasicSalary(e.target.value)}
                    placeholder="e.g. 30000"
                  />
                </div>
                <div className="space-y-1.5">
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Pay Frequency</p>
                  <Select value={payFrequency} onValueChange={(v) => setPayFrequency(v as "monthly" | "semi-monthly")}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monthly">monthly</SelectItem>
                      <SelectItem value="semi-monthly">semi-monthly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Effective Date</p>
                  <Input type="date" value={salaryEffectiveDate} onChange={(e) => setSalaryEffectiveDate(e.target.value)} />
                </div>
              </div>

              <Button onClick={() => void handleSaveSalary()} disabled={salarySaving}>
                {salarySaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Save Salary Baseline
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="benefits" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base font-bold tracking-tight">Catalog</CardTitle>
              <Dialog open={addCatalogOpen} onOpenChange={setAddCatalogOpen}>
                <DialogTrigger asChild>
                  <Button size="sm">
                    <Plus className="h-3.5 w-3.5" />
                    Add Benefit Type
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add Benefit Type</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Name</p>
                      <Input value={newBenefitName} onChange={(e) => setNewBenefitName(e.target.value)} placeholder="Transport Allowance" />
                    </div>
                    <div className="space-y-1.5">
                      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Type</p>
                      <Select value={newBenefitType} onValueChange={(v) => { setNewBenefitType(v); if (v !== "custom") setNewBenefitCustomType(""); }}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="allowance">Allowance</SelectItem>
                          <SelectItem value="incentive">Incentive</SelectItem>
                          <SelectItem value="one_time_incentive">One-Time Incentive</SelectItem>
                          <SelectItem value="13th_month">13th Month Pay</SelectItem>
                          <SelectItem value="retirement">Retirement Benefit</SelectItem>
                          <SelectItem value="custom">Custom Type…</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {newBenefitType === "custom" && (
                      <div className="space-y-1.5">
                        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Custom Type Name</p>
                        <Input
                          value={newBenefitCustomType}
                          onChange={(e) => setNewBenefitCustomType(e.target.value)}
                          placeholder="e.g. meal_allowance"
                        />
                      </div>
                    )}
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox checked={newBenefitTaxable} onCheckedChange={(checked) => setNewBenefitTaxable(checked === true)} />
                      Taxable
                    </label>
                    <Button onClick={() => void handleCreateCatalogItem()} disabled={creatingCatalog} className="w-full">
                      {creatingCatalog ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      Save Benefit Type
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              {catalogLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading benefit catalog...
                </div>
              ) : (
                <div className="space-y-2">
                  {catalog.map((item) => (
                    <div key={item.benefit_id} className="rounded-md border p-3 flex items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold">{item.benefit_name}</p>
                        <p className="text-xs text-muted-foreground">{item.benefit_type}</p>
                      </div>
                      <Badge variant={item.taxable ? "default" : "secondary"}>
                        {item.taxable ? "Taxable" : "Non-taxable"}
                      </Badge>
                    </div>
                  ))}
                  {catalog.length === 0 ? <p className="text-sm text-muted-foreground">No benefit types yet.</p> : null}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base font-bold tracking-tight">Employee Benefits</CardTitle>
              <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="sm">
                    <Plus className="h-3.5 w-3.5" />
                    Assign Benefit
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Assign Benefit</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Benefit</p>
                      <Select value={assignBenefitId} onValueChange={setAssignBenefitId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select benefit" />
                        </SelectTrigger>
                        <SelectContent>
                          {catalog.map((item) => (
                            <SelectItem key={item.benefit_id} value={item.benefit_id}>
                              {item.benefit_name} ({item.benefit_type})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Amount (PHP)</p>
                      <Input type="number" min="0" value={assignAmount} onChange={(e) => setAssignAmount(e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Effective Date</p>
                      <Input type="date" value={assignEffectiveDate} onChange={(e) => setAssignEffectiveDate(e.target.value)} />
                    </div>
                    <Button onClick={() => void handleAssignBenefit()} disabled={assigningBenefit} className="w-full">
                      {assigningBenefit ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      Assign
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Employee</p>
                <Select value={benefitsUserId} onValueChange={setBenefitsUserId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select employee" />
                  </SelectTrigger>
                  <SelectContent>
                    {employees.map((employee) => (
                      <SelectItem key={employee.user_id} value={employee.user_id}>
                        {employee.first_name} {employee.last_name} ({employee.employee_id})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {employeeBenefitsLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading employee benefits...
                </div>
              ) : (
                <div className="space-y-2">
                  {employeeBenefits.map((item) => {
                    const deleting = deletingMappingId === item.mapping_id;
                    return (
                      <div key={item.mapping_id} className="rounded-md border p-3 flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold">{item.benefit_name ?? "Unknown Benefit"}</p>
                          <p className="text-xs text-muted-foreground">
                            {item.benefit_type ?? "N/A"} · {toCurrency(Number(item.amount))} · Effective{" "}
                            {new Date(item.effective_date).toLocaleDateString()}
                          </p>
                        </div>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="text-rose-600 hover:text-rose-700"
                          disabled={deleting}
                          onClick={() => void handleDeleteBenefit(item.mapping_id)}
                        >
                          {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                        </Button>
                      </div>
                    );
                  })}
                  {employeeBenefits.length === 0 ? <p className="text-sm text-muted-foreground">No assigned benefits.</p> : null}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="statutory-ids" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-bold tracking-tight">Statutory IDs</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Employee</p>
                <Select value={statutoryUserId} onValueChange={setStatutoryUserId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select employee" />
                  </SelectTrigger>
                  <SelectContent>
                    {employees.map((employee) => (
                      <SelectItem key={employee.user_id} value={employee.user_id}>
                        {employee.first_name} {employee.last_name} ({employee.employee_id})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {statutoryLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading statutory IDs...
                </div>
              ) : (
                <div className="rounded-lg border bg-muted/20 p-3 text-sm">
                  {statutoryData ? "Existing statutory records loaded." : "No statutory record yet. Enter values below."}
                </div>
              )}

              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1.5">
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">TIN Number</p>
                  <Input
                    value={statutoryForm.tin_number}
                    onChange={(e) => setStatutoryForm((prev) => ({ ...prev, tin_number: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">SSS Number</p>
                  <Input
                    value={statutoryForm.sss_number}
                    onChange={(e) => setStatutoryForm((prev) => ({ ...prev, sss_number: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">PhilHealth Number</p>
                  <Input
                    value={statutoryForm.philhealth_number}
                    onChange={(e) => setStatutoryForm((prev) => ({ ...prev, philhealth_number: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Pag-IBIG MID</p>
                  <Input
                    value={statutoryForm.pagibig_number}
                    onChange={(e) => setStatutoryForm((prev) => ({ ...prev, pagibig_number: e.target.value }))}
                  />
                </div>
              </div>

              <Button onClick={() => void handleSaveStatutory()} disabled={statutorySaving}>
                {statutorySaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Save Statutory IDs
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <SecondaryAuthModal
        open={authOpen}
        onOpenChange={setAuthOpen}
        title="Unlock Compensation Data"
        description="Re-enter your password to access payroll amounts."
        onVerified={() => {
          setLocked(false);
          if (pendingLedgerPeriodId) {
            void loadPayslipsForPeriod(pendingLedgerPeriodId);
            setPendingLedgerPeriodId(null);
          }
        }}
      />

      {/* Payslip Receipt Modal */}
      <Dialog open={!!receiptPayslip} onOpenChange={(open) => { if (!open) setReceiptPayslip(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-4 w-4" /> Payslip Receipt
            </DialogTitle>
          </DialogHeader>
          {receiptPayslip && (
            <PayslipReceiptView payslip={receiptPayslip} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PayslipReceiptView({ payslip }: { payslip: ComputedPayslip }) {
  const fmt = (n: string | number) =>
    new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(Number(n));

  // breakdown is stored as JSON in other_deductions by the computation engine
  const breakdown = payslip.breakdown as PayslipBreakdown | null;

  // Derive statutory values: prefer itemized breakdown, fall back to aggregate
  const sss = breakdown?.sss ?? null;
  const philhealth = breakdown?.philhealth ?? null;
  const pagibig = breakdown?.pagibig ?? null;
  const hasItemisedStatutory = sss !== null && philhealth !== null && pagibig !== null;
  const statutoryTotal = Number(payslip.statutory_deductions);

  return (
    <div className="space-y-4 text-sm">
      {/* Employee header */}
      <div className="rounded-lg bg-slate-50 border p-3">
        <p className="font-semibold">
          {payslip.employee
            ? `${payslip.employee.first_name} ${payslip.employee.last_name}`
            : payslip.user_id}
        </p>
        {payslip.employee?.employee_id && (
          <p className="text-xs text-muted-foreground">{payslip.employee.employee_id}</p>
        )}
      </div>

      {/* Earnings */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">Earnings</p>
        <div className="space-y-1.5">
          <div className="flex justify-between">
            <span>Basic Pay</span>
            <span className="font-medium">{fmt(payslip.basic_pay_earned)}</span>
          </div>
          {breakdown?.benefits?.map((b, i) => (
            <div key={i} className="flex justify-between text-muted-foreground">
              <span>{b.name ?? b.type ?? "Benefit"}</span>
              <span>{fmt(b.amount)}</span>
            </div>
          ))}
          {(!breakdown?.benefits?.length) && Number(payslip.total_allowances) > 0 && (
            <div className="flex justify-between text-muted-foreground">
              <span>Total Allowances</span>
              <span>{fmt(payslip.total_allowances)}</span>
            </div>
          )}
        </div>
        <div className="flex justify-between font-semibold border-t mt-2 pt-2">
          <span>Gross Pay</span>
          <span>{fmt(payslip.gross_pay)}</span>
        </div>
      </div>

      {/* Deductions */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">Deductions</p>
        <div className="space-y-1.5">
          {/* Income Tax */}
          <div className="flex justify-between text-muted-foreground">
            <span>Income Tax (Withheld)</span>
            <span>{fmt(payslip.tax_deduction)}</span>
          </div>
          {Number(payslip.tax_deduction) === 0 && (
            <p className="text-xs text-amber-600 pl-1">
              ↳ ₱0 — no tax brackets configured. Set them under System Admin → Tax Brackets.
            </p>
          )}

          {/* Statutory deductions — itemised if breakdown available, aggregate otherwise */}
          {hasItemisedStatutory ? (
            <>
              <div className="flex justify-between text-muted-foreground">
                <span>SSS (Employee Share)</span>
                <span>{fmt(sss!)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>PhilHealth (Employee Share)</span>
                <span>{fmt(philhealth!)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Pag-IBIG</span>
                <span>{fmt(pagibig!)}</span>
              </div>
            </>
          ) : (
            <div className="flex justify-between text-muted-foreground">
              <span>Statutory Deductions (SSS / PhilHealth / Pag-IBIG)</span>
              <span>{fmt(statutoryTotal)}</span>
            </div>
          )}
        </div>
        <div className="flex justify-between font-semibold border-t mt-2 pt-2 text-rose-700">
          <span>Total Deductions</span>
          <span>{fmt(payslip.total_deductions)}</span>
        </div>
      </div>

      {/* Net Pay */}
      <div className="rounded-lg bg-emerald-50 border-emerald-200 border p-3 flex justify-between items-center">
        <span className="font-bold text-emerald-900">Net Pay</span>
        <span className="font-bold text-emerald-900 text-lg">{fmt(payslip.net_pay)}</span>
      </div>
    </div>
  );
}
