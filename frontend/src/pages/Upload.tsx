import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { CheckCircle2, FileSpreadsheet, Lightbulb, UploadCloud, X, XCircle } from "lucide-react";
import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Card, Chip, Dialog, ErrorState, LinearProgress, Steps } from "../components/ui";
import { useApp } from "../context";
import { api, ApiError } from "../lib/api";
import { REQUIRED_COLUMNS, cx, useLocalStorage, validateCsvHeader } from "../lib/utils";

const STEPS = ["Upload", "Analyzing", "Done"];

export default function UploadPage() {
  const { setRunId, settings, snack } = useApp();
  const nav = useNavigate();
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [check, setCheck] = useState<ReturnType<typeof validateCsvHeader> | null>(null);
  const [drag, setDrag] = useState(false);
  const [step, setStep] = useState(0);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [tipsSeen, setTipsSeen] = useLocalStorage("jeg-tips", false);
  const recent = useQuery({ queryKey: ["runs"], queryFn: api.runs });

  const analyze = useMutation({
    mutationFn: async (sample: boolean) => {
      setStep(0);
      const { run, upload_url } = await api.createRun(file?.name ?? "sample_gl.csv", sample);
      if (!sample && upload_url && file) await api.upload(upload_url, file);
      setStep(1);
      await api.analyze(run.id, settings);
      return run.id;
    },
    onSuccess: (id) => { setStep(2); setRunId(id); qc.invalidateQueries({ queryKey: ["runs"] }); snack("Analysis complete."); setTimeout(() => nav("/dashboard"), 400); },
    onError: () => setStep(0),
  });

  async function pick(f: File | undefined) {
    if (!f) return;
    if (!f.name.toLowerCase().endsWith(".csv")) { setFile(null); setCheck({ ok: false, missing: [], found: [] }); snack("Please choose a .csv file."); return; }
    setFile(f);
    setCheck(validateCsvHeader((await f.slice(0, 4096).text()).split(/\r?\n/)[0]));
  }

  const busy = analyze.isPending;
  const err = analyze.error as ApiError | null;
  return (
    <div className="space-y-6 py-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-display">Test a general ledger</h2>
          <p className="mt-1 max-w-xl text-on-surface-variant">Upload a general ledger CSV. JE Guard runs standard journal entry tests, scores each posting, and explains the riskiest ones.</p>
        </div>
        <Steps steps={STEPS} current={busy || analyze.isSuccess ? step : 0} />
      </div>

      {!tipsSeen && (
        <Card className="flex items-start gap-3 bg-primary-container text-on-primary-container">
          <Lightbulb size={20} className="mt-0.5 shrink-0" aria-hidden />
          <p className="flex-1">First time here? Try the sample dataset. Then open <b>Flags</b> and use J / K to move, A to accept, D to dismiss.</p>
          <button aria-label="Dismiss tip" className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-black/10" onClick={() => setTipsSeen(true)}><X size={18} /></button>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <div role="button" tabIndex={0} aria-label="Drop a CSV file here or press Enter to browse"
            onClick={() => input.current?.click()} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && input.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); void pick(e.dataTransfer.files[0]); }}
            className={cx("flex min-h-[260px] cursor-pointer flex-col items-center justify-center gap-3 rounded-card border-2 border-dashed p-8 text-center transition-colors duration-200", drag ? "border-primary bg-primary/10" : "border-outline-variant bg-surface-container hover:bg-surface-high")}>
            <UploadCloud size={40} className="text-primary" aria-hidden />
            <p className="text-title">{file ? file.name : "Drag and drop your ledger CSV"}</p>
            <p className="text-on-surface-variant">{file ? `${(file.size / 1024).toFixed(0)} KB` : "or click to browse. Up to 200,000 rows."}</p>
            <input ref={input} type="file" accept=".csv,text/csv" hidden onChange={(e) => void pick(e.target.files?.[0])} />
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button disabled={!file || !check?.ok || busy} onClick={() => analyze.mutate(false)}>Upload and analyze</Button>
            <Button variant="tonal" disabled={busy} icon={<FileSpreadsheet size={18} aria-hidden />} onClick={() => (file ? setConfirmReplace(true) : analyze.mutate(true))}>Use sample dataset</Button>
            {file && <Button variant="text" disabled={busy} onClick={() => { setFile(null); setCheck(null); }}>Cancel</Button>}
          </div>
          {busy && <div className="mt-4 space-y-2"><LinearProgress value={step === 0 ? 0.3 : undefined} /><p className="text-label text-on-surface-variant" aria-live="polite">{step === 0 ? "Uploading your ledger…" : "Analyzing entries and asking Gemini to explain the riskiest ones…"}</p></div>}
          {err && <div className="mt-4"><ErrorState message={err.message} nextStep={(err as ApiError).nextStep} onRetry={() => analyze.mutate(!file)} /></div>}
        </div>

        <Card className="lg:col-span-5">
          <h3 className="text-title">Column check</h3>
          <p className="mt-1 text-on-surface-variant">Your file needs these 10 columns. We check them before uploading.</p>
          <ul className="mt-3 grid grid-cols-2 gap-2">
            {REQUIRED_COLUMNS.map((c) => {
              const state = !check ? "idle" : check.found.includes(c) ? "ok" : "missing";
              return (
                <motion.li key={c} layout className="flex min-h-[32px] items-center gap-2 text-label">
                  {state === "ok" ? <CheckCircle2 size={16} className="text-low" aria-label="present" /> : state === "missing" ? <XCircle size={16} className="text-error" aria-label="missing" /> : <span className="h-4 w-4 rounded-full border border-outline" aria-hidden />}
                  <code>{c}</code>
                </motion.li>
              );
            })}
          </ul>
          {check && !check.ok && check.missing.length > 0 && <p role="alert" className="mt-3 text-error">Missing: {check.missing.join(", ")}. Add them and choose the file again.</p>}
          {check?.ok && <p className="mt-3 text-low">All required columns found.</p>}
        </Card>
      </div>

      {recent.data && recent.data.length > 0 && (
        <section aria-label="Recent runs">
          <h3 className="mb-2 text-title">Recent runs</h3>
          <div className="flex flex-wrap gap-2">
            {recent.data.slice(0, 6).map((r) => (
              <button key={r.id} onClick={() => { setRunId(r.id); nav("/dashboard"); }} className="min-h-[44px]">
                <Chip className="min-h-[44px] px-4 hover:bg-surface-high">{r.filename} · {new Date(r.created_at).toLocaleDateString()} · {r.status}</Chip>
              </button>
            ))}
          </div>
        </section>
      )}

      <Dialog open={confirmReplace} onClose={() => setConfirmReplace(false)} title="Use the sample instead?"
        actions={<><Button variant="text" onClick={() => setConfirmReplace(false)}>Cancel</Button><Button onClick={() => { setConfirmReplace(false); setFile(null); setCheck(null); analyze.mutate(true); }}>Use sample</Button></>}>
        You chose <b>{file?.name}</b>. Using the sample dataset will clear that selection.
      </Dialog>
    </div>
  );
}
