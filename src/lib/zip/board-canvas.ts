/**
 * Shared Zip board canvas logic: layout, hit-testing, and painting.
 * Used by create, play, and solution viewer.
 */

import { BLOCKED, GRID_SIZE_MAX, GRID_SIZE_MIN } from "@/lib/zip/validate";

export { BLOCKED };

export interface ZipBoardTheme {
  pad: number;
  gap: number;
  boardRadius: number;
  gridLineWidth: number;
  boardBorderWidth: number;
  gridStrokeStyle: string;
  pathWidthRatio: number;
  waypointRadiusRatio: number;
}

export const ZIP_BOARD_DEFAULT_THEME: ZipBoardTheme = {
  pad: 0,
  gap: 0,
  boardRadius: 12,
  gridLineWidth: 2,
  boardBorderWidth: 3,
  gridStrokeStyle: "#a1a1aa",
  pathWidthRatio: 0.58,
  waypointRadiusRatio: 0.38,
};

/** Slightly smaller styling for solution thumbnails. */
export const ZIP_BOARD_SOLUTION_THEME: ZipBoardTheme = {
  ...ZIP_BOARD_DEFAULT_THEME,
  boardRadius: 8,
  gridLineWidth: 1.5,
  boardBorderWidth: 2,
};

/** Cell size for main game/create (larger). */
export function zipBoardCellSize(size: number): number {
  if (size >= GRID_SIZE_MIN && size <= GRID_SIZE_MAX) {
    return Math.round(72 - (size - 4) * 8);
  }
  return 44;
}

/** Cell size for solution viewer (smaller). */
export function zipBoardSolutionCellSize(size: number): number {
  if (size >= GRID_SIZE_MIN && size <= GRID_SIZE_MAX) {
    return Math.round(44 - (size - 4) * 4);
  }
  return 28;
}

export function zipBoardLogicalSize(
  size: number,
  theme: ZipBoardTheme,
  getCellSize: (s: number) => number = zipBoardCellSize,
): number {
  const cs = getCellSize(size);
  return theme.pad * 2 + size * cs + (size - 1) * theme.gap;
}

export function zipBoardGetCellFromPoint(
  canvasX: number,
  canvasY: number,
  size: number,
  theme: ZipBoardTheme,
  getCellSize: (s: number) => number = zipBoardCellSize,
): number | null {
  const cs = getCellSize(size);
  const row = Math.floor((canvasY - theme.pad) / (cs + theme.gap));
  const col = Math.floor((canvasX - theme.pad) / (cs + theme.gap));
  if (row < 0 || row >= size || col < 0 || col >= size) return null;
  return row * size + col;
}

export function zipBoardGetCellCenter(
  index: number,
  size: number,
  theme: ZipBoardTheme,
  getCellSize: (s: number) => number = zipBoardCellSize,
): { x: number; y: number } {
  const cs = getCellSize(size);
  const r = Math.floor(index / size);
  const c = index % size;
  return {
    x: theme.pad + c * (cs + theme.gap) + cs / 2,
    y: theme.pad + r * (cs + theme.gap) + cs / 2,
  };
}

export interface PaintZipBoardOptions {
  /** When true and path.length === 1, fill start cell with #ffedd5 */
  highlightStartCell?: boolean;
  /** Stable seed (e.g. chain + userId) for deterministic path gradient colors per game/user */
  gradientSeed?: string;
}

const PATH_GRADIENT_START = "#f97316";
const PATH_GRADIENT_END = "#9a3412";

/** Deterministic hash of a string to a number (djb2). */
function hashString(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h) ^ s.charCodeAt(i);
  }
  return h >>> 0;
}

/** HSL to hex (h 0–360, s and l 0–100). */
function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
  };
  const r = Math.round(f(0) * 255);
  const g = Math.round(f(8) * 255);
  const b = Math.round(f(4) * 255);
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

/**
 * Returns a stable gradient (start, end) for a seed string (e.g. chain + "\0" + userId).
 * Same seed always gives the same colors; different games/users get different colors.
 */
export function getGradientColorsForSeed(seed: string): {
  start: string;
  end: string;
} {
  const h = hashString(seed);
  const hue = h % 360;
  const hueEnd = (hue + 70 + (h % 40)) % 360;
  return {
    start: hslToHex(hue, 72, 52),
    end: hslToHex(hueEnd, 68, 38),
  };
}

/** Interpolate between two hex colors; t in [0, 1]. */
function lerpHex(hexStart: string, hexEnd: string, t: number): string {
  const parse = (hex: string) => {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
  };
  const [r0, g0, b0] = parse(hexStart);
  const [r1, g1, b1] = parse(hexEnd);
  const r = Math.round(r0 + (r1 - r0) * t);
  const g = Math.round(g0 + (g1 - g0) * t);
  const b = Math.round(b0 + (b1 - b0) * t);
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

/**
 * Paint the Zip board (background, cells, path, waypoints, border).
 * Caller must set canvas size and ctx.scale(dpr) before calling.
 */
export function paintZipBoard(
  ctx: CanvasRenderingContext2D,
  size: number,
  board: number[],
  path: number[],
  theme: ZipBoardTheme,
  options: PaintZipBoardOptions & {
    getCellSize?: (s: number) => number;
  } = {},
): void {
  const getCellSize = options.getCellSize ?? zipBoardCellSize;
  const cs = getCellSize(size);
  const totalW = theme.pad * 2 + size * cs + (size - 1) * theme.gap;
  const totalH = totalW;
  const highlightStart = options.highlightStartCell ?? false;
  const pathColors = options.gradientSeed
    ? getGradientColorsForSeed(options.gradientSeed)
    : { start: PATH_GRADIENT_START, end: PATH_GRADIENT_END };

  const center = (index: number) =>
    zipBoardGetCellCenter(index, size, theme, getCellSize);

  ctx.save();
  ctx.beginPath();
  ctx.roundRect(0, 0, totalW, totalH, theme.boardRadius);
  ctx.clip();

  ctx.fillStyle = "#f4f4f5";
  ctx.fillRect(0, 0, totalW, totalH);

  for (let i = 0; i < size * size; i++) {
    const r = Math.floor(i / size);
    const c = i % size;
    const x = theme.pad + c * (cs + theme.gap);
    const y = theme.pad + r * (cs + theme.gap);
    if (board[i] === BLOCKED) {
      ctx.fillStyle = "#3f3f46";
      ctx.fillRect(x, y, cs, cs);
    } else {
      ctx.fillStyle = "#fff";
      ctx.fillRect(x, y, cs, cs);
      ctx.strokeStyle = theme.gridStrokeStyle;
      ctx.lineWidth = theme.gridLineWidth;
      ctx.strokeRect(x, y, cs, cs);
    }
  }

  if (path.length === 1 && highlightStart) {
    const startIdx = path[0];
    const r = Math.floor(startIdx / size);
    const c = startIdx % size;
    const x = theme.pad + c * (cs + theme.gap);
    const y = theme.pad + r * (cs + theme.gap);
    ctx.fillStyle = "#ffedd5";
    ctx.fillRect(x, y, cs, cs);
    ctx.strokeStyle = theme.gridStrokeStyle;
    ctx.lineWidth = theme.gridLineWidth;
    ctx.strokeRect(x, y, cs, cs);
  }

  if (path.length > 0) {
    const pts = path.map((i) => center(i));
    const lw = cs * theme.pathWidthRatio;
    ctx.lineWidth = lw;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (path.length === 1) {
      ctx.fillStyle = pathColors.start;
      ctx.beginPath();
      ctx.arc(pts[0].x, pts[0].y, lw / 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Subdivide each segment so color lerps smoothly along the path (stable as path grows)
      const n = pts.length - 1;
      const subdivisions = 16;
      for (let i = 0; i < n; i++) {
        const ax = pts[i].x;
        const ay = pts[i].y;
        const bx = pts[i + 1].x;
        const by = pts[i + 1].y;
        for (let j = 0; j < subdivisions; j++) {
          const j0 = j / subdivisions;
          const j1 = (j + 1) / subdivisions;
          const progress = (i + (j + 0.5) / subdivisions) / n;
          ctx.strokeStyle = lerpHex(pathColors.start, pathColors.end, progress);
          ctx.beginPath();
          ctx.moveTo(ax + (bx - ax) * j0, ay + (by - ay) * j0);
          ctx.lineTo(ax + (bx - ax) * j1, ay + (by - ay) * j1);
          ctx.stroke();
        }
      }
    }
  }

  for (let i = 0; i < size * size; i++) {
    const val = board[i];
    if (typeof val !== "number" || val <= 0) continue;
    const { x, y } = center(i);
    const rad = cs * theme.waypointRadiusRatio;
    ctx.fillStyle = "#18181b";
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = `bold ${Math.round(rad * 1.1)}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(val), x, y);
  }

  ctx.restore();

  ctx.strokeStyle = theme.gridStrokeStyle;
  ctx.lineWidth = theme.boardBorderWidth;
  ctx.beginPath();
  ctx.roundRect(0, 0, totalW, totalH, theme.boardRadius);
  ctx.stroke();
}
