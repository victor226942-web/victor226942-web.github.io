// Desenho dos QRs no navegador (PNG com logo e legenda, SVG) e tratamento de logos.
// Usa a biblioteca qrcode-generator (vendor/qrcode.min.js), carregada antes como script comum.
import { DEST_TYPES, UserError } from "./core.js";

/* global qrcode */
qrcode.stringToBytes = qrcode.stringToBytesFuncs["UTF-8"]; // acentos (ex.: nome de rede "Padaria São José")

const BOX = 12;
const BORDER = 4;
const LOGO_RATIO = 0.22; // largura da logo em relacao ao QR (seguro com correcao H)
export const LOGO_MAX_BYTES = 2 * 1024 * 1024;

function modules(text) {
  const q = qrcode(0, "H"); // H = 30% de correcao: o QR continua legivel com a logo no centro
  q.addData(text, "Byte");
  q.make();
  return { n: q.getModuleCount(), dark: (r, c) => q.isDark(r, c) };
}

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new UserError("Imagem inválida (use PNG, JPG ou WEBP)"));
    img.src = src;
  });
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** QR em canvas: modulos pretos, logo opcional no centro e legenda embaixo (ex.: "#007  UH9UD4"). */
export function qrCanvas(text, { logo = null, caption = "" } = {}) {
  const { n, dark } = modules(text);
  const size = (n + BORDER * 2) * BOX;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size + (caption ? BOX * 2 : 0);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#000";
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) if (dark(r, c)) ctx.fillRect((c + BORDER) * BOX, (r + BORDER) * BOX, BOX, BOX);
  }
  if (logo) {
    const s = Math.floor(size * LOGO_RATIO);
    const pad = Math.floor(s / 8);
    const pos = Math.floor((size - s) / 2);
    ctx.fillStyle = "#fff"; // fundo branco atras da logo, para ela nao se misturar aos modulos
    roundRect(ctx, pos - pad, pos - pad, s + pad * 2, s + pad * 2, pad * 2);
    ctx.fill();
    ctx.drawImage(logo, pos, pos, s, s);
  }
  if (caption) {
    let fs = BOX * 3;
    const font = (px) => `500 ${px}px Inter, "DejaVu Sans", Arial, sans-serif`;
    ctx.font = font(fs);
    while (ctx.measureText(caption).width > size - BOX * 2 && fs > 12) ctx.font = font((fs -= 2));
    ctx.fillStyle = "#000";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(caption, size / 2, size - BOX);
  }
  return canvas;
}

export const canvasBlob = (canvas) => new Promise((resolve) => canvas.toBlob(resolve, "image/png"));

/** QR vetorial (para a grafica). logoPng = base64 do PNG da logo, ou null. */
export function qrSvg(text, logoPng = null) {
  const { n: inner, dark } = modules(text);
  const n = inner + BORDER * 2;
  let path = "";
  for (let r = 0; r < inner; r++) {
    for (let c = 0; c < inner; c++) if (dark(r, c)) path += `M${c + BORDER},${r + BORDER}h1v1h-1z`;
  }
  let extra = "";
  if (logoPng) {
    const size = n * LOGO_RATIO;
    const pad = size / 8;
    const pos = (n - size) / 2;
    extra = `<rect x='${(pos - pad).toFixed(3)}' y='${(pos - pad).toFixed(3)}' width='${(size + 2 * pad).toFixed(3)}'`
      + ` height='${(size + 2 * pad).toFixed(3)}' rx='${(pad * 2).toFixed(3)}' fill='#fff'/>`
      + `<image x='${pos.toFixed(3)}' y='${pos.toFixed(3)}' width='${size.toFixed(3)}' height='${size.toFixed(3)}'`
      + ` href='data:image/png;base64,${logoPng}'/>`;
  }
  return `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${n} ${n}' width='${n * 10}' height='${n * 10}'`
    + ` shape-rendering='crispEdges'><rect width='${n}' height='${n}' fill='#fff'/><path d='${path}' fill='#000'/>${extra}</svg>`;
}

// ---------------------------------------------------------------- logos

/** Icone pronto do tipo (branco sobre fundo colorido), o mesmo dos blocos da tela. */
export function typeIconSvg(kind) {
  const [, , bg, paths] = DEST_TYPES[kind];
  const fill = bg.startsWith("linear-gradient") ? "url(#g)" : bg;
  return "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' width='512' height='512'>"
    + "<defs><linearGradient id='g' x1='0' y1='1' x2='1' y2='0'><stop offset='0' stop-color='#f58529'/>"
    + "<stop offset='.5' stop-color='#dd2a7b'/><stop offset='1' stop-color='#8134af'/></linearGradient></defs>"
    + `<rect width='24' height='24' rx='6' fill='${fill}'/>`
    + "<g transform='translate(4.5 4.5) scale(.625)' fill='none' stroke='#fff' stroke-width='2.4'"
    + ` stroke-linecap='round' stroke-linejoin='round' color='#fff'>${paths}</g></svg>`;
}

const iconCache = new Map();
export function typeIconImage(kind) {
  if (!iconCache.has(kind)) {
    iconCache.set(kind, loadImage("data:image/svg+xml;charset=utf-8," + encodeURIComponent(typeIconSvg(kind))));
  }
  return iconCache.get(kind);
}

/** Valida a imagem enviada e devolve PNG quadrado (ate 512px) em base64. */
export async function normalizeLogo(file) {
  if (file.size > LOGO_MAX_BYTES) throw new UserError("Logo muito grande (máximo 2 MB)");
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const scale = Math.min(1, 512 / Math.max(img.width, img.height));
    const w = Math.round(img.width * scale);
    const h = Math.round(img.height * scale);
    const side = Math.max(w, h);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = side;
    canvas.getContext("2d").drawImage(img, (side - w) / 2, (side - h) / 2, w, h);
    return canvas.toDataURL("image/png").split(",")[1];
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function logoId(b64) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(b64));
  return Array.from(new Uint8Array(hash).slice(0, 8), (b) => b.toString(16).padStart(2, "0")).join("");
}

export const pngImage = (b64) => loadImage("data:image/png;base64," + b64);

export function download(data, filename) {
  const url = typeof data === "string" ? data : URL.createObjectURL(data);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  if (typeof data !== "string") setTimeout(() => URL.revokeObjectURL(url), 5000);
}
