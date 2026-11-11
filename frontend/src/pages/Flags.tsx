import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { flexRender, getCoreRowModel, getSortedRowModel, useReactTable, type ColumnDef, type SortingState } from "@tanstack/react-table";
import { motion } from "framer-motion";
import { ArrowUpDown, Bookmark, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlagDetail } from "../components/FlagDetail";
import { NoRun, QueryError } from "../components/RunGate";
import { Button, Chip, EmptyState, ScoreRing, Segmented, SeverityChip, SeverityLegend, Skeleton } from "../components/ui";
import { useApp } from "../context";
import { api } from "../lib/api";
import type { Flag, FlagStatus, Severity } from "../lib/types";
import { fmtMoney2, useLocalStorage } from "../lib/utils";

interface Filters { q: string; sev: Severity | "all"; status: FlagStatus | "all"; test: string }
const DEFAULT: Filters = { q: "", sev: "all", status: "all", test: "all" };
const TESTS = [["all", "All tests"], ["self_approved", "Self-approved"], ["duplicate", "Duplicate"], ["threshold", "Below threshold"], ["unusual_pairing", "Pairing"], ["round_number", "Round"], ["weekend", "Weekend"], ["after_hours", "After-hours"], ["ml", "ML outlier"]];

export default function Flags() {
  const { runId, snack } = useApp();
  const qc = useQueryClient();
  const search = useRef<HTMLInputElement>(null);
  const [f, setF] = useState<Filters>(DEFAULT);
  const [saved, setSaved] = useLocalStorage<Filters[]>("jeg-saved-filters", []);
  const [sorting, setSorting] = useState<SortingState>([{ id: "score", desc: true }]);
  const [sel, setSel] = useState<string | null>(null);
  const q = useQuery({ queryKey: ["flags", runId], queryFn: () => api.flags(runId!), enabled: !!runId });

  const patch = useMutation({
    mutationFn: (v: { id: string; status?: FlagStatus; comment?: string }) => api.patchFlag(v.id, { status: v.status, comment: v.comment }),
    onSuccess: (flag) => qc.setQueryData<Flag[]>(["flags", runId], (old) => old?.map((x) => (x.id === flag.id ? flag : x))),
    onError: (e: Error) => snack(`${e.message} Try again.`),
  });
  const setStatus = useCallback((fl: Flag, status: FlagStatus) => {
    const prev = fl.status;
    patch.mutate({ id: fl.id, status });
    if (status !== "open") snack(`Entry ${fl.entry_id} ${status}.`, { label: "Undo", run: () => patch.mutate({ id: fl.id, status: prev }) });
  }, [patch, snack]);

  const rows = useMemo(() => (q.data ?? []).filter((x) =>
    (f.sev === "all" || x.severity === f.sev) && (f.status === "all" || x.status === f.status) &&
    (f.test === "all" || x.hits.some((h) => h.test === f.test)) &&
    (!f.q || `${x.entry_id} ${x.entry.description} ${x.entry.posted_by} ${x.entry.amount}`.toLowerCase().includes(f.q.toLowerCase()))), [q.data, f]);

  const cols = useMemo<ColumnDef<Flag>[]>(() => [
    { id: "score", accessorKey: "score", header: "Risk", cell: (c) => <ScoreRing score={c.row.original.score} severity={c.row.original.severity} /> },
    { id: "entry", accessorKey: "entry_id", header: "Entry" },
    { id: "date", accessorFn: (r) => r.entry.posting_date, header: "Date" },
    { id: "amount", accessorFn: (r) => r.entry.amount, header: "Amount", cell: (c) => <span className="tabular-nums">{fmtMoney2(c.getValue<number>())}</span> },
    { id: "severity", accessorFn: (r) => r.score, header: "Severity", cell: (c) => <SeverityChip severity={c.row.original.severity} /> },
    { id: "tests", enableSorting: false, header: "Tests fired", cell: (c) => <div className="flex flex-wrap gap-1">{c.row.original.hits.map((h) => <Chip key={h.test}>{h.label}</Chip>)}</div> },
    { id: "status", accessorKey: "status", header: "Status", cell: (c) => <span className="capitalize">{c.getValue<string>()}</span> },
  ], []);
  const table = useReactTable({ data: rows, columns: cols, state: { sorting }, onSortingChange: setSorting, getCoreRowModel: getCoreRowModel(), getSortedRowModel: getSortedRowModel() });
  const ordered = table.getRowModel().rows.map((r) => r.original);
  const current = ordered.find((x) => x.id === sel) ?? null;

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName)) { if (e.key === "Escape") t.blur(); return; }
      if (e.key === "/") { e.preventDefault(); search.current?.focus(); return; }
      const i = ordered.findIndex((x) => x.id === sel);
      if (e.key === "j") setSel(ordered[Math.min(ordered.length - 1, i + 1)]?.id ?? null);
      else if (e.key === "k") setSel(ordered[Math.max(0, i - 1)]?.id ?? null);
      else if (current && e.key === "a") setStatus(current, "accepted");
      else if (current && e.key === "d") setStatus(current, "dismissed");
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [ordered, sel, current, setStatus]);

  if (!runId) return <NoRun />;
  if (q.isError) return <QueryError error={q.error} onRetry={() => q.refetch()} />;
  const filtered = JSON.stringify(f) !== JSON.stringify(DEFAULT);

  return (
    <div className="space-y-4 py-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h2 className="text-headline">Flags</h2><p className="text-on-surface-variant">{rows.length.toLocaleString()} of {(q.data?.length ?? 0).toLocaleString()} flagged entries. Shortcuts: J/K move, A accept, D dismiss, / search.</p></div>
        <SeverityLegend />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex min-h-[44px] min-w-[220px] flex-1 items-center gap-2 rounded-chip border border-outline px-4"><Search size={16} aria-hidden /><span className="sr-only">Search entries</span>
          <input ref={search} value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} placeholder="Search entry, description, user ( / )" className="w-full bg-transparent outline-none" /></label>
        <Segmented label="Severity" value={f.sev} onChange={(sev) => setF({ ...f, sev })} options={[{ value: "all", label: "All" }, { value: "critical", label: "Critical" }, { value: "high", label: "High" }, { value: "medium", label: "Medium" }, { value: "low", label: "Low" }]} />
        <Segmented label="Status" value={f.status} onChange={(status) => setF({ ...f, status })} options={[{ value: "all", label: "Any status" }, { value: "open", label: "Open" }, { value: "accepted", label: "Accepted" }, { value: "dismissed", label: "Dismissed" }]} />
        <label className="sr-only" htmlFor="test">Filter by test</label>
        <select id="test" value={f.test} onChange={(e) => setF({ ...f, test: e.target.value })} className="min-h-[44px] rounded-chip border border-outline bg-surface px-4">{TESTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        <Button variant="text" icon={<Bookmark size={16} />} disabled={!filtered} onClick={() => { setSaved([...saved, f]); snack("Filter saved."); }}>Save filter</Button>
        {filtered && <Button variant="text" onClick={() => setF(DEFAULT)}>Clear</Button>}
      </div>
      {saved.length > 0 && <div className="flex flex-wrap gap-2" aria-label="Saved filters">{saved.map((s, i) => <button key={i} className="min-h-[44px]" onClick={() => setF(s)}><Chip className="min-h-[36px] hover:bg-surface-high">{[s.sev !== "all" && s.sev, s.status !== "all" && s.status, s.test !== "all" && s.test, s.q && `"${s.q}"`].filter(Boolean).join(" · ") || "All"}</Chip></button>)}</div>}

      {q.isLoading ? <div className="space-y-2">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-14" />)}</div>
        : rows.length === 0 ? <EmptyState title="No flags match" body="Try clearing a filter or searching for something else." action={<Button variant="tonal" onClick={() => setF(DEFAULT)}>Clear filters</Button>} />
        : (<>
          {/* Table on tablet+ */}
          <div className="hidden overflow-hidden rounded-card bg-surface-container shadow-e1 md:block">
            <table className="w-full text-left">
              <thead className="bg-surface-high text-label text-on-surface-variant">{table.getHeaderGroups().map((hg) => <tr key={hg.id}>{hg.headers.map((h) => (
                <th key={h.id} className="px-4 py-3 font-medium" aria-sort={h.column.getIsSorted() === "asc" ? "ascending" : h.column.getIsSorted() === "desc" ? "descending" : "none"}>
                  {h.column.getCanSort() ? <button className="inline-flex min-h-[32px] items-center gap-1" onClick={h.column.getToggleSortingHandler()}>{flexRender(h.column.columnDef.header, h.getContext())}<ArrowUpDown size={12} aria-hidden /></button> : flexRender(h.column.columnDef.header, h.getContext())}</th>))}</tr>)}</thead>
              <tbody>{table.getRowModel().rows.slice(0, 300).map((r) => (
                <motion.tr layout="position" transition={{ duration: 0.2 }} key={r.id} tabIndex={0} aria-selected={r.original.id === sel}
                  onClick={() => setSel(r.original.id)} onKeyDown={(e) => e.key === "Enter" && setSel(r.original.id)}
                  className={`cursor-pointer border-t border-outline-variant/50 hover:bg-surface-high ${r.original.id === sel ? "bg-primary-container/50" : ""}`}>
                  {r.getVisibleCells().map((c) => <td key={c.id} className="px-4 py-2">{flexRender(c.column.columnDef.cell, c.getContext())}</td>)}</motion.tr>))}</tbody>
            </table>
            {rows.length > 300 && <p className="p-3 text-label text-on-surface-variant">Showing the top 300 of {rows.length.toLocaleString()}. Use filters to narrow down.</p>}
          </div>
          {/* Stacked cards on mobile */}
          <ul className="space-y-3 md:hidden">{ordered.slice(0, 100).map((x) => (
            <motion.li layout="position" key={x.id}><button onClick={() => setSel(x.id)} className="flex w-full items-start gap-3 rounded-card bg-surface-container p-4 text-left shadow-e1">
              <ScoreRing score={x.score} severity={x.severity} />
              <span className="min-w-0 flex-1"><span className="flex items-center justify-between gap-2"><b>{x.entry_id}</b><SeverityChip severity={x.severity} /></span>
                <span className="block text-on-surface-variant">{x.entry.posting_date} · {fmtMoney2(x.entry.amount)} · <span className="capitalize">{x.status}</span></span>
                <span className="mt-2 flex flex-wrap gap-1">{x.hits.map((h) => <Chip key={h.test}>{h.label}</Chip>)}</span></span></button></motion.li>))}</ul>
        </>)}

      <FlagDetail flag={current} onClose={() => setSel(null)} onStatus={setStatus} onComment={(fl, text) => patch.mutate({ id: fl.id, comment: text })} />
    </div>
  );
}
