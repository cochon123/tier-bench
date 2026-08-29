export type BallotImageModel = {
  name: string;
  color: string;
  mark: string;
  maker: string;
  logo?: string;
};
export type BallotImageRow = { tier: string; color: string; models: BallotImageModel[] };

export const ballotImageWidth = 1720;
const padX = 40;
const headerH = 118;
const footerH = 42;
const labelW = 112;
const cardW = 286;
const cardH = 74;
const markSize = 48;
const gap = 14;
const cols = 5;
const rowPad = 22;
const scale = 3;

const logoColors: Record<string, string> = {
  Anthropic: "#f5efe9",
  OpenAI: "#050505",
  Google: "#050505",
  DeepSeek: "#4f6ff0",
  Meta: "#0866ff",
  xAI: "#050505",
  Mistral: "#f15a24",
  Qwen: "transparent",
  "Moonshot AI": "transparent",
  Xiaomi: "#ff6900",
  "Z.ai": "#171717",
};
const lightLogos = new Set(["OpenAI", "DeepSeek", "Meta", "xAI", "Mistral", "Xiaomi", "Z.ai"]);
const squareLogos = new Set(["Qwen", "Moonshot AI"]);

function rowHeight(count: number) {
  const lines = Math.max(1, Math.ceil(count / cols));
  return Math.max(148, rowPad * 2 + lines * cardH + (lines - 1) * gap);
}

export function ballotImageSize(rows: BallotImageRow[]) {
  const height = headerH + rows.reduce((total, row) => total + rowHeight(row.models.length), 0) + footerH;
  return { width: ballotImageWidth, height };
}

function roundedRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  const r = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + width, y, x + width, y + height, r);
  context.arcTo(x + width, y + height, x, y + height, r);
  context.arcTo(x, y + height, x, y, r);
  context.arcTo(x, y, x + width, y, r);
  context.closePath();
}

function fitText(context: CanvasRenderingContext2D, text: string, maxWidth: number) {
  if (context.measureText(text).width <= maxWidth) return text;
  let next = text;
  while (next.length && context.measureText(`${next}…`).width > maxWidth) next = next.slice(0, -1);
  return `${next}…`;
}

function loadExportFonts() {
  if (document.querySelector("link[data-ballot-export-fonts]")) return document.fonts?.ready;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.dataset.ballotExportFonts = "true";
  link.href = "https://fonts.googleapis.com/css2?family=Inter:wght@600;700;800&family=DM+Mono:wght@500&display=swap";
  document.head.appendChild(link);
  return new Promise<void>((resolve) => {
    link.onload = () => { void document.fonts?.ready.then(() => resolve(), () => resolve()); };
    link.onerror = () => resolve();
  });
}

function loadLogo(src?: string) {
  if (!src) return Promise.resolve(null);
  return new Promise<HTMLImageElement | null>((resolve) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

function drawMark(
  context: CanvasRenderingContext2D,
  model: BallotImageModel,
  logo: HTMLImageElement | null,
  x: number,
  y: number,
) {
  const background = logo ? (logoColors[model.maker] ?? "#fff") : model.color;
  roundedRect(context, x, y, markSize, markSize, 10);
  context.fillStyle = background === "transparent" ? "#111" : background;
  context.fill();
  context.save();
  roundedRect(context, x, y, markSize, markSize, 10);
  context.clip();
  if (logo) {
    const square = squareLogos.has(model.maker);
    if (lightLogos.has(model.maker) && !square) context.filter = "invert(1) brightness(2.2)";
    if (square) {
      context.drawImage(logo, x, y, markSize, markSize);
    } else {
      const inset = markSize * 0.19;
      context.drawImage(logo, x + inset, y + inset, markSize - inset * 2, markSize - inset * 2);
    }
  } else {
    context.fillStyle = "#fff";
    context.font = "800 16px Inter, ui-sans-serif, Arial, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(model.mark, x + markSize / 2, y + markSize / 2 + 1);
  }
  context.restore();
  context.strokeStyle = "rgba(255,255,255,.13)";
  context.lineWidth = 1;
  roundedRect(context, x + 0.5, y + 0.5, markSize - 1, markSize - 1, 10);
  context.stroke();
}

function drawCard(
  context: CanvasRenderingContext2D,
  model: BallotImageModel,
  logo: HTMLImageElement | null,
  x: number,
  y: number,
  tier: string,
) {
  const radius = 13;
  if (tier === "S" || tier === "A") {
    const border = context.createLinearGradient(x, y, x + cardW, y + cardH);
    if (tier === "S") {
      border.addColorStop(0, "#ff4545");
      border.addColorStop(0.25, "#ffd84a");
      border.addColorStop(0.5, "#54df82");
      border.addColorStop(0.75, "#4d9cff");
      border.addColorStop(1, "#b66cff");
    } else {
      border.addColorStop(0, "#fff");
      border.addColorStop(0.5, "#777");
      border.addColorStop(1, "#bbb");
    }
    context.fillStyle = border;
    roundedRect(context, x, y, cardW, cardH, radius);
    context.fill();
    context.fillStyle = "#171717";
    roundedRect(context, x + 3, y + 3, cardW - 6, cardH - 6, 11);
    context.fill();
  } else {
    context.fillStyle = "#171717";
    roundedRect(context, x, y, cardW, cardH, radius);
    context.fill();
    context.strokeStyle = "#3d3d3a";
    context.lineWidth = 2;
    roundedRect(context, x + 1, y + 1, cardW - 2, cardH - 2, radius);
    context.stroke();
  }
  const markX = x + 13;
  const markY = y + (cardH - markSize) / 2;
  drawMark(context, model, logo, markX, markY);
  context.fillStyle = "#f5f3ed";
  context.font = "700 18px Inter, ui-sans-serif, Arial, sans-serif";
  context.textAlign = "left";
  context.textBaseline = "middle";
  context.fillText(fitText(context, model.name, cardW - 86), markX + markSize + 12, y + cardH / 2);
}

export async function renderBallotPng(categoryName: string, rows: BallotImageRow[]) {
  const logos = new Map<string, HTMLImageElement | null>();
  await Promise.all(rows.flatMap((row) => row.models).map(async (model) => {
    if (!model.logo || logos.has(model.logo)) return;
    logos.set(model.logo, await loadLogo(model.logo));
  }));
  await loadExportFonts();
  if (document.fonts?.ready) await document.fonts.ready.catch(() => undefined);

  const { width, height } = ballotImageSize(rows);
  const canvas = document.createElement("canvas");
  canvas.width = width * scale;
  canvas.height = height * scale;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not create a canvas for the PNG export.");
  context.scale(scale, scale);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.fillStyle = "#090909";
  context.fillRect(0, 0, width, height);

  context.fillStyle = "#f5f3ed";
  context.font = "800 34px Inter, ui-sans-serif, Arial, sans-serif";
  context.textBaseline = "alphabetic";
  context.textAlign = "left";
  context.fillText("tier", padX, 52);
  const tierWidth = context.measureText("tier").width;
  context.fillStyle = "#d8ff55";
  context.fillText("/", padX + tierWidth, 52);
  const slashWidth = context.measureText("/").width;
  context.fillStyle = "#f5f3ed";
  context.font = "800 34px Inter, ui-sans-serif, Arial, sans-serif";
  context.fillText("bench", padX + tierWidth + slashWidth, 52);
  context.font = "600 18px Inter, ui-sans-serif, Arial, sans-serif";
  context.fillStyle = "#92928d";
  context.fillText(categoryName, padX, 84);
  context.font = "500 13px ui-monospace, 'DM Mono', monospace";
  context.fillStyle = "#d8ff55";
  context.textAlign = "right";
  context.fillText("MY BALLOT", width - padX, 52);

  const boardX = padX;
  const boardY = headerH;
  const boardW = width - padX * 2;
  const boardH = height - headerH - footerH;
  const line = "#2b2b29";
  context.fillStyle = "#0c0c0c";
  context.fillRect(boardX, boardY, boardW, boardH);

  let y = headerH;
  rows.forEach((row, rowIndex) => {
    const h = rowHeight(row.models.length);
    context.fillStyle = row.color;
    context.fillRect(boardX, y, labelW, h);
    context.fillStyle = "#090909";
    context.font = "800 44px Inter, ui-sans-serif, Arial, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(row.tier, boardX + labelW / 2, y + h / 2);
    row.models.forEach((model, index) => {
      const col = index % cols;
      const lineIndex = Math.floor(index / cols);
      const x = boardX + labelW + 20 + col * (cardW + gap);
      const cardY = y + rowPad + lineIndex * (cardH + gap);
      drawCard(context, model, model.logo ? logos.get(model.logo) ?? null : null, x, cardY, row.tier);
    });
    if (rowIndex < rows.length - 1) {
      context.strokeStyle = line;
      context.lineWidth = 1.5;
      context.beginPath();
      context.moveTo(boardX, y + h + 0.5);
      context.lineTo(boardX + boardW, y + h + 0.5);
      context.stroke();
    }
    y += h;
  });

  context.strokeStyle = "#3a3a37";
  context.lineWidth = 2;
  context.strokeRect(boardX + 1, boardY + 1, boardW - 2, boardH - 2);
  context.strokeStyle = line;
  context.lineWidth = 1.5;
  context.beginPath();
  context.moveTo(boardX + labelW + 0.5, boardY);
  context.lineTo(boardX + labelW + 0.5, boardY + boardH);
  context.stroke();

  context.fillStyle = "#5a5a54";
  context.font = "500 12px ui-monospace, 'DM Mono', monospace";
  context.textAlign = "left";
  context.textBaseline = "middle";
  context.fillText("tier/bench", padX, height - footerH / 2);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Could not encode the PNG.")), "image/png");
  });
}
