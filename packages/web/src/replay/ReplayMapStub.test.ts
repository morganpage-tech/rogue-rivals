import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { REPLAY_TRIBE_STROKE } from "./replayTheme.js";
import { ReplayMapStub } from "./ReplayMapStub.js";
import type { ReplayFrame } from "./types.js";

describe("ReplayMapStub", () => {
  it("renders an SVG circle per layout id with tribe stroke from region owner", () => {
    const frame = {
      state: {
        regions: {
          r_orange_plains: { owner: "orange" },
          r_grey_mountains: { owner: "grey" },
        },
      },
    } as ReplayFrame;
    const layout = {
      r_orange_plains: [0, 0] as const,
      r_grey_mountains: [100, 0] as const,
    };

    const html = renderToStaticMarkup(createElement(ReplayMapStub, { frame, layout }));

    expect(html).toContain("<svg");
    expect(html).toContain('stroke="' + REPLAY_TRIBE_STROKE.orange + '"');
    expect(html).toContain('stroke="' + REPLAY_TRIBE_STROKE.grey + '"');
    expect(html.split("<circle").length - 1).toBe(2);
  });

  it("uses neutral stroke when owner is missing", () => {
    const frame = { state: { regions: { r_a: {} } } } as ReplayFrame;
    const layout = { r_a: [0, 0] as const };
    const html = renderToStaticMarkup(createElement(ReplayMapStub, { frame, layout }));
    expect(html).toContain('stroke="#444"');
  });
});
