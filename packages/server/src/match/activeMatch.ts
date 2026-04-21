import type { WebSocket } from "ws";

import type { GameState } from "@rr/engine2";
import type {
  CreateMatchRequest,
  Order,
  OrderPacket,
  ProjectedView,
  ResolutionEvent,
  SubmitOrdersResponse,
  TickDebug,
  Tribe,
} from "@rr/shared";
import type { SpectatorView } from "@rr/shared";

export interface SlotInfo {
  tribe: Tribe;
  type: "human" | "llm" | "pass";
  displayName?: string;
  jwt?: string;
  joinedAt?: Date;
  llmConfig?: import("@rr/shared").LlmSlotConfig;
}

export interface TickBufferEntry {
  tickNumber: number;
  stateHash: string;
  spectatorView: SpectatorView;
  projectedViews: Record<Tribe, ProjectedView>;
  events: ResolutionEvent[];
  packetsByTribe: Record<Tribe, OrderPacket>;
}

export interface SubmittedOrderEntry {
  clientPacketId: string;
  tick: number;
  orders: Order[];
  acceptedResponse: SubmitOrdersResponse;
}

export class ActiveMatch {
  id: string;
  slotConfig: CreateMatchRequest;
  state: GameState;
  slots: Map<Tribe, SlotInfo>;
  submittedOrders: Map<Tribe, SubmittedOrderEntry>;
  tickBuffer: TickBufferEntry[];
  debugBuffer: TickDebug[];
  tickTimeoutTimer: ReturnType<typeof setTimeout> | null = null;
  spectatorSockets: Set<WebSocket> = new Set();
  debugSockets: Set<WebSocket> = new Set();
  playerSockets: Map<Tribe, WebSocket> = new Map();
  status: "lobby" | "running" | "finished";
  autoPlay: boolean;
  tickTimeoutSeconds: number;
  acceptingWork = true;

  private _lock: Promise<void> = Promise.resolve();

  constructor(
    id: string,
    slotConfig: CreateMatchRequest,
    state: GameState,
    slots: Map<Tribe, SlotInfo>,
    autoPlay: boolean,
    tickTimeoutSeconds: number,
  ) {
    this.id = id;
    this.slotConfig = slotConfig;
    this.state = state;
    this.slots = slots;
    this.submittedOrders = new Map();
    this.tickBuffer = [];
    this.debugBuffer = [];
    this.status = autoPlay ? "running" : "lobby";
    this.autoPlay = autoPlay;
    this.tickTimeoutSeconds = tickTimeoutSeconds;
  }

  async withLock<T>(op: () => Promise<T>): Promise<T> {
    const prev = this._lock;
    let release!: () => void;
    this._lock = new Promise((r) => {
      release = r;
    });
    try {
      await prev;
      return await op();
    } finally {
      release();
    }
  }
}
