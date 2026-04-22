"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { X, GripHorizontal, ChevronLeft, ChevronRight } from "lucide-react";
import { AttendanceCalendarGrid, type CalendarDayData, type CalendarViewMode } from "./AttendanceCalendarGrid";

// ─── Constants ────────────────────────────────────────────────────────────────

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FloatingDatePickerProps {
  open: boolean;
  onClose: () => void;
  /** The month/year the calendar is currently showing (controlled by parent) */
  referenceDate: Date;
  /** Attendance data for the current reference month (fetched by parent) */
  days: CalendarDayData[];
  calendarMode: CalendarViewMode;
  onCalendarModeChange?: (m: CalendarViewMode) => void;
  onDayClick?: (date: string, data: CalendarDayData | null) => void;
  /**
   * Called when the user navigates to a different month within the picker.
   * Parent should update referenceDate and re-fetch days accordingly.
   */
  onNavigate?: (newRef: Date) => void;
  showModeToggle?: boolean;
  loading?: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function FloatingDatePicker({
  open,
  onClose,
  referenceDate,
  days,
  calendarMode,
  onCalendarModeChange,
  onDayClick,
  onNavigate,
  showModeToggle = true,
  loading = false,
}: FloatingDatePickerProps) {

  // ── Position for drag ────────────────────────────────────────────────────
  const [pos, setPos] = useState({ x: 60, y: 80 });
  const dragging    = useRef(false);
  const dragOffset  = useRef({ x: 0, y: 0 });

  // ── Picker mode (shows month/year grid instead of calendar) ─────────────
  const [pickerMode, setPickerMode] = useState(false);
  const [pickerYear, setPickerYear] = useState(referenceDate.getFullYear());

  // ── Internal nav date — what month/year the calendar panel shows ─────────
  const [navDate, setNavDate]   = useState<Date>(referenceDate);
  const prevRefKey              = useRef(`${referenceDate.getFullYear()}-${referenceDate.getMonth()}`);

  // Sync internal navDate only when parent referenceDate actually changes months
  useEffect(() => {
    const key = `${referenceDate.getFullYear()}-${referenceDate.getMonth()}`;
    if (key !== prevRefKey.current) {
      prevRefKey.current = key;
      setNavDate(new Date(referenceDate));
      setPickerYear(referenceDate.getFullYear());
    }
  }, [referenceDate]);

  // Reset picker mode whenever the panel closes
  useEffect(() => {
    if (!open) setPickerMode(false);
  }, [open]);

  // Escape key closes the panel
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // ── Drag handlers ────────────────────────────────────────────────────────
  const onHeaderMouseDown = useCallback((e: React.MouseEvent) => {
    dragging.current    = true;
    dragOffset.current  = { x: e.clientX - pos.x, y: e.clientY - pos.y };
    e.preventDefault();
  }, [pos.x, pos.y]);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      const nx = Math.max(0, Math.min(e.clientX - dragOffset.current.x, window.innerWidth  - 390));
      const ny = Math.max(0, Math.min(e.clientY - dragOffset.current.y, window.innerHeight - 80));
      setPos({ x: nx, y: ny });
    };
    const onMouseUp = () => { dragging.current = false; };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup",   onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup",   onMouseUp);
    };
  }, []);

  // ── Month navigation ─────────────────────────────────────────────────────
  function navigate(delta: number) {
    setNavDate(prev => {
      const next = new Date(prev.getFullYear(), prev.getMonth() + delta, 1);
      onNavigate?.(next);
      return next;
    });
  }

  function pickMonthYear(month: number) {
    const d = new Date(pickerYear, month, 1);
    setNavDate(d);
    setPickerMode(false);
    onNavigate?.(d);
  }

  // ─────────────────────────────────────────────────────────────────────────

  if (!open || typeof document === "undefined") return null;

  const headerLabel = navDate.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const panel = (
    <div
      style={{ position: "fixed", left: pos.x, top: pos.y, zIndex: 9999, width: 384 }}
      className="bg-white border border-slate-200 rounded-2xl shadow-2xl shadow-slate-300/60 overflow-hidden"
    >
      {/* ── Drag handle / header ──────────────────────────────────────────── */}
      <div
        onMouseDown={onHeaderMouseDown}
        className="flex items-center justify-between px-4 py-3 bg-slate-50 border-b border-slate-100 cursor-grab active:cursor-grabbing select-none"
      >
        {/* Left: grip + month/year label (click to toggle picker mode) */}
        <div className="flex items-center gap-2">
          <GripHorizontal className="h-4 w-4 text-slate-400 shrink-0" />
          <button
            onMouseDown={e => e.stopPropagation()}
            onClick={() => {
              setPickerYear(navDate.getFullYear());
              setPickerMode(v => !v);
            }}
            className="font-semibold text-sm text-slate-800 hover:text-blue-600 transition-colors duration-150 cursor-pointer flex items-center gap-1"
            title="Click to pick month & year"
          >
            {headerLabel}
            <span className="text-slate-400 text-[10px] mt-px leading-none">
              {pickerMode ? "▴" : "▾"}
            </span>
          </button>
        </div>

        {/* Right: prev/next + close */}
        <div className="flex items-center gap-0.5">
          {!pickerMode && (
            <>
              <button
                onMouseDown={e => e.stopPropagation()}
                onClick={() => navigate(-1)}
                className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-slate-200 transition-colors cursor-pointer text-slate-500"
                aria-label="Previous month"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <button
                onMouseDown={e => e.stopPropagation()}
                onClick={() => navigate(1)}
                className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-slate-200 transition-colors cursor-pointer text-slate-500"
                aria-label="Next month"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </>
          )}
          <button
            onMouseDown={e => e.stopPropagation()}
            onClick={onClose}
            className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-red-50 hover:text-red-500 transition-colors cursor-pointer text-slate-400 ml-1"
            aria-label="Close calendar"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* ── Body ────────────────────────────────────────────────────────────── */}
      <div className="p-4">
        {pickerMode ? (
          /* Month / Year quick-picker */
          <div>
            {/* Year row */}
            <div className="flex items-center justify-between mb-4 px-1">
              <button
                onClick={() => setPickerYear(y => y - 1)}
                className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-slate-100 transition-colors cursor-pointer text-slate-500"
                aria-label="Previous year"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="font-bold text-slate-800 text-base tracking-tight select-none">
                {pickerYear}
              </span>
              <button
                onClick={() => setPickerYear(y => y + 1)}
                className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-slate-100 transition-colors cursor-pointer text-slate-500"
                aria-label="Next year"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            {/* 3×4 month grid */}
            <div className="grid grid-cols-3 gap-2">
              {MONTHS_SHORT.map((m, i) => {
                const isSelected =
                  pickerYear === navDate.getFullYear() && i === navDate.getMonth();
                return (
                  <button
                    key={m}
                    onClick={() => pickMonthYear(i)}
                    className={[
                      "rounded-xl px-3 py-2.5 text-sm font-semibold transition-all duration-150 cursor-pointer",
                      isSelected
                        ? "bg-blue-600 text-white shadow-sm scale-[1.04]"
                        : "text-slate-700 hover:bg-blue-50 hover:text-blue-700 hover:scale-[1.04]",
                    ].join(" ")}
                  >
                    {m}
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          /* Attendance calendar grid */
          <AttendanceCalendarGrid
            mode={calendarMode}
            referenceDate={navDate}
            days={days}
            loading={loading}
            showModeToggle={showModeToggle}
            onModeChange={onCalendarModeChange}
            onDayClick={onDayClick}
          />
        )}
      </div>
    </div>
  );

  return createPortal(panel, document.body);
}
