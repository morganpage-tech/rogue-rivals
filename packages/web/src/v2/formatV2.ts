import type { Tribe } from "@rr/shared";
import { REGION_DISPLAY_NAME } from "./mapData.js";

const TRIBE_LABEL: Record<Tribe, string> = {
  orange: "Orange",
  grey: "Grey",
  brown: "Brown",
  red: "Red",
  tricoloured: "Tricoloured",
  arctic: "Arctic",
};

export function tribeLabel(t: Tribe): string {
  return TRIBE_LABEL[t] ?? t;
}

/** `r_or_vulpgard` → "Vulpgard", `r_core_moon_ford` → "Moon Ford" */
export function regionShortName(regionId: string): string {
  const base = regionId.replace(/^r_/, "");
  const segs = base.split("_").slice(1);
  const tail = segs.length >= 2 ? segs.slice(-2) : segs;
  return tail
    .join(" ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Map label for UI: 6p overrides in `mapData.REGION_DISPLAY_NAME`, else `regionShortName`. */
export function regionDisplayName(regionId: string): string {
  const o = REGION_DISPLAY_NAME[regionId as keyof typeof REGION_DISPLAY_NAME];
  return o ?? regionShortName(regionId);
}

/**
 * In-transit army chip (tribe is shown by the pill color; no `OR`/`GR` code prefix).
 * `T2 → Howling Pass · 1t`
 */
export function transitToDestinationBadge(
  destRegionId: string,
  tier: number,
  ticksRemaining: number,
): string {
  return `T${tier} → ${regionDisplayName(destRegionId)} · ${ticksRemaining}t`;
}

/** Rough SVG <rect> width for a single-line 10px label (avoids pill clipping). */
export function estimateTransitBadgeWidth(label: string, fontSize = 10): number {
  return Math.min(400, Math.max(64, 18 + 0.58 * fontSize * label.length));
}
