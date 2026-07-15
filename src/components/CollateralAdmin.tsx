import { useEffect, useRef, useState } from "react";
import {
  collateralUrl,
  deleteCollateral,
  loadCollateral,
  uploadCollateral,
  type Collateral,
} from "../lib/partners";
import { fmtDate } from "../lib/format";

/*
 * Team-side collateral library: upload marketing materials, mark which are
 * shared with partners, download, delete. Partner-visible files show up in
 * the partner portal's Resources tab.
 */

export function CollateralAdmin({ userName }: { userName: string }) {
  const [items, setItems] = useState<Collateral[]>([]);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [partnerVisible, setPartnerVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = () => {
    loadCollateral().then(setItems).catch(() => {});
  };
  useEffect(refresh, []);

  async function upload() {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setMsg("Choose a file first.");
      return;
    }
    setBusy(true);
    setMsg("");
    try {
      await uploadCollateral(file, {
        name: name.trim() || file.name,
        description: desc.trim(),
        partner_visible: partnerVisible,
        uploaded_by: userName,
      });
      setName("");
      setDesc("");
      setPartnerVisible(false);
      if (fileRef.current) fileRef.current.value = "";
      setMsg("Uploaded ✓");
      refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function open(item: Collateral) {
    const url = await collateralUrl(item.path);
    if (url) window.open(url, "_blank");
  }

  return (
    <div className="prio-grid">
      <div>
        <div className="section-h">
          Collateral
          <span className="hint">marketing materials · toggle which are shared with partners</span>
        </div>
        {items.length === 0 && <div className="empty">Nothing uploaded yet.</div>}
        <div className="tbl-wrap">
          <table className="grid">
            <thead>
              <tr>
                <th>Name</th>
                <th>Shared</th>
                <th>Added</th>
                <th>By</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((c) => (
                <tr key={c.id}>
                  <td>
                    <button className="row" style={{ background: "none", color: "var(--gd2)" }} onClick={() => open(c)}>
                      {c.name}
                    </button>
                    {c.description && <div className="sub">{c.description}</div>}
                  </td>
                  <td>
                    {c.partner_visible ? (
                      <span className="badge" style={{ background: "#0a2414", color: "#6ec98a" }}>Partners</span>
                    ) : (
                      <span className="badge" style={{ background: "#201614", color: "#907870" }}>Internal</span>
                    )}
                  </td>
                  <td className="mono">{fmtDate(c.created_at?.slice(0, 10))}</td>
                  <td className="sub">{c.uploaded_by || "—"}</td>
                  <td>
                    <button
                      className="dbtn danger"
                      onClick={() => {
                        if (window.confirm(`Delete "${c.name}"?`)) deleteCollateral(c).then(refresh).catch(() => {});
                      }}
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <div className="panel">
          <h3>Upload</h3>
          <div className="f" style={{ marginTop: 8 }}>
            <label>File</label>
            <input ref={fileRef} type="file" />
          </div>
          <div className="f" style={{ marginTop: 8 }}>
            <label>Name (optional)</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="defaults to file name" />
          </div>
          <div className="f" style={{ marginTop: 8 }}>
            <label>Description (optional)</label>
            <textarea rows={2} value={desc} onChange={(e) => setDesc(e.target.value)} />
          </div>
          <label className="tickrow" style={{ marginTop: 10 }}>
            <input type="checkbox" checked={partnerVisible} onChange={(e) => setPartnerVisible(e.target.checked)} />
            Share with partners
          </label>
          <button className="btn primary" style={{ marginTop: 10 }} disabled={busy} onClick={upload}>
            {busy ? "Uploading…" : "Upload"}
          </button>
          {msg && <div className="sub" style={{ marginTop: 8, color: "#6ec98a" }}>{msg}</div>}
        </div>
      </div>
    </div>
  );
}
