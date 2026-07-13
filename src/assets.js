// Sprite-sheet loader with graceful failure (the game falls back to
// procedural art if the image can't be loaded).
export class SpriteSheet {
  constructor(src) {
    this.loaded = false;
    this.error = false;
    this.img = new Image();
    this.img.onload = () => { this.loaded = true; };
    this.img.onerror = () => { this.error = true; };
    this.img.src = src;
  }

  ready() { return this.loaded && !this.error; }

  // Draw source rect [sx,sy,sw,sh] centred at (dx,dy), scaled uniformly.
  drawFrame(ctx, frame, dx, dy, scale) {
    if (!this.ready()) return false;
    const [sx, sy, sw, sh] = frame;
    const w = sw * scale, h = sh * scale;
    const prev = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = true; // smooth downscale for the illustrated sprite
    ctx.drawImage(this.img, sx, sy, sw, sh, dx - w / 2, dy - h / 2, w, h);
    ctx.imageSmoothingEnabled = prev;
    return true;
  }
}
