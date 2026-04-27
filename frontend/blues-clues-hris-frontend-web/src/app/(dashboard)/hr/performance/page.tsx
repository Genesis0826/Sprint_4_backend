"use client";
import { BarChart, Clock } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function HRPerformancePage() {
  return (
    <div className="space-y-6">
      <div className="rounded-[26px] bg-[linear-gradient(135deg,#0f172a_0%,#172554_52%,#1e3a5f_100%)] text-white px-8 py-10 shadow-sm">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/65 mb-2">HR Operations</p>
        <h1 className="text-2xl font-bold tracking-tight mb-1">Performance Management</h1>
        <p className="text-sm text-white/75">Goal setting, appraisals, and performance reviews.</p>
      </div>
      <Card className="max-w-lg">
        <CardHeader className="text-center space-y-3">
          <div className="flex justify-center">
            <div className="rounded-full bg-slate-100 p-5">
              <BarChart className="size-12 text-slate-400" />
            </div>
          </div>
          <CardTitle>Coming Soon</CardTitle>
          <CardDescription>Performance management features are planned for a future sprint.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 flex items-center gap-3 text-slate-500">
            <Clock className="size-5 shrink-0" />
            <p className="text-sm">This module is not yet available.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
