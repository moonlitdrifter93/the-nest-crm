import { useEffect, useMemo, useState } from "react";
import { daysUntil, fmtDate, fmtFum, fmtRelative, parseFumMillions } from "../lib/format";
import { platformCoverage } from "../lib/score";
import { loadPlatformFunds, supabaseEnabled, type PlatformFund } from "../lib/store";
import { visibleFunds, type TeamUser } from "../lib/users";
import { ASSET_CLASSES, type Firm } from "../types";

export function LiveFundsView({
  firms,
  user,
  onOpen,
}: {
  firms: Firm[];
  user: TeamUser;
  onOpen: (firm: Firm) => void;
}) {
  const [platform, setPlatform] = useState<PlatformFund[] | null>(null);

  useEffect(() => {
    loadPlatformFunds().then(setPlatform);
  }, []);

  const funds = useMemo(() => visibleFunds(user, firms), [user, firms]);
  const live = funds.filter((f) => f.status === "Live");
  const onboarded = funds.filter((f) => f.status === "Onboarded");

  // Platform rows scoped the same way as CRM live funds: pod members only see
  // firms allocated to their pod (matched to CRM records by name).
  const firmByName = useMemo(() => {
    const m = new Map<string, Firm>();
    for (const f of firms) m.set(f.name.toLowerCase().trim(), f);
    return m;
  }, [firms]);

  // Admin sees every platform fund; everyone else sees only the funds they're
  // allocated to on The Nest (firm sub-admin / product owner, matched by email).
  const visiblePlatform = useMemo(() => {
    if (!platform) return [];
    if (user.seesAllFunds) return platform;
    const me = (user.email ?? "").toLowerCase();
    return platform.filter((p) =>
      (p.owner_emails ?? "")
        .toLowerCase()
        .split(",")
        .map((e) => e.trim())
        .includes(me),
    );
  }, [platform, user]);

  const scope = user.seesAllFunds
    ? "all funds · full view"
    : `funds allocated to ${listNames(user.fundOwners ?? [user.name])}`;

  const coverage = useMemo(() => platformCoverage(firms), [firms]);
  const gaps = useMemo(
    () =>
      [...ASSET_CLASSES].sort(
        (a, b) => (coverage.get(a) ?? 0) - (coverage.get(b) ?? 0) || a.localeCompare(b),
      ),
    [coverage],
  );

  const syncedAt = visiblePlatform[0]?.synced_at;

  return (
    <div className="prio-grid">
      <div>
        <div className="section-h">
          On The Nest — platform data
          <span className="hint">
            {visiblePlatform.length > 0
              ? `${visiblePlatform.length} firms (live + drafts) · synced ${fmtDate(syncedAt?.slice(0, 10))} · ${scope}`
              : "synced from the production database"}
          </span>
        </div>
        {visiblePlatform.length === 0 ? (
          <div className="notice">
            {supabaseEnabled
              ? "No platform data synced yet. Run `node scripts/sync-platform.mjs` (see README) to mirror the live fund list from The Nest's production database into the CRM."
              : "Platform sync requires the CRM's Supabase to be configured."}
          </div>
        ) : (
          <div className="tbl-wrap" style={{ marginBottom: 30 }}>
            <table className="grid">
              <thead>
                <tr>
                  <th>Firm</th>
                  <th>Plan</th>
                  <th>Live</th>
                  <th>Approved</th>
                  <th>Draft</th>
                  <th>Asset classes</th>
                  <th>City</th>
                  <th>FUM</th>
                </tr>
              </thead>
              <tbody>
                {visiblePlatform.map((p) => {
                  const crm = firmByName.get(p.firm_name.toLowerCase().trim());
                  return (
                    <tr
                      key={p.firm_id}
                      className={crm ? "row" : ""}
                      onClick={crm ? () => onOpen(crm) : undefined}
                    >
                      <td>
                        {p.firm_name}
                        {!crm && <div className="sub">not in CRM — add it</div>}
                      </td>
                      <td>
                        <span className={`chip plan-${p.is_enterprise ? "enterprise" : "ppr"}`}>
                          {p.is_enterprise ? "Enterprise" : "PPR"}
                        </span>
                      </td>
                      <td className="mono">{p.live_products}</td>
                      <td className="mono">{p.approved_products}</td>
                      <td className="mono">{p.draft_products ?? 0}</td>
                      <td>
                        <span className="sub">{p.asset_classes || "—"}</span>
                      </td>
                      <td>{p.head_office_city || <span className="sub">—</span>}</td>
                      <td className="mono">
                        {p.fum != null ? fmtFum(`$${Math.round(p.fum / 1_000_000)}M`) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <FundTable
          title="Live (CRM status)"
          hint={`${live.length} funds · ${scope}`}
          funds={live}
          onOpen={onOpen}
        />
        <FundTable
          title="Onboarded — coming online"
          hint={`${onboarded.length} firms signed, first product pending`}
          funds={onboarded}
          onOpen={onOpen}
        />
      </div>

      <div>
        <div className="panel">
          <h3>Platform coverage</h3>
          <div className="sub">live funds per asset class (CRM statuses) — gaps first</div>
          {gaps.map((ac) => {
            const cov = coverage.get(ac) ?? 0;
            return (
              <div key={ac} className="gaprow" style={{ cursor: "default" }}>
                <span className="ac">{ac}</span>
                <span className={`cov${cov === 0 ? " zero" : ""}`}>{cov} live</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function listNames(names: string[]): string {
  const firsts = names.map((n) => n.split(" ")[0]);
  if (firsts.length <= 1) return firsts.join("");
  return `${firsts.slice(0, -1).join(", ")} & ${firsts[firsts.length - 1]}`;
}

function FundTable({
  title,
  hint,
  funds,
  onOpen,
}: {
  title: string;
  hint: string;
  funds: Firm[];
  onOpen: (firm: Firm) => void;
}) {
  const sorted = useMemo(
    () =>
      [...funds].sort(
        (a, b) =>
          (parseFumMillions(b.fum) ?? -1) - (parseFumMillions(a.fum) ?? -1) ||
          a.name.localeCompare(b.name),
      ),
    [funds],
  );

  return (
    <div style={{ marginBottom: 34 }}>
      <div className="section-h">
        {title}
        <span className="hint">{hint}</span>
      </div>
      {sorted.length === 0 ? (
        <div className="empty">No funds in view.</div>
      ) : (
        <div className="tbl-wrap">
          <table className="grid">
            <thead>
              <tr>
                <th>Fund</th>
                <th>Plan</th>
                <th>Owner</th>
                <th>FUM</th>
                <th>Asset classes</th>
                <th>Contact</th>
                <th>Last contact</th>
                <th>Follow-up</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((f) => {
                const due = daysUntil(f.followup);
                return (
                  <tr key={f.id} className="row" onClick={() => onOpen(f)}>
                    <td>{f.name}</td>
                    <td>
                      {f.plan ? (
                        <span className={`chip plan-${f.plan.toLowerCase()}`}>{f.plan}</span>
                      ) : (
                        <span className="sub">—</span>
                      )}
                    </td>
                    <td>{f.owner || <span className="sub">—</span>}</td>
                    <td className="mono">{fmtFum(f.fum)}</td>
                    <td>
                      <span className="sub">{(f.asset_classes ?? []).join(", ") || "—"}</span>
                    </td>
                    <td>
                      {f.contact || <span className="sub">—</span>}
                      {f.email && <div className="sub">{f.email}</div>}
                    </td>
                    <td className="mono">{fmtDate(f.last_contact)}</td>
                    <td
                      className={`mono${
                        due !== null && due < 0 ? " overdue" : due !== null && due <= 7 ? " soon" : ""
                      }`}
                    >
                      {f.followup ? `${fmtDate(f.followup)} (${fmtRelative(f.followup)})` : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
