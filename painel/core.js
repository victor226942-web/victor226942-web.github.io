// Regras do sistema de placas (sem tela): codigos, Pix, Wi-Fi, validacoes e as paginas publicas.
// Roda no navegador e no Node (testes em painel/tests).

export const OWNER = "victor226942-web";
export const PAGES_REPO = "victor226942-web.github.io";
export const DATA_REPO = "qrcode-dados";
export const BASE_URL = "https://victor226942-web.github.io";
export const scanUrl = (code) => `${BASE_URL}/${code}`;

export const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sem 0/O, 1/I/L: facil de digitar
export const CODE_LEN = 6;
export const BATCH_MAX = 500;
export const GOOGLE_REVIEW_URL = "https://search.google.com/local/writereview?placeid=";

export const ARTS = {
  "ART-01-GOOGLE": "Avalie-nos no Google",
  "ART-02-PIX-INSTA": "PIX + Instagram",
  "ART-03-WIFI-CARDAPIO": "Wi-Fi + Cardápio",
  "ART-04-PIX-CAIXA": "PIX no Caixa",
  "ART-05-GORJETA": "Gorjeta + Avaliação",
  "ART-06-REDES": "Redes Sociais",
  "ART-07-INSTAGRAM": "Siga nosso Instagram",
};
// destino sugerido para cada arte; "page" = pagina com varios botoes
export const ART_SETUP = {
  "ART-01-GOOGLE": ["google", []],
  "ART-02-PIX-INSTA": ["page", ["pix", "instagram"]],
  "ART-03-WIFI-CARDAPIO": ["page", ["wifi", "menu"]],
  "ART-04-PIX-CAIXA": ["pix", []],
  "ART-05-GORJETA": ["page", ["pix", "google"]],
  "ART-06-REDES": ["page", ["instagram", "whatsapp", "site"]],
  "ART-07-INSTAGRAM": ["instagram", []],
};
export const BLOCKS = {
  pix: "Pix", wifi: "Wi-Fi", menu: "Cardápio", google: "Avaliação Google",
  instagram: "Instagram", whatsapp: "WhatsApp", site: "Site",
};
export const STATUSES = { // ordem do fluxo: nome e estilo do selo
  disponivel: ["Disponível", "neutral"],
  reservada: ["Reservada", "warn"],
  vendida: ["Vendida: personalizando", "info"],
  enviada: ["Enviada", "ok"],
};
export const CHECKS = {
  qr: "QR lido no celular e abrindo o destino certo",
  nfc: "NFC testado (aproximar o celular)",
  dados: "Nome, telefone e links do cliente conferidos",
  impressao: "Impressão sem erro",
  acabamento: "Acabamento e embalagem conferidos",
};
export const WIFI_SECURITY = { WPA: "WPA / WPA2 / WPA3 (o mais comum)", WEP: "WEP (roteador antigo)" };
export const REDIRECT_KINDS = ["link", "google", "instagram", "whatsapp", "menu"];
export const QUICK_TYPES = ["google", "instagram", "whatsapp", "pix", "menu", "link", "wifi"];

const IG_GRADIENT = "linear-gradient(45deg,#f58529,#dd2a7b,#8134af)";
// um bloco por item: titulo, descricao, cor e icone (SVG 24x24, atributos entre aspas)
export const DEST_TYPES = {
  instagram: ["Instagram", "Abre o perfil direto", IG_GRADIENT,
    '<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor"/>'],
  pix: ["Pix", "Copia e cola e chave", "#32BCAD",
    '<path d="M12 3l9 9-9 9-9-9z"/><path d="M8.5 12h7"/>'],
  wifi: ["Wi-Fi", "QR que conecta sozinho", "#4b5563",
    '<path d="M2 8.5a15 15 0 0 1 20 0"/><path d="M5.5 12a10 10 0 0 1 13 0"/><path d="M9 15.5a5 5 0 0 1 6 0"/><circle cx="12" cy="19" r="1" fill="currentColor"/>'],
  menu: ["Cardápio", "Abre o cardápio (site ou PDF)", "#b45309",
    '<path d="M7 3v8a2 2 0 0 0 2 2v8"/><path d="M11 3v8a2 2 0 0 1-2 2"/><path d="M17 21V3c-2 1-3 3-3 6v4h3"/>'],
  google: ["Avaliação Google", "Abre a tela de dar estrelas", "#4285F4",
    '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>'],
  whatsapp: ["WhatsApp", "Abre uma conversa", "#25D366",
    '<path d="M4 20l1.3-4A8 8 0 1 1 8 18.7z"/>'],
  link: ["Link", "Qualquer endereço", "#6b7280",
    '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>'],
  page: ["Combinar vários", "Uma página com vários botões", "#1f2937",
    '<rect x="4" y="4" width="16" height="4" rx="1.5"/><rect x="4" y="10" width="16" height="4" rx="1.5"/><rect x="4" y="16" width="16" height="4" rx="1.5"/>'],
};

/** Erro de validacao: a mensagem aparece para quem esta usando o painel. */
export class UserError extends Error {}
const fail = (msg) => { throw new UserError(msg); };

export function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#x27;" }[ch]
  ));
}

export function nowText(date = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())} ${p(date.getHours())}:${p(date.getMinutes())}:${p(date.getSeconds())}`;
}

export function randomCode(taken, random = (n) => crypto.getRandomValues(new Uint32Array(n))) {
  for (;;) {
    const code = Array.from(random(CODE_LEN), (x) => CODE_ALPHABET[x % CODE_ALPHABET.length]).join("");
    if (!taken.has(code)) return code;
  }
}

export const plateLabel = (p) => (p.plate_no ? `#${String(p.plate_no).padStart(3, "0")}` : "#---");

// ---------------------------------------------------------------- pix (BR Code)

export function asciiUpper(text, limit) {
  return String(text || "").normalize("NFKD").replace(/[^\x00-\x7f]/g, "")
    .replace(/\s+/g, " ").trim().toUpperCase().slice(0, limit);
}

const emv = (tag, value) => `${tag}${String(value.length).padStart(2, "0")}${value}`;

export function crc16(payload) {
  let crc = 0xffff;
  for (const byte of new TextEncoder().encode(payload)) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) crc = (crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

/** Pix Copia e Cola (BR Code estatico) no padrao do Banco Central. */
export function pixBrcode(d) {
  const payload = emv("00", "01")
    + emv("26", emv("00", "br.gov.bcb.pix") + emv("01", d.key))
    + emv("52", "0000") + emv("53", "986")
    + (d.amount ? emv("54", d.amount) : "")
    + emv("58", "BR") + emv("59", d.name) + emv("60", d.city)
    + emv("62", emv("05", d.txid || "***"))
    + "6304";
  return payload + crc16(payload);
}

export function parsePix(key, name, city, amount = "", txid = "") {
  key = String(key || "").trim();
  if (key.includes("@")) key = key.toLowerCase();
  else if (/^[\d.\-/ ]+$/.test(key)) key = key.replace(/\D/g, ""); // CPF/CNPJ com pontuacao
  if (!key || key.length > 77) fail("Chave Pix inválida");
  name = asciiUpper(name, 25);
  city = asciiUpper(city, 15);
  if (!name || !city) fail("Nome do recebedor e cidade são obrigatórios");
  amount = String(amount || "").trim().replace("R$", "").replace(/ /g, "");
  if (amount) {
    if (amount.includes(",")) amount = amount.replace(/\./g, "").replace(",", ".");
    const value = Number(amount);
    if (!Number.isFinite(value)) fail("Valor inválido (ex.: 25,90)");
    if (value <= 0) fail("O valor deve ser maior que zero");
    amount = value.toFixed(2);
  }
  txid = String(txid || "").replace(/[^A-Za-z0-9]/g, "").slice(0, 25);
  return { key, name, city, amount, txid };
}

// ---------------------------------------------------------------- destinos

export function googleUrl(place) {
  place = String(place || "").trim();
  if (/^https?:\/\//i.test(place)) return place;
  if (/^[A-Za-z0-9_-]{10,}$/.test(place)) return GOOGLE_REVIEW_URL + place;
  return fail("Informe o link de avaliação (https://...) ou o Place ID da loja");
}

export function httpUrl(url, what) {
  url = String(url || "").trim();
  if (!/^https?:\/\//i.test(url)) fail(`${what}: o link deve começar com http:// ou https://`);
  return url;
}

export function instagramUser(value) {
  let user = String(value || "").trim();
  if (user.includes("instagram.com/")) user = user.split("instagram.com/")[1];
  user = user.split("/")[0].split("?")[0].replace(/^@+/, "");
  if (!/^[A-Za-z0-9._]{1,30}$/.test(user)) fail("Instagram: informe o usuário (ex.: @restaurantexyz) ou o link do perfil");
  return user;
}

export function whatsappNumber(value) {
  let digits = String(value || "").replace(/\D/g, "");
  if (digits.length === 10 || digits.length === 11) digits = "55" + digits;
  if (digits.length !== 12 && digits.length !== 13) fail("WhatsApp: informe o número com DDD (ex.: 11 99999-0000)");
  return digits;
}

export function whatsappUrl(digits, message = "") {
  return `https://wa.me/${digits}` + (message ? `?text=${encodeURIComponent(message)}` : "");
}

export function parseWifi({ ssid, password = "", security = "WPA", title = "" }) {
  ssid = String(ssid || "").trim();
  if (!ssid) fail("Wi-Fi: informe o nome da rede");
  if (!(security in WIFI_SECURITY)) fail("Wi-Fi: tipo de segurança inválido");
  if (security === "WPA" && password && password.length < 8) {
    fail("Wi-Fi: senha WPA tem no mínimo 8 caracteres. Confira a senha com o cliente.");
  }
  return { ssid, password, security, title: String(title || "").trim().slice(0, 60) };
}

/** Conteudo do QR de Wi-Fi padrao: a camera do iPhone/Android oferece conectar na rede. */
export function wifiQrText(w) {
  const e = (t) => String(t).replace(/([\\;,:"])/g, "\\$1");
  if (!w.password) return `WIFI:T:nopass;S:${e(w.ssid)};;`;
  return `WIFI:T:${w.security || "WPA"};S:${e(w.ssid)};P:${e(w.password)};;`;
}

/** Valida e monta a pagina com varios botoes. */
export function parsePage(f) {
  const d = { title: String(f.title || "").trim().slice(0, 60) };
  if (String(f.pix_key || "").trim()) d.pix = parsePix(f.pix_key, f.pix_name, f.pix_city, f.pix_amount, "");
  if (String(f.wifi_ssid || "").trim()) d.wifi = { ssid: f.wifi_ssid.trim(), password: f.wifi_password || "" };
  if (String(f.menu || "").trim()) d.menu = httpUrl(f.menu, "Cardápio");
  if (String(f.google || "").trim()) d.google = { input: f.google.trim(), url: googleUrl(f.google) };
  if (String(f.instagram || "").trim()) d.instagram = instagramUser(f.instagram);
  if (String(f.whatsapp || "").trim()) d.whatsapp = whatsappNumber(f.whatsapp);
  if (String(f.site || "").trim()) d.site = httpUrl(f.site, "Site");
  if (Object.keys(d).length === 1) fail("Preencha pelo menos um botão da página");
  return d;
}

/**
 * Converte o formulario de um tipo em [kind, destination, data].
 * Usado tanto na configuracao da placa quanto em "Gerar QR".
 */
export function buildDestination(kind, f) {
  switch (kind) {
    case "google": { const url = googleUrl(f.place); return ["google", url, { input: String(f.place).trim() }]; }
    case "instagram": { const u = instagramUser(f.user); return ["instagram", `https://instagram.com/${u}`, { user: u }]; }
    case "whatsapp": {
      const n = whatsappNumber(f.number);
      const msg = String(f.message || "").trim().slice(0, 300);
      return ["whatsapp", whatsappUrl(n, msg), { number: n, message: msg }];
    }
    case "pix": return ["pix", null, parsePix(f.key, f.name, f.city, f.amount, f.txid)];
    case "menu": { const url = httpUrl(f.url, "Cardápio"); return ["menu", url, { url }]; }
    case "link": return ["link", httpUrl(f.url, "Link"), null];
    case "wifi": return ["wifi", null, parseWifi(f)];
    case "page": return ["page", null, parsePage(f)];
    default: return fail("Tipo de destino inválido");
  }
}

export function describe(kind, destination, d = {}) {
  d = d || {};
  switch (kind) {
    case "link": return `Link: ${destination}`;
    case "google": return `Avaliação Google: ${d.input || ""}`;
    case "instagram": return `Instagram: @${d.user || ""}`;
    case "whatsapp": return `WhatsApp: +${d.number || ""}`;
    case "wifi": return `Wi-Fi: ${d.ssid || ""}`;
    case "menu": return `Cardápio: ${destination}`;
    case "pix": return `Pix: ${d.key} (${d.name})` + (d.amount ? ` - R$ ${d.amount.replace(".", ",")}` : "");
    case "page": return `Página ${d.title || "da loja"}: ` + Object.keys(BLOCKS).filter((k) => d[k]).map((k) => BLOCKS[k]).join(", ");
    default: return "";
  }
}

/** QR "direto" (fixo) para Pix e Wi-Fi, que o app do banco/camera le sem abrir pagina. */
export function directQrText(plate) {
  const d = plate.data || {};
  if (plate.kind === "pix") return pixBrcode(d);
  if (plate.kind === "wifi") return wifiQrText(d);
  if (plate.kind === "page" && d.wifi) return wifiQrText(d.wifi);
  return null;
}

// ---------------------------------------------------------------- operacoes no banco (db.json)

export function emptyDb() {
  return { version: 1, plates: [], events: [], logos: {} };
}

export const findPlate = (db, code) => {
  const c = String(code || "").trim();
  return db.plates.find((p) => p.code === c) || db.plates.find((p) => p.code === c.toUpperCase());
};

export function getPlate(db, code) {
  return findPlate(db, code) || fail("Placa não encontrada");
}

export function log(db, code, text, at = nowText()) {
  db.events.push({ code, at, text });
}

export const nextPlateNo = (db) => db.plates.reduce((m, p) => Math.max(m, p.plate_no || 0), 0) + 1;

export function shipBlockers(p) {
  const missing = [];
  if (!p.kind) missing.push("configurar o destino do QR");
  if (!p.nfc) missing.push("gravar o NFC");
  for (const [k, label] of Object.entries(CHECKS)) if (!(p.checks || {})[k]) missing.push(label);
  return missing;
}

export function newPlate(db, { label = "", art = null, logo = null, batch = null, random } = {}) {
  const taken = new Set(db.plates.map((p) => p.code));
  const plate = {
    code: randomCode(taken, random), plate_no: nextPlateNo(db), label, status: "disponivel", art, customer: null,
    order_ref: null, contact: null, notes: null, nfc: false, checks: {}, kind: null, destination: null, data: null,
    batch, logo, created_at: nowText(),
  };
  db.plates.push(plate);
  log(db, plate.code, batch ? `Placa gerada no lote ${batch}` : "Placa gerada");
  return plate;
}

export function newBatch(db, quantity, art = "", logo = null, date = new Date(), random) {
  quantity = Number(quantity);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > BATCH_MAX) fail(`Quantidade entre 1 e ${BATCH_MAX}`);
  if (art && !(art in ARTS)) fail("Arte inválida");
  const p = (n) => String(n).padStart(2, "0");
  const batch = `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}-${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}`
    + (art ? `-${art.toLowerCase()}` : "");
  const plates = [];
  for (let i = 0; i < quantity; i++) plates.push(newPlate(db, { art: art || null, logo, batch, random }));
  return { batch, plates };
}

export function setDestination(db, code, kind, destination, data) {
  const p = getPlate(db, code);
  p.kind = kind; p.destination = destination; p.data = data;
  log(db, p.code, `Destino: ${describe(kind, destination, data || {}) || "virgem"}`);
  if (kind && (p.status === "disponivel" || p.status === "reservada")) {
    p.status = "vendida";
    log(db, p.code, "Status: vendida");
  }
  return p;
}

export function saveOrder(db, code, f) {
  const p = getPlate(db, code);
  if (!(f.status in STATUSES) || (f.art && !(f.art in ARTS))) fail("Status ou arte inválidos");
  if (f.status === "enviada" && p.status !== "enviada" && shipBlockers(p).length) {
    fail("Falta concluir a conferência: " + shipBlockers(p).join("; "));
  }
  const fields = {
    status: f.status, art: f.art || null, customer: (f.customer || "").trim() || null,
    order_ref: (f.order_ref || "").trim() || null, contact: (f.contact || "").trim() || null,
    notes: (f.notes || "").trim() || null,
  };
  const changed = Object.entries(fields).filter(([k, v]) => (p[k] || null) !== v).map(([k, v]) => `${k}: ${v || "-"}`);
  Object.assign(p, fields);
  if (changed.length) log(db, p.code, "Pedido: " + changed.join(", "));
  return p;
}

export function setNfc(db, code, done) {
  const p = getPlate(db, code);
  p.nfc = !!done;
  log(db, p.code, `NFC ${done ? "gravado" : "marcado como não gravado"}: ${scanUrl(p.code)}`);
  return p;
}

export function setChecks(db, code, keys) {
  const p = getPlate(db, code);
  p.checks = Object.fromEntries(Object.keys(CHECKS).map((k) => [k, keys.includes(k)]));
  log(db, p.code, `Conferência: ${Object.values(p.checks).filter(Boolean).length}/${Object.keys(CHECKS).length} itens ok`);
  return p;
}

export function ship(db, code) {
  const p = getPlate(db, code);
  const missing = shipBlockers(p);
  if (missing.length) fail("Falta concluir a conferência: " + missing.join("; "));
  p.status = "enviada";
  log(db, p.code, `Enviada - ${describe(p.kind, p.destination, p.data || {})}`);
  return p;
}

export function unlink(db, code) {
  const p = getPlate(db, code);
  log(db, p.code, `Desvinculada. Antes: cliente ${p.customer || "-"}, pedido ${p.order_ref || "-"}, `
    + `${describe(p.kind, p.destination, p.data || {}) || "virgem"}`);
  Object.assign(p, {
    status: "disponivel", customer: null, order_ref: null, contact: null, notes: null, kind: null,
    destination: null, data: null, checks: {},
  });
  return p;
}

export function setLogo(db, code, logoId) {
  const p = getPlate(db, code);
  p.logo = logoId;
  log(db, p.code, logoId ? "Logo alterada" : "Logo removida");
  return p;
}

/** Remove logos que nenhuma placa usa mais (o banco fica menor). */
export function pruneLogos(db) {
  const used = new Set(db.plates.map((p) => p.logo).filter(Boolean));
  for (const id of Object.keys(db.logos)) if (!used.has(id)) delete db.logos[id];
}

// ---------------------------------------------------------------- paginas publicas (GitHub Pages)

const COPY_JS = "<script>function copy(id,b){var t=document.getElementById(id);t.select();t.setSelectionRange(0,99999);"
  + "var ok=false;try{ok=document.execCommand('copy')}catch(e){}"
  + "if(!ok&&navigator.clipboard){navigator.clipboard.writeText(t.value);ok=true}"
  + "var old=b.textContent;b.textContent=ok?'Copiado!':'Selecione e copie manualmente';"
  + "setTimeout(function(){b.textContent=old},2000)}</script>";

const PUBLIC_CSS = "body{margin:0;background:linear-gradient(180deg,#eef2ff 0,#f5f6f8 260px);min-height:100vh;"
  + "font-family:Inter,system-ui,-apple-system,'Segoe UI',sans-serif;color:#0f172a;-webkit-font-smoothing:antialiased}"
  + "main{max-width:460px;margin:0 auto;padding:2.2rem 16px 3rem}"
  + "h1{text-align:center;margin:.3rem 0 1.6rem;font-size:1.7rem;letter-spacing:-.02em}"
  + "h2{margin:0 0 .5rem;font-size:1.1rem}"
  + ".box{background:#fff;border-radius:18px;padding:1.1rem 1.2rem;margin:0 0 1rem;"
  + "box-shadow:0 1px 2px rgba(15,23,42,.05),0 4px 16px rgba(15,23,42,.06)}"
  + ".box p{margin:.4rem 0;overflow-wrap:anywhere}.center{text-align:center}.icon{font-size:2.4rem;margin:.3rem 0}"
  + ".b{display:block;box-sizing:border-box;width:100%;padding:1rem;margin:.6rem 0;border:0;border-radius:14px;"
  + "color:#fff;font:inherit;font-size:1.05rem;font-weight:600;text-align:center;text-decoration:none;cursor:pointer;"
  + "box-shadow:0 2px 8px rgba(15,23,42,.12);transition:transform .1s}"
  + ".b:active{transform:scale(.98)}.b.light{background:#eef0f3;color:#0f172a;box-shadow:none}"
  + ".hint{font-size:.85rem;color:#64748b}textarea{position:absolute;left:-9999px}";

export function publicPage(title, inner) {
  return "<!doctype html><html lang=pt-BR><meta charset=utf-8>"
    + "<meta name=viewport content='width=device-width,initial-scale=1'>"
    + `<title>${esc(title)}</title>`
    + "<link rel=stylesheet href='https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap'>"
    + `<style>${PUBLIC_CSS}</style><main><h1>${esc(title)}</h1>${inner}</main>` + COPY_JS;
}

export function landingPage(d) {
  const button = (href, text, bg) => `<a class=b style='background:${bg}' href='${esc(href)}' target=_blank rel=noopener>${text}</a>`;
  const parts = [];
  if (d.pix) {
    const p = d.pix;
    const valor = p.amount ? `R$ ${p.amount.replace(".", ",")}` : "Você digita o valor no app do banco";
    parts.push("<div class=box><h2>Pagar com Pix</h2>"
      + `<p>Recebedor: <b>${esc(p.name)}</b><br>Valor: <b>${esc(valor)}</b></p>`
      + `<textarea id=pixcode readonly>${esc(pixBrcode(p))}</textarea>`
      + "<button class=b style='background:#32BCAD' onclick=\"copy('pixcode',this)\">Copiar código Pix</button>"
      + "<p class=hint>Depois abra o app do seu banco em <b>Pix &gt; Pix Copia e Cola</b> e cole.</p>"
      + `<p>Chave: <b>${esc(p.key)}</b></p><textarea id=pixkey readonly>${esc(p.key)}</textarea>`
      + "<button class='b light' onclick=\"copy('pixkey',this)\">Copiar chave Pix</button></div>");
  }
  if (d.wifi) {
    const w = d.wifi;
    const pwd = w.password
      ? `<p>Senha: <b>${esc(w.password)}</b></p><textarea id=wifipass readonly>${esc(w.password)}</textarea>`
        + "<button class=b style='background:#4b5563' onclick=\"copy('wifipass',this)\">Copiar senha do Wi-Fi</button>"
      : "<p>Rede aberta, sem senha.</p>";
    parts.push(`<div class=box><h2>Wi-Fi</h2><p>Rede: <b>${esc(w.ssid)}</b></p>${pwd}`
      + "<p class=hint>Abra <b>Ajustes &gt; Wi-Fi</b> no celular, escolha a rede e cole a senha.</p></div>");
  }
  if (d.menu) parts.push(button(d.menu, "Ver cardápio", "#1f2937"));
  if (d.google) parts.push(button(d.google.url, "&#11088; Avaliar no Google", "#4285F4"));
  if (d.instagram) parts.push(button(`https://instagram.com/${d.instagram}`, `Instagram @${esc(d.instagram)}`, IG_GRADIENT));
  if (d.whatsapp) parts.push(button(`https://wa.me/${d.whatsapp}`, "WhatsApp", "#25D366"));
  if (d.site) parts.push(button(d.site, "Visitar site", "#6b7280"));
  return publicPage(d.title || "Bem-vindo", parts.join(""));
}

export function redirectHtml(url) {
  const jsUrl = JSON.stringify(url).replace(/<\//g, "<\\/");
  return "<!doctype html><html lang=pt-BR><meta charset=utf-8>"
    + "<meta name=viewport content='width=device-width,initial-scale=1'>"
    + `<meta http-equiv=refresh content='0;url=${esc(url)}'><title>Abrindo...</title>`
    + `<script>location.replace(${jsUrl})</script>`
    + "<p style='font-family:system-ui;text-align:center;margin-top:3rem'>Abrindo... "
    + `<a href='${esc(url)}'>toque aqui</a> se não abrir.</p>`;
}

/** Pagina que o cliente final ve (sem redirecionamento). */
export function plateView(p) {
  const d = p.data || {};
  if (!p.kind) {
    return publicPage("Placa ainda não ativada",
      "<div class='box center'><div class=icon>&#9203;</div>"
      + "<p>Esta placa ainda está sendo configurada.<br>Em breve ela vai levar você ao conteúdo do estabelecimento.</p></div>");
  }
  if (p.kind === "page") return landingPage(d);
  if (p.kind === "wifi") return landingPage({ title: d.title || "Wi-Fi", wifi: d });
  return landingPage({ title: "Pagamento via Pix", pix: d });
}

/** Arquivo publicado no GitHub Pages para a placa (<codigo>.html). */
export function staticPage(p) {
  return REDIRECT_KINDS.includes(p.kind) ? redirectHtml(p.destination) : plateView(p);
}

/** O que mostrar na previa do painel (redirecionamentos mostram para onde vao). */
export function previewHtml(p) {
  if (!REDIRECT_KINDS.includes(p.kind)) return plateView(p);
  return publicPage("Abre direto",
    "<div class='box center'><div class=icon>&#8599;</div><p>Quem ler a placa vai direto para:</p>"
    + `<p><b>${esc(p.destination)}</b></p></div>`
    + `<a class=b style='background:#4f46e5' href='${esc(p.destination)}' target=_blank rel=noopener>Abrir destino</a>`);
}
