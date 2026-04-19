"""Render a GameState's map to a standalone HTML+SVG file.

Usage:
    python -m tools.v2.render_map --which minimal --out maps/minimal.html
    python -m tools.v2.render_map --which expanded --out maps/expanded.html
"""

from __future__ import annotations

import argparse
import html
from pathlib import Path
from typing import Dict, List, Tuple

from .mapgen import (
    MINIMAL_REGION_LAYOUT,
    EXPANDED_REGION_LAYOUT,
    build_expanded_map,
    build_hand_map,
    place_tribes,
    place_tribes_expanded,
)
from .state import GameState


TRIBES_4 = ["orange", "grey", "brown", "red"]


TERRAIN_FILL: Dict[str, str] = {
    "plains": "#d7c87a",
    "mountains": "#8a8a8a",
    "swamps": "#5a7a4a",
    "desert": "#d8a864",
    "ruins": "#6a4a8a",
    "river_crossing": "#4a8ad7",
    "forest": "#2e6b3b",
}

TRIBE_STROKE: Dict[str, str] = {
    "orange": "#ff8800",
    "grey":   "#6c6c6c",
    "brown":  "#6b3f1f",
    "red":    "#c13030",
}


def render_svg(state: GameState, layout: Dict[str, Tuple[int, int]]) -> str:
    """Render regions + trails to an SVG string."""
    xs = [p[0] for p in layout.values()]
    ys = [p[1] for p in layout.values()]
    pad = 80
    w = max(xs) - min(xs) + 2 * pad
    h = max(ys) - min(ys) + 2 * pad

    def tx(x: int) -> int:
        return x - min(xs) + pad

    def ty(y: int) -> int:
        return y - min(ys) + pad

    parts: List[str] = []
    parts.append(
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" '
        f'style="background:#1a1a1a; font-family: \'SF Mono\', Menlo, monospace;">'
    )

    # Trails (behind regions)
    for trail in state.trails:
        if trail.a not in layout or trail.b not in layout:
            continue
        x1, y1 = layout[trail.a]
        x2, y2 = layout[trail.b]
        mx = (tx(x1) + tx(x2)) // 2
        my = (ty(y1) + ty(y2)) // 2
        parts.append(
            f'<line x1="{tx(x1)}" y1="{ty(y1)}" x2="{tx(x2)}" y2="{ty(y2)}" '
            f'stroke="#555" stroke-width="3" stroke-dasharray="6,4"/>'
        )
        parts.append(
            f'<rect x="{mx-12}" y="{my-10}" width="24" height="18" '
            f'rx="4" fill="#1a1a1a" stroke="#777"/>'
        )
        parts.append(
            f'<text x="{mx}" y="{my+3}" fill="#ddd" font-size="11" '
            f'text-anchor="middle">{trail.base_length_ticks}t</text>'
        )

    # Regions
    for rid, (x, y) in layout.items():
        region = state.regions[rid]
        fill = TERRAIN_FILL.get(region.type, "#444")
        owner = region.owner
        stroke = TRIBE_STROKE.get(owner or "", "#222")
        stroke_width = 4 if owner else 1.5
        tx_, ty_ = tx(x), ty(y)

        parts.append(
            f'<circle cx="{tx_}" cy="{ty_}" r="42" fill="{fill}" '
            f'stroke="{stroke}" stroke-width="{stroke_width}"/>'
        )
        # Region short id (strip prefix)
        short = rid.removeprefix("r_")
        parts.append(
            f'<text x="{tx_}" y="{ty_-4}" fill="#fff" font-size="10" '
            f'font-weight="bold" text-anchor="middle" '
            f'style="text-shadow: 0 1px 2px #000;">{html.escape(short)}</text>'
        )
        parts.append(
            f'<text x="{tx_}" y="{ty_+10}" fill="#eee" font-size="9" '
            f'text-anchor="middle" style="text-shadow: 0 1px 2px #000;">'
            f'{region.type}</text>'
        )
        if owner:
            parts.append(
                f'<text x="{tx_}" y="{ty_+26}" fill="{TRIBE_STROKE[owner]}" '
                f'font-size="10" font-weight="bold" text-anchor="middle" '
                f'style="text-shadow: 0 1px 2px #000;">{owner.upper()}</text>'
            )
        if region.structures:
            parts.append(
                f'<text x="{tx_}" y="{ty_-28}" fill="#ffd" font-size="9" '
                f'text-anchor="middle">[{",".join(region.structures)}]</text>'
            )

    parts.append("</svg>")
    return "\n".join(parts)


def render_html(state: GameState, layout: Dict[str, Tuple[int, int]], title: str) -> str:
    svg = render_svg(state, layout)
    region_count = len(state.regions)
    trail_count = len(state.trails)

    # Legend
    legend_rows = "\n".join(
        f'<li><span style="display:inline-block;width:14px;height:14px;'
        f'background:{color};border:1px solid #333;margin-right:6px;'
        f'vertical-align:middle;"></span>{terrain}</li>'
        for terrain, color in TERRAIN_FILL.items()
    )
    tribe_rows = "\n".join(
        f'<li><span style="display:inline-block;width:14px;height:14px;'
        f'background:transparent;border:3px solid {color};margin-right:6px;'
        f'vertical-align:middle;"></span>{tribe}</li>'
        for tribe, color in TRIBE_STROKE.items()
    )

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>{html.escape(title)}</title>
<style>
  body {{
    background:#1a1a1a; color:#e0e0e0;
    font-family: 'SF Mono', Menlo, monospace;
    margin: 0; padding: 24px;
  }}
  h1 {{ margin: 0 0 8px 0; font-weight: 500; }}
  p.meta {{ color:#999; margin: 0 0 24px 0; }}
  .wrap {{ display: flex; gap: 24px; align-items: flex-start; }}
  .map {{ flex: 1 1 auto; background: #111; border: 1px solid #333;
          border-radius: 6px; padding: 8px; overflow:auto; }}
  .legend {{ flex: 0 0 200px; background: #222; border: 1px solid #333;
             border-radius: 6px; padding: 12px 18px; }}
  .legend h3 {{ margin-top: 12px; margin-bottom: 6px; font-size: 13px;
                color:#ccc; text-transform: uppercase; letter-spacing: .05em; }}
  .legend ul {{ list-style:none; margin:0; padding:0; font-size:13px; }}
  .legend li {{ padding: 2px 0; }}
</style>
</head>
<body>
  <h1>{html.escape(title)}</h1>
  <p class="meta">{region_count} regions &bull; {trail_count} trails &bull;
     number on trail = base travel ticks</p>
  <div class="wrap">
    <div class="map">{svg}</div>
    <div class="legend">
      <h3>Terrain</h3>
      <ul>{legend_rows}</ul>
      <h3>Tribe ring colour</h3>
      <ul>{tribe_rows}</ul>
      <h3>Notes</h3>
      <p style="font-size:12px;color:#aaa;margin:0;">
        Dashed lines are trails. Rings show tribe ownership.
        Starting structures (e.g. fort, road) appear in yellow above the disc.
      </p>
    </div>
  </div>
</body>
</html>
"""


def build_state(which: str) -> Tuple[GameState, Dict[str, Tuple[int, int]]]:
    state = GameState(seed=1)
    if which == "minimal":
        build_hand_map(state)
        place_tribes(state, TRIBES_4)
        return state, MINIMAL_REGION_LAYOUT
    if which == "expanded":
        build_expanded_map(state)
        place_tribes_expanded(state, TRIBES_4)
        return state, EXPANDED_REGION_LAYOUT
    raise ValueError(f"unknown map {which!r}")


def main() -> int:
    p = argparse.ArgumentParser(description="Render a Rogue Rivals v2 map to HTML")
    p.add_argument("--which", choices=["minimal", "expanded"], default="minimal")
    p.add_argument("--out", type=Path, required=True)
    args = p.parse_args()

    state, layout = build_state(args.which)
    title = f"Rogue Rivals v2 \u2013 {args.which} map"
    html_text = render_html(state, layout, title)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(html_text, encoding="utf-8")
    print(f"wrote {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
