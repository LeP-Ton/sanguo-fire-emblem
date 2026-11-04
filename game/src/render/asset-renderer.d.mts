export function drawUnit(ctx: CanvasRenderingContext2D, assets: Record<string, unknown>, options: {
  x: number; y: number; scale?: number; state?: string; timeMs?: number;
  facing?: 'left' | 'right'; showBone?: boolean; loopOverride?: boolean;
}): unknown;
export function drawVfx(ctx: CanvasRenderingContext2D, image: CanvasImageSource, effect: unknown, options: {
  x?: number; y?: number; timeMs?: number; scale?: number; loop?: boolean;
}): void;
