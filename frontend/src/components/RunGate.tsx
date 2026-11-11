import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useApp } from "../context";
import { api, ApiError } from "../lib/api";
import { Button, EmptyState, ErrorState } from "./ui";

/** Loads the current run; shows an empty state if none is selected. */
export function useRun() {
  const { runId } = useApp();
  return useQuery({ queryKey: ["run", runId], queryFn: () => api.run(runId!), enabled: !!runId });
}

export function NoRun() {
  const nav = useNavigate();
  return <EmptyState title="No run selected" body="Upload a ledger or use the sample dataset to see results here." action={<Button onClick={() => nav("/")}>Go to Upload</Button>} />;
}

export function QueryError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const e = error as ApiError;
  return <ErrorState message={e.message} nextStep={e.nextStep} onRetry={onRetry} />;
}
