import type { Tribe } from "@rr/shared";

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
