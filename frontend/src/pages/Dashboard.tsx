import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { NoRun, QueryError, useRun } from "../components/RunGate";
import { Card, Chip, Skeleton, Stat } from "../components/ui";
import { useApp } from "../context";
import { fmtMoney, prefersReducedMotion } from "../lib/utils";

const tick = { fill: "rgb(var(--on-surface-variant))", fontSize: 12 };
const tip = { background: "rgb(var(--surface-high))", border: "none", borderRadius: 12, color: "rgb(var(--on-surface))" };
const list = { hidden: {}, show: { transition: { staggerChildren: 0.05 } } };
const item = { hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0, transition: { duration: 0.2 } } };

export default function Dashboard() {
  const { runId } = useApp();
  const run = useRun();
  if (!runId) return <NoRun />;
  if (run.isError) return <QueryError error={run.error} onRetry={() => run.refetch()} />;
  const s = run.data?.summary;
  const anim = !prefersReducedMotion();
  return (
    <div className="space-y-6 py-4">
      <h2 className="text-headline">Dashboard</h2>
      {!s ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28" />)}</div>
      ) : (
        <motion.div variants={list} initial="hidden" animate="show" className="space-y-6">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <motion.div variants={item}><Stat label="Entries tested" value={s.entries_tested} hint={`${s.rows.toLocaleString()} ledger lines`} /></motion.div>
            <motion.div variants={item}><Stat label="Entries flagged" value={s.flagged} /></motion.div>
            <motion.div variants={item}><Stat label="High-risk entries" value={s.high_risk} hint="Score 60 or more" /></motion.div>
            <motion.div variants={item}><Stat label="Total value at risk" value={s.value_at_risk} prefix="₹" hint="Sum of flagged amounts" /></motion.div>
          </div>

          <motion.div variants={item}>
            <Card className="bg-primary-container/60">
              <div className="flex items-center gap-2"><Sparkles size={18} className="text-primary" aria-hidden /><h3 className="text-title">Executive summary</h3>
                <Chip>{s.ai_used ? `Gemini · ${s.usage.model}` : "Template (no Gemini key)"}</Chip></div>
              <p className="mt-3 max-w-4xl leading-6">{s.executive_summary}</p>
              <p className="mt-3 text-label text-on-surface-variant">Gemini usage for this run: {s.usage.input_tokens.toLocaleString()} input + {s.usage.output_tokens.toLocaleString()} output tokens, about ${s.usage.cost_usd.toFixed(4)} (estimate).</p>
            </Card>
          </motion.div>

          <div className="grid gap-4 lg:grid-cols-2">
            <motion.div variants={item}>
              <Card><h3 className="text-title">Risk score distribution</h3><p className="mb-3 text-label text-on-surface-variant">Flagged entries by score band</p>
                <div className="h-60" role="img" aria-label="Bar chart of flagged entries by risk score band">
                  <ResponsiveContainer><BarChart data={s.distribution}><CartesianGrid vertical={false} stroke="rgb(var(--outline-variant))" /><XAxis dataKey="bucket" tick={tick} interval="preserveStartEnd" /><YAxis tick={tick} width={40} allowDecimals={false} /><Tooltip contentStyle={tip} cursor={{ fill: "rgb(var(--surface-variant) / .4)" }} /><Bar dataKey="count" name="Entries" fill="rgb(var(--primary))" radius={[6, 6, 0, 0]} isAnimationActive={anim} animationDuration={300} /></BarChart></ResponsiveContainer>
                </div></Card>
            </motion.div>
            <motion.div variants={item}>
              <Card><h3 className="text-title">Tests triggered</h3><p className="mb-3 text-label text-on-surface-variant">Flagged entries where each test fired</p>
                <div className="h-60" role="img" aria-label="Bar chart of entries per test">
                  <ResponsiveContainer><BarChart data={s.tests} layout="vertical" margin={{ left: 8 }}><CartesianGrid horizontal={false} stroke="rgb(var(--outline-variant))" /><XAxis type="number" tick={tick} allowDecimals={false} /><YAxis type="category" dataKey="label" tick={tick} width={window.innerWidth < 640 ? 90 : 150} /><Tooltip contentStyle={tip} cursor={{ fill: "rgb(var(--surface-variant) / .4)" }} /><Bar dataKey="count" name="Entries" fill="rgb(var(--primary))" radius={[0, 6, 6, 0]} isAnimationActive={anim} animationDuration={300} /></BarChart></ResponsiveContainer>
                </div></Card>
            </motion.div>
          </div>

          <motion.div variants={item}>
            <Card>
              <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="text-title">Benford's Law: first digit of amounts</h3>
                <p className="text-label text-on-surface-variant">Expected versus actual share of entries by leading digit</p></div>
                <Chip>χ² = {s.benford.chi2.toFixed(1)} · p = {s.benford.p_value < 0.001 ? "<0.001" : s.benford.p_value.toFixed(3)} · n = {fmtMoney(s.benford.n)}</Chip></div>
              <div className="mt-3 h-64" role="img" aria-label="Line chart comparing expected and actual first-digit frequency">
                <ResponsiveContainer><LineChart data={s.benford.digits.map((d) => ({ digit: d.digit, Expected: +(d.expected * 100).toFixed(1), Actual: +(d.actual * 100).toFixed(1) }))}>
                  <CartesianGrid vertical={false} stroke="rgb(var(--outline-variant))" /><XAxis dataKey="digit" tick={tick} /><YAxis tick={tick} unit="%" width={44} /><Tooltip contentStyle={tip} /><Legend />
                  <Line dataKey="Expected" stroke="rgb(var(--outline))" strokeDasharray="5 4" dot={false} strokeWidth={2} isAnimationActive={anim} animationDuration={300} />
                  <Line dataKey="Actual" stroke="rgb(var(--primary))" strokeWidth={3} dot={{ r: 4 }} isAnimationActive={anim} animationDuration={300} />
                </LineChart></ResponsiveContainer>
              </div>
              <p className="mt-2 text-label text-on-surface-variant">{s.benford.p_value < 0.05 ? "The distribution differs from Benford's Law. Large gaps can hint at made-up or rounded amounts, but they are a prompt to look closer, not proof." : "The distribution is consistent with Benford's Law."}</p>
            </Card>
          </motion.div>
        </motion.div>
      )}
    </div>
  );
}
