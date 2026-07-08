import { useEffect, useState } from "react";
import { contactCount, isEstimated, isTough, isToughManual } from "../lib/contact";
import { touchFirm } from "../lib/format";
import { addFollowupEvent, emailsWith, sendMail, type OutlookMessage } from "../lib/outlook";
import { ASSET_CLASSES, OWNERS, STATUSES, type Firm, type Plan, type Status } from "../types";

export function FirmDrawer({
  firm,
  userName,
  outlookConnected,
  onSave,
  onDelete,
  onClose,
}: {
  firm: Firm;
  userName: string;
  outlookConnected: boolean;
  onSave: (firm: Firm) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<Firm>({ ...firm });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [emails, setEmails] = useState<OutlookMessage[] | null>(null);
  const [emailErr, setEmailErr] = useState("");
  const [calMsg, setCalMsg] = useState("");
  const [composing, setComposing] = useState(false);
  const [composeTo, setComposeTo] = useState("");
  const [composeSubject, setComposeSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");
  const [composeMsg, setComposeMsg] = useState("");
  const [sending, setSending] = useState(false);
  const [logDetail, setLogDetail] = useState("");

  const firmAddresses = [
    firm.email,
    firm.email2,
    ...(firm.contacts ?? []).map((c) => c.email),
  ].filter((e): e is string => Boolean(e?.trim()));

  async function loadEmails() {
    setEmailErr("");
    setEmails(null);
    try {
      setEmails(await emailsWith(firmAddresses));
    } catch (e) {
      setEmailErr(e instanceof Error ? e.message : "Could not load emails");
    }
  }

  async function pushFollowup() {
    setCalMsg("");
    if (!draft.followup) {
      setCalMsg("Set a follow-up date first.");
      return;
    }
    try {
      await addFollowupEvent(draft.name, draft.followup, draft.action || "", firmAddresses[0]);
      setCalMsg(`Added to your Outlook calendar for ${draft.followup} ✓`);
    } catch (e) {
      setCalMsg(e instanceof Error ? e.message : "Calendar add failed");
    }
  }

  // Pull an email into the firm's notes and count it as an email touchpoint.
  function saveEmailToNotes(m: OutlookMessage) {
    const line = `${new Date(m.received).toLocaleDateString("en-AU")} — email — ${m.incoming ? "from" : "to"} ${m.fromName}: ${m.subject}${m.preview ? ` — ${m.preview.slice(0, 200)}` : ""}`;
    setDraft((d) => ({
      ...d,
      last_contact: m.received.slice(0, 10),
      contact_count: (d.contact_count ?? 0) + 1,
      note: d.note?.trim() ? `${line}\n${d.note}` : line,
    }));
    setCalMsg("Saved to notes — remember to Save the firm.");
  }

  async function send() {
    setComposeMsg("");
    if (!composeTo.trim() || !composeSubject.trim()) {
      setComposeMsg("Recipient and subject are required.");
      return;
    }
    setSending(true);
    try {
      await sendMail(composeTo.trim(), composeSubject.trim(), composeBody);
      // log the sent email as a touchpoint
      const line = `${new Date().toLocaleDateString("en-AU")} — email — to ${composeTo.trim()}: ${composeSubject.trim()}`;
      setDraft((d) => ({
        ...d,
        last_contact: new Date().toISOString().slice(0, 10),
        contact_count: (d.contact_count ?? 0) + 1,
        note: d.note?.trim() ? `${line}\n${d.note}` : line,
      }));
      setComposing(false);
      setComposeMsg("");
      setCalMsg("Email sent and logged to notes — Save the firm to keep it.");
    } catch (e) {
      setComposeMsg(e instanceof Error ? e.message : "Send failed");
    } finally {
      setSending(false);
    }
  }

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

  function setContact(i: number, key: "name" | "title" | "email" | "phone" | "li", value: string) {
    setDraft((d) => {
      const contacts = [...(d.contacts ?? [])];
      contacts[i] = { ...contacts[i], [key]: value };
      return { ...d, contacts };
    });
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
            <label>
              LinkedIn{" "}
              {draft.li?.trim() && (
                <a href={liUrl(draft.li)} target="_blank" rel="noreferrer" style={{ fontSize: 11 }}>
                  ↗ open
                </a>
              )}
            </label>
            <input value={draft.li ?? ""} onChange={(e) => set("li", e.target.value)} />
          </div>
        </div>

        <div className="sect">
          Additional contacts
          <button
            className="btn"
            style={{ float: "right", padding: "3px 12px", fontSize: 12 }}
            onClick={() =>
              set("contacts", [...(draft.contacts ?? []), { name: "", title: "", email: "", phone: "", li: "" }])
            }
          >
            + Add contact
          </button>
        </div>
        {(draft.contacts ?? []).map((c, i) => (
          <div key={i} className="contact-card" style={{ padding: 12 }}>
            <div className="fgrid">
              <div className="f">
                <label>Name</label>
                <input value={c.name ?? ""} onChange={(e) => setContact(i, "name", e.target.value)} />
              </div>
              <div className="f">
                <label>Title</label>
                <input value={c.title ?? ""} onChange={(e) => setContact(i, "title", e.target.value)} />
              </div>
              <div className="f">
                <label>Email</label>
                <input value={c.email ?? ""} onChange={(e) => setContact(i, "email", e.target.value)} />
              </div>
              <div className="f">
                <label>Phone</label>
                <input value={c.phone ?? ""} onChange={(e) => setContact(i, "phone", e.target.value)} />
              </div>
              <div className="f full">
                <label>
                  LinkedIn{" "}
                  {c.li?.trim() && (
                    <a href={liUrl(c.li)} target="_blank" rel="noreferrer" style={{ fontSize: 11 }}>
                      ↗ open
                    </a>
                  )}
                </label>
                <input value={c.li ?? ""} onChange={(e) => setContact(i, "li", e.target.value)} />
              </div>
            </div>
            <button
              className="btn danger"
              style={{ padding: "3px 12px", fontSize: 12, marginTop: 6 }}
              onClick={() => set("contacts", (draft.contacts ?? []).filter((_, j) => j !== i))}
            >
              Remove contact
            </button>
          </div>
        ))}

        <div className="sect">Pipeline</div>
        {isTough(draft) && (
          <div className="notice" style={{ borderColor: "#5a4326", color: "#d0a878" }}>
            🪺 <b>Tough basket</b>
            {isToughManual(draft) ? " (flagged by hand)" : " — chased with no response"}. Don't
            cross them off; approach with care — change the angle and lead with something useful.
          </div>
        )}
        <div className="f full" style={{ marginBottom: 8 }}>
          <label>Log a touchpoint — optional note</label>
          <input
            placeholder="e.g. left voicemail / discussed AFSL / sent deck…"
            value={logDetail}
            onChange={(e) => setLogDetail(e.target.value)}
          />
        </div>
        <div className="tickrow" style={{ marginBottom: 12 }}>
          {(["call", "email", "meeting", "linkedin"] as const).map((kind) => (
            <button
              key={kind}
              className="btn"
              disabled={busy}
              title="Stamps last contact today, adds a dated note line, bumps the count, then saves"
              onClick={async () => {
                const touched = touchFirm(draft, kind, userName, logDetail);
                setDraft(touched);
                setLogDetail("");
                setBusy(true);
                try {
                  await onSave(touched);
                } catch (e) {
                  setErr(e instanceof Error ? e.message : "Save failed.");
                } finally {
                  setBusy(false);
                }
              }}
            >
              {kind === "call"
                ? "☎ Log call"
                : kind === "email"
                  ? "✉ Log email"
                  : kind === "meeting"
                    ? "👥 Log meeting"
                    : "in Log LinkedIn"}
            </button>
          ))}
        </div>
        <div className="tickrow" style={{ marginBottom: 12 }}>
          <label title="Manually mark this firm as tough (gone cold). Overrides the auto guess.">
            <input
              type="checkbox"
              checked={isTough(draft)}
              onChange={(e) => set("tough", e.target.checked)}
            />
            🪺 In tough basket (gone cold)
          </label>
          {draft.tough !== undefined && (
            <button className="btn" style={{ padding: "2px 10px", fontSize: 12 }} onClick={() => set("tough", undefined)}>
              reset to auto
            </button>
          )}
        </div>
        <div className="fgrid">
          <div className="f">
            <label>Points of contact{isEstimated(draft) ? " (est.)" : ""}</label>
            <input
              type="number"
              min={0}
              value={contactCount(draft)}
              onChange={(e) => set("contact_count", Math.max(0, Number(e.target.value) || 0))}
            />
          </div>
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

        <div className="sect">Outlook</div>
        {!outlookConnected ? (
          <div className="notice">
            Connect Outlook (the <b>✉ Connect Outlook</b> button, top right) to pull recent emails
            with this firm's contacts, compose &amp; log emails, and push follow-ups to your
            calendar.
          </div>
        ) : (
          <>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
              <button
                className="btn"
                disabled={firmAddresses.length === 0}
                title={firmAddresses.length === 0 ? "No contact email on file" : ""}
                onClick={loadEmails}
              >
                📥 Recent emails
              </button>
              <button
                className="btn"
                onClick={() => {
                  setComposeTo(firmAddresses[0] ?? "");
                  setComposeSubject(`The Nest — ${draft.name}`);
                  setComposeBody(`Hi ${draft.contact?.split(" ")[0] ?? "there"},\n\n`);
                  setComposing((v) => !v);
                }}
              >
                ✉ Compose email
              </button>
              <button className="btn" onClick={pushFollowup}>
                📅 Follow-up → my calendar
              </button>
            </div>
            {calMsg && <div className="sub" style={{ marginBottom: 8, color: "#6ec98a" }}>{calMsg}</div>}
            {emailErr && (
              <div className="sub" style={{ color: "var(--red)", marginBottom: 8 }}>{emailErr}</div>
            )}

            {composing && (
              <div className="contact-card" style={{ padding: 12 }}>
                <div className="f" style={{ marginBottom: 6 }}>
                  <label>To</label>
                  <input value={composeTo} onChange={(e) => setComposeTo(e.target.value)} />
                </div>
                <div className="f" style={{ marginBottom: 6 }}>
                  <label>Subject</label>
                  <input value={composeSubject} onChange={(e) => setComposeSubject(e.target.value)} />
                </div>
                <div className="f" style={{ marginBottom: 8 }}>
                  <label>Message</label>
                  <textarea rows={5} value={composeBody} onChange={(e) => setComposeBody(e.target.value)} />
                </div>
                {composeMsg && (
                  <div className="sub" style={{ color: "var(--red)", marginBottom: 6 }}>{composeMsg}</div>
                )}
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn primary" disabled={sending} onClick={send}>
                    {sending ? "Sending…" : "Send from my Outlook"}
                  </button>
                  <button className="btn" onClick={() => setComposing(false)}>
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {emails && emails.length === 0 && (
              <div className="sub" style={{ marginBottom: 8 }}>No emails found with these contacts.</div>
            )}
            {emails?.map((m) => (
              <div key={m.id} className="contact-card">
                <div className="nm">
                  <a href={m.webLink} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
                    {m.incoming ? "↙ " : "↗ "}
                    {m.subject}
                  </a>
                </div>
                <div className="dt">
                  {m.fromName} · {new Date(m.received).toLocaleDateString("en-AU")}
                </div>
                <div className="dt" style={{ marginTop: 4 }}>{m.preview.slice(0, 140)}</div>
                <button
                  className="btn"
                  style={{ padding: "3px 10px", fontSize: 12, marginTop: 6 }}
                  onClick={() => saveEmailToNotes(m)}
                >
                  ＋ Save to notes
                </button>
              </div>
            ))}
          </>
        )}

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

// Normalise a LinkedIn value (full URL or bare "in/slug" / "slug") to a URL.
function liUrl(li: string): string {
  const v = li.trim();
  if (/^https?:\/\//i.test(v)) return v;
  if (/^(www\.)?linkedin\.com/i.test(v)) return `https://${v}`;
  if (/^in\//i.test(v)) return `https://www.linkedin.com/${v}`;
  return `https://www.linkedin.com/in/${v.replace(/^\/+/, "")}`;
}
