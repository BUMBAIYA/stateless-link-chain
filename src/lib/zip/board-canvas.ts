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
    ctx.strokeStyle = "#ea580c";
    ctx.fillStyle = "#ea580c";
    ctx.lineWidth = cs * theme.pathWidthRatio;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(pts[i].x, pts[i].y);
    }
    ctx.stroke();
    if (path.length === 1) {
      ctx.beginPath();
      ctx.arc(
        pts[0].x,
        pts[0].y,
        (cs * theme.pathWidthRatio) / 2,
        0,
        Math.PI * 2,
      );
      ctx.fill();
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
