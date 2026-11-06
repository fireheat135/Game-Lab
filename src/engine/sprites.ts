// Sprite loading and color tinting. Sprites are drawn in white/gray, so one image serves every color.

export function loadSprite(name: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.src = `${import.meta.env.BASE_URL}assets/${name}.png`;
  return img.decode().then(() => img);
}

const tintCache = new Map<string, HTMLCanvasElement>();

/** Multiplies the sprite by `color` while keeping its alpha (cached per sprite × color). */
export function tinted(img: HTMLImageElement, color: string): HTMLCanvasElement {
  const id = `${img.src}|${color}`;
  const hit = tintCache.get(id);
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  const g = c.getContext("2d")!;
  g.drawImage(img, 0, 0);
  g.globalCompositeOperation = "multiply";
  g.fillStyle = color; g.fillRect(0, 0, c.width, c.height);
  g.globalCompositeOperation = "destination-in";
  g.drawImage(img, 0, 0);
  tintCache.set(id, c);
  return c;
}
