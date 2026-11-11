import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { QueryError, useRun } from "../components/RunGate";
import { Card, Chip, Skeleton } from "../components/ui";
import { api } from "../lib/api";
import { prefersReducedMotion } from "../lib/utils";

const tick = { fill: "rgb(var(--on-surface-variant))", fontSize: 12 };

export default function Insights() {
  const ev = useQuery({ queryKey: ["evaluation"], queryFn: api.evaluation });
  const run = useRun();
  if (ev.isError) return <QueryError error={ev.error} onRetry={() => ev.refetch()} />;
  const e = ev.data;
  const o = run.data?.summary?.overlap ?? e?.overlap;
  const pct = (n: number) => `${Math.round(n * 100)}%`;
  return (
    <div className="space-y-6 py-4">
      <div><h2 className="text-headline">Insights and evaluation</h2><p className="text-on-surface-variant">How well each test finds anomalies we deliberately injected into synthetic data.</p></div>
      <Card className="bg-primary-container/60"><h3 className="text-title">How to read this</h3>
        <p className="mt-1 max-w-3xl">We generated a ledger and planted known problems. <b>Precision</b> answers "of the entries a test flagged, how many were real planted problems?" <b>Recall</b> answers "of the planted problems, how many did the test catch?" High recall with lower precision means the test is thorough but creates review work.</p></Card>
      {!e ? <Skeleton className="h-72" /> : (<>
        <Card><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-title">Precision and recall per test</h3><Chip>{e.entries.toLocaleString()} entries · {e.injected_entries.toLocaleString()} planted anomalies</Chip></div>
          <div className="mt-3 h-72" role="img" aria-label="Grouped bar chart of precision and recall for each test">
            <ResponsiveContainer><BarChart data={e.tests.map((t) => ({ name: t.label, Precision: Math.round(t.precision * 100), Recall: Math.round(t.recall * 100) }))} margin={{ bottom: 40 }}>
              <CartesianGrid vertical={false} stroke="rgb(var(--outline-variant))" /><XAxis dataKey="name" tick={tick} interval={0} angle={-30} textAnchor="end" height={70} /><YAxis tick={tick} unit="%" domain={[0, 100]} width={44} />
              <Tooltip contentStyle={{ background: "rgb(var(--surface-high))", border: "none", borderRadius: 12 }} /><Legend verticalAlign="top" />
              <Bar dataKey="Precision" fill="rgb(var(--primary))" radius={[4, 4, 0, 0]} isAnimationActive={!prefersReducedMotion()} animationDuration={300} />
              <Bar dataKey="Recall" fill="rgb(var(--outline))" radius={[4, 4, 0, 0]} isAnimationActive={!prefersReducedMotion()} animationDuration={300} />
            </BarChart></ResponsiveContainer></div>
          <div className="mt-3 overflow-x-auto"><table className="w-full text-left"><thead className="text-label text-on-surface-variant"><tr><th className="py-2">Test</th><th>Precision</th><th>Recall</th><th>F1</th><th className="hidden sm:table-cell">Caught / planted</th></tr></thead>
            <tbody>{e.tests.map((t) => <tr key={t.test} className="border-t border-outline-variant/50"><td className="py-2">{t.label}</td><td>{pct(t.precision)}</td><td>{pct(t.recall)}</td><td>{t.f1.toFixed(2)}</td><td className="hidden sm:table-cell">{t.tp} / {t.injected}</td></tr>)}</tbody></table></div>
          <p className="mt-3 text-label text-on-surface-variant">{e.note}</p></Card>
        {o && <Card><h3 className="text-title">Rule-based flags versus Isolation Forest</h3>
          <div className="mt-3 grid grid-cols-3 gap-3 text-center">{[["Both", o.both], ["Rules only", o.rule_only], ["ML only", o.ml_only]].map(([l, v]) => <div key={l as string} className="rounded-xl bg-surface-variant/50 p-4"><p className="text-headline">{(v as number).toLocaleString()}</p><p className="text-label text-on-surface-variant">{l}</p></div>)}</div>
          <p className="mt-3 max-w-3xl">Overlap (Jaccard) is <b>{pct(o.jaccard)}</b>. Entries flagged only by the ML model are unusual in ways the rules do not cover, so they are worth a look. Entries flagged only by rules are explainable but not statistically rare.</p></Card>}
      </>)}
    </div>
  );
}
