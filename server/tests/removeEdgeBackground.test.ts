import { describe, it, expect } from "vitest";
import { removeEdgeBackground } from "../src/media/icons.js";

/** 40x40 white image with a red disc (r=15) that has a white dot (r=4) in its centre - like a like/share button on white. */
function buttonOnWhite(): Uint8Array {
  const size = 40;
  const px = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x + 0.5 - 20, y + 0.5 - 20);
      const [r, g, b] = d < 4 ? [255, 255, 255] : d < 15 ? [229, 58, 30] : [255, 255, 255];
      px.set([r, g, b, 255], (y * size + x) * 4);
    }
  }
  return px;
}

describe("removeEdgeBackground", () => {
  const alphaAt = (px: Uint8Array, x: number, y: number) => px[(y * 40 + x) * 4 + 3];

  it("makes the white area around the shape transparent", () => {
    const px = removeEdgeBackground(buttonOnWhite(), 40, 40);
    expect(alphaAt(px, 0, 0)).toBe(0);
    expect(alphaAt(px, 39, 39)).toBe(0);
    expect(alphaAt(px, 20, 2)).toBe(0); // above the disc
  });

  it("keeps the shape and white enclosed inside it (icon glyph / button text)", () => {
    const px = removeEdgeBackground(buttonOnWhite(), 40, 40);
    expect(alphaAt(px, 20, 10)).toBe(255); // red ring
    expect(alphaAt(px, 20, 20)).toBe(255); // white centre dot, not connected to the border
    expect(Array.from(px.slice((20 * 40 + 20) * 4, (20 * 40 + 20) * 4 + 3))).toEqual([255, 255, 255]);
  });
});
