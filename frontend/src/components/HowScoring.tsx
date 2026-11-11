import { useApp } from "../context";
import { Sheet } from "./ui";

const EXPLAIN: Record<string, string> = {
  self_approved: "The same person posted and approved the entry.", duplicate: "Same amount, account and date as another entry.",
  threshold: "Amount sits just under the approval threshold.", unusual_pairing: "The debit/credit account pair is rare in this ledger.",
  round_number: "Amount is an exact multiple of 1,000.", weekend: "Posted on a Saturday or Sunday.", after_hours: "Posted outside working hours.",
  benford: "Leading digit is over-represented versus Benford's Law (small weight).", ml: "Isolation Forest outlier; weight scales with how unusual the entry is.",
};

export function HowScoring({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { settings } = useApp();
  return (
    <Sheet open={open} onClose={onClose} title="How scoring works">
      <p className="text-on-surface-variant">Each journal entry starts at 0. Every test that fires adds its weight. The total is capped at 100 and shown as the risk score. Nothing is hidden: the breakdown for each entry lists exactly which tests fired.</p>
      <ul className="mt-4 space-y-3">
        {Object.entries(settings.weights).map(([k, w]) => (
          <li key={k} className="flex items-start justify-between gap-4 rounded-xl bg-surface-container p-3">
            <span>{EXPLAIN[k] ?? k}</span><span className="font-semibold">+{w}</span>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-on-surface-variant">Severity: Critical 80+, High 60-79, Medium 40-59, Low below 40. Entries scoring under 15 are not shown. Change weights under Settings.</p>
      <p className="mt-3 text-on-surface-variant">Gemini explains the 20 highest-scoring entries in plain English. It never changes a score.</p>
    </Sheet>
  );
}
