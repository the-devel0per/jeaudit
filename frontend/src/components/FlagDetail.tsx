import { Check, X, Undo2 } from "lucide-react";
import { useState } from "react";
import type { Flag } from "../lib/types";
import { fmtMoney2 } from "../lib/utils";
import { Button, Chip, ScoreRing, SeverityChip, Sheet } from "./ui";

interface Props {
  flag: Flag | null; onClose: () => void; onStatus: (f: Flag, s: "accepted" | "dismissed" | "open") => void; onComment: (f: Flag, text: string) => void;
}

export function FlagDetail({ flag, onClose, onStatus, onComment }: Props) {
  const [text, setText] = useState("");
  const [more, setMore] = useState(false);
  return (
    <Sheet open={!!flag} onClose={onClose} title={flag ? `Entry ${flag.entry_id}` : ""}>
      {flag && (
        <div className="space-y-6">
          <div className="flex items-center gap-4"><ScoreRing score={flag.score} severity={flag.severity} size={64} /><div><SeverityChip severity={flag.severity} /><p className="mt-1 text-on-surface-variant">Status: <b className="text-on-surface">{flag.status}</b></p></div></div>

          <div className="flex flex-wrap gap-2">
            {flag.status === "open" ? (<>
              <Button icon={<Check size={16} />} onClick={() => onStatus(flag, "accepted")}>Accept finding (A)</Button>
              <Button variant="outlined" icon={<X size={16} />} onClick={() => onStatus(flag, "dismissed")}>Dismiss (D)</Button></>
            ) : <Button variant="tonal" icon={<Undo2 size={16} />} onClick={() => onStatus(flag, "open")}>Reopen</Button>}
          </div>

          <section><h3 className="text-title">Entry</h3>
            <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2">
              {[["Posting date", `${flag.entry.posting_date} ${flag.entry.posting_time}`], ["Amount", fmtMoney2(flag.entry.amount)], ["Debit account", flag.entry.debit_account], ["Credit account", flag.entry.credit_account], ["Posted by", flag.entry.posted_by], ["Approved by", flag.entry.approved_by || "None"]].map(([k, v]) => (
                <div key={k}><dt className="text-label text-on-surface-variant">{k}</dt><dd>{v}</dd></div>))}
              <div className="col-span-2"><dt className="text-label text-on-surface-variant">Description</dt><dd>{flag.entry.description}</dd></div>
            </dl></section>

          <section><h3 className="text-title">Score breakdown</h3>
            <ul className="mt-2 space-y-2">
              {flag.hits.map((h) => (
                <li key={h.test} className="rounded-xl bg-surface-container p-3"><div className="flex justify-between gap-2"><b>{h.label}</b><span className="font-semibold">+{h.weight}</span></div><p className="text-on-surface-variant">{h.reason}</p></li>))}
              <li className="flex justify-between px-3 font-semibold"><span>Total (capped at 100)</span><span>{flag.score}</span></li>
            </ul></section>

          {flag.insight && (
            <section><div className="flex items-center gap-2"><h3 className="text-title">Gemini explanation</h3><Chip>Confidence: {flag.insight.confidence}</Chip></div>
              <p className="mt-2">{flag.insight.plain_english_explanation}</p>
              <button className="mt-2 min-h-[44px] text-label font-medium text-primary" onClick={() => setMore(!more)} aria-expanded={more}>{more ? "Hide" : "Show"} risk scenario and audit procedure</button>
              {more && <div className="space-y-3 rounded-xl bg-surface-container p-3"><div><p className="text-label text-on-surface-variant">Likely risk scenario</p><p>{flag.insight.likely_risk_scenario}</p></div><div><p className="text-label text-on-surface-variant">Suggested audit procedure</p><p>{flag.insight.suggested_audit_procedure}</p></div></div>}
            </section>
          )}

          <section><h3 className="text-title">Comments</h3>
            {flag.comments.map((c, i) => <p key={i} className="mt-2 rounded-xl bg-surface-container p-3"><b>{c.who}</b> <span className="text-label text-on-surface-variant">{new Date(c.when).toLocaleString()}</span><br />{c.text}</p>)}
            <label htmlFor="cmt" className="sr-only">Add a comment</label>
            <textarea id="cmt" value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} rows={2} placeholder="Add a note for the audit file…" className="mt-2 w-full rounded-xl border border-outline bg-transparent p-3" />
            <Button className="mt-2" variant="tonal" disabled={!text.trim()} onClick={() => { onComment(flag, text.trim()); setText(""); }}>Add comment</Button>
          </section>

          <section><h3 className="text-title">History</h3>
            {flag.history.length === 0 ? <p className="mt-1 text-on-surface-variant">No review activity yet.</p> : (
              <ol className="mt-2 space-y-1">{[...flag.history].reverse().map((h, i) => <li key={i} className="text-on-surface-variant"><b className="text-on-surface">{h.what}</b> by {h.who} · {new Date(h.when).toLocaleString()}</li>)}</ol>)}
          </section>
        </div>
      )}
    </Sheet>
  );
}
