export const MAX_COLUMNS = 16;
export const MAX_HEIGHT = 8;
export const PRESETS = {
  classic: [0, 1, 0, 2, 1, 0, 1, 3, 2, 1, 2, 1],
  basin: [4, 2, 0, 3, 2, 5],
  flat: [2, 2, 2, 2, 2, 2, 2, 2]
};

// A frame is the state after one complete iteration of the article's C loop.
export function traceRainWater(heights) {
  if (!Array.isArray(heights) || heights.length > MAX_COLUMNS ||
      heights.some(value => !Number.isInteger(value) || value < 0 || value > MAX_HEIGHT)) {
    throw new RangeError(`Expected at most ${MAX_COLUMNS} integer heights between 0 and ${MAX_HEIGHT}`);
  }
  let l = 0;
  let r = heights.length - 1;
  let lMax = 0;
  let rMax = 0;
  let total = 0;
  const water = Array(heights.length).fill(0);
  const settled = Array(heights.length).fill(false);
  const frames = [{l, r, lMax, rMax, total, water: [...water], settled: [...settled], index: null, side: null, added: 0}];
  while (l < r) {
    lMax = Math.max(lMax, heights[l]);
    rMax = Math.max(rMax, heights[r]);
    const side = lMax > rMax ? 'right' : 'left';
    const index = side === 'right' ? r : l;
    const boundary = side === 'right' ? rMax : lMax;
    const added = boundary - heights[index];
    water[index] = added;
    settled[index] = true;
    total += added;
    if (side === 'right') r--;
    else l++;
    frames.push({l, r, lMax, rMax, total, water: [...water], settled: [...settled], index, side, boundary, added});
  }
  return frames;
}
