"""CSV / PDF findings report for confirmed (accepted) flags."""
import csv
import io

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


def to_csv(flags: list[dict], include_ai: bool) -> bytes:
    buf = io.StringIO()
    cols = ["entry_id", "posting_date", "amount", "debit_account", "credit_account", "risk_score", "severity", "tests", "comments"]
    if include_ai:
        cols += ["explanation", "suggested_procedure"]
    w = csv.writer(buf)
    w.writerow(cols)
    for f in flags:
        e, ai = f["entry"], f.get("insight") or {}
        row = [f["entry_id"], e["posting_date"], e["amount"], e["debit_account"], e["credit_account"], f["score"],
               f["severity"], "; ".join(h["label"] for h in f["hits"]), " | ".join(c["text"] for c in f["comments"])]
        if include_ai:
            row += [ai.get("plain_english_explanation", ""), ai.get("suggested_audit_procedure", "")]
        w.writerow(row)
    return buf.getvalue().encode()


def to_pdf(run: dict, flags: list[dict], include_ai: bool) -> bytes:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=landscape(A4), title="JE Guard findings report")
    st = getSampleStyleSheet()
    body = [Paragraph("JE Guard - Confirmed findings", st["Title"]),
            Paragraph(f"Run {run['id']} - {run['filename']} - Synthetic data only", st["Normal"]), Spacer(1, 12)]
    if run.get("summary", {}).get("executive_summary"):
        body += [Paragraph(run["summary"]["executive_summary"], st["BodyText"]), Spacer(1, 12)]
    rows = [["Entry", "Date", "Amount", "Score", "Severity", "Tests fired"]]
    for f in flags:
        rows.append([f["entry_id"], f["entry"]["posting_date"], f"{f['entry']['amount']:,.2f}", f["score"], f["severity"],
                     Paragraph(", ".join(h["label"] for h in f["hits"]), st["BodyText"])])
    t = Table(rows, repeatRows=1, colWidths=[70, 70, 80, 50, 60, 380])
    t.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0B57D0")), ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                           ("GRID", (0, 0), (-1, -1), 0.25, colors.grey), ("VALIGN", (0, 0), (-1, -1), "TOP")]))
    body.append(t)
    if include_ai:
        for f in flags:
            ai = f.get("insight")
            if ai:
                body += [Spacer(1, 8), Paragraph(f"<b>{f['entry_id']}</b>: {ai['plain_english_explanation']} "
                                                 f"<i>Procedure:</i> {ai['suggested_audit_procedure']}", st["BodyText"])]
    doc.build(body)
    return buf.getvalue()
