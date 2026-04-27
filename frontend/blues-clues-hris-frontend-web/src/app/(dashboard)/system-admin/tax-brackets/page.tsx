"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { getTaxBrackets, createTaxBracket, deleteTaxBracket, type TaxBracket } from "@/lib/payrollApi";

const toCurrency = (value: number) =>
  new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 2,
  }).format(value);

export default function SystemAdminTaxBracketsPage() {
  const currentYear = useMemo(() => new Date().getFullYear(), []);
  const [year, setYear] = useState<number>(currentYear);
  const [rows, setRows] = useState<TaxBracket[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [effectiveYear, setEffectiveYear] = useState<number>(currentYear);
  const [minSalary, setMinSalary] = useState("");
  const [maxSalary, setMaxSalary] = useState("");
  const [baseTaxAmount, setBaseTaxAmount] = useState("");
  const [excessPercentage, setExcessPercentage] = useState("");

  const loadBrackets = async (targetYear: number) => {
    setLoading(true);
    try {
      const data = await getTaxBrackets(targetYear);
      setRows(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load tax brackets");
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadBrackets(year);
  }, [year]);

  const handleCreate = async () => {
    const min = Number(minSalary);
    const max = Number(maxSalary);
    const baseTax = Number(baseTaxAmount);
    const excess = Number(excessPercentage);

    if (!Number.isFinite(min) || !Number.isFinite(max) || !Number.isFinite(baseTax) || !Number.isFinite(excess)) {
      toast.error("All numeric fields are required.");
      return;
    }
    if (max < min) {
      toast.error("Max salary must be greater than or equal to min salary.");
      return;
    }

    setCreating(true);
    try {
      await createTaxBracket({
        effective_year: effectiveYear,
        min_salary: min,
        max_salary: max,
        base_tax_amount: baseTax,
        excess_percentage: excess,
      });
      toast.success("Tax bracket added.");
      setDialogOpen(false);
      setEffectiveYear(currentYear);
      setMinSalary("");
      setMaxSalary("");
      setBaseTaxAmount("");
      setExcessPercentage("");
      if (year === effectiveYear) {
        await loadBrackets(year);
      } else {
        setYear(effectiveYear);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add tax bracket");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (bracketId: string) => {
    setDeletingId(bracketId);
    try {
      await deleteTaxBracket(bracketId);
      toast.success("Tax bracket deleted.");
      await loadBrackets(year);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete tax bracket");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-[26px] bg-[linear-gradient(135deg,#0f172a_0%,#172554_52%,#134e4a_100%)] text-white px-8 py-10 shadow-sm">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/65 mb-2">System Admin</p>
        <h1 className="text-2xl font-bold tracking-tight mb-1">Tax Brackets</h1>
        <p className="text-sm text-white/75">Configure annual income tax brackets used in payroll computations.</p>
      </div>

      <Card className="border-amber-200 bg-amber-50/70">
        <CardContent className="py-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-700 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-900">Tax brackets must be configured before payroll can be computed.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base font-bold tracking-tight">Bracket Configuration</CardTitle>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="w-28"
            />
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4" />
                  Add Bracket
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Tax Bracket</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Effective Year</p>
                    <Input type="number" value={effectiveYear} onChange={(e) => setEffectiveYear(Number(e.target.value))} />
                  </div>
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Min Salary</p>
                    <Input type="number" value={minSalary} onChange={(e) => setMinSalary(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Max Salary</p>
                    <Input type="number" value={maxSalary} onChange={(e) => setMaxSalary(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Base Tax Amount</p>
                    <Input type="number" value={baseTaxAmount} onChange={(e) => setBaseTaxAmount(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Excess Percentage</p>
                    <Input type="number" value={excessPercentage} onChange={(e) => setExcessPercentage(e.target.value)} />
                  </div>
                  <Button className="w-full" onClick={() => void handleCreate()} disabled={creating}>
                    {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Save Bracket
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading tax brackets...
            </div>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No brackets configured for {year}.</p>
          ) : (
            <div className="space-y-2">
              <div className="hidden md:grid md:grid-cols-[1.2fr_1.2fr_1.2fr_1fr_120px] text-xs font-semibold text-muted-foreground px-3">
                <p>Min Salary</p>
                <p>Max Salary</p>
                <p>Base Tax</p>
                <p>Excess %</p>
                <p className="text-right">Actions</p>
              </div>
              {rows.map((row) => {
                const deleting = deletingId === row.bracket_id;
                return (
                  <div key={row.bracket_id} className="rounded-lg border p-3 grid gap-2 md:grid-cols-[1.2fr_1.2fr_1.2fr_1fr_120px] md:items-center">
                    <p className="text-sm">{toCurrency(Number(row.min_salary))}</p>
                    <p className="text-sm">{toCurrency(Number(row.max_salary))}</p>
                    <p className="text-sm">{toCurrency(Number(row.base_tax_amount))}</p>
                    <p className="text-sm">{Number(row.excess_percentage)}%</p>
                    <div className="flex justify-end">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="text-rose-600 hover:text-rose-700"
                        disabled={deleting}
                        onClick={() => void handleDelete(row.bracket_id)}
                      >
                        {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
