import { AnimatePresence, motion } from "framer-motion";
import { CircleAlert, Info, OctagonAlert, TriangleAlert, X, Check } from "lucide-react";
import { useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import type { Severity } from "../lib/types";
import { cx, useCountUp } from "../lib/utils";

export const EASE = [0.2, 0, 0, 1] as const;
export const DECEL = [0.05, 0.7, 0.1, 1] as const;

/* ---------- Buttons (filled / tonal / outlined / text) with a subtle press ripple ---------- */
type Variant = "filled" | "tonal" | "outlined" | "text";
const VARIANT: Record<Variant, string> = {
  filled: "bg-primary text-on-primary shadow-e1 hover:shadow-e2",
  tonal: "bg-primary-container text-on-primary-container hover:shadow-e1",
  outlined: "border border-outline text-primary hover:bg-primary/10",
  text: "text-primary hover:bg-primary/10",
};
interface BtnProps extends ButtonHTMLAttributes<HTMLButtonElement> { variant?: Variant; icon?: ReactNode }
export function Button({ variant = "filled", icon, className, children, onPointerDown, ...rest }: BtnProps) {
  const [ripples, setRipples] = useState<{ id: number; x: number; y: number }[]>([]);
  return (
    <button
      {...rest}
      onPointerDown={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        const id = Date.now() + Math.random();
        setRipples((p) => [...p, { id, x: e.clientX - r.left, y: e.clientY - r.top }]);
        window.setTimeout(() => setRipples((p) => p.filter((x) => x.id !== id)), 300);
        onPointerDown?.(e);
      }}
      className={cx("relative inline-flex min-h-[44px] items-center justify-center gap-2 overflow-hidden rounded-chip px-5 text-label font-medium transition-shadow duration-200 ease-standard disabled:pointer-events-none disabled:opacity-40", VARIANT[variant], className)}>
      {icon}{children}
      {ripples.map((r) => (
        <motion.span key={r.id} aria-hidden className="pointer-events-none absolute h-8 w-8 rounded-full bg-current"
          style={{ left: r.x - 16, top: r.y - 16 }} initial={{ scale: 0, opacity: 0.18 }} animate={{ scale: 6, opacity: 0 }} transition={{ duration: 0.3, ease: EASE }} />
      ))}
    </button>
  );
}

export const Card = ({ children, className, elevated = 1 }: { children: ReactNode; className?: string; elevated?: 0 | 1 | 2 | 3 }) => (
  <div className={cx("rounded-card bg-surface-container p-5", ["shadow-e0", "shadow-e1", "shadow-e2", "shadow-e3"][elevated], className)}>{children}</div>
);

export const Chip = ({ children, icon, className, ...p }: { children: ReactNode; icon?: ReactNode; className?: string } & React.HTMLAttributes<HTMLSpanElement>) => (
  <span {...p} className={cx("inline-flex items-center gap-1 rounded-chip bg-surface-variant/70 px-3 py-1 text-label text-on-surface-variant", className)}>{icon}{children}</span>
);

/* ---------- Severity: colour is always paired with an icon and a text label ---------- */
export const SEV_META: Record<Severity, { label: string; Icon: typeof Info; cls: string; ring: string }> = {
  critical: { label: "Critical", Icon: OctagonAlert, cls: "bg-critical/15 text-critical", ring: "rgb(var(--critical))" },
  high: { label: "High", Icon: TriangleAlert, cls: "bg-high/15 text-high", ring: "rgb(var(--high))" },
  medium: { label: "Medium", Icon: CircleAlert, cls: "bg-medium/15 text-medium", ring: "rgb(var(--medium))" },
  low: { label: "Low", Icon: Info, cls: "bg-low/15 text-low", ring: "rgb(var(--low))" },
};
export function SeverityChip({ severity }: { severity: Severity }) {
  const { label, Icon, cls } = SEV_META[severity];
  return <span className={cx("inline-flex items-center gap-1 rounded-chip px-3 py-1 text-label font-medium", cls)}><Icon size={14} aria-hidden />{label}</span>;
}
export function SeverityLegend() {
  return (
    <div className="flex flex-wrap items-center gap-2" aria-label="Severity legend">
      {(Object.keys(SEV_META) as Severity[]).map((s) => <SeverityChip key={s} severity={s} />)}
    </div>
  );
}

/* ---------- Animated risk-score ring ---------- */
export function ScoreRing({ score, severity, size = 44 }: { score: number; severity: Severity; size?: number }) {
  const r = (size - 6) / 2;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={`Risk score ${Math.round(score)} out of 100, ${severity}`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgb(var(--surface-variant))" strokeWidth={4} />
        <motion.circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={SEV_META[severity].ring} strokeWidth={4} strokeLinecap="round"
          initial={{ pathLength: 0 }} animate={{ pathLength: Math.max(0.02, score / 100) }} transition={{ duration: 0.3, ease: DECEL }} />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-label font-semibold">{Math.round(score)}</span>
    </div>
  );
}

export function Stat({ label, value, prefix = "", hint }: { label: string; value: number; prefix?: string; hint?: string }) {
  const v = useCountUp(value);
  return (
    <Card>
      <p className="text-label text-on-surface-variant">{label}</p>
      <p className="mt-1 text-headline" aria-label={`${label}: ${prefix}${Math.round(value).toLocaleString()}`}>{prefix}{Math.round(v).toLocaleString("en-US")}</p>
      {hint && <p className="mt-1 text-label text-on-surface-variant">{hint}</p>}
    </Card>
  );
}

export const Skeleton = ({ className }: { className?: string }) => <div className={cx("skeleton", className)} aria-hidden />;

export function LinearProgress({ value }: { value?: number }) {
  return (
    <div className="h-1 w-full overflow-hidden rounded-chip bg-surface-variant" role="progressbar" aria-valuenow={value} aria-label="Progress">
      <motion.div className="h-full origin-left rounded-chip bg-primary" initial={{ scaleX: 0 }} animate={{ scaleX: value === undefined ? 0.6 : value }} transition={{ duration: 0.3, ease: EASE }} />
    </div>
  );
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex overflow-hidden rounded-chip border border-outline">
      {options.map((o, i) => (
        <button key={o.value} role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)}
          className={cx("flex min-h-[44px] items-center gap-1 px-4 text-label font-medium transition-colors duration-150", i > 0 && "border-l border-outline", value === o.value ? "bg-primary-container text-on-primary-container" : "text-on-surface-variant hover:bg-surface-high")}>
          {value === o.value && <Check size={14} aria-hidden />}{o.label}
        </button>
      ))}
    </div>
  );
}

/* ---------- Step progress: upload -> analyzing -> done ---------- */
export function Steps({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol className="flex items-center gap-2" aria-label="Progress">
      {steps.map((s, i) => (
        <li key={s} className="flex items-center gap-2" aria-current={i === current ? "step" : undefined}>
          <span className={cx("flex h-7 w-7 items-center justify-center rounded-full text-label font-semibold", i < current ? "bg-primary text-on-primary" : i === current ? "bg-primary-container text-on-primary-container ring-2 ring-primary" : "bg-surface-variant text-on-surface-variant")}>
            {i < current ? <Check size={14} aria-hidden /> : i + 1}
          </span>
          <span className={cx("text-label", i === current ? "font-medium text-on-surface" : "text-on-surface-variant")}>{s}</span>
          {i < steps.length - 1 && <span className="mx-1 hidden h-px w-6 bg-outline-variant sm:block" aria-hidden />}
        </li>
      ))}
    </ol>
  );
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 py-12 text-center">
      <svg width="96" height="80" viewBox="0 0 96 80" fill="none" aria-hidden>
        <rect x="14" y="10" width="68" height="60" rx="10" fill="rgb(var(--surface-variant))" />
        <rect x="26" y="24" width="44" height="6" rx="3" fill="rgb(var(--outline-variant))" />
        <rect x="26" y="38" width="30" height="6" rx="3" fill="rgb(var(--outline-variant))" />
        <circle cx="70" cy="58" r="14" fill="rgb(var(--primary-container))" /><path d="M64 58l4 4 8-8" stroke="rgb(var(--primary))" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <h2 className="text-title">{title}</h2>
      <p className="max-w-sm text-on-surface-variant">{body}</p>
      {action}
    </div>
  );
}

export function ErrorState({ message, nextStep, onRetry }: { message: string; nextStep?: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-2 rounded-card bg-error/10 p-5 text-error">
      <p className="text-title">{message}</p>
      {nextStep && <p className="text-on-surface-variant">{nextStep}</p>}
      {onRetry && <Button variant="outlined" onClick={onRetry}>Retry</Button>}
    </div>
  );
}

/* ---------- Dialog (centered) ---------- */
export function Dialog({ open, title, children, actions, onClose }: { open: boolean; title: string; children: ReactNode; actions: ReactNode; onClose: () => void }) {
  useEscape(open, onClose);
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div className="absolute inset-0 bg-black/40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} onClick={onClose} />
          <motion.div role="dialog" aria-modal="true" aria-label={title} initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }} transition={{ duration: 0.2, ease: DECEL }}
            className="relative w-full max-w-md rounded-[28px] bg-surface-high p-6 shadow-e3">
            <h2 className="text-headline">{title}</h2>
            <div className="mt-3 text-on-surface-variant">{children}</div>
            <div className="mt-6 flex justify-end gap-2">{actions}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

function useEscape(active: boolean, fn: () => void) {
  useEffect(() => {
    if (!active) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && fn();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [active, fn]);
}

export function useIsDesktop() {
  const q = "(min-width: 768px)";
  const [d, setD] = useState(() => window.matchMedia(q).matches);
  useEffect(() => { const m = window.matchMedia(q); const h = () => setD(m.matches); m.addEventListener("change", h); return () => m.removeEventListener("change", h); }, []);
  return d;
}

/* ---------- Side drawer on desktop, full-screen bottom sheet on mobile ---------- */
export function Sheet({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  const desktop = useIsDesktop();
  const ref = useRef<HTMLDivElement>(null);
  useEscape(open, onClose);
  useEffect(() => { if (open) ref.current?.focus(); }, [open]);
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-40">
          <motion.div className="absolute inset-0 bg-black/30" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} onClick={onClose} />
          <motion.aside ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title}
            initial={desktop ? { x: "100%" } : { y: "100%" }} animate={{ x: 0, y: 0 }} exit={desktop ? { x: "100%" } : { y: "100%" }}
            transition={{ duration: 0.25, ease: DECEL }}
            className="absolute bottom-0 right-0 flex h-full w-full flex-col bg-surface-high shadow-e3 outline-none md:w-[480px] md:rounded-l-[28px]">
            <header className="flex items-center justify-between px-6 pb-2 pt-4">
              <h2 className="text-title">{title}</h2>
              <button aria-label="Close panel" onClick={onClose} className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-surface-variant"><X size={20} /></button>
            </header>
            <div className="flex-1 overflow-y-auto px-6 pb-8">{children}</div>
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
}

export function Tip({ text, children }: { text: string; children: ReactNode }) {
  return <span title={text} className="inline-flex items-center">{children}</span>;
}
