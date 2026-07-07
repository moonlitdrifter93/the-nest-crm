import { useEffect, useState } from "react";
import { ASSET_CLASSES, OWNERS, STATUSES, type Firm, type Plan, type Status } from "../types";

export function FirmDrawer({
  firm,
  onSave,
  onDelete,
  onClose,
}: {
  firm: Firm;
  onSave: (firm: Firm) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<Firm>({ ...firm });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => setDraft({ ...firm }), [firm]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function set<K extends keyof Firm>(key: K, value: Firm[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  function toggleAc(ac: string) {
    const cur = new Set(draft.asset_classes ?? []);
    if (cur.has(ac)) cur.delete(ac);
    else cur.add(ac);
    set(
      "asset_classes",
      ASSET_CLASSES.filter((a) => cur.has(a)),
    );
  }

  async function save() {
    if (!draft.name.trim()) {
      setErr("Firm name is required.");
      return;
    }
    setBusy(true);
    setErr("");
    try {
      await onSave({ ...draft, name: draft.name.trim() });
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm(`Delete ${draft.name}? This cannot be undone.`)) return;
    setBusy(true);
    try {
      await onDelete(draft.id);
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Delete failed.");
      setBusy(false);
    }
  }

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="drawer">
        <button className="close" onClick={onClose} aria-label="Close">
          ×
        </button>
        <h2>{draft.name || "New firm"}</h2>

        <div className="sect">Company</div>
        <div className="fgrid">
          <div className="f full">
            <label>Firm name</label>
            <input value={draft.name} onChange={(e) => set("name", e.target.value)} />
          </div>
          <div className="f">
            <label>Stage</label>
            <select value={draft.status} onChange={(e) => set("status", e.target.value as Status)}>
              {STATUSES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
          <div className="f">
            <label>Owner</label>
            <select value={draft.owner ?? ""} onChange={(e) => set("owner", e.target.value)}>
              <option value="">Unassigned</option>
              {OWNERS.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          </div>
          <div className="f">
            <label>Plan</label>
            <select value={draft.plan ?? ""} onChange={(e) => set("plan", e.target.value as Plan)}>
              <option value="">—</option>
              <option value="PPR">PPR</option>
              <option value="Enterprise">Enterprise</option>
            </select>
          </div>
          <div className="f">
            <label>FUM</label>
            <input
              placeholder="$500M AUM"
              value={draft.fum ?? ""}
              onChange={(e) => set("fum", e.target.value)}
            />
          </div>
          <div className="f">
            <label>Website</label>
            <input value={draft.website ?? ""} onChange={(e) => set("website", e.target.value)} />
          </div>
        </div>

        <div className="sect">Primary contact</div>
        <div className="fgrid">
          <div className="f">
            <label>Name</label>
            <input value={draft.contact ?? ""} onChange={(e) => set("contact", e.target.value)} />
          </div>
          <div className="f">
            <label>Title</label>
            <input value={draft.title ?? ""} onChange={(e) => set("title", e.target.value)} />
          </div>
          <div className="f">
            <label>Email</label>
            <input value={draft.email ?? ""} onChange={(e) => set("email", e.target.value)} />
          </div>
          <div className="f">
            <label>Phone</label>
            <input value={draft.phone ?? ""} onChange={(e) => set("phone", e.target.value)} />
          </div>
          <div className="f full">
            <label>LinkedIn</label>
            <input value={draft.li ?? ""} onChange={(e) => set("li", e.target.value)} />
          </div>
        </div>

        {(draft.contacts?.length ?? 0) > 0 && (
          <>
            <div className="sect">Additional contacts</div>
            {draft.contacts!.map((c, i) => (
              <div key={i} className="contact-card">
                <div className="nm">
                  {c.name} {c.title && <span className="dt">— {c.title}</span>}
                </div>
                <div className="dt">
                  {[c.email, c.phone].filter(Boolean).join(" · ")}
                  {c.li && (
                    <>
                      {" · "}
                      <a href={c.li} target="_blank" rel="noreferrer">
                        LinkedIn
                      </a>
                    </>
                  )}
                </div>
              </div>
            ))}
          </>
        )}

        <div className="sect">Pipeline</div>
        <div className="fgrid">
          <div className="f">
            <label>Last contact</label>
            <input
              type="date"
              value={draft.last_contact ?? ""}
              onChange={(e) => set("last_contact", e.target.value)}
            />
          </div>
          <div className="f">
            <label>Follow-up</label>
            <input
              type="date"
              value={draft.followup ?? ""}
              onChange={(e) => set("followup", e.target.value)}
            />
          </div>
          <div className="f full">
            <label>Next action</label>
            <input
              placeholder="e.g. Chase agreement, book call…"
              value={draft.action ?? ""}
              onChange={(e) => set("action", e.target.value)}
            />
          </div>
          <div className="f full tickrow" style={{ marginTop: 4 }}>
            <label>
              <input
                type="checkbox"
                checked={draft.has_deal ?? false}
                onChange={(e) => set("has_deal", e.target.checked)}
              />
              Has deal ready
            </label>
            <label>
              <input
                type="checkbox"
                checked={draft.is_placement ?? false}
                onChange={(e) => set("is_placement", e.target.checked)}
              />
              Placement
            </label>
            <label>
              <input
                type="checkbox"
                checked={draft.is_family_office ?? false}
                onChange={(e) => set("is_family_office", e.target.checked)}
              />
              Family office
            </label>
          </div>
        </div>

        <div className="sect">Asset classes</div>
        <div className="acgrid">
          {ASSET_CLASSES.map((ac) => (
            <label key={ac}>
              <input
                type="checkbox"
                checked={(draft.asset_classes ?? []).includes(ac)}
                onChange={() => toggleAc(ac)}
              />
              {ac}
            </label>
          ))}
        </div>

        <div className="sect">Intel</div>
        <textarea
          rows={7}
          value={draft.note ?? ""}
          onChange={(e) => set("note", e.target.value)}
        />

        {err && (
          <div className="notice" style={{ borderColor: "#5a3830", color: "var(--red)" }}>
            {err}
          </div>
        )}

        <div className="actions">
          <button className="btn primary" disabled={busy} onClick={save}>
            {busy ? "Saving…" : "Save"}
          </button>
          <button className="btn" disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button className="btn danger" disabled={busy} onClick={remove}>
            Delete
          </button>
        </div>
      </div>
    </>
  );
}
