import { AnimatePresence, motion } from "framer-motion";
import { Flag, FileText, FlaskConical, HelpCircle, LayoutDashboard, Monitor, Moon, Settings as Cog, ShieldCheck, Sun, Upload as UploadIcon } from "lucide-react";
import { useState } from "react";
import { NavLink, Route, Routes, useLocation } from "react-router-dom";
import { HowScoring } from "./components/HowScoring";
import { Chip, DECEL, Tip } from "./components/ui";
import { applyTheme, cx, getTheme, type ThemeChoice } from "./lib/utils";
import Dashboard from "./pages/Dashboard";
import Flags from "./pages/Flags";
import Insights from "./pages/Insights";
import Report from "./pages/Report";
import SettingsPage from "./pages/Settings";
import UploadPage from "./pages/Upload";

const NAV = [
  { to: "/", label: "Upload", Icon: UploadIcon }, { to: "/dashboard", label: "Dashboard", Icon: LayoutDashboard },
  { to: "/flags", label: "Flags", Icon: Flag }, { to: "/insights", label: "Insights", Icon: FlaskConical },
  { to: "/report", label: "Report", Icon: FileText }, { to: "/settings", label: "Settings", Icon: Cog },
];

function ThemeToggle() {
  const [t, setT] = useState<ThemeChoice>(getTheme());
  const order: ThemeChoice[] = ["system", "light", "dark"];
  const next = order[(order.indexOf(t) + 1) % 3];
  const Icon = t === "dark" ? Moon : t === "light" ? Sun : Monitor;
  return (
    <Tip text={`Theme: ${t}. Switch to ${next}`}>
      <button aria-label={`Theme: ${t}. Switch to ${next}`} onClick={() => { setT(next); applyTheme(next); }} className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-surface-variant"><Icon size={20} /></button>
    </Tip>
  );
}

export default function App() {
  const loc = useLocation();
  const [help, setHelp] = useState(false);
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 flex h-16 items-center gap-3 bg-surface/90 px-4 backdrop-blur md:pl-[104px] md:pr-gutter">
        <ShieldCheck className="text-primary" size={26} aria-hidden />
        <h1 className="text-title">JE Guard</h1>
        <Chip className="bg-primary-container text-on-primary-container" title="All data in this app is generated for demonstration">Synthetic data only</Chip>
        <div className="ml-auto flex items-center gap-1">
          <button onClick={() => setHelp(true)} className="flex min-h-[44px] items-center gap-2 rounded-chip px-3 text-label font-medium text-primary hover:bg-primary/10"><HelpCircle size={18} aria-hidden /><span className="hidden sm:inline">How scoring works</span></button>
          <ThemeToggle />
        </div>
      </header>

      {/* Navigation rail (md+) */}
      <nav aria-label="Main" className="fixed bottom-0 left-0 top-16 z-20 hidden w-20 flex-col items-center gap-3 pt-2 md:flex">
        {NAV.map(({ to, label, Icon }) => (
          <NavLink key={to} to={to} end={to === "/"} className="group flex w-16 flex-col items-center gap-1 py-1 text-label">
            {({ isActive }) => (<>
              <span className={cx("flex h-8 w-14 items-center justify-center rounded-chip transition-colors duration-200", isActive ? "bg-primary-container text-on-primary-container" : "text-on-surface-variant group-hover:bg-surface-variant")}><Icon size={20} aria-hidden /></span>
              <span className={isActive ? "font-semibold text-on-surface" : "text-on-surface-variant"}>{label}</span>
            </>)}
          </NavLink>
        ))}
      </nav>

      {/* Bottom navigation (mobile) */}
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 flex h-16 justify-around bg-surface-container shadow-e2 md:hidden">
        {NAV.map(({ to, label, Icon }) => (
          <NavLink key={to} to={to} end={to === "/"} className="flex min-h-[44px] min-w-[44px] flex-1 flex-col items-center justify-center gap-0.5 text-[11px]">
            {({ isActive }) => (<>
              <span className={cx("flex h-7 w-12 items-center justify-center rounded-chip", isActive && "bg-primary-container text-on-primary-container")}><Icon size={18} aria-hidden /></span>
              <span className={isActive ? "font-semibold" : "text-on-surface-variant"}>{label}</span>
            </>)}
          </NavLink>
        ))}
      </nav>

      <main className="px-4 pb-24 pt-2 md:pb-10 md:pl-[104px] md:pr-gutter">
        <div className="mx-auto max-w-[1280px]">
          <AnimatePresence mode="wait">
            <motion.div key={loc.pathname} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.2, ease: DECEL }}>
              <Routes location={loc}>
                <Route path="/" element={<UploadPage />} />
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/flags" element={<Flags />} />
                <Route path="/insights" element={<Insights />} />
                <Route path="/report" element={<Report />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="*" element={<UploadPage />} />
              </Routes>
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
      <HowScoring open={help} onClose={() => setHelp(false)} />
    </div>
  );
}
