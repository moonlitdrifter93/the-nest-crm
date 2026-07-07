import { useMemo, useState, type DragEvent } from "react";
import { fmtDate, todayISO } from "../lib/format";
import type { PlatformFund } from "../lib/store";
import type { Deal, Firm, Plan } from "../types";

/*
 * Master — Matthew's private deal book, as a board of tiles: add, edit,
 * delete, drag to reorder. New deals can be pulled straight from the live
 * funds list (platform + CRM Live/Onboarded surface first in the picker).
 * The tab only renders for the admin, and the deals table's RLS only
 * answers to the admin's account.
 */

export function MasterView({
  firms,
  platform,
  deals,
  onCreate,
  onUpdate,
  onDelete,
  onReorder,
}: {
  firms: Firm[];
  platform: PlatformFund[];
  deals: Deal[];
  onCreate: (deal: Deal) => void;
  onUpdate: (deal: Deal) => void;
  onDelete: (id: Deal["id"]) => void;
  onReorder: (deals: Deal[]) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<Deal["id"] | null>(null);
  const [dragId, setDragId] = useState<Deal["id"] | null>(null);

  // Firm picker options: live funds first (platform + CRM live/onboarded),
  // then the rest of the universe.
  const firmOptions = useMemo(() => {
    const liveNames = new Set<string>();
    for (const p of platform) liveNames.add(p.firm_name);
    for (const f of firms) {
      if (f.status === "Live" || f.status === "Onboarded") liveNames.add(f.name);
    }
    const live = [...liveNames].sort();
    const rest = firms
      .map((f) => f.name)
      .filter((n) => !liveNames.has(n))
      .sort();
    return { live, rest };
  }, [firms, platform]);

  const firmByName = useMemo(() => {
    const m = new Map<string, Firm>();
    for (const f of firms) m.set(f.name.toLowerCase().trim(), f);
    return m;
  }, [firms]);

  function handleDrop(e: DragEvent, targetId: Deal["id"]) {
    e.preventDefault();
    if (dragId === null || dragId === targetId) return;
    const from = deals.findIndex((d) => d.id === dragId);
    const to = deals.findIndex((d) => d.id === targetId);
    if (from < 0 || to < 0) return;
    const next = [...deals];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onReorder(next);
    setDragId(null);
  }

  return (
    <div>
      <div className="section-h">
        Master — deal book
        <span className="hint">
          {deals.length} deals · add, edit, delete, drag to reorder · database-locked to your
          account
        </span>
        <div style={{ flex: 1 }} />
        <button className="btn primary" onClick={() => setAdding(true)}>
          + Add deal
        </button>
      </div>

      <div className="deal-grid">
        {adding && (
          <DealEditor
            firmOptions={firmOptions}
            firmByName={firmByName}
            onSave={(d) => {
              onCreate({ ...d, id: 0, position: deals.length });
              setAdding(false);
            }}
            onCancel={() => setAdding(false)}
          />
        )}
        {deals.map((d) =>
          editingId === d.id ? (
            <DealEditor
              key={d.id}
              initial={d}
              firmOptions={firmOptions}
              firmByName={firmByName}
              onSave={(next) => {
                onUpdate({ ...d, ...next });
                setEditingId(null);
              }}
              onCancel={() => setEditingId(null)}
            />
          ) : (
            <div
              key={d.id}
              className={`dtile${dragId === d.id ? " dragging" : ""}`}
              draggable
              onDragStart={() => setDragId(d.id)}
              onDragEnd={() => setDragId(null)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => handleDrop(e, d.id)}
            >
              <div className="dtop">
                <div className="dname">{d.name}</div>
                <button className="dbtn" title="Edit" onClick={() => setEditingId(d.id)}>
                  ✎
                </button>
                <button
                  className="dbtn danger"
                  title="Delete"
                  onClick={() => {
                    if (window.confirm(`Delete deal "${d.name}"?`)) onDelete(d.id);
                  }}
                >
                  ×
                </button>
              </div>
              <div className="dchips">
                {d.is_placement && <span className="chip hot">Placement</span>}
                {d.plan && <span className={`chip plan-${d.plan.toLowerCase()}`}>{d.plan}</span>}
                {!d.is_placement && !d.plan && <span className="sub">no type set</span>}
              </div>
              <div className="damount">{d.amount?.trim() || "—"}</div>
              <div className="dupdate">
                {d.update_text?.trim() || <span className="sub">no update logged</span>}
              </div>
              {d.update_at && <div className="ddate">{fmtDate(d.update_at)}</div>}
            </div>
          ),
        )}
      </div>
      {deals.length === 0 && !adding && (
        <div className="empty">No deals yet — hit “+ Add deal” and pull one in from the live funds.</div>
      )}
    </div>
  );
}

function DealEditor({
  initial,
  firmOptions,
  firmByName,
  onSave,
  onCancel,
}: {
  initial?: Deal;
  firmOptions: { live: string[]; rest: string[] };
  firmByName: Map<string, Firm>;
  onSave: (deal: Omit<Deal, "id" | "position"> & Partial<Pick<Deal, "id" | "position">>) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [isPlacement, setIsPlacement] = useState(initial?.is_placement ?? false);
  const [plan, setPlan] = useState<Plan>(initial?.plan ?? "");
  const [amount, setAmount] = useState(initial?.amount ?? "");
  const [update, setUpdate] = useState(initial?.update_text ?? "");
  const [err, setErr] = useState("");

  // Picking a firm auto-fills its plan/placement tags from the CRM record.
  function pick(n: string) {
    setName(n);
    const f = firmByName.get(n.toLowerCase().trim());
    if (f) {
      if (f.plan && !initial?.plan) setPlan(f.plan);
      if (f.is_placement && !initial?.is_placement) setIsPlacement(true);
    }
  }

  function save() {
    if (!name.trim()) {
      setErr("Pick a fund or type a name.");
      return;
    }
    const f = firmByName.get(name.toLowerCase().trim());
    onSave({
      name: name.trim(),
      firm_id: f?.id ?? initial?.firm_id ?? null,
      is_placement: isPlacement,
      plan,
      amount: amount.trim(),
      update_text: update.trim(),
      update_at:
        update.trim() !== (initial?.update_text ?? "") ? todayISO() : initial?.update_at,
    });
  }

  return (
    <div className="dtile editing">
      <div className="f">
        <label>Fund / deal name</label>
        <input
          list="deal-firms"
          placeholder="Pick from live funds or type…"
          value={name}
          autoFocus
          onChange={(e) => pick(e.target.value)}
        />
        <datalist id="deal-firms">
          {firmOptions.live.map((n) => (
            <option key={`l-${n}`} value={n}>
              ● live fund
            </option>
          ))}
          {firmOptions.rest.map((n) => (
            <option key={`r-${n}`} value={n} />
          ))}
        </datalist>
      </div>
      <div className="tickrow" style={{ margin: "8px 0" }}>
        <label>
          <input
            type="checkbox"
            checked={isPlacement}
            onChange={(e) => setIsPlacement(e.target.checked)}
          />
          Placement
        </label>
        <select
          value={plan}
          onChange={(e) => setPlan(e.target.value as Plan)}
          style={{ width: "auto" }}
        >
          <option value="">— plan —</option>
          <option value="PPR">PPR</option>
          <option value="Enterprise">Enterprise</option>
        </select>
      </div>
      <div className="f" style={{ marginBottom: 8 }}>
        <label>Amount</label>
        <input className="mono" placeholder="$2M" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </div>
      <div className="f" style={{ marginBottom: 10 }}>
        <label>Latest update</label>
        <input
          placeholder="e.g. Term sheet out, signature expected Friday"
          value={update}
          onChange={(e) => setUpdate(e.target.value)}
        />
      </div>
      {err && <div className="err" style={{ color: "var(--red)", fontSize: 12, marginBottom: 8 }}>{err}</div>}
      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn primary" onClick={save}>
          Save
        </button>
        <button className="btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
