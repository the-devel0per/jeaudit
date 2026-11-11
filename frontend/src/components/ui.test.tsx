import { render, screen } from "@testing-library/react";
import { SeverityChip, ScoreRing, Steps } from "./ui";
import { validateCsvHeader } from "../lib/utils";

test("SeverityChip pairs colour with a text label", () => {
  render(<SeverityChip severity="critical" />);
  expect(screen.getByText("Critical")).toBeInTheDocument();
});

test("ScoreRing exposes the score to assistive tech", () => {
  render(<ScoreRing score={72} severity="high" />);
  expect(screen.getByRole("img", { name: /72 out of 100/ })).toBeInTheDocument();
});

test("Steps marks the current step", () => {
  render(<Steps steps={["Upload", "Analyzing", "Done"]} current={1} />);
  expect(screen.getByText("Analyzing").closest("li")).toHaveAttribute("aria-current", "step");
});

test("CSV header validator reports missing columns", () => {
  const ok = validateCsvHeader("entry_id,posting_date,posting_time,account,debit,credit,description,posted_by,approved_by,amount");
  expect(ok.ok).toBe(true);
  const bad = validateCsvHeader("entry_id,amount");
  expect(bad.ok).toBe(false);
  expect(bad.missing).toContain("posting_date");
});
