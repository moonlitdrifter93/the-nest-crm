import { useMemo, useState } from "react";
import { closeQueue, platformCoverage, upkeepQueue, type ScoredFirm } from "../lib/score";
import { fmtFum } from "../lib/format";
import { ASSET_CLASSES, type Firm } from "../types";
import { StatusBadge } from "./StatusBadge";

const PAGE = 25;

export function PriorityView({
  firms,
  onOpen,
}: {
  firms: Firm[];
  onOpen: (firm: Firm) => void;
}) {
  const [acFilter, setAcFilter] = useState<string | null>(null);
  const [limit, setLimit] = useState(PAGE);

  const coverage = useMemo(() => platformCoverage(firms), [firms]);
  const queue = useMemo(() => closeQueue(firms), [firms]);
  const upkeep = useMemo(() => upkeepQueue(firms), [firms]);

  const pipelineCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const f of firms) {
      if (f.status !== "Active" && f.status !== "Engaged" && f.status !== "Prospecting") continue;
      for (const ac of f.asset_classes ?? []) m.set(ac, (m.get(ac) ?? 0) + 1);
    }
    return m;
  }, [firms]);

  const shown = useMemo(
    () => (acFilter ? queue.filter((s) => s.firm.asset_classes?.includes(acFilter)) : queue),
    [queue, acFilter],
  );

  const gaps = useMemo(
    () =>
      [...ASSET_CLASSES].sort(
        (a, b) => (coverage.get(a) ?? 0) - (coverage.get(b) ?? 0) || a.localeCompare(b),
      ),
    [coverage],
  );

  return (
    <div className="prio-grid">
      <div>
        <div className="section-h">
          Close queue
          <span className="hint">
            {acFilter ? `${shown.length} in ${acFilter} — ` : ""}
            ranked by sign-up propensity, platform gaps, action &amp; link
          </span>
        </div>
        {shown.length === 0 && <div className="empty">Nothing in the pipeline matches.</div>}
        {shown.slice(0, limit).map((s, i) => (
          <PriorityCard key={s.firm.id} scored={s} rank={i + 1} onOpen={onOpen} />
        ))}
        {shown.length > limit && (
          <button className="btn" style={{ width: "100%" }} onClick={() => setLimit(limit + PAGE)}>
            Show more ({shown.length - limit} remaining)
          </button>
        )}

        {upkeep.length > 0 && !acFilter && (
          <>
            <div className="section-h" style={{ marginTop: 34 }}>
              On-platform upkeep
              <span className="hint">live &amp; onboarded firms with an open follow-up or action</span>
            </div>
            {upkeep.map((s) => (
              <PriorityCard key={s.firm.id} scored={s} onOpen={onOpen} />
            ))}
          </>
        )}
      </div>

      <div>
        <div className="panel">
          <h3>Platform coverage</h3>
          <div className="sub">
            Live funds per asset class · click to focus the queue on gap-fillers
          </div>
          {gaps.map((ac) => {
            const cov = coverage.get(ac) ?? 0;
            const pipe = pipelineCounts.get(ac) ?? 0;
            return (
              <div
                key={ac}
                className={`gaprow${acFilter === ac ? " sel" : ""}`}
                onClick={() => setAcFilter(acFilter === ac ? null : ac)}
              >
                <span className="ac">{ac}</span>
                <span className={`cov${cov === 0 ? " zero" : ""}`}>{cov} live</span>
                <span className="pipe">{pipe} in pipe</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function PriorityCard({
  scored,
  rank,
  onOpen,
}: {
  scored: ScoredFirm;
  rank?: number;
  onOpen: (firm: Firm) => void;
}) {
  const f = scored.firm;
  const meta = [
    f.owner || "Unassigned",
    fmtFum(f.fum),
    (f.asset_classes ?? []).join(" · ") || null,
  ]
    .filter(Boolean)
    .join("  ·  ");

  return (
    <div className="pcard" onClick={() => onOpen(f)}>
      <div className="rank">{rank ?? "•"}</div>
      <div>
        <div className="name">
          {f.name}
          <StatusBadge status={f.status} />
        </div>
        <div className="meta">{meta}</div>
        <div className="why">
          {scored.reasons.map((r, i) => (
            <span key={i} className={`chip ${r.kind}`}>
              {r.label} +{r.pts}
            </span>
          ))}
        </div>
        {f.action?.trim() && <div className="act">→ {f.action}</div>}
      </div>
      <div className="score">
        {scored.score}
        <small>score</small>
      </div>
    </div>
  );
}
