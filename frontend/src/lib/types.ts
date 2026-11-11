export type Severity = "critical" | "high" | "medium" | "low";
export type FlagStatus = "open" | "accepted" | "dismissed";
export interface Hit { test: string; label: string; weight: number; reason: string }
export interface Insight {
  plain_english_explanation: string; likely_risk_scenario: string; suggested_audit_procedure: string;
  confidence: "low" | "medium" | "high";
}
export interface Flag {
  id: string; run_id: string; entry_id: string; score: number; severity: Severity; hits: Hit[];
  ml_score: number; ml_flagged: boolean; insight: Insight | null; status: FlagStatus;
  entry: { posting_date: string; posting_time: string; amount: number; debit_account: string; credit_account: string; description: string; posted_by: string; approved_by: string };
  comments: { who: string; text: string; when: string }[];
  history: { who: string; what: string; when: string }[];
}
export interface Summary {
  entries_tested: number; rows: number; flagged: number; high_risk: number; value_at_risk: number;
  distribution: { bucket: string; count: number }[];
  tests: { test: string; label: string; count: number }[];
  benford: { digits: { digit: number; expected: number; actual: number }[]; chi2: number; p_value: number; n: number };
  overlap: { both: number; rule_only: number; ml_only: number; jaccard: number };
  executive_summary: string; ai_used: boolean;
  usage: { input_tokens: number; output_tokens: number; cost_usd: number; model: string };
}
export interface Run { id: string; filename: string; status: "created" | "uploaded" | "analyzing" | "done" | "failed"; created_at: string; error: string | null; summary: Summary | null }
export interface EvalRow { test: string; label: string; precision: number; recall: number; f1: number; tp: number; fp: number; fn: number; injected: number; flagged: number }
export interface Evaluation { rows: number; entries: number; injected_entries: number; tests: EvalRow[]; overlap: Summary["overlap"]; note: string }
export interface AppSettings {
  approval_threshold: number; threshold_band: number; work_start: number; work_end: number; rare_pair_share: number;
  weights: Record<string, number>;
}
