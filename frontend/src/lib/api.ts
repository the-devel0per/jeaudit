import type { AppSettings, Evaluation, Flag, FlagStatus, Run } from "./types";

const BASE = ((import.meta.env.VITE_API_URL as string | undefined) ?? "").replace(/\/+$/, "");

export class ApiError extends Error {
  constructor(message: string, public nextStep = "") { super(message); }
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, { headers: { "Content-Type": "application/json", "X-Auditor": "auditor" }, ...init });
  } catch {
    throw new ApiError("We could not reach the JE Guard service.", "Check that the backend is running, then retry.");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new ApiError(body?.error?.message ?? "Something went wrong.", body?.error?.next_step ?? "Please try again.");
  }
  return res.json() as Promise<T>;
}

export const api = {
  createRun: (filename: string, sample = false) =>
    req<{ run: Run; upload_url: string | null }>("/runs", { method: "POST", body: JSON.stringify({ filename, sample }) }),
  upload: async (url: string, file: File) => {
    const res = await fetch(url, { method: "PUT", headers: { "Content-Type": "text/csv" }, body: file }).catch(() => null);
    if (!res || !res.ok) throw new ApiError("The upload did not finish.", "Check your connection and upload the file again.");
  },
  analyze: (id: string, settings: AppSettings) => req<Run>(`/runs/${id}/analyze`, { method: "POST", body: JSON.stringify({ settings }) }),
  runs: () => req<Pick<Run, "id" | "filename" | "status" | "created_at">[]>("/runs"),
  run: (id: string) => req<Run>(`/runs/${id}`),
  flags: (id: string) => req<Flag[]>(`/runs/${id}/flags`),
  patchFlag: (id: string, body: { status?: FlagStatus; comment?: string }) =>
    req<Flag>(`/flags/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  evaluation: () => req<Evaluation>("/evaluation"),
  reportUrl: (id: string, format: "csv" | "pdf", ids: string[], includeAi: boolean) =>
    `${BASE}/runs/${id}/report?format=${format}&include_ai=${includeAi}&ids=${ids.join(",")}`,
  download: async (url: string, name: string) => {
    const res = await fetch(url);
    if (!res.ok) { const b = await res.json().catch(() => null); throw new ApiError(b?.error?.message ?? "Download failed.", b?.error?.next_step ?? "Try again."); }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(await res.blob()); a.download = name; a.click(); URL.revokeObjectURL(a.href);
  },
};
