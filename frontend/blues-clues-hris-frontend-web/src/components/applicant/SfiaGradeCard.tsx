import { Award } from "lucide-react";

// ─── SFIA Level config ─────────────────────────────────────────────────────────
// Skills Framework for the Information Age — 7 responsibility levels.

export const SFIA_LEVELS = [
  { level: 1, name: "Follow",               shortTitle: "Entry",     color: "text-slate-600",  ringColor: "border-slate-300",  bgColor: "bg-slate-50",  barColor: "bg-slate-400",  desc: "Works under close supervision following defined procedures." },
  { level: 2, name: "Assist",               shortTitle: "Junior",    color: "text-slate-700",  ringColor: "border-slate-400",  bgColor: "bg-slate-50",  barColor: "bg-slate-500",  desc: "Applies acquired knowledge with some guidance required." },
  { level: 3, name: "Apply",                shortTitle: "Mid-level", color: "text-blue-600",   ringColor: "border-blue-300",   bgColor: "bg-blue-50",   barColor: "bg-blue-500",   desc: "Performs defined tasks with personal responsibility, exercises judgment." },
  { level: 4, name: "Enable",               shortTitle: "Senior",    color: "text-blue-700",   ringColor: "border-blue-500",   bgColor: "bg-blue-50",   barColor: "bg-blue-600",   desc: "Plans and monitors own work, influences peers and stakeholders." },
  { level: 5, name: "Ensure & Advise",      shortTitle: "Lead",      color: "text-violet-600", ringColor: "border-violet-400", bgColor: "bg-violet-50", barColor: "bg-violet-500", desc: "Provides authoritative advice, accountable for significant outcomes." },
  { level: 6, name: "Initiate & Influence", shortTitle: "Principal", color: "text-violet-700", ringColor: "border-violet-600", bgColor: "bg-violet-50", barColor: "bg-violet-700", desc: "Leads major technical or business initiatives across the organization." },
  { level: 7, name: "Set Strategy",         shortTitle: "Director",  color: "text-amber-600",  ringColor: "border-amber-400",  bgColor: "bg-amber-50",  barColor: "bg-amber-500",  desc: "Sets organizational direction, inspires and mobilises at the highest level." },
] as const;

// ─── SfiaGradeCard ─────────────────────────────────────────────────────────────
// Shows the applicant's assessed SFIA skill level (or a "not yet assessed"
// placeholder that mirrors the HR recruitment pipeline view).
//
// TODO: SFIA hook — when the SFIA engine is live, pass real values:
//   <SfiaGradeCard grade={profile.sfia_grade ?? null}
//                  matchPct={profile.sfia_match_percentage ?? null} />
//
// Both props default to null so the UI degrades gracefully until then.

export function SfiaGradeCard({
  grade,
  matchPct,
}: {
  readonly grade: number | null;
  readonly matchPct: number | null;
}) {
  const levelCfg = grade != null
    ? SFIA_LEVELS.find(l => l.level === grade) ?? null
    : null;

  // ── Not yet assessed ───────────────────────────────────────────────────────
  if (!levelCfg) {
    return (
      <div className="rounded-xl border border-border bg-muted/20 px-4 py-5 flex flex-col items-center gap-3 text-center">
        {/* Dashed placeholder circle — mirrors the HR pipeline sidebar */}
        <div className="h-16 w-16 rounded-full border-[3px] border-dashed border-border flex items-center justify-center bg-background">
          <span className="text-xl font-bold text-muted-foreground/30">—</span>
        </div>
        <div>
          <p className="text-sm font-semibold text-muted-foreground">Not yet assessed</p>
          <p className="text-xs text-muted-foreground/70 mt-0.5 max-w-[22rem]">
            Your skills will be evaluated against job requirements during the review process.
          </p>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-muted/40 border border-border">
          <Award className="h-3 w-3 text-muted-foreground/50" />
          <span className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider">SFIA Pending</span>
        </div>
      </div>
    );
  }

  // ── Assessed — show grade ──────────────────────────────────────────────────
  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      {/* Top colour stripe */}
      <div className={`h-1 w-full ${levelCfg.barColor}`} />

      <div className="px-4 py-4 flex items-start gap-4">
        {/* Level badge circle */}
        <div className={`h-16 w-16 rounded-full border-[3px] ${levelCfg.ringColor} ${levelCfg.bgColor} flex flex-col items-center justify-center shrink-0`}>
          <span className={`text-2xl font-black leading-none tabular-nums ${levelCfg.color}`}>{levelCfg.level}</span>
          <span className={`text-[8px] font-bold uppercase tracking-widest ${levelCfg.color} opacity-70 leading-none mt-0.5`}>Level</span>
        </div>

        {/* Text */}
        <div className="flex-1 min-w-0 pt-0.5">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <span className={`text-base font-bold ${levelCfg.color}`}>{levelCfg.name}</span>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${levelCfg.bgColor} ${levelCfg.ringColor} ${levelCfg.color}`}>
              {levelCfg.shortTitle}
            </span>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">{levelCfg.desc}</p>

          {/* Match percentage bar — shown only when available */}
          {matchPct != null && (
            <div className="mt-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Skill Match</span>
                <span className={`text-xs font-bold tabular-nums ${levelCfg.color}`}>{matchPct}%</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full rounded-full ${levelCfg.barColor} transition-all duration-700`}
                  style={{ width: `${Math.min(100, Math.max(0, matchPct))}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Level 1–7 pip track */}
      <div className="px-4 pb-3">
        <div className="flex items-center gap-1">
          {SFIA_LEVELS.map(l => (
            <div
              key={l.level}
              title={`Level ${l.level}: ${l.name}`}
              className={[
                "flex-1 h-1.5 rounded-full transition-all",
                l.level <= levelCfg.level ? levelCfg.barColor : "bg-muted",
                l.level === levelCfg.level ? "opacity-100" : l.level < levelCfg.level ? "opacity-60" : "opacity-25",
              ].join(" ")}
            />
          ))}
        </div>
        <div className="flex justify-between mt-1">
          <span className="text-[9px] text-muted-foreground/50 font-medium">L1 Entry</span>
          <span className="text-[9px] text-muted-foreground/50 font-medium">L7 Strategic</span>
        </div>
      </div>
    </div>
  );
}
