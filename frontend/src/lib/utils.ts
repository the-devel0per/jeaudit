import { useEffect, useState } from "react";
import type { AppSettings } from "./types";

export const REQUIRED_COLUMNS = ["entry_id", "posting_date", "posting_time", "account", "debit", "credit", "description", "posted_by", "approved_by", "amount"];

export const DEFAULT_SETTINGS: AppSettings = {
  approval_threshold: 10000, threshold_band: 0.05, work_start: 8, work_end: 18, rare_pair_share: 0.005,
  weights: { self_approved: 30, duplicate: 25, threshold: 25, unusual_pairing: 20, round_number: 15, weekend: 15, after_hours: 15, benford: 5, ml: 20 },
};

export const fmtMoney = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 0 });
export const fmtMoney2 = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const cx = (...c: (string | false | undefined | null)[]) => c.filter(Boolean).join(" ");

/** Check the header row of a CSV before upload (error prevention). */
export function validateCsvHeader(headerLine: string): { ok: boolean; missing: string[]; found: string[] } {
  const found = headerLine.replace(/^\uFEFF/, "").split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
  const missing = REQUIRED_COLUMNS.filter((c) => !found.includes(c));
  return { ok: missing.length === 0, missing, found };
}

export const prefersReducedMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** Animated count-up for KPI numbers (instant when reduced motion is requested). */
export function useCountUp(target: number, ms = 600): number {
  const [v, setV] = useState(prefersReducedMotion() ? target : 0);
  useEffect(() => {
    if (prefersReducedMotion()) { setV(target); return; }
    let raf = 0; const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / ms);
      setV(target * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}

export function useLocalStorage<T>(key: string, initial: T): [T, (v: T) => void] {
  const [val, setVal] = useState<T>(() => {
    try { const s = localStorage.getItem(key); return s ? (JSON.parse(s) as T) : initial; } catch { return initial; }
  });
  const set = (v: T) => { setVal(v); try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* storage unavailable */ } };
  return [val, set];
}

export type ThemeChoice = "system" | "light" | "dark";
export function applyTheme(t: ThemeChoice) {
  const dark = t === "dark" || (t === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
  try { localStorage.setItem("jeg-theme", t); } catch { /* ignore */ }
}
export const getTheme = (): ThemeChoice => (localStorage.getItem("jeg-theme") as ThemeChoice) || "system";
