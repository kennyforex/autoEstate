import React, { useCallback, useEffect, useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  Panel,
  Position,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type NodeTypes,
  type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Building2, Library, Plus } from "lucide-react";

export type OrgSelection = "team" | "manager" | string;

export interface DepartmentOrgChartProps {
  departmentName: string;
  managerName: string;
  /** Bound staff skills only */
  staffItems: Array<{
    id: string;
    label: string;
    subtitle?: string;
    /** Live line while that staff’s skill is running (e.g. skill display name) */
    activity?: string;
  }>;
  /** null = no node highlighted (settings panel closed) */
  selection: OrgSelection | null;
  /** Latest chat turn: which org node is “on duty” (animated ring); independent of selection */
  activeHighlight?: OrgSelection | null;
  /** While a skill is executing (execute_skill in flight) — amber ring; takes precedence over activeHighlight */
  processingHighlight?: OrgSelection | null;
  onSelect: (id: OrgSelection) => void;
  /** Click empty canvas — e.g. close settings */
  onPaneClick?: () => void;
  onAddStaff?: () => void;
  /** Opens manager skill library settings (e.g. side panel skills tab). */
  onOpenSkillLibrary?: () => void;
  /** Opens pixel virtual office view (playground). */
  onOpenVirtualOffice?: () => void;
  className?: string;
  labels: {
    department: string;
    manager: string;
    staff: string;
    addStaff: string;
    skillLibrary: string;
    virtualOffice: string;
    zoomHint: string;
    badgeDepartment: string;
    badgeManager: string;
    badgeStaff: string;
  };
}

type OrgNodeData = {
  variant: "dept" | "manager" | "staff";
  title: string;
  subtitle?: string;
  /** Staff: current skill / action while processing */
  activity?: string;
  selected: boolean;
  /** Responsible for latest agent reply (chat) */
  active: boolean;
  /** Skill currently running (execute_skill) */
  processing: boolean;
  badge: string;
};

function OrgCard({ data }: { data: OrgNodeData }) {
  const base =
    "rounded-xl px-3 py-2.5 min-w-[100px] max-w-[160px] text-center shadow-sm border transition-colors";
  const processingRing = data.processing
    ? data.variant === "manager" && data.selected
      ? "ring-2 ring-amber-400 ring-offset-2 ring-offset-slate-900 animate-pulse shadow-[0_0_12px_rgba(251,191,36,0.45)]"
      : "ring-2 ring-amber-500/90 ring-offset-2 ring-offset-white animate-pulse shadow-[0_0_12px_rgba(245,158,11,0.4)]"
    : "";
  const activeRing =
    !data.processing && data.active
      ? data.variant === "manager"
        ? data.selected
          ? "ring-2 ring-violet-400 ring-offset-2 ring-offset-slate-900 animate-pulse shadow-[0_0_10px_rgba(167,139,250,0.38)]"
          : "ring-2 ring-violet-500/85 ring-offset-2 ring-offset-white animate-pulse shadow-[0_0_12px_rgba(139,92,246,0.32)]"
        : "ring-2 ring-blue-500/80 ring-offset-2 ring-offset-white animate-pulse"
      : "";
  const variant =
    data.variant === "dept"
      ? data.selected
        ? "border-indigo-500 bg-indigo-50 ring-2 ring-indigo-200/90 shadow-md"
        : "border-indigo-200 bg-white"
      : data.variant === "manager"
        ? data.selected
          ? "border-slate-900 bg-slate-900 text-white"
          : "border-slate-300 bg-white"
        : data.selected
          ? "border-blue-500 bg-blue-50"
          : "border-gray-200 bg-white";

  const badge =
    data.variant === "dept"
      ? "text-[10px] font-semibold text-indigo-600 uppercase tracking-wide"
      : data.variant === "manager"
        ? data.selected
          ? "text-[10px] font-semibold text-slate-300 uppercase tracking-wide"
          : "text-[10px] font-semibold text-slate-500 uppercase tracking-wide"
        : "text-[10px] font-semibold text-gray-500 uppercase tracking-wide";

  const titleCls =
    data.variant === "manager" && data.selected
      ? "text-sm font-semibold text-white truncate"
      : "text-sm font-semibold text-gray-900 truncate";

  /** React Flow requires Handle components so edges can resolve source/target; keep visually minimal. */
  const handleClass =
    "!h-2 !w-2 !min-h-0 !min-w-0 !border-0 !bg-slate-300 opacity-40";

  return (
    <div className={`${base} ${variant} ${processingRing} ${activeRing} relative`}>
      {data.variant === "dept" && (
        <Handle
          type="source"
          position={Position.Bottom}
          id="out"
          className={handleClass}
        />
      )}
      {data.variant === "manager" && (
        <>
          <Handle
            type="target"
            position={Position.Top}
            id="in"
            className={handleClass}
          />
          <Handle
            type="source"
            position={Position.Bottom}
            id="out"
            className={handleClass}
          />
        </>
      )}
      {data.variant === "staff" && (
        <Handle
          type="target"
          position={Position.Top}
          id="in"
          className={handleClass}
        />
      )}
      {data.variant !== "staff" && (
        <div className={badge}>
          {data.badge}
        </div>
      )}
      <div className={titleCls} title={data.title}>
        {data.title}
      </div>
      {data.subtitle && (
        <div className="text-[10px] text-gray-500 truncate mt-0.5">
          {data.subtitle}
        </div>
      )}
      {data.variant === "staff" && data.activity && (
        <div
          className="text-[10px] font-medium text-violet-700 truncate mt-0.5 leading-tight"
          title={data.activity}
        >
          {data.activity}
        </div>
      )}
    </div>
  );
}

const nodeTypes: NodeTypes = {
  orgCard: ({ data }) => <OrgCard data={data as OrgNodeData} />,
};

/** Layout: generous spacing so nodes don’t feel cramped */
const CENTER = 320;
const ROW1 = 32;
const ROW2 = 168;
const ROW3 = 340;
const STAFF_NODE_WIDTH = 148;
const STAFF_GAP_X = 36;
/** Half of typical card width for horizontal centering */
const NODE_X_OFFSET = 80;

export const DepartmentOrgChart: React.FC<DepartmentOrgChartProps> = ({
  departmentName,
  managerName,
  staffItems,
  selection,
  activeHighlight = null,
  processingHighlight = null,
  onSelect,
  onPaneClick,
  onAddStaff,
  onOpenSkillLibrary,
  onOpenVirtualOffice,
  labels,
  className = "",
}) => {
  const initialNodes = useMemo((): Node[] => {
    const teamSel = selection === "team";
    const mgrSel = selection === "manager";
    const mgrActive = activeHighlight === "manager";
    const mgrProcessing = processingHighlight === "manager";
    const nodes: Node[] = [
      {
        id: "dept",
        type: "orgCard",
        position: { x: CENTER - NODE_X_OFFSET, y: ROW1 },
        data: {
          variant: "dept" as const,
          title: departmentName || "—",
          selected: teamSel,
          active: false,
          processing: false,
          badge: labels.badgeDepartment,
        },
        draggable: false,
        selectable: true,
      },
      {
        id: "manager",
        type: "orgCard",
        position: { x: CENTER - NODE_X_OFFSET, y: ROW2 },
        data: {
          variant: "manager" as const,
          title: managerName || "—",
          selected: mgrSel,
          active: mgrActive,
          processing: mgrProcessing,
          badge: labels.badgeManager,
        },
        draggable: false,
        selectable: true,
      },
    ];

    const n = staffItems.length;
    const total =
      n * STAFF_NODE_WIDTH + Math.max(0, n - 1) * STAFF_GAP_X;
    const startX = CENTER - total / 2;

    staffItems.forEach((s, i) => {
      const isSel = selection === s.id;
      const isActive = activeHighlight === s.id;
      const isProcessing = processingHighlight === s.id;
      nodes.push({
        id: `staff-${s.id}`,
        type: "orgCard",
        position: {
          x: startX + i * (STAFF_NODE_WIDTH + STAFF_GAP_X),
          y: ROW3,
        },
        data: {
          variant: "staff" as const,
          title: s.label,
          subtitle: s.subtitle,
          ...(s.activity ? { activity: s.activity } : {}),
          selected: isSel,
          active: isActive,
          processing: isProcessing,
          badge: labels.badgeStaff,
        },
        draggable: false,
        selectable: true,
      });
    });

    return nodes;
  }, [
    departmentName,
    managerName,
    staffItems,
    selection,
    activeHighlight,
    processingHighlight,
    labels,
  ]);

  const initialEdges = useMemo((): Edge[] => {
    const edges: Edge[] = [
      {
        id: "e-dept-mgr",
        source: "dept",
        sourceHandle: "out",
        target: "manager",
        targetHandle: "in",
        type: "smoothstep",
        animated: true,
        style: { stroke: "#818CF8", strokeWidth: 2 },
      },
    ];
    staffItems.forEach((s) => {
      edges.push({
        id: `e-mgr-${s.id}`,
        source: "manager",
        sourceHandle: "out",
        target: `staff-${s.id}`,
        targetHandle: "in",
        type: "smoothstep",
        animated: true,
        style: { stroke: "#94A3B8", strokeWidth: 1.75 },
      });
    });
    return edges;
  }, [staffItems]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  useEffect(() => {
    setNodes(initialNodes);
  }, [initialNodes, setNodes]);

  useEffect(() => {
    setEdges(initialEdges);
  }, [initialEdges, setEdges]);

  const onInit = useCallback((instance: ReactFlowInstance) => {
    instance.fitView({ padding: 0.15, maxZoom: 1.25, minZoom: 0.5 });
  }, []);

  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      if (node.id === "dept") {
        onSelect("team");
        return;
      }
      if (node.id === "manager") {
        onSelect("manager");
        return;
      }
      if (node.id.startsWith("staff-")) {
        onSelect(node.id.replace(/^staff-/, ""));
      }
    },
    [onSelect],
  );

  return (
    <div
      className={`h-full min-h-[280px] w-full border border-gray-200 rounded-xl bg-slate-50/80 overflow-hidden ${className}`}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        onPaneClick={onPaneClick}
        nodeTypes={nodeTypes}
        onInit={onInit}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
        panOnScroll
        zoomOnScroll
        minZoom={0.4}
        maxZoom={1.5}
        proOptions={{ hideAttribution: true }}
      >
        <Background />
        <Controls showInteractive={false} />
        {(onAddStaff || onOpenSkillLibrary || onOpenVirtualOffice) && (
          <Panel position="top-right">
            <div className="flex flex-wrap items-center justify-end gap-2">
              {onOpenSkillLibrary && (
                <button
                  type="button"
                  onClick={onOpenSkillLibrary}
                  className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm font-medium text-blue-700 shadow-sm transition-colors hover:bg-blue-50 hover:border-blue-300"
                  aria-label={labels.skillLibrary}
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-blue-100 text-blue-700">
                    <Library className="h-4 w-4" strokeWidth={2} />
                  </span>
                  {labels.skillLibrary}
                </button>
              )}
              {onOpenVirtualOffice && (
                <button
                  type="button"
                  onClick={onOpenVirtualOffice}
                  className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm font-medium text-blue-700 shadow-sm transition-colors hover:bg-blue-50 hover:border-blue-300"
                  aria-label={labels.virtualOffice}
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-blue-100 text-blue-700">
                    <Building2 className="h-4 w-4" strokeWidth={2} />
                  </span>
                  {labels.virtualOffice}
                </button>
              )}
              {onAddStaff && (
                <button
                  type="button"
                  onClick={onAddStaff}
                  className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700"
                >
                  <Plus className="h-4 w-4 shrink-0" />
                  {labels.addStaff}
                </button>
              )}
            </div>
          </Panel>
        )}
        <Panel position="bottom-center">
          <p className="text-[10px] text-gray-400 pb-1">{labels.zoomHint}</p>
        </Panel>
      </ReactFlow>
    </div>
  );
};
