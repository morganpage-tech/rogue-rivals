import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  applyCommand,
  computeBuildCost,
  computeGatherYield,
  initMatch,
  listLegalActions,
  TRIBE_HOME,
  VP_WIN_THRESHOLD,
  type Action,
  type BuildingType,
  type MatchState,
  type Region,
  type Resource,
  type Tribe,
} from "@rr/engine";
import { ProposeTrade, RespondTrade } from "./TradeModal";
import { renderEvent } from "./events";
import { HelpPanel } from "./HelpPanel";
import {
  ACTION_EFFECT,
  BUILDING_EFFECT,
  BUILDING_LABEL,
  BUILDING_VP,
  BUILDING_WHY,
  REGION_LABEL,
  REGION_RES_NAME,
  RES_LABEL,
  RES_SHORT,
  TRIBE_LABEL,
  formatResourceBag,
} from "./format";

type LogLine = { key: number; ev: Record<string, unknown> };
const RES_KEYS: Resource[] = ["T", "O", "F", "Rel", "S"];
const REGION_KEYS: Region[] = ["plains", "mountains", "swamps", "desert", "ruins"];
const BUILDING_KEYS: BuildingType[] = [
  "shack",
  "den",
  "watchtower",
  "forge",
  "great_hall",
];

interface SeatConfig {
  playerId: string;
  displayName: string;
  tribe: Tribe;
}

function defaultSeats(count: number): SeatConfig[] {
  const tribes: Tribe[] = ["orange", "grey", "brown", "red"];
  return Array.from({ length: count }, (_, i) => ({
    playerId: `P${i + 1}`,
    displayName: `Player ${i + 1}`,
    tribe: tribes[i]!,
  }));
}

interface SetupScreenProps {
  onStart: (seats: SeatConfig[], seed: number) => void;
}

function SetupScreen({ onStart }: SetupScreenProps) {
  const [count, setCount] = useState(2);
  const [seats, setSeats] = useState<SeatConfig[]>(defaultSeats(2));
  const [seed, setSeed] = useState<number>(() => Math.floor(Math.random() * 1_000_000));

  useEffect(() => {
    setSeats((prev) => {
      const base = defaultSeats(count);
      return base.map((b, i) => prev[i] ?? b);
    });
  }, [count]);

  const availableTribes: Tribe[] = ["orange", "grey", "brown", "red"];
  const usedTribes = new Set(seats.map((s) => s.tribe));
  const dupe = seats.length !== new Set(seats.map((s) => s.tribe)).size;

  return (
    <div className="card" style={{ maxWidth: 640, margin: "40px auto" }}>
      <h2 style={{ marginBottom: 6 }}>New match</h2>
      <div className="muted" style={{ marginBottom: 14, fontSize: 13 }}>
        Local hot-seat — pass the device between players. Rules v0.8.
      </div>
      <div className="col" style={{ gap: 14 }}>
        <label className="row" style={{ justifyContent: "space-between" }}>
          <span>Players</span>
          <select value={count} onChange={(e) => setCount(Number(e.target.value))}>
            {[2, 3, 4].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <div className="col" style={{ gap: 8 }}>
          {seats.map((seat, i) => (
            <div className="col" key={i} style={{ gap: 4 }}>
            <div
              className="row"
              style={{ gap: 8, justifyContent: "space-between" }}
            >
              <span className="mono muted" style={{ width: 32 }}>
                {seat.playerId}
              </span>
              <input
                value={seat.displayName}
                onChange={(e) =>
                  setSeats((prev) =>
                    prev.map((s, j) =>
                      j === i ? { ...s, displayName: e.target.value } : s,
                    ),
                  )
                }
                style={{ flex: 1 }}
              />
              <select
                value={seat.tribe}
                onChange={(e) =>
                  setSeats((prev) =>
                    prev.map((s, j) =>
                      j === i ? { ...s, tribe: e.target.value as Tribe } : s,
                    ),
                  )
                }
              >
                {availableTribes.map((t) => (
                  <option
                    key={t}
                    value={t}
                    disabled={usedTribes.has(t) && seat.tribe !== t}
                  >{`${TRIBE_LABEL[t]} — ${REGION_LABEL[TRIBE_HOME[t].region]} (${RES_LABEL[TRIBE_HOME[t].resource]})`}
                  </option>
                ))}
              </select>
            </div>
            <div className="muted" style={{ fontSize: 11, marginLeft: 40 }}>
              Home: {REGION_LABEL[TRIBE_HOME[seat.tribe].region]} · gathers there yield +2 {RES_LABEL[TRIBE_HOME[seat.tribe].resource]}
            </div>
            </div>
          ))}
        </div>
        <label className="row" style={{ justifyContent: "space-between" }}>
          <span>Seed</span>
          <div className="row" style={{ gap: 6 }}>
            <input
              value={seed}
              onChange={(e) => setSeed(Number(e.target.value) || 0)}
              style={{ width: 120 }}
              type="number"
            />
            <button onClick={() => setSeed(Math.floor(Math.random() * 1_000_000))}>
              Random
            </button>
          </div>
        </label>
        <button
          className="primary"
          disabled={dupe}
          onClick={() => onStart(seats, seed)}
        >
          Start match
        </button>
        {dupe && (
          <div className="bad" style={{ fontSize: 12 }}>
            Each player needs a unique tribe.
          </div>
        )}
      </div>
    </div>
  );
}

interface MatchInstance {
  state: MatchState;
  log: LogLine[];
  seats: SeatConfig[];
}

function nameFactory(seats: SeatConfig[]) {
  const m = new Map(seats.map((s) => [s.playerId, s.displayName]));
  return (id: string) => m.get(id) ?? id;
}

function ResourceStrip({ resources }: { resources: Record<Resource, number> }) {
  return (
    <div className="resources">
      {RES_KEYS.map((k) => (
        <div className="r" key={k}>
          <div className="k">{RES_SHORT[k]}</div>
          <div className="v">{resources[k]}</div>
        </div>
      ))}
      <div className="r">
        <div className="k">VP</div>
        <div className="v">—</div>
      </div>
    </div>
  );
}

interface MatchViewProps {
  match: MatchInstance;
  onCommand: (command: Parameters<typeof applyCommand>[2]) => void;
  onAcknowledgeTurn: () => void;
  onResign: () => void;
  acknowledged: boolean;
}

function MatchView({
  match,
  onCommand,
  onAcknowledgeTurn,
  onResign,
  acknowledged,
}: MatchViewProps) {
  const { state, seats, log } = match;
  const nameOf = useMemo(() => nameFactory(seats), [seats]);
  const [selectedActionKind, setSelectedActionKind] = useState<
    null | "gather" | "ambush" | "scout" | "build"
  >(null);
  const [proposingTrade, setProposingTrade] = useState(false);
  const [respondingTo, setRespondingTo] = useState<string | null>(null);

  const activeId = state.currentPlayerId;
  const activeName = nameOf(activeId);
  const activeSeat = seats.find((s) => s.playerId === activeId)!;
  const activePs = state.players[activeId];

  const legalActions = useMemo(() => listLegalActions(state, activeId), [state, activeId]);

  const incomingOffers = state.pendingOffers.filter((o) => o.recipient === activeId);
  const outgoingOffers = state.pendingOffers.filter((o) => o.offerer === activeId);

  const logRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [log.length]);

  const totalResources = (pid: string) =>
    RES_KEYS.reduce((a, k) => a + state.players[pid].resources[k], 0);

  const turnOrderSummary = state.turnOrder
    .map((id) => nameOf(id))
    .map((n, i) => (i === state.turnOrder.indexOf(activeId) ? `? ${n}` : n))
    .join(" · ");

  const sortedByVp = [...state.seatPlayerIds].sort(
    (a, b) => state.players[b].vp - state.players[a].vp,
  );
  const topVp = state.players[sortedByVp[0]!].vp;
  const topPlayers = sortedByVp.filter((id) => state.players[id].vp === topVp);
  const leaderSummary =
    topVp === 0
      ? "nobody yet"
      : topPlayers.length === 1
        ? `${nameOf(topPlayers[0]!)} (${topVp} VP)`
        : `tied ${topPlayers.map((id) => nameOf(id)).join(" & ")} (${topVp} VP)`;

  if (!acknowledged) {
    const isVeryFirstTurn = log.every((l) => {
      const t = l.ev.type as string;
      return t === "round_start" || t === "turn_start";
    });
    return (
      <div className="handoff">
        <h2>
          <span className={`tribe-chip tribe-${activeSeat.tribe}`} />
          {activeName}, it's your turn
        </h2>
        <div className="hint">
          Round {state.round} / 15. Pass the device so only {activeName} can see the screen.
          {isVeryFirstTurn
            ? ` Turn order this match: ${turnOrderSummary}.`
            : " Any private state from the previous turn has been hidden."}
        </div>
        {isVeryFirstTurn && (
          <div
            className="hint"
            style={{
              fontSize: 13,
              maxWidth: 520,
              borderTop: "1px solid var(--border)",
              paddingTop: 14,
            }}
          >
            <b className="accent">New to Rogue Rivals?</b> You are the{" "}
            <b>{TRIBE_LABEL[activeSeat.tribe]} tribe</b> and your home is the{" "}
            <b>{REGION_LABEL[TRIBE_HOME[activeSeat.tribe].region]}</b> — gathers
            there yield <b>+2 {RES_LABEL[TRIBE_HOME[activeSeat.tribe].resource]}</b>{" "}
            instead of +1. Each turn propose any trades, then take one action:{" "}
            <b>Gather</b>, <b>Build</b>, <b>Ambush</b>, <b>Scout</b>, or{" "}
            <b>Pass</b>. First player to <b>{VP_WIN_THRESHOLD} VP</b> wins. A
            "How to play" panel is open on the right once you start your turn.
          </div>
        )}
        <button
          className="primary"
          onClick={onAcknowledgeTurn}
          style={{ padding: "12px 28px", fontSize: 16 }}
        >
          Start {activeName}'s turn
        </button>
      </div>
    );
  }

  const doAction = (action: Action) => {
    setSelectedActionKind(null);
    onCommand({ kind: "take_action", action });
  };

  const canGather = (reg: Region) =>
    legalActions.some((a) => a.kind === "gather" && a.region === reg);
  const canScout = (reg: Region) =>
    legalActions.some((a) => a.kind === "scout" && a.region === reg);
  const canAmbush = (reg: Region) =>
    legalActions.some((a) => a.kind === "ambush" && a.region === reg);
  const canBuild = (b: BuildingType) =>
    legalActions.some((a) => a.kind === "build" && a.building === b);

  const responding = respondingTo
    ? state.pendingOffers.find((o) => o.id === respondingTo)
    : null;

  return (
    <>
      <div className="header">
        <div>
          <h1>Rogue Rivals</h1>
          <div className="sub">
            Round {state.round}/15 — {activeName}'s turn —{" "}
            turn order: <span className="mono">{turnOrderSummary}</span>
          </div>
          <div className="sub" style={{ marginTop: 2 }}>
            <span className="accent">
              Goal: first to {VP_WIN_THRESHOLD} VP wins
            </span>{" "}
            — leader: <b>{leaderSummary}</b> —{" "}
            <span className="mono">seed {state.seed}</span> —{" "}
            <span className="mono">{state.rulesVersion}</span>
          </div>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <button onClick={onResign}>Quit match</button>
        </div>
      </div>

      <div className="layout">
        <div className="col">
          <div className="card">
            <h3>Your stockpile</h3>
            <div className="row" style={{ gap: 16, marginTop: 8, flexWrap: "wrap" }}>
              <div>
                <div className="muted" style={{ fontSize: 12 }}>
                  <span className={`tribe-chip tribe-${activeSeat.tribe}`} />
                  {activeName} — {TRIBE_LABEL[activeSeat.tribe]} tribe
                </div>
                <div className="accent" style={{ fontSize: 12, marginTop: 2 }}>
                  Home region: {REGION_LABEL[TRIBE_HOME[activeSeat.tribe].region]} ({RES_LABEL[TRIBE_HOME[activeSeat.tribe].resource]})
                </div>
                <div style={{ marginTop: 4, fontSize: 14 }}>
                  VP: <b>{activePs.vp}</b> — Beads:{" "}
                  <b>{activePs.beads}</b>
                  {activePs.pendingBeads > 0 && (
                    <span className="accent"> (+{activePs.pendingBeads} pending)</span>
                  )}
                </div>
                {activePs.activeAmbushRegion && (
                  <div className="accent" style={{ fontSize: 12, marginTop: 4 }}>
                    Ambush set at {REGION_LABEL[activePs.activeAmbushRegion]} —{" "}
                    {activePs.ambushRoundsRemaining} rnd left
                  </div>
                )}
              </div>
            </div>
            <ResourceStrip resources={activePs.resources} />
            <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
              Buildings:{" "}
              {activePs.buildings.length
                ? activePs.buildings.map((b) => BUILDING_LABEL[b]).join(" — ")
                : "none yet"}
            </div>
          </div>

          <div className="card">
            <h3>Map</h3>
            <div className="regions" style={{ marginTop: 10 }}>
              {REGION_KEYS.map((reg) => {
                const ambushers = state.turnOrder.filter(
                  (p) => state.players[p].activeAmbushRegion === reg,
                );
                const myAmbush = activePs.activeAmbushRegion === reg;
                const isMyHome = reg === TRIBE_HOME[activeSeat.tribe].region;
                const yieldForMe = computeGatherYield(state, activeId, reg);
                return (
                  <div className={`region${isMyHome ? " home" : ""}`} key={reg}>
                    <div className="name">
                      <span className={`region-chip region-${reg}`} />
                      {REGION_LABEL[reg]}
                      {isMyHome && (
                        <span className="home-badge" title="Your tribe's home region">HOME</span>
                      )}
                    </div>
                    <div className="meta">
                      Yields {REGION_RES_NAME[reg]}
                      {isMyHome ? " · your home" : ""}
                    </div>
                    <div className="meta accent">
                      If you gather: +{yieldForMe} {REGION_RES_NAME[reg]}
                      {isMyHome && yieldForMe > 1 ? " (home bonus)" : ""}
                    </div>
                    {myAmbush && <div className="mine">You are ambushing here.</div>}
                    {ambushers.length > 0 && !myAmbush && (
                      <div className="scouted">
                        Someone may be ambushing here.
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {selectedActionKind === "gather" && (
            <div className="card">
              <h3>Gather from…</h3>
              <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>
                {ACTION_EFFECT.gather}
              </div>
              <div className="regions" style={{ marginTop: 10 }}>
                {REGION_KEYS.map((reg) => {
                  const y = computeGatherYield(state, activeId, reg);
                  const isHome = reg === TRIBE_HOME[activeSeat.tribe].region;
                  return (
                    <button
                      className={`region${isHome ? " home" : ""}`}
                      key={reg}
                      disabled={!canGather(reg)}
                      onClick={() => doAction({ kind: "gather", region: reg })}
                    >
                      <div className="name">
                        <span className={`region-chip region-${reg}`} />
                        {REGION_LABEL[reg]}
                        {isHome && <span className="home-badge">HOME</span>}
                      </div>
                      <div className="meta">
                        Gain <b>+{y} {REGION_RES_NAME[reg]}</b>
                      </div>
                    </button>
                  );
                })}
              </div>
              <button style={{ marginTop: 10 }} onClick={() => setSelectedActionKind(null)}>
                Back
              </button>
            </div>
          )}

          {selectedActionKind === "ambush" && (
            <div className="card">
              <h3>Set an ambush at…</h3>
              <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>
                {ACTION_EFFECT.ambush}
              </div>
              <div className="regions">
                {REGION_KEYS.map((reg) => (
                  <button
                    className="region"
                    key={reg}
                    disabled={!canAmbush(reg)}
                    onClick={() => doAction({ kind: "ambush", region: reg })}
                  >
                    <div className="name">
                      <span className={`region-chip region-${reg}`} />
                      {REGION_LABEL[reg]}
                    </div>
                    <div className="meta">Strike next gatherer here</div>
                  </button>
                ))}
              </div>
              <button style={{ marginTop: 10 }} onClick={() => setSelectedActionKind(null)}>
                Back
              </button>
            </div>
          )}

          {selectedActionKind === "scout" && (
            <div className="card">
              <h3>Scout…</h3>
              <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>
                {ACTION_EFFECT.scout}
              </div>
              <div className="regions">
                {REGION_KEYS.map((reg) => (
                  <button
                    className="region"
                    key={reg}
                    disabled={!canScout(reg)}
                    onClick={() => doAction({ kind: "scout", region: reg })}
                  >
                    <div className="name">
                      <span className={`region-chip region-${reg}`} />
                      {REGION_LABEL[reg]}
                    </div>
                    <div className="meta">Reveal ambush if present</div>
                  </button>
                ))}
              </div>
              <button style={{ marginTop: 10 }} onClick={() => setSelectedActionKind(null)}>
                Back
              </button>
            </div>
          )}

          {selectedActionKind === "build" && (
            <div className="card">
              <h3>Build…</h3>
              <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
                {ACTION_EFFECT.build}
              </div>
              <div className="col" style={{ gap: 8 }}>
                {BUILDING_KEYS.map((b) => {
                  const cost = computeBuildCost(state, activeId, b);
                  const already = activePs.buildings.includes(b);
                  return (
                    <div
                      key={b}
                      className="card sub"
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <div>
                          <b>{BUILDING_LABEL[b]}</b>{" "}
                          <span className="accent">+{BUILDING_VP[b]} VP</span>
                        </div>
                        <div style={{ fontSize: 12, marginTop: 2 }}>
                          {BUILDING_EFFECT[b]}
                        </div>
                        <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                          Why: {BUILDING_WHY[b]}
                        </div>
                        <div className="muted mono" style={{ fontSize: 12, marginTop: 4 }}>
                          {already
                            ? "already built"
                            : cost
                              ? `cost: ${formatResourceBag(cost)}`
                              : "cannot afford yet"}
                        </div>
                      </div>
                      <button
                        className="primary"
                        disabled={!canBuild(b)}
                        onClick={() => doAction({ kind: "build", building: b })}
                      >
                        Build
                      </button>
                    </div>
                  );
                })}
              </div>
              <button style={{ marginTop: 10 }} onClick={() => setSelectedActionKind(null)}>
                Back
              </button>
            </div>
          )}

          <div className="card">
            <h3>Your turn</h3>
            <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
              Propose trades freely, then take <b>one</b> action to end your turn.
              Your turn ends automatically after you pick an action.
            </div>
            <div className="action-tray">
              <button onClick={() => setSelectedActionKind("gather")}>Gather</button>
              <button onClick={() => setSelectedActionKind("build")}>Build</button>
              <button
                onClick={() => setSelectedActionKind("ambush")}
                disabled={!legalActions.some((a) => a.kind === "ambush")}
              >
                Ambush
              </button>
              <button onClick={() => setSelectedActionKind("scout")}>Scout</button>
              <button onClick={() => doAction({ kind: "pass" })}>Pass</button>
              <button
                onClick={() => setProposingTrade(true)}
                disabled={state.seatPlayerIds.length < 2}
              >
                Propose trade
              </button>
            </div>
          </div>
        </div>

        <div className="col">
          <HelpPanel />
          <div className="card">
            <h3>Players</h3>
            <div className="players" style={{ marginTop: 10 }}>
              {state.seatPlayerIds.map((pid) => {
                const ps = state.players[pid];
                const seat = seats.find((s) => s.playerId === pid)!;
                const isActive = pid === activeId;
                const isYou = pid === activeId;
                return (
                  <div
                    className={`player ${isActive ? "active" : ""} ${isYou ? "you" : ""}`}
                    key={pid}
                  >
                    <div className="name">
                      <span>
                        <span className={`tribe-chip tribe-${seat.tribe}`} />
                        {seat.displayName}
                      </span>
                      <span className="mono">{pid}</span>
                    </div>
                    <div className="line">
                      {TRIBE_LABEL[seat.tribe]} tribe · home: {REGION_LABEL[TRIBE_HOME[seat.tribe].region]}
                    </div>
                    <div className="line">
                      VP: <b className="accent">{ps.vp}</b> — Beads: <b>{ps.beads}</b>
                      {ps.pendingBeads > 0 && ` (+${ps.pendingBeads})`}
                    </div>
                    <div className="line">
                      Stockpile total:{" "}
                      {isYou
                        ? RES_KEYS.map((k) => `${RES_SHORT[k]}:${ps.resources[k]}`).join(" ")
                        : totalResources(pid)}
                    </div>
                    <div className="line">
                      Buildings:{" "}
                      {ps.buildings.length
                        ? ps.buildings.map((b) => BUILDING_LABEL[b]).join(", ")
                        : "—"}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="card">
            <h3>Trade offers</h3>
            <div className="offer-list">
              {incomingOffers.length === 0 && outgoingOffers.length === 0 && (
                <div className="muted" style={{ fontSize: 13 }}>
                  No open offers.
                </div>
              )}
              {incomingOffers.map((o) => (
                <div className="offer" key={o.id}>
                  <div className="line">
                    <b>{nameOf(o.offerer)}</b> ? you
                  </div>
                  <div className="body">
                    <div className="swap mono">
                      {formatResourceBag(o.offered)} ? {formatResourceBag(o.requested)}
                    </div>
                    <div className="btns">
                      <button onClick={() => setRespondingTo(o.id)}>Review…</button>
                    </div>
                  </div>
                </div>
              ))}
              {outgoingOffers.map((o) => (
                <div className="offer" key={o.id}>
                  <div className="line">
                    you ? <b>{nameOf(o.recipient)}</b> — waiting
                  </div>
                  <div className="body">
                    <div className="swap mono">
                      {formatResourceBag(o.offered)} ? {formatResourceBag(o.requested)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <h3>Event log</h3>
            <div className="events" ref={logRef}>
              {log.map((l) => (
                <React.Fragment key={l.key}>{renderEvent(l.ev, nameOf)}</React.Fragment>
              ))}
            </div>
          </div>
        </div>
      </div>

      {proposingTrade && (
        <ProposeTrade
          state={state}
          fromId={activeId}
          nameOf={nameOf}
          onCancel={() => setProposingTrade(false)}
          onSubmit={(recipient, offered, requested) => {
            setProposingTrade(false);
            onCommand({
              kind: "propose_trade",
              offer: { offerer: activeId, recipient, offered, requested },
            });
          }}
        />
      )}

      {responding && (
        <RespondTrade
          offer={responding}
          state={state}
          nameOf={nameOf}
          onCancel={() => setRespondingTo(null)}
          onAccept={() => {
            setRespondingTo(null);
            onCommand({ kind: "accept_trade", offerId: responding.id });
          }}
          onReject={() => {
            setRespondingTo(null);
            onCommand({ kind: "reject_trade", offerId: responding.id });
          }}
          onCounter={(offered, requested) => {
            setRespondingTo(null);
            onCommand({
              kind: "counter_trade",
              offerId: responding.id,
              counter: { offered, requested },
            });
          }}
        />
      )}
    </>
  );
}

interface MatchEndProps {
  match: MatchInstance;
  onNewMatch: () => void;
}

function MatchEndScreen({ match, onNewMatch }: MatchEndProps) {
  const { state, seats, log } = match;
  const nameOf = nameFactory(seats);

  const sorted = [...state.seatPlayerIds].sort(
    (a, b) => state.players[b].vp - state.players[a].vp,
  );
  const top = state.players[sorted[0]!].vp;
  const winners = sorted.filter((id) => state.players[id].vp === top);
  const winnerText =
    winners.length === 1
      ? `${nameOf(winners[0]!)} wins!`
      : `Tie: ${winners.map((w) => nameOf(w)).join(", ")}`;

  const triggerText: Record<string, string> = {
    great_hall: "Great Hall built",
    vp_threshold: "VP threshold reached",
    round_limit: "Round 15 ended",
  };
  const trigger =
    state.endTrigger && triggerText[state.endTrigger]
      ? triggerText[state.endTrigger]
      : "Match complete";

  return (
    <div>
      <div className="header">
        <div>
          <h1>Rogue Rivals</h1>
          <div className="sub">Final standings</div>
        </div>
        <button className="primary" onClick={onNewMatch}>
          New match
        </button>
      </div>
      <div className="card match-end">
        <div className="trophy">??</div>
        <h2>{winnerText}</h2>
        <div className="muted" style={{ marginTop: 6 }}>
          {trigger} — {state.rulesVersion}
        </div>
        <div className="standings">
          {sorted.map((id, idx) => {
            const seat = seats.find((s) => s.playerId === id)!;
            const ps = state.players[id];
            return (
              <div
                className={`row ${winners.includes(id) ? "winner" : ""}`}
                key={id}
              >
                <div>
                  <span className="muted">#{idx + 1}</span>{" "}
                  <span className={`tribe-chip tribe-${seat.tribe}`} />
                  <b>{seat.displayName}</b>
                </div>
                <div>
                  <span className="accent">{ps.vp}</span>{" "}
                  <span className="muted">VP</span>
                </div>
              </div>
            );
          })}
        </div>
        <details style={{ marginTop: 20, textAlign: "left", maxWidth: 720, marginLeft: "auto", marginRight: "auto" }}>
          <summary className="muted" style={{ cursor: "pointer" }}>
            Full event log ({log.length} events)
          </summary>
          <div className="events" style={{ maxHeight: 380 }}>
            {log.map((l) => (
              <React.Fragment key={l.key}>{renderEvent(l.ev, nameOf)}</React.Fragment>
            ))}
          </div>
        </details>
      </div>
    </div>
  );
}

export function App() {
  const [match, setMatch] = useState<MatchInstance | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const eventKeyRef = useRef(0);

  const startMatch = (seats: SeatConfig[], seed: number) => {
    const state = initMatch({
      seed,
      seats: seats.map((s) => ({ playerId: s.playerId, tribe: s.tribe })),
    });
    const initialLog: LogLine[] = [
      {
        key: eventKeyRef.current++,
        ev: { type: "round_start", round: state.round },
      },
      {
        key: eventKeyRef.current++,
        ev: { type: "turn_start", round: state.round, player_id: state.currentPlayerId },
      },
    ];
    setMatch({ state, seats, log: initialLog });
    setAcknowledged(false);
  };

  const onCommand: MatchViewProps["onCommand"] = (command) => {
    if (!match) return;
    const activeId = match.state.currentPlayerId;
    const result = applyCommand(match.state, activeId, command, new Date());
    if ("error" in result) {
      console.warn("Illegal command", command, result.error);
      return;
    }
    const { newState, events } = result;
    const newLog: LogLine[] = [
      ...match.log,
      ...events.map((ev) => ({ key: eventKeyRef.current++, ev })),
    ];

    const turnChanged = newState.currentPlayerId !== activeId;
    if (turnChanged && !newState.matchEnded) {
      newLog.push({
        key: eventKeyRef.current++,
        ev: {
          type: "turn_start",
          round: newState.round,
          player_id: newState.currentPlayerId,
        },
      });
    }

    setMatch({ ...match, state: newState, log: newLog });
    if (turnChanged) setAcknowledged(false);
  };

  if (!match) {
    return (
      <div className="app">
        <div className="header">
          <div>
            <h1>Rogue Rivals</h1>
            <div className="sub">Hot-seat prototype — rules v0.8</div>
          </div>
        </div>
        <SetupScreen onStart={startMatch} />
      </div>
    );
  }

  if (match.state.matchEnded) {
    return (
      <div className="app">
        <MatchEndScreen match={match} onNewMatch={() => setMatch(null)} />
      </div>
    );
  }

  return (
    <div className="app">
      <MatchView
        match={match}
        onCommand={onCommand}
        onAcknowledgeTurn={() => setAcknowledged(true)}
        onResign={() => setMatch(null)}
        acknowledged={acknowledged}
      />
    </div>
  );
}

void RES_LABEL;
