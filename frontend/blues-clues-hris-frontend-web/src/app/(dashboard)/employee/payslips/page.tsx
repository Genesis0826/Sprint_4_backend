"use client";

import { useEffect, useMemo, useState } from "react";
import { BadgeDollarSign, Download, Eye, FileText, Loader2, Lock, Printer } from "lucide-react";
import { toast } from "sonner";

import { SecondaryAuthModal } from "@/components/security/SecondaryAuthModal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  getMyCompensation,
  getMyPayslipsFromCnb,
  type CompensationPackage,
  type PayslipDetail,
  type PayslipBreakdown,
} from "@/lib/payrollApi";

const toCurrency = (value: number | string) =>
  new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 2,
  }).format(Number(value));

function maskId(value?: string | null) {
  if (!value) return "Not set";
  const plain = value.replace(/\s+/g, "");
  const tail = plain.slice(-4);
  const hiddenCount = Math.max(0, plain.length - 4);
  return `${"•".repeat(hiddenCount)}${tail}`;
}

function formatPeriod(payslip: PayslipDetail) {
  if (payslip.period) {
    const start = new Date(payslip.period.cutoff_start_date).toLocaleDateString("en-PH", { month: "short", day: "numeric" });
    const end = new Date(payslip.period.cutoff_end_date).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
    return `${start} – ${end}`;
  }
  return new Date(payslip.created_at).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
}

function PayslipReceiptView({ payslip }: { payslip: PayslipDetail }) {
  const breakdown = payslip.breakdown as PayslipBreakdown | null;

  const handlePrint = () => globalThis.print();

  const handleDownload = () => {
    const lines = [
      ["Description", "Amount (PHP)"],
      ["--- EARNINGS ---", ""],
      ["Basic Pay", payslip.basic_pay_earned],
      ...(breakdown?.benefits?.map((b) => [b.name ?? b.type ?? "Benefit", String(b.amount)]) ?? []),
      ["Gross Pay", payslip.gross_pay],
      ["--- DEDUCTIONS ---", ""],
      ["Income Tax", payslip.tax_deduction],
      ["SSS", String(breakdown?.sss ?? 0)],
      ["PhilHealth", String(breakdown?.philhealth ?? 0)],
      ["Pag-IBIG", String(breakdown?.pagibig ?? 0)],
      ["Total Deductions", payslip.total_deductions],
      ["--- NET PAY ---", ""],
      ["Net Pay", payslip.net_pay],
    ];
    const csv = lines
      .map((line) => line.map((c) => `"${String(c).replaceAll('"', '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `payslip-${formatPeriod(payslip).replace(/\s+/g, "-").toLowerCase()}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4 text-sm">
      <div className="rounded-lg bg-slate-50 border p-3 text-xs text-muted-foreground">
        Pay Period: <span className="font-semibold text-foreground">{formatPeriod(payslip)}</span>
        {payslip.period?.payout_date && (
          <> · Payout: <span className="font-semibold text-foreground">
            {new Date(payslip.period.payout_date).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}
          </span></>
        )}
      </div>

      {/* Earnings */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">Earnings</p>
        <div className="space-y-1.5">
          <div className="flex justify-between">
            <span>Basic Pay</span>
            <span className="font-medium">{toCurrency(payslip.basic_pay_earned)}</span>
          </div>
          {breakdown?.benefits?.map((b, i) => (
            <div key={i} className="flex justify-between text-muted-foreground">
              <span>{b.name ?? b.type ?? "Benefit"}</span>
              <span>{toCurrency(b.amount)}</span>
            </div>
          ))}
          {(!breakdown?.benefits?.length) && Number(payslip.total_allowances) > 0 && (
            <div className="flex justify-between text-muted-foreground">
              <span>Total Allowances</span>
              <span>{toCurrency(payslip.total_allowances)}</span>
            </div>
          )}
        </div>
        <div className="flex justify-between font-semibold border-t mt-2 pt-2">
          <span>Gross Pay</span>
          <span>{toCurrency(payslip.gross_pay)}</span>
        </div>
      </div>

      {/* Deductions */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">Deductions</p>
        <div className="space-y-1.5">
          <div className="flex justify-between text-muted-foreground">
            <span>Income Tax (Withheld)</span>
            <span>{toCurrency(payslip.tax_deduction)}</span>
          </div>
          {breakdown?.sss != null ? (
            <>
              <div className="flex justify-between text-muted-foreground">
                <span>SSS (Employee Share)</span>
                <span>{toCurrency(breakdown.sss)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>PhilHealth (Employee Share)</span>
                <span>{toCurrency(breakdown.philhealth)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Pag-IBIG</span>
                <span>{toCurrency(breakdown.pagibig)}</span>
              </div>
            </>
          ) : (
            <div className="flex justify-between text-muted-foreground">
              <span>Statutory Deductions (SSS / PhilHealth / Pag-IBIG)</span>
              <span>{toCurrency(payslip.statutory_deductions)}</span>
            </div>
          )}
        </div>
        <div className="flex justify-between font-semibold border-t mt-2 pt-2 text-rose-700">
          <span>Total Deductions</span>
          <span>{toCurrency(payslip.total_deductions)}</span>
        </div>
      </div>

      {/* Net Pay */}
      <div className="rounded-lg bg-emerald-50 border-emerald-200 border p-3 flex justify-between items-center">
        <span className="font-bold text-emerald-900">Net Pay</span>
        <span className="font-bold text-emerald-900 text-lg">{toCurrency(payslip.net_pay)}</span>
      </div>

      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={handleDownload}>
          <Download className="h-3.5 w-3.5" /> Download CSV
        </Button>
        <Button variant="outline" size="sm" onClick={handlePrint}>
          <Printer className="h-3.5 w-3.5" /> Print
        </Button>
      </div>
    </div>
  );
}

export default function EmployeePayslipsPage() {
  const [payslips, setPayslips] = useState<PayslipDetail[]>([]);
  const [loading, setLoading] = useState(true);

  const [authOpen, setAuthOpen] = useState(false);
  const [pendingReceiptId, setPendingReceiptId] = useState<string | null>(null);
  const [receiptPayslip, setReceiptPayslip] = useState<PayslipDetail | null>(null);

  const [activeTab, setActiveTab] = useState("payslips");
  const [packageUnlocked, setPackageUnlocked] = useState(false);
  const [loadingPackage, setLoadingPackage] = useState(false);
  const [myPackage, setMyPackage] = useState<CompensationPackage | null>(null);

  useEffect(() => {
    getMyPayslipsFromCnb()
      .then((data) => setPayslips(data))
      .catch((err) => toast.error(err instanceof Error ? err.message : "Failed to load payslips"))
      .finally(() => setLoading(false));
  }, []);

  const handleView = (payslipId: string) => {
    setPendingReceiptId(payslipId);
    setAuthOpen(true);
  };

  const loadCompensation = async () => {
    setLoadingPackage(true);
    try {
      const data = await getMyCompensation();
      setMyPackage(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load compensation package");
    } finally {
      setLoadingPackage(false);
    }
  };

  useEffect(() => {
    if (activeTab === "my-package" && packageUnlocked && !myPackage && !loadingPackage) {
      void loadCompensation();
    }
  }, [activeTab, packageUnlocked, myPackage, loadingPackage]);

  const totalNetPay = useMemo(
    () => payslips.reduce((sum, p) => sum + Number(p.net_pay), 0),
    [payslips],
  );

  if (loading) {
    return (
      <div className="min-h-60 flex items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm">Loading payslips...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-[24px] bg-[linear-gradient(135deg,#0f172a_0%,#075985_54%,#166534_100%)] text-white px-8 py-10 shadow-sm">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/70 mb-2">Employee Self-Service</p>
        <h1 className="text-2xl font-bold tracking-tight mb-1">Payslips & Compensation</h1>
        <p className="text-sm text-white/80 max-w-2xl">
          Access payroll records and your compensation package. Sensitive details are protected with secondary verification.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full max-w-sm grid-cols-2">
          <TabsTrigger value="payslips">Payslips</TabsTrigger>
          <TabsTrigger value="my-package">My Package</TabsTrigger>
        </TabsList>

        <TabsContent value="payslips" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-muted-foreground">Payslips</CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-bold">{payslips.length}</CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-muted-foreground">Total Net Pay</CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-bold">{toCurrency(totalNetPay)}</CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-muted-foreground">Status</CardTitle>
              </CardHeader>
              <CardContent>
                <Badge variant="secondary">{payslips.length > 0 ? "From payroll engine" : "No records yet"}</Badge>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg font-bold tracking-tight">
                <BadgeDollarSign className="h-4 w-4 text-primary" /> Payslips
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {payslips.length === 0 ? (
                <div className="text-sm text-muted-foreground rounded-lg border border-dashed p-6 text-center">
                  No payslips yet. Your HR team will generate payslips after running the payroll cutoff.
                </div>
              ) : (
                payslips.map((p) => (
                  <div
                    key={p.payslip_id}
                    className="border rounded-lg p-4 bg-muted/20 flex flex-col gap-3 md:flex-row md:items-center md:justify-between"
                  >
                    <div>
                      <p className="text-sm font-semibold">{formatPeriod(p)}</p>
                      <p className="text-xs text-muted-foreground">
                        Generated: {new Date(p.created_at).toLocaleDateString()} · {p.status}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">Net: {toCurrency(p.net_pay)}</Badge>
                      <Button size="sm" onClick={() => handleView(p.payslip_id)} className="h-8 px-3">
                        <Eye className="h-3.5 w-3.5" />
                        View Receipt
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="my-package" className="space-y-4">
          {!packageUnlocked ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg font-bold tracking-tight flex items-center gap-2">
                  <Lock className="h-4 w-4" /> My Package
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Verify your identity to view your salary, benefits, and statutory IDs.
                </p>
                <Button onClick={() => setAuthOpen(true)}>Unlock My Package</Button>
              </CardContent>
            </Card>
          ) : loadingPackage ? (
            <div className="min-h-40 flex items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Loading compensation package...</span>
            </div>
          ) : (
            <>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base font-bold tracking-tight">Salary</CardTitle>
                </CardHeader>
                <CardContent>
                  {myPackage?.salary ? (
                    <div className="grid gap-3 md:grid-cols-3">
                      <div className="rounded-md border p-3 bg-muted/10">
                        <p className="text-xs text-muted-foreground">Basic Salary</p>
                        <p className="text-sm font-semibold">{toCurrency(myPackage.salary.basic_salary)}</p>
                      </div>
                      <div className="rounded-md border p-3 bg-muted/10">
                        <p className="text-xs text-muted-foreground">Pay Frequency</p>
                        <p className="text-sm font-semibold capitalize">{myPackage.salary.pay_frequency}</p>
                      </div>
                      <div className="rounded-md border p-3 bg-muted/10">
                        <p className="text-xs text-muted-foreground">Effective Date</p>
                        <p className="text-sm font-semibold">{new Date(myPackage.salary.effective_date).toLocaleDateString()}</p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">Your salary record has not been set up yet. Contact HR.</p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base font-bold tracking-tight">Benefits</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {myPackage?.benefits?.length ? (
                    myPackage.benefits.map((benefit) => (
                      <div key={benefit.mapping_id} className="rounded-md border p-3 flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                        <p className="text-sm font-semibold">{benefit.benefit_name ?? "Unknown Benefit"}</p>
                        <p className="text-sm text-muted-foreground">
                          {benefit.benefit_type ?? "N/A"} · {toCurrency(benefit.amount)}
                        </p>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">No assigned benefits.</p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base font-bold tracking-tight">Statutory IDs</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-3 md:grid-cols-2">
                  {[
                    { label: "TIN", value: myPackage?.statutory?.tin_number },
                    { label: "SSS", value: myPackage?.statutory?.sss_number },
                    { label: "PhilHealth", value: myPackage?.statutory?.philhealth_number },
                    { label: "Pag-IBIG", value: myPackage?.statutory?.pagibig_number },
                  ].map(({ label, value }) => (
                    <div key={label} className="rounded-md border p-3 bg-muted/10">
                      <p className="text-xs text-muted-foreground">{label}</p>
                      <p className="text-sm font-semibold">{maskId(value)}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>
      </Tabs>

      <SecondaryAuthModal
        open={authOpen}
        onOpenChange={setAuthOpen}
        title="Unlock Payslip"
        description="Enter your account password to view payslip details."
        onVerified={() => {
          if (activeTab === "my-package") {
            setPackageUnlocked(true);
          } else if (pendingReceiptId) {
            const found = payslips.find((p) => p.payslip_id === pendingReceiptId) ?? null;
            setReceiptPayslip(found);
            setPendingReceiptId(null);
          }
        }}
      />

      <Dialog open={!!receiptPayslip} onOpenChange={(open) => { if (!open) setReceiptPayslip(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-4 w-4" /> Payslip Receipt
            </DialogTitle>
          </DialogHeader>
          {receiptPayslip && <PayslipReceiptView payslip={receiptPayslip} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
