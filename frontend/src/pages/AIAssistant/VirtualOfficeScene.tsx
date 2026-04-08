import React, { useEffect, useMemo, useRef, useState } from "react";
import { SpriteAvatar } from "./SpriteAvatar";

/** Larger logical grid + bigger cells = bigger office on screen */
const GRID_W = 40;
const GRID_H = 24;
const CELL_PX = 22;
const MAX_WALKERS = 2;
const WALK_SPEED = 2.8;

const WAYPOINTS = [
  { x: 20, y: 12 },
  { x: 32, y: 15 },
  { x: 12, y: 9 },
  { x: 28, y: 18 },
  { x: 18, y: 14 },
];

/** Staff home positions — spaced to avoid stacking */
const STAFF_DESK_SLOTS: { x: number; y: number }[] = [
  { x: 7, y: 19 },
  { x: 14, y: 19 },
  { x: 21, y: 19 },
  { x: 28, y: 19 },
  { x: 7, y: 15 },
  { x: 14, y: 15 },
  { x: 21, y: 15 },
  { x: 28, y: 15 },
  { x: 10, y: 11 },
  { x: 17, y: 11 },
  { x: 24, y: 11 },
];

const MANAGER_HOME = { x: 5, y: 9 };
const MANAGER_DESK_BLOCK = { x: 4, y: 10, w: 2, h: 1 };

export type VirtualOfficeStaff = {
  id: string;
  label: string;
  subtitle?: string;
  activity?: string;
};

export interface VirtualOfficeSceneProps {
  departmentName?: string;
  managerName: string;
  /** Defaults to [] if omitted (avoids runtime errors). */
  staffItems?: VirtualOfficeStaff[];
  idleThoughts?: string[];
  emptyHint: string;
}

type Phase = "at_desk" | "walking";

type Agent = {
  key: string;
  label: string;
  hue: number;
  home: { x: number; y: number };
  x: number;
  y: number;
  phase: Phase;
  targetX: number;
  targetY: number;
  leg: "to_waypoint" | "to_home";
  nextDecisionAt: number;
  idlePhraseIndex: number;
};

function pctX(tx: number) {
  return `${(tx / GRID_W) * 100}%`;
}
function pctY(ty: number) {
  return `${(ty / GRID_H) * 100}%`;
}
function pctW(tw: number) {
  return `${(tw / GRID_W) * 100}%`;
}
function pctH(th: number) {
  return `${(th / GRID_H) * 100}%`;
}

function hashHue(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h) % 360;
}

function spriteVariantForAgent(agentKey: string): number {
  if (agentKey === "__manager") return 0;
  return hashHue(agentKey) % 3;
}

function dist(a: { x: number; y: number }, b: { x: number; y: number }) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

function resolveActivity(
  a: Agent,
  staffItems: VirtualOfficeStaff[],
): string | undefined {
  if (a.key === "__manager") return undefined;
  return staffItems.find((x) => x.id === a.key)?.activity;
}

function resolveLabel(
  a: Agent,
  staffItems: VirtualOfficeStaff[],
  managerName: string,
): string {
  if (a.key === "__manager") return managerName.trim() || "Manager";
  return staffItems.find((x) => x.id === a.key)?.label ?? a.label;
}

function buildAgents(
  managerName: string,
  staffItems: VirtualOfficeStaff[],
): Agent[] {
  const now = performance.now();
  const agents: Agent[] = [
    {
      key: "__manager",
      label: managerName.trim() || "Manager",
      hue: 210,
      home: { ...MANAGER_HOME },
      x: MANAGER_HOME.x,
      y: MANAGER_HOME.y,
      phase: "at_desk",
      targetX: MANAGER_HOME.x,
      targetY: MANAGER_HOME.y,
      leg: "to_home",
      nextDecisionAt: now + 3000 + Math.random() * 4000,
      idlePhraseIndex: 0,
    },
  ];

  staffItems.forEach((s, i) => {
    const slot = STAFF_DESK_SLOTS[i % STAFF_DESK_SLOTS.length];
    const home = { x: slot.x, y: slot.y };
    agents.push({
      key: s.id,
      label: s.label,
      hue: hashHue(s.id),
      home,
      x: home.x,
      y: home.y,
      phase: "at_desk",
      targetX: home.x,
      targetY: home.y,
      leg: "to_home",
      nextDecisionAt: now + 2000 + Math.random() * 5000 + i * 400,
      idlePhraseIndex: i % 8,
    });
  });

  return agents;
}

function countWalking(agents: Agent[]): number {
  return agents.filter((a) => a.phase === "walking").length;
}

function mergeAgentsPreserveMotion(prev: Agent[], next: Agent[]): Agent[] {
  const prevByKey = new Map(prev.map((a) => [a.key, a]));
  return next.map((a) => {
    const p = prevByKey.get(a.key);
    if (!p) return { ...a };
    return {
      ...a,
      x: p.x,
      y: p.y,
      phase: p.phase,
      targetX: p.targetX,
      targetY: p.targetY,
      leg: p.leg,
      nextDecisionAt: p.nextDecisionAt,
      idlePhraseIndex: p.idlePhraseIndex,
    };
  });
}

function simulateAgentsStep(
  agents: Agent[],
  t: number,
  dt: number,
  staffSnapshot: VirtualOfficeStaff[],
  idleLen: number,
  lastIdleRotateRef: React.MutableRefObject<number>,
): Agent[] {
  let walking = countWalking(agents);
  const next = agents.map((a) => ({ ...a }));

  for (const a of next) {
    if (a.phase === "walking") {
      const d = dist(a, { x: a.targetX, y: a.targetY });
      if (d < 0.08) {
        a.x = a.targetX;
        a.y = a.targetY;
        if (a.leg === "to_waypoint") {
          a.leg = "to_home";
          a.targetX = a.home.x;
          a.targetY = a.home.y;
        } else {
          a.phase = "at_desk";
          walking--;
          a.nextDecisionAt = t + 3500 + Math.random() * 5500;
        }
      } else {
        const step = WALK_SPEED * dt;
        const move = Math.min(d, step);
        a.x += ((a.targetX - a.x) / d) * move;
        a.y += ((a.targetY - a.y) / d) * move;
      }
    } else if (a.phase === "at_desk" && t >= a.nextDecisionAt) {
      if (walking < MAX_WALKERS) {
        const wp = WAYPOINTS[Math.floor(Math.random() * WAYPOINTS.length)];
        a.phase = "walking";
        walking++;
        a.leg = "to_waypoint";
        a.targetX = wp.x;
        a.targetY = wp.y;
      } else {
        a.nextDecisionAt = t + 1500;
      }
    }
  }

  const safeIdleLen = Math.max(1, idleLen);
  if (t - lastIdleRotateRef.current > 4200) {
    lastIdleRotateRef.current = t;
    for (const a of next) {
      if (a.phase === "at_desk" && !resolveActivity(a, staffSnapshot)) {
        a.idlePhraseIndex = (a.idlePhraseIndex + 1) % safeIdleLen;
      }
    }
  }

  return next;
}

/** Simple pixel-style human (head, body, legs); shirt color from hue */
function PixelHuman({
  hue,
  walking,
  facingRight,
}: {
  hue: number;
  walking: boolean;
  facingRight: boolean;
}) {
  const skin = "hsl(32 42% 78%)";
  const shirt = `hsl(${hue} 58% 46%)`;
  const pants = `hsl(${hue} 28% 32%)`;
  const hair = `hsl(${hue} 35% 22%)`;

  return (
    <div
      className="relative flex flex-col items-center [image-rendering:pixelated]"
      style={{
        width: 40,
        height: 56,
        transform: `scaleX(${facingRight ? 1 : -1})`,
      }}
    >
      {/* Hair */}
      <div
        className="z-[1] h-[10px] w-[16px] rounded-t-[4px] border-[3px] border-slate-900"
        style={{ backgroundColor: hair }}
      />
      {/* Face */}
      <div
        className="z-[1] -mt-px h-[11px] w-[14px] border-[3px] border-slate-900 border-t-0"
        style={{ backgroundColor: skin }}
      />
      {/* Body + sleeves (one block) */}
      <div
        className={`relative z-[1] -mt-px h-[18px] w-[22px] border-[3px] border-slate-900 border-t-0 ${walking ? "animate-pulse" : ""}`}
        style={{ backgroundColor: shirt }}
      >
        <div
          className="absolute -left-1 top-1 h-[10px] w-[5px] border-2 border-slate-900"
          style={{ backgroundColor: skin }}
        />
        <div
          className="absolute -right-1 top-1 h-[10px] w-[5px] border-2 border-slate-900"
          style={{ backgroundColor: skin }}
        />
      </div>
      {/* Legs */}
      <div className="z-[1] mt-0.5 flex gap-1">
        <div
          className="h-[13px] w-[7px] border-[3px] border-slate-900"
          style={{ backgroundColor: pants }}
        />
        <div
          className="h-[13px] w-[7px] border-[3px] border-slate-900"
          style={{ backgroundColor: pants }}
        />
      </div>
    </div>
  );
}

/** Company sign — placed *below* the top window band (windows use tile rows 0–2) */
function CompanySignboard({ name }: { name: string }) {
  const display = String(name ?? "").trim() || "AutoEstate";
  return (
    <div
      className="absolute z-[4] flex flex-col items-center [image-rendering:pixelated]"
      style={{
        left: pctX(10),
        top: pctY(2.12),
        width: pctW(20),
        height: pctH(1.35),
      }}
    >
      {/* Brackets */}
      <div className="mb-0.5 flex w-[88%] shrink-0 justify-between px-1">
        <div className="h-2 w-1.5 border-2 border-amber-950 bg-amber-800" />
        <div className="h-2 w-1.5 border-2 border-amber-950 bg-amber-800" />
      </div>
      {/* Board — fixed flex growth so layout never collapses to 0 height */}
      <div className="relative min-h-[26px] w-full flex-1 rounded-[3px] border-[4px] border-amber-950 bg-gradient-to-b from-amber-700 to-amber-900 p-0.5 shadow-[3px_4px_0_rgba(0,0,0,0.35)]">
        <div className="flex min-h-[22px] w-full items-center justify-center rounded-[2px] border-2 border-amber-950/80 bg-amber-50 px-2 py-1">
          <p
            className="w-full truncate text-center font-mono text-[10px] font-bold leading-tight text-amber-950 sm:text-[11px]"
            title={display}
          >
            {display}
          </p>
        </div>
        {/* Corner rivets */}
        <div className="absolute -left-0.5 -top-0.5 h-1.5 w-1.5 rounded-full border border-amber-950 bg-amber-600" />
        <div className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full border border-amber-950 bg-amber-600" />
        <div className="absolute -bottom-0.5 -left-0.5 h-1.5 w-1.5 rounded-full border border-amber-950 bg-amber-600" />
        <div className="absolute -bottom-0.5 -right-0.5 h-1.5 w-1.5 rounded-full border border-amber-950 bg-amber-600" />
      </div>
    </div>
  );
}

/** Static office props in tile space */
function OfficeProps({ companyName }: { companyName: string }) {
  return (
    <>
      <CompanySignboard name={companyName} />

      {/* Top wall — side segments + window row */}
      <div
        className="absolute z-[1] bg-slate-500"
        style={{ left: 0, top: 0, width: pctW(8), height: pctH(2) }}
      />
      <div
        className="absolute z-[1] bg-slate-500"
        style={{ left: pctX(32), top: 0, width: pctW(8), height: pctH(2) }}
      />
      <div
        className="absolute z-[1] flex items-end justify-around border-b-2 border-slate-800 bg-slate-500"
        style={{
          left: pctX(8),
          top: 0,
          width: pctW(24),
          height: pctH(2),
        }}
      >
        {[0, 1, 2].map((i) => (
          <div
            key={`win-${i}`}
            className="mb-0.5 h-[65%] w-[26%] border-2 border-slate-800 bg-sky-200/90 shadow-inner"
            style={{ boxShadow: "inset 0 0 0 2px rgba(255,255,255,0.35)" }}
          />
        ))}
      </div>

      {/* Door (left wall) */}
      <div
        className="absolute z-[1] rounded-t border-2 border-slate-900 bg-amber-900/85"
        style={{
          left: pctX(0),
          top: pctY(14),
          width: pctW(2.2),
          height: pctH(9),
        }}
      >
        <div className="absolute bottom-2 right-1 h-1.5 w-1.5 rounded-full border border-amber-950 bg-amber-600" />
      </div>

      {/* Plants — tucked into wall corners (not machines, but off the aisle) */}
      <div
        className="absolute z-[1]"
        style={{ left: pctX(2.2), top: pctY(18), width: pctW(2), height: pctH(3) }}
      >
        <div className="mx-auto h-[55%] w-[70%] rounded-full border-2 border-emerald-900 bg-emerald-600 shadow-sm" />
        <div className="mx-auto mt-0.5 h-[40%] w-[55%] rounded-sm border-2 border-amber-900 bg-amber-800" />
      </div>

      <div
        className="absolute z-[1]"
        style={{ left: pctX(36.5), top: pctY(19.5), width: pctW(1.8), height: pctH(2.5) }}
      >
        <div className="mx-auto h-[50%] w-[80%] rounded-full border-2 border-green-900 bg-lime-600" />
        <div className="mx-auto mt-0.5 h-[45%] w-[60%] border-2 border-stone-700 bg-stone-600" />
      </div>

      {/* Machines — vertical stack along right wall (below windows) */}
      <div
        className="absolute z-[1] rounded-sm border-2 border-slate-800 bg-amber-700/90"
        style={{
          left: pctX(37.4),
          top: pctY(2.4),
          width: pctW(2.2),
          height: pctH(4.2),
        }}
      >
        <div className="m-0.5 space-y-0.5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-1 border-b border-amber-950/60" />
          ))}
        </div>
      </div>

      <div
        className="absolute z-[1] rounded-sm border-2 border-slate-800 bg-slate-200"
        style={{
          left: pctX(37.6),
          top: pctY(9.5),
          width: pctW(2.1),
          height: pctH(4.2),
        }}
      >
        <div className="mx-auto mt-0.5 h-[22%] w-[75%] rounded-sm bg-sky-500" />
        <div className="mx-auto mt-1 h-[8%] w-[40%] bg-slate-700" />
        <div className="absolute bottom-1 left-1/2 h-[28%] w-[35%] -translate-x-1/2 rounded-b border border-slate-700 bg-white/90" />
      </div>

      {/* Conference: horizontal table + chairs on both long sides */}
      <ConferenceTableSet />
    </>
  );
}

/** Compact east–west table: six seats (three per side). */
function ConferenceTableSet() {
  const table = { x: 14, y: 9.1, w: 10, h: 1.4 };
  const chairW = 1.2;
  const chairH = 0.95;
  const chairsPerSide = 3;
  const innerPad = 0.65;
  const startX = table.x + innerPad;
  const endX = table.x + table.w - innerPad - chairW;
  const chairXs = Array.from({ length: chairsPerSide }, (_, i) =>
    chairsPerSide <= 1
      ? table.x + (table.w - chairW) / 2
      : startX + (i * (endX - startX)) / (chairsPerSide - 1),
  );

  return (
    <div
      className="pointer-events-none absolute inset-0 z-[1] [image-rendering:pixelated]"
      aria-hidden
    >
      {/* Table top — wrapper must fill scene so % left/top use full grid width/height */}
      <div
        className="absolute rounded-[3px] border-[3px] border-slate-900 bg-gradient-to-b from-amber-700 to-amber-900 shadow-[2px_3px_0_rgba(0,0,0,0.25)]"
        style={{
          left: pctX(table.x),
          top: pctY(table.y),
          width: pctW(table.w),
          height: pctH(table.h),
        }}
      >
        <div className="absolute inset-x-2 top-1 h-[22%] rounded-sm border border-amber-950/50 bg-amber-600/35" />
      </div>
      {/* Legs (corners) */}
      <div
        className="absolute rounded-sm border-2 border-slate-900 bg-amber-950/90"
        style={{
          left: pctX(table.x + 0.35),
          top: pctY(table.y + table.h - 0.15),
          width: pctW(0.55),
          height: pctH(0.55),
        }}
      />
      <div
        className="absolute rounded-sm border-2 border-slate-900 bg-amber-950/90"
        style={{
          left: pctX(table.x + table.w - 0.9),
          top: pctY(table.y + table.h - 0.15),
          width: pctW(0.55),
          height: pctH(0.55),
        }}
      />

      {chairXs.map((cx, i) => (
        <React.Fragment key={`conf-chair-n-${i}`}>
          {/* North side — seats face south toward table */}
          <div
            className="absolute rounded-[3px] border-[3px] border-slate-900 bg-slate-600 shadow-sm"
            style={{
              left: pctX(cx),
              top: pctY(table.y - chairH - 0.12),
              width: pctW(chairW),
              height: pctH(chairH),
            }}
          >
            <div className="absolute inset-x-1 top-0.5 h-[28%] rounded-[2px] border border-slate-800 bg-slate-800" />
            <div className="absolute bottom-0.5 left-1/2 h-[35%] w-[55%] -translate-x-1/2 rounded-b-[2px] border-2 border-slate-900 bg-slate-500" />
          </div>
          {/* South side */}
          <div
            className="absolute rounded-[3px] border-[3px] border-slate-900 bg-slate-600 shadow-sm"
            style={{
              left: pctX(cx),
              top: pctY(table.y + table.h + 0.12),
              width: pctW(chairW),
              height: pctH(chairH),
            }}
          >
            <div className="absolute inset-x-1 bottom-0.5 h-[28%] rounded-[2px] border border-slate-800 bg-slate-800" />
            <div className="absolute left-1/2 top-0.5 h-[35%] w-[55%] -translate-x-1/2 rounded-t-[2px] border-2 border-slate-900 bg-slate-500" />
          </div>
        </React.Fragment>
      ))}
    </div>
  );
}

export const VirtualOfficeScene: React.FC<VirtualOfficeSceneProps> = ({
  departmentName,
  managerName,
  staffItems = [],
  idleThoughts = [],
  emptyHint,
}) => {
  const companySignName =
    String(departmentName ?? "").trim() || "AutoEstate";
  const deptLine = String(departmentName ?? "").trim();
  const idleList = idleThoughts.length ? idleThoughts : ["…"];
  const [agents, setAgents] = useState<Agent[]>(() =>
    buildAgents(managerName, staffItems),
  );
  const staffItemsRef = useRef(staffItems);
  useEffect(() => {
    staffItemsRef.current = staffItems;
  }, [staffItems]);

  const rosterKey = useMemo(
    () => [...staffItems.map((s) => s.id)].sort().join(","),
    [staffItems],
  );

  useEffect(() => {
    const next = buildAgents(managerName, staffItems);
    queueMicrotask(() => {
      setAgents((prev) => mergeAgentsPreserveMotion(prev, next));
    });
  }, [managerName, rosterKey, staffItems]);

  const prevTimeRef = useRef<number | null>(null);
  const lastIdleRotateRef = useRef(0);
  const rafRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const loop = (t: number) => {
      if (cancelled) return;
      const prev = prevTimeRef.current ?? t;
      const dt = Math.min(0.055, (t - prev) / 1000);
      prevTimeRef.current = t;

      setAgents((prevAgents) =>
        simulateAgentsStep(
          prevAgents,
          t,
          dt,
          staffItemsRef.current,
          idleList.length,
          lastIdleRotateRef,
        ),
      );

      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
    };
  }, [idleList.length]);

  const agentsList = agents;
  const sceneW = GRID_W * CELL_PX;
  const sceneH = GRID_H * CELL_PX;

  const deskBlocks = useMemo(() => {
    const blocks: { x: number; y: number; w: number; h: number }[] = [
      MANAGER_DESK_BLOCK,
    ];
    staffItems.forEach((_, i) => {
      const slot = STAFF_DESK_SLOTS[i % STAFF_DESK_SLOTS.length];
      blocks.push({ x: slot.x - 1, y: slot.y + 1, w: 2, h: 1 });
    });
    return blocks;
  }, [staffItems]);

  return (
    <div className="flex h-full min-h-[min(520px,85vh)] w-full min-w-0 flex-1 flex-col bg-slate-300/90 [image-rendering:pixelated]">
      {(deptLine || staffItems.length === 0) && (
        <div className="shrink-0 border-b border-slate-400/80 bg-slate-200/90 px-3 py-2">
          {deptLine ? (
            <p className="font-mono text-xs font-semibold text-slate-800">
              {deptLine}
            </p>
          ) : null}
          {staffItems.length === 0 ? (
            <p className="mt-0.5 font-mono text-[11px] text-slate-600">
              {emptyHint}
            </p>
          ) : null}
        </div>
      )}

      <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-4">
        <div
          className="relative overflow-visible rounded-sm border-[6px] border-slate-600 bg-[#b8c9b8] shadow-xl [image-rendering:pixelated]"
          style={{
            width: sceneW,
            minWidth: sceneW,
            height: sceneH,
            minHeight: sceneH,
            imageRendering: "pixelated",
            backgroundImage: `
              linear-gradient(rgba(0,0,0,0.045) 1px, transparent 1px),
              linear-gradient(90deg, rgba(0,0,0,0.045) 1px, transparent 1px)
            `,
            backgroundSize: `${CELL_PX}px ${CELL_PX}px`,
          }}
        >
          <OfficeProps companyName={companySignName} />

          {deskBlocks.map((d, i) => (
            <div
              key={`desk-${i}`}
              className="absolute z-[2] rounded-[2px] border-2 border-slate-800 bg-amber-800/95 shadow-sm"
              style={{
                left: pctX(d.x),
                top: pctY(d.y),
                width: pctW(d.w),
                height: pctH(d.h),
              }}
            >
              <div
                className="absolute right-1 top-1 h-[32%] w-[38%] rounded-[2px] border border-slate-700 bg-sky-300"
                aria-hidden
              />
            </div>
          ))}

          {agentsList.map((a) => {
            const liveActivity = resolveActivity(a, staffItems)?.trim();
            const phraseIdx = Number.isFinite(a.idlePhraseIndex)
              ? Math.abs(Math.floor(a.idlePhraseIndex)) % idleList.length
              : 0;
            const bubbleText =
              liveActivity || idleList[phraseIdx];
            const showBubble = a.phase === "at_desk";
            const leftPct = (a.x / GRID_W) * 100;
            const topPct = (a.y / GRID_H) * 100;
            const facingRight =
              a.phase === "walking" ? a.targetX >= a.x - 0.02 : true;

            return (
              <div
                key={a.key}
                className="pointer-events-none absolute z-20"
                style={{
                  left: `${leftPct}%`,
                  top: `${topPct}%`,
                  transform: "translate(-50%, -55%)",
                }}
              >
                {showBubble && (
                  <div
                    className="absolute bottom-full left-1/2 z-30 mb-2 w-max max-w-[min(240px,85vw)] -translate-x-1/2 rounded-lg border-[3px] border-slate-900 bg-white px-2 py-1.5 shadow-md"
                  >
                    <p
                      className="line-clamp-2 break-words text-left font-mono text-[11px] font-medium leading-snug text-slate-900"
                      lang="auto"
                    >
                      {bubbleText}
                    </p>
                    <div
                      className="absolute -bottom-1.5 left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 border-b-[3px] border-r-[3px] border-slate-900 bg-white"
                      aria-hidden
                    />
                  </div>
                )}

                <div
                  className="relative flex flex-col items-center"
                  title={resolveLabel(a, staffItems, managerName)}
                >
                  <SpriteAvatar
                    variant={spriteVariantForAgent(a.key)}
                    walking={a.phase === "walking"}
                    facingRight={facingRight}
                    fallback={
                      <PixelHuman
                        hue={a.hue}
                        walking={a.phase === "walking"}
                        facingRight={facingRight}
                      />
                    }
                  />
                  <div className="mt-1 max-w-[88px] text-center font-mono text-[9px] font-bold leading-tight text-slate-900 drop-shadow-sm [text-shadow:0_0_1px_white]">
                    {resolveLabel(a, staffItems, managerName)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
