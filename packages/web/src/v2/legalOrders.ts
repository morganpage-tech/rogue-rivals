import type {
  ForceTier,
  LegalOrderOption,
  Order,
  ProjectedView,
  Proposal,
  StructureKind,
} from "@rr/shared";

/** Whether a legal option starts at the given region (for map-driven filtering). Propose/respond always match. */
export function legalOptionMatchesRegion(
  opt: LegalOrderOption,
  regionId: string,
  view: ProjectedView,
): boolean {
  const p = opt.payload as Record<string, unknown>;
  switch (opt.kind) {
    case "move": {
      const forceId = p.forceId as string;
      const f = view.myForces.find((x) => x.id === forceId);
      const origin =
        f?.location.kind === "garrison" ? f.location.regionId : null;
      return origin === regionId;
    }
    case "recruit":
      return (p.regionId as string) === regionId;
    case "build": {
      const rid = p.regionId as string;
      return rid === regionId;
    }
    case "scout":
      return (p.fromRegionId as string) === regionId;
    case "propose":
    case "respond":
      return true;
    default:
      return true;
  }
}

/**
 * True when a scout order would not reveal new map tiles: v2 fog already includes every region
 * adjacent to any province you own, and scouts may only target adjacent regions — so the
 * destination is always already in `visibleRegions`.
 */
export function scoutOptionRedundantForMapIntel(
  view: ProjectedView,
  opt: LegalOrderOption,
): boolean {
  if (opt.kind !== "scout") return false;
  const target = opt.payload.targetRegionId as string;
  return target in view.visibleRegions;
}

/** Turn a legal-option row into a concrete `Order` (payloads are camelCase from `projectForPlayer`). */
export function orderFromLegalOption(opt: LegalOrderOption): Order {
  const p = opt.payload as Record<string, unknown>;
  switch (opt.kind) {
    case "move":
      return {
        kind: "move",
        forceId: p.forceId as string,
        destinationRegionId: p.destinationRegionId as string,
      };
    case "recruit":
      return {
        kind: "recruit",
        regionId: p.regionId as string,
        tier: p.tier as ForceTier,
      };
    case "build":
      return {
        kind: "build",
        regionId: p.regionId as string,
        structure: p.structure as StructureKind,
        ...(typeof p.roadTarget === "string" ? { roadTarget: p.roadTarget } : {}),
      };
    case "scout":
      return {
        kind: "scout",
        fromRegionId: p.fromRegionId as string,
        targetRegionId: p.targetRegionId as string,
      };
    case "propose":
      return {
        kind: "propose",
        proposal: p.proposal as Proposal,
      };
    case "respond":
      return {
        kind: "respond",
        proposalId: p.proposalId as string,
        response: p.response as "accept" | "decline",
      };
    default:
      throw new Error(`Unsupported legal option kind: ${String(opt.kind)}`);
  }
}
