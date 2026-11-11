import { useState } from "react";
import { Button, Card, Dialog, Segmented } from "../components/ui";
import { useApp } from "../context";
import { DEFAULT_SETTINGS, applyTheme, getTheme, type ThemeChoice } from "../lib/utils";

const LABELS: Record<string, string> = { self_approved: "Self-approved", duplicate: "Duplicate entry", threshold: "Just below threshold", unusual_pairing: "Unusual account pairing", round_number: "Round amount", weekend: "Weekend posting", after_hours: "After-hours posting", benford: "Benford's Law digit", ml: "ML outlier (max)" };

function NumberField({ id, label, value, onChange, min, max, step = 1, hint }: { id: string; label: string; value: number; onChange: (n: number) => void; min: number; max: number; step?: number; hint?: string }) {
  const bad = Number.isNaN(value) || value < min || value > max;
  return (
    <div><label htmlFor={id} className="text-label text-on-surface-variant">{label}</label>
      <input id={id} type="number" value={Number.isNaN(value) ? "" : value} min={min} max={max} step={step} onChange={(e) => onChange(parseFloat(e.target.value))} aria-invalid={bad}
        className="mt-1 min-h-[44px] w-full rounded-xl border border-outline bg-transparent px-3" />
      <p className={`text-label ${bad ? "text-error" : "text-on-surface-variant"}`}>{bad ? `Enter a value between ${min} and ${max}.` : hint}</p></div>
  );
}

export default function SettingsPage() {
  const { settings, setSettings, snack } = useApp();
  const [s, setS] = useState(settings);
  const [theme, setTheme] = useState<ThemeChoice>(getTheme());
  const [confirm, setConfirm] = useState(false);
  const valid = s.approval_threshold > 0 && s.work_start >= 0 && s.work_start < s.work_end && s.work_end <= 24 && Object.values(s.weights).every((w) => w >= 0 && w <= 100);
  const dirty = JSON.stringify(s) !== JSON.stringify(settings);
  return (
    <div className="space-y-4 py-4">
      <div><h2 className="text-headline">Settings</h2><p className="text-on-surface-variant">Changes apply the next time you analyze a ledger.</p></div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="space-y-4"><h3 className="text-title">Approval and hours</h3>
          <NumberField id="thr" label="Approval threshold" value={s.approval_threshold} min={1} max={100000000} step={100} onChange={(n) => setS({ ...s, approval_threshold: n })} hint="Entries just below this amount are flagged." />
          <div className="grid grid-cols-2 gap-4">
            <NumberField id="ws" label="Working hours start" value={s.work_start} min={0} max={23} onChange={(n) => setS({ ...s, work_start: n })} hint="Hour, 0-23" />
            <NumberField id="we" label="Working hours end" value={s.work_end} min={1} max={24} onChange={(n) => setS({ ...s, work_end: n })} hint="Must be after start" /></div>
          <div><p className="mb-2 text-label text-on-surface-variant">Theme</p><Segmented label="Theme" value={theme} onChange={(t) => { setTheme(t); applyTheme(t); }} options={[{ value: "system", label: "System" }, { value: "light", label: "Light" }, { value: "dark", label: "Dark" }]} /></div>
        </Card>
        <Card className="space-y-3"><h3 className="text-title">Test weights</h3><p className="text-on-surface-variant">Points added to the 0-100 risk score when a test fires.</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{Object.keys(DEFAULT_SETTINGS.weights).map((k) => (
            <NumberField key={k} id={`w-${k}`} label={LABELS[k]} value={s.weights[k]} min={0} max={100} onChange={(n) => setS({ ...s, weights: { ...s.weights, [k]: n } })} />))}</div></Card>
      </div>
      <div className="flex gap-3"><Button disabled={!valid || !dirty} onClick={() => { setSettings(s); snack("Settings saved."); }}>Save settings</Button><Button variant="outlined" onClick={() => setConfirm(true)}>Reset to defaults</Button></div>
      <Dialog open={confirm} onClose={() => setConfirm(false)} title="Reset all settings?" actions={<><Button variant="text" onClick={() => setConfirm(false)}>Cancel</Button><Button onClick={() => { setS(DEFAULT_SETTINGS); setSettings(DEFAULT_SETTINGS); setConfirm(false); snack("Settings reset."); }}>Reset</Button></>}>Thresholds, hours and weights return to their defaults.</Dialog>
    </div>
  );
}
