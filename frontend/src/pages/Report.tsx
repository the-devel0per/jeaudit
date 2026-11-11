import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { NoRun, QueryError } from "../components/RunGate";
import { Button, Card, EmptyState, Segmented, SeverityChip, Skeleton } from "../components/ui";
import { useApp } from "../context";
import { api, ApiError } from "../lib/api";
import { fmtMoney2 } from "../lib/utils";

export default function Report() {
  const { runId, snack } = useApp();
  const nav = useNavigate();
  const q = useQuery({ queryKey: ["flags", runId], queryFn: () => api.flags(runId!), enabled: !!runId });
  const confirmed = (q.data ?? []).filter((f) => f.status === "accepted");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [ai, setAi] = useState(true);
  const [fmt, setFmt] = useState<"csv" | "pdf">("pdf");
  const [busy, setBusy] = useState(false);
  useEffect(() => setPicked(new Set(confirmed.map((f) => f.entry_id))), [q.data]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!runId) return <NoRun />;
  if (q.isError) return <QueryError error={q.error} onRetry={() => q.refetch()} />;
  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });

  async function download() {
    setBusy(true);
    try { await api.download(api.reportUrl(runId!, fmt, [...picked], ai), `je-guard-${runId}.${fmt}`); snack("Report downloaded."); }
    catch (e) { snack(`${(e as ApiError).message} ${(e as ApiError).nextStep}`); } finally { setBusy(false); }
  }
  return (
    <div className="space-y-4 py-4">
      <h2 className="text-headline">Findings report</h2>
      {q.isLoading ? <Skeleton className="h-64" /> : confirmed.length === 0 ? (
        <EmptyState title="No confirmed findings yet" body="Accept flags on the Flags screen and they will appear here, ready to export." action={<Button onClick={() => nav("/flags")}>Review flags</Button>} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-12">
          <Card className="lg:col-span-8"><h3 className="text-title">Preview ({picked.size} of {confirmed.length} included)</h3>
            <ul className="mt-3 divide-y divide-outline-variant/50">{confirmed.map((f) => (
              <li key={f.id} className="flex items-start gap-3 py-3"><input id={f.id} type="checkbox" className="mt-1 h-5 w-5 accent-[rgb(var(--primary))]" checked={picked.has(f.entry_id)} onChange={() => toggle(f.entry_id)} />
                <label htmlFor={f.id} className="min-w-0 flex-1 cursor-pointer"><span className="flex flex-wrap items-center gap-2"><b>{f.entry_id}</b><SeverityChip severity={f.severity} /><span className="text-on-surface-variant">{f.entry.posting_date} · {fmtMoney2(f.entry.amount)}</span></span>
                  <span className="block text-on-surface-variant">{f.hits.map((h) => h.label).join(", ")}</span>
                  {ai && f.insight && <span className="mt-1 block">{f.insight.plain_english_explanation}</span>}
                  {f.comments.map((c, i) => <span key={i} className="block text-label text-on-surface-variant">Note: {c.text}</span>)}</label></li>))}</ul></Card>
          <Card className="h-fit space-y-4 lg:col-span-4"><h3 className="text-title">Export options</h3>
            <Segmented label="Format" value={fmt} onChange={setFmt} options={[{ value: "pdf", label: "PDF" }, { value: "csv", label: "CSV" }]} />
            <label className="flex min-h-[44px] items-center gap-3"><input type="checkbox" className="h-5 w-5 accent-[rgb(var(--primary))]" checked={ai} onChange={(e) => setAi(e.target.checked)} />Include Gemini explanations</label>
            <Button disabled={picked.size === 0 || busy} icon={<Download size={16} aria-hidden />} onClick={download}>{busy ? "Preparing…" : "Download report"}</Button>
            <p className="text-label text-on-surface-variant">Synthetic data only. Only accepted flags can be exported.</p></Card>
        </div>)}
    </div>
  );
}
