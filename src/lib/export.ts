import type { SpifEvent } from "./store";
import type { Firm } from "../types";

// Excel export — exceljs is loaded on demand so it never weighs down the app.
export async function exportExcel(firms: Firm[], spif: SpifEvent[]): Promise<void> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.created = new Date();

  const ws = wb.addWorksheet("Firms");
  ws.columns = [
    { header: "Firm", key: "name", width: 34 },
    { header: "Stage", key: "status", width: 12 },
    { header: "Plan", key: "plan", width: 11 },
    { header: "Owner", key: "owner", width: 18 },
    { header: "FUM", key: "fum", width: 14 },
    { header: "Asset classes", key: "ac", width: 34 },
    { header: "Contact", key: "contact", width: 22 },
    { header: "Title", key: "title", width: 24 },
    { header: "Email", key: "email", width: 30 },
    { header: "Phone", key: "phone", width: 17 },
    { header: "LinkedIn", key: "li", width: 34 },
    { header: "Website", key: "website", width: 26 },
    { header: "Last contact", key: "last", width: 13 },
    { header: "Follow-up", key: "fu", width: 13 },
    { header: "Next action", key: "action", width: 34 },
    { header: "Placement", key: "pl", width: 10 },
    { header: "Family office", key: "fo", width: 12 },
    { header: "Notes", key: "note", width: 80 },
  ];
  for (const f of [...firms].sort((a, b) => a.name.localeCompare(b.name))) {
    ws.addRow({
      name: f.name,
      status: f.status,
      plan: f.plan || "",
      owner: f.owner || "",
      fum: f.fum || "",
      ac: (f.asset_classes ?? []).join(", "),
      contact: f.contact || "",
      title: f.title || "",
      email: f.email || "",
      phone: f.phone || "",
      li: f.li || "",
      website: f.website || "",
      last: f.last_contact || "",
      fu: f.followup || "",
      action: f.action || "",
      pl: f.is_placement ? "Yes" : "",
      fo: f.is_family_office ? "Yes" : "",
      note: f.note || "",
    });
  }
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  ws.autoFilter = { from: "A1", to: "R1" };

  const sp = wb.addWorksheet("SPIF");
  sp.columns = [
    { header: "Date", key: "ts", width: 13 },
    { header: "Firm", key: "firm", width: 34 },
    { header: "Close type", key: "kind", width: 12 },
    { header: "Owner", key: "owner", width: 18 },
    { header: "Logged by", key: "by", width: 18 },
  ];
  for (const e of spif) {
    sp.addRow({
      ts: e.ts.slice(0, 10),
      firm: e.firm_name,
      kind: e.kind,
      owner: e.owner || "",
      by: e.logged_by || "",
    });
  }
  sp.getRow(1).font = { bold: true };

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `nest-crm-${new Date().toISOString().slice(0, 10)}.xlsx`;
  a.click();
  URL.revokeObjectURL(a.href);
}
