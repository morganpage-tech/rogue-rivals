import { describe, expect, it } from "vitest";

import {
  CONTINENT_6P_REGION_LAYOUT,
  EXPANDED_REGION_LAYOUT,
  HAND_MINIMAL_REGION_LAYOUT,
} from "../v2/mapData.js";
import {
  getSpectatorMapKind,
  getSpectatorMapLayout,
  isContinent6pSpectator,
} from "./spectatorMapLayout.js";

const HAND_MINIMAL_IDS = Object.keys(HAND_MINIMAL_REGION_LAYOUT);

describe("getSpectatorMapKind", () => {
  it("prefers hand_minimal over continent markers when both appear", () => {
    expect(
      getSpectatorMapKind(["r_orange_plains", "r_core_moon_ford"]),
    ).toBe("hand_minimal");
  });
});

describe("isContinent6pSpectator", () => {
  it("is true when a core 6p region id is present", () => {
    expect(isContinent6pSpectator(["r_core_moon_ford"])).toBe(true);
    expect(isContinent6pSpectator(["r_orange_plains"])).toBe(false);
  });
});

describe("getSpectatorMapLayout", () => {
  it("resolves hand-minimal regions to replay layout coordinates", () => {
    const layout = getSpectatorMapLayout(HAND_MINIMAL_IDS);
    expect(layout).not.toBeNull();
    expect(layout!.r_orange_plains).toEqual([0, 0]);
    expect(layout!.r_ruins_center).toEqual([300, 0]);
    expect(layout!.r_red_desert).toEqual([600, 200]);
    expect(Object.keys(layout!).sort()).toEqual([...HAND_MINIMAL_IDS].sort());
  });

  it("returns only coordinates for ids present in the snapshot", () => {
    const subset = ["r_orange_plains", "r_grey_mountains", "r_desert_wastes"];
    const layout = getSpectatorMapLayout(subset);
    expect(layout).not.toBeNull();
    expect(Object.keys(layout!).sort()).toEqual([...subset].sort());
    expect(layout!.r_brown_swamps).toBeUndefined();
  });

  it("resolves expanded map when r_or_plains is present", () => {
    const expandedSample = [
      "r_or_plains",
      "r_gr_mountains",
      "r_dark_forest",
      "r_rd_desert",
    ];
    const layout = getSpectatorMapLayout(expandedSample);
    expect(layout).not.toBeNull();
    expect(layout!.r_or_plains).toEqual(EXPANDED_REGION_LAYOUT.r_or_plains);
    expect(layout!.r_rd_desert).toEqual(EXPANDED_REGION_LAYOUT.r_rd_desert);
  });

  it("resolves 6p-continent when core region ids appear", () => {
    const ids = ["r_core_foxfire_ruins", "r_border_snowpine_reach"];
    const layout = getSpectatorMapLayout(ids);
    expect(layout).not.toBeNull();
    expect(layout!.r_core_foxfire_ruins).toEqual(CONTINENT_6P_REGION_LAYOUT.r_core_foxfire_ruins);
    expect(layout!.r_border_snowpine_reach).toEqual(
      CONTINENT_6P_REGION_LAYOUT.r_border_snowpine_reach,
    );
  });

  it("detects 6p via r_core_moon_ford when foxfire is absent", () => {
    const layout = getSpectatorMapLayout(["r_core_moon_ford"]);
    expect(layout).not.toBeNull();
    expect(layout!.r_core_moon_ford).toEqual(CONTINENT_6P_REGION_LAYOUT.r_core_moon_ford);
  });

  it("returns null for unknown region sets", () => {
    expect(getSpectatorMapLayout(["r_unknown_region"])).toBeNull();
    expect(getSpectatorMapLayout([])).toBeNull();
  });

  it("prefers hand-minimal when r_orange_plains is present (even if other ids are foreign)", () => {
    const layout = getSpectatorMapLayout(["r_orange_plains", "r_not_in_minimal"]);
    expect(layout).not.toBeNull();
    expect(layout!.r_orange_plains).toEqual([0, 0]);
    expect(layout!.r_not_in_minimal).toBeUndefined();
  });
});
