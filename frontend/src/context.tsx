import { AnimatePresence, motion } from "framer-motion";
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import type { AppSettings } from "./lib/types";
import { DEFAULT_SETTINGS, useLocalStorage } from "./lib/utils";

interface SnackAction { label: string; run: () => void }
interface Ctx {
  runId: string | null; setRunId: (id: string | null) => void;
  settings: AppSettings; setSettings: (s: AppSettings) => void;
  snack: (message: string, action?: SnackAction) => void;
}
const AppCtx = createContext<Ctx | null>(null);
export const useApp = () => { const c = useContext(AppCtx); if (!c) throw new Error("AppProvider missing"); return c; };

export function AppProvider({ children }: { children: ReactNode }) {
  const [runId, setRunId] = useLocalStorage<string | null>("jeg-run", null);
  const [settings, setSettings] = useLocalStorage<AppSettings>("jeg-settings", DEFAULT_SETTINGS);
  const [msg, setMsg] = useState<{ message: string; action?: SnackAction } | null>(null);
  const timer = useRef<number>();
  const snack = useCallback((message: string, action?: SnackAction) => {
    setMsg({ message, action });
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setMsg(null), 6000);
  }, []);
  return (
    <AppCtx.Provider value={{ runId, setRunId, settings: { ...DEFAULT_SETTINGS, ...settings, weights: { ...DEFAULT_SETTINGS.weights, ...settings.weights } }, setSettings, snack }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex justify-center px-4 md:bottom-6" aria-live="polite" role="status">
        <AnimatePresence>
          {msg && (
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} transition={{ duration: 0.2, ease: [0.05, 0.7, 0.1, 1] }}
              className="pointer-events-auto flex min-h-[48px] items-center gap-4 rounded-xl bg-on-surface px-4 py-2 text-surface shadow-e3">
              <span>{msg.message}</span>
              {msg.action && (
                <button className="min-h-[44px] rounded-chip px-3 font-medium text-primary-container hover:underline"
                  onClick={() => { msg.action?.run(); setMsg(null); }}>{msg.action.label}</button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </AppCtx.Provider>
  );
}
