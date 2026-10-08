// Telas do painel de placas (roda no navegador, hospedado no GitHub Pages).
import * as core from "./core.js";
import { ApiError, GitHub, MockGitHub, Store, decryptToken, encryptToken, passwordProblem } from "./gh.js";
import * as qr from "./qr.js";

/* global JSZip */
const { esc } = core;
const $app = document.getElementById("app");
const params = new URLSearchParams(location.search);
const MOCK = params.has("teste"); // modo de teste: dados ficam so neste navegador, nada vai para o GitHub
const TOKEN_KEY = MOCK ? "qrMockToken" : "qrToken";

const state = {
  gh: null,
  store: null,
  flash: "",
  filters: { q: "", status: "", art: "", lote: "" },
  pub: { state: "idle", at: "", error: "" },
  queue: new Set(),
  quick: { tipo: "google", form: {}, logoB64: "", result: null },
};

// ---------------------------------------------------------------- utilidades de tela

function toast(message, kind = "ok") {
  const el = document.getElementById("toast");
  el.textContent = message;
  el.className = `show ${kind}`;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { el.className = ""; }, kind === "error" ? 7000 : 3500);
}

function friendly(e) {
  if (e instanceof core.UserError) return e.message;
  if (e instanceof ApiError) {
    if (e.status === 401) return "A chave de acesso do GitHub expirou ou foi apagada. Faça a configuração de novo.";
    if (e.status === 403 || e.status === 404) return "A chave de acesso não tem permissão neste repositório.";
    return `GitHub respondeu: ${e.message}`;
  }
  if (e instanceof TypeError) return "Sem conexão com a internet. Tente de novo.";
  return e.message || String(e);
}

async function run(fn) {
  document.body.classList.add("busy");
  try {
    await fn();
  } catch (e) {
    if (!(e instanceof core.UserError)) console.error(e); // erro de validacao ja aparece na tela
    toast(friendly(e), "error");
  } finally {
    document.body.classList.remove("busy");
  }
}

const badge = (status) => {
  const [name, cls] = core.STATUSES[status || "disponivel"] || core.STATUSES.disponivel;
  return `<span class='badge s-${cls}'><span class=dot></span>${name}</span>`;
};

const options = (choices, current, empty) => (empty !== undefined ? `<option value=''>${esc(empty)}</option>` : "")
  + Object.entries(choices).map(([value, label]) => {
    const text = Array.isArray(label) ? label[0] : choices === core.ARTS ? `${value} - ${label}` : label;
    return `<option value='${esc(value)}'${value === current ? " selected" : ""}>${esc(text)}</option>`;
  }).join("");

function tileIcon(kind, size = 20) {
  const [, , bg, paths] = core.DEST_TYPES[kind];
  return `<span class=ticon style='background:${bg}'><svg width=${size} height=${size} viewBox='0 0 24 24' fill=none `
    + `stroke=currentColor stroke-width=2 stroke-linecap=round stroke-linejoin=round>${paths}</svg></span>`;
}

const summary = (p) => esc(core.describe(p.kind, p.destination, p.data)) || "<span class=muted>Virgem (sem destino)</span>";
const DASH = "<span class=muted>—</span>";

// ---------------------------------------------------------------- QR nas telas

async function logoImage(spec) {
  if (!spec) return null;
  if (spec.startsWith("icon:")) return qr.typeIconImage(spec.slice(5));
  if (spec === "quick") return qr.pngImage(state.quick.logoB64);
  const b64 = state.store.db.logos[spec.slice(3)];
  return b64 ? qr.pngImage(b64) : null;
}

const logoB64 = (spec) => {
  if (!spec || spec.startsWith("icon:")) return null;
  return spec === "quick" ? state.quick.logoB64 : state.store.db.logos[spec.slice(3)] || null;
};

async function qrFor(text, logoSpec, caption) {
  return qr.qrCanvas(text, { logo: await logoImage(logoSpec), caption });
}

/** Preenche as imagens <img data-qr=...> depois que a tela foi montada. */
async function hydrate() {
  for (const img of $app.querySelectorAll("img[data-qr]")) {
    const canvas = await qrFor(img.dataset.qr, img.dataset.logo || "", img.dataset.caption || "");
    img.src = canvas.toDataURL("image/png");
  }
}

const plateLogo = (p) => (p.logo ? `id:${p.logo}` : "");

// ---------------------------------------------------------------- publicacao das paginas das placas

function updatePubBadge() {
  const el = document.getElementById("pub");
  if (!el) return;
  const { state: s, at, error } = state.pub;
  const txt = s === "publishing" ? ["info", "Publicando..."] : s === "error" ? ["danger", "Erro ao publicar"]
    : s === "ok" ? ["ok", `Site publicado ${at}`] : ["ok", "Site no ar"];
  el.innerHTML = `<span class='badge s-${txt[0]}' title='${esc(error)}'><span class=dot></span>${txt[1]}</span>`
    + (s === "error" ? "<button class='sec sm' data-click=retry-publish>Tentar de novo</button>" : "");
}

function publish(codes) {
  if (MOCK && params.has("sem-publicar")) return;
  codes.forEach((c) => state.queue.add(c));
  clearTimeout(publish.timer);
  publish.timer = setTimeout(flushPublish, 600);
}

async function flushPublish() {
  if (state.pub.state === "publishing") { publish.timer = setTimeout(flushPublish, 800); return; }
  const codes = [...state.queue];
  if (!codes.length) return;
  state.queue.clear();
  state.pub = { state: "publishing", at: "", error: "" };
  updatePubBadge();
  try {
    const files = {};
    for (const code of codes) {
      const p = core.findPlate(state.store.db, code);
      if (p) files[`${p.code}.html`] = core.staticPage(p);
    }
    if (Object.keys(files).length) {
      await state.gh.commitFiles(core.PAGES_REPO, files, `Atualiza placas ${core.nowText()}`);
    }
    state.pub = { state: "ok", at: core.nowText().slice(11, 16), error: "" };
  } catch (e) {
    codes.forEach((c) => state.queue.add(c)); // fica na fila para "Tentar de novo"
    state.pub = { state: "error", at: "", error: friendly(e) };
    toast("Não foi possível publicar no site: " + friendly(e), "error");
  }
  updatePubBadge();
  if (state.queue.size && state.pub.state === "ok") flushPublish();
}

window.addEventListener("beforeunload", (e) => {
  if (state.queue.size || state.pub.state === "publishing") { e.preventDefault(); e.returnValue = ""; }
});

/** Grava uma alteracao no banco e publica as paginas das placas afetadas. */
async function change(fn, message, codes = []) {
  const result = await state.store.mutate(fn, message);
  if (codes.length) publish(codes);
  return result;
}

// ---------------------------------------------------------------- entrada: configuracao e login

const WORDS = ("abacaxi acerola alface ameixa amora anel areia arroz asa azeite balde banana barco batata bico bigode "
  + "bolo bota brisa cabide cacau caju cama caneca canoa carro casaco caqui cebola cenoura chave chuva cidade "
  + "coelho colher copo coruja couve cravo dado dente doce escova esfera estrela faca farol feijao figo flauta foca "
  + "folha fogao forno fruta fuba gaita galho garfo gato girafa goiaba gol grama grilo ilha janela jarra jaca "
  + "jipe lago lapis leite limao lobo lua macaco manga mapa mar mel melao mesa milho mola morango navio neve "
  + "novelo nuvem oca olho onda ovo pato peixe pera pipa pipoca pneu pomba porta prato queijo quiabo radio "
  + "rato rede relogio remo rio roda sapo selo sino sofa sol tatu tela tigre tomate trem uva vaca vela vento violao").split(" ");

function suggestPassword() {
  const r = crypto.getRandomValues(new Uint32Array(6));
  return [0, 1, 2, 3, 4].map((i) => WORDS[r[i] % WORDS.length]).join("-") + "-" + String(r[5] % 1000).padStart(3, "0");
}

function setNav(on) {
  document.getElementById("nav").hidden = !on;
  document.getElementById("tools").hidden = !on;
}

function renderSetup(hasConfig) {
  setNav(false);
  $app.innerHTML = `
    <div class='card narrow'>
      <h1>Configurar o painel</h1>
      <p class=muted>${hasConfig ? "Use para trocar a senha ou uma chave de acesso vencida." : "Primeiro acesso: ligue o painel ao GitHub."}
      Isso só precisa ser feito uma vez.</p>
      <ol class=steps>
        <li>Abra <a href='https://github.com/settings/personal-access-tokens/new' target=_blank rel=noopener>GitHub &gt; Nova chave de acesso (fine-grained)</a> logado na conta <b>${core.OWNER}</b>.</li>
        <li>Nome: <b>painel-placas</b>. Validade: a maior disponível.</li>
        <li>Em <b>Repository access</b>, escolha <b>Only select repositories</b> e marque <b>${core.DATA_REPO}</b> e <b>${core.PAGES_REPO}</b>.</li>
        <li>Em <b>Permissions &gt; Repository permissions</b>, coloque <b>Contents</b> em <b>Read and write</b>.</li>
        <li>Clique em <b>Generate token</b>, copie e cole abaixo.</li>
      </ol>
      <form data-action=setup>
        <label>Chave de acesso do GitHub<input name=token required autocomplete=off placeholder='github_pat_...'></label>
        <div class=fields style='margin-top:.8rem'>
          <label>Senha do painel<input name=password type=text required autocomplete=new-password></label>
          <label>Repita a senha<input name=password2 type=text required autocomplete=new-password></label>
        </div>
        <p class=note>Mínimo de 12 caracteres, sem ser só números. É essa senha que você e seu pai vão usar para entrar.
        <button type=button class='sec sm' data-click=suggest>Sugerir senha forte</button></p>
        <div class=actions><button>Salvar e entrar</button></div>
      </form>
    </div>`;
}

function renderLogin(cfg) {
  setNav(false);
  $app.innerHTML = `
    <div class='card narrow'>
      <h1>Placas QR</h1>
      <p class=muted>Digite a senha do painel.</p>
      <form data-action=login>
        <label>Senha<input name=password type=password required autofocus autocomplete=current-password></label>
        <label class=check><input type=checkbox name=remember> Manter conectado neste aparelho</label>
        <div class=actions><button>Entrar</button></div>
      </form>
      <p class=note><a href='?configurar'>Trocar senha ou chave de acesso</a></p>
    </div>`;
  state.cfg = cfg;
}

async function loadConfig() {
  if (MOCK) return JSON.parse(localStorage.getItem("qrMockConfig") || "null");
  try {
    const res = await fetch(`config.json?t=${Date.now()}`, { cache: "no-store" });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

const makeGh = (token) => (MOCK ? new MockGitHub() : new GitHub(token));

function forget() {
  sessionStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(TOKEN_KEY);
}

async function start(token) {
  state.gh = makeGh(token);
  state.store = new Store(state.gh);
  try {
    await state.store.load();
  } catch (e) {
    if (e instanceof ApiError && [401, 403, 404].includes(e.status)) {
      forget();
      toast(friendly(e), "error");
      return boot();
    }
    throw e;
  }
  setNav(true);
  updatePubBadge();
  render();
}

async function boot() {
  const token = sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY);
  const wantSetup = params.has("configurar");
  if (token && !wantSetup) return start(token);
  const cfg = await loadConfig();
  if (!cfg || wantSetup) return renderSetup(!!cfg);
  return renderLogin(cfg);
}

// ---------------------------------------------------------------- lista de placas

function filteredPlates() {
  const { q, status, art, lote } = state.filters;
  const term = q.trim().toLowerCase();
  const num = term.replace(/^#/, "");
  return state.store.db.plates
    .filter((p) => !status || p.status === status)
    .filter((p) => !art || p.art === art)
    .filter((p) => !lote || p.batch === lote)
    .filter((p) => !term || [p.code, p.label, p.customer, p.order_ref, p.contact].some((v) => (v || "").toLowerCase().includes(term))
      || (/^\d+$/.test(num) && p.plate_no === Number(num)))
    .sort((a, b) => a.plate_no - b.plate_no);
}

function plateRows() {
  const rows = filteredPlates();
  if (!rows.length) {
    const filtering = Object.values(state.filters).some(Boolean);
    return `<div class='card empty'>${filtering ? "Nenhuma placa encontrada com esses filtros."
      : "Nenhuma placa ainda. Gere o primeiro lote em <a href='#estoque' data-click=scroll-estoque>Estoque</a>."}</div>`;
  }
  return `<div class='card flush scroll'><table><thead><tr><th>Placa</th><th>Código</th><th>Status</th>
    <th class=hide-sm>Arte</th><th>Cliente / pedido</th><th class=hide-sm>Destino</th><th>NFC</th></tr></thead><tbody>`
    + rows.map((p) => `<tr class=link data-href='#/placa/${p.code}'>
      <td class=mono><b>${core.plateLabel(p)}</b></td>
      <td><a class=mono href='#/placa/${p.code}'><b>${p.code}</b></a></td>
      <td>${badge(p.status)}</td><td class=hide-sm><small>${esc(p.art || "—")}</small></td>
      <td>${esc(p.customer) || DASH}${p.order_ref ? `<br><small>${esc(p.order_ref)}</small>` : ""}</td>
      <td class='trunc hide-sm'><small>${summary(p)}</small></td>
      <td>${p.nfc ? "<span class='badge s-ok'>Gravado</span>" : DASH}</td></tr>`).join("")
    + `</tbody></table></div><p class=note>${rows.length} placas.</p>`;
}

function renderList() {
  const db = state.store.db;
  const counts = {};
  db.plates.forEach((p) => { counts[p.status] = (counts[p.status] || 0) + 1; });
  const batches = {};
  for (const p of db.plates) {
    if (!p.batch) continue;
    const b = (batches[p.batch] ||= { n: 0, used: 0, a: Infinity, z: 0 });
    b.n++; b.used += p.status !== "disponivel"; b.a = Math.min(b.a, p.plate_no); b.z = Math.max(b.z, p.plate_no);
  }
  const f = state.filters;
  const pad = (n) => String(n).padStart(3, "0");
  $app.innerHTML = `
    ${state.flash}
    <div class=head><div><h1>Placas</h1><p class=muted>${db.plates.length} placas no total
      ${f.lote ? ` · lote <span class=mono>${esc(f.lote)}</span> <a href='#/' data-click=clear-filters>ver todas</a>` : ""}</p></div>
      <a class=btn href='#estoque' data-click=scroll-estoque>+ Gerar placas</a></div>
    <div class=stats>${Object.entries(core.STATUSES).map(([k, [name, cls]]) => `
      <a class='stat${f.status === k ? " sel" : ""}' href='#/' data-click=filter-status data-status=${k}>
      <span class='lbl c-${cls}'><span class=dot></span><span>${name}</span></span><span class=n>${counts[k] || 0}</span></a>`).join("")}</div>
    <div class='card row'>
      <input id=f-q value='${esc(f.q)}' placeholder='Buscar por código, placa (#007), cliente ou pedido'>
      <select id=f-status>${options(core.STATUSES, f.status, "Todos os status")}</select>
      <select id=f-art>${options(core.ARTS, f.art, "Todas as artes")}</select>
      <button class=sec data-click=clear-filters>Limpar</button>
    </div>
    <div id=plates>${plateRows()}</div>
    <h2 id=estoque>Estoque</h2>
    <div class=card><h3>Gerar placas</h3>
      <form data-action=batch><div class='fields gen'>
        <label>Quantidade<input type=number name=quantity min=1 max=${core.BATCH_MAX} value=25 required></label>
        <label>Arte<select name=art>${options(core.ARTS, "", "Sem arte definida")}</select></label>
        <label>Logo no centro (opcional)<input type=file name=logo accept='image/png,image/jpeg,image/webp'></label>
      </div><div class=actions><button>Gerar placas</button></div>
      <p class=note>Cria placas numeradas em sequência, cada uma com um QR permanente. O ZIP do lote traz o PNG com placa
      e código embaixo, o SVG e a planilha de links para gravar nas tags NFC.</p></form>
      <details><summary>Gerar uma placa avulsa</summary><div class=in>
        <form class=row data-action=new-plate><input name=label placeholder='Observação (opcional)'>
        <button class=sec>Gerar placa</button></form></div></details>
    </div>
    ${Object.keys(batches).length ? `<div class='card flush scroll'><table><thead><tr><th>Lote</th><th>Placas</th><th>Uso</th>
      <th>Arquivos</th></tr></thead><tbody>${Object.entries(batches).sort((a, b) => b[0].localeCompare(a[0])).map(([id, b]) => `
      <tr><td><a class=mono href='#/' data-click=filter-batch data-batch='${esc(id)}'>${esc(id)}</a></td>
      <td class=mono>#${pad(b.a)} – #${pad(b.z)}</td><td>${b.used} de ${b.n} em uso</td>
      <td><div class=row><button class='sec sm' data-click=zip data-batch='${esc(id)}'>Baixar ZIP</button>
      <button class='sec sm' data-click=print data-batch='${esc(id)}'>Folha para imprimir</button></div></td></tr>`).join("")}
      </tbody></table></div>` : ""}`;
  state.flash = "";
  const refilter = () => {
    state.filters.q = document.getElementById("f-q").value;
    state.filters.status = document.getElementById("f-status").value;
    state.filters.art = document.getElementById("f-art").value;
    document.getElementById("plates").innerHTML = plateRows();
  };
  ["f-q", "f-status", "f-art"].forEach((id) => document.getElementById(id).addEventListener("input", refilter));
}

// ---------------------------------------------------------------- tela da placa

function destForms(p, rec) {
  const kind = p.kind;
  const d = p.data || {};
  const mine = (k) => (kind === k ? d : {});
  const g = mine("google"); const pix = mine("pix"); const ig = mine("instagram"); const wa = mine("whatsapp");
  const pg = mine("page"); const wf = mine("wifi"); const mn = mine("menu");
  const pgPix = pg.pix || {}; const pgWifi = pg.wifi || {};
  const opened = (k) => (pg[k] || rec[1].includes(k) ? " open" : "");
  const v = esc;
  const bodies = {
    instagram: `<label>Usuário ou link do perfil<input name=user value='${v(ig.user)}' required
      placeholder='@restaurantexyz ou https://instagram.com/restaurantexyz'></label>
      <p class=note>Quem ler a placa abre o perfil direto no app do Instagram.</p>`,
    pix: `<div class=fields><label class=full>Chave Pix (CPF, CNPJ, e-mail, celular com +55 ou aleatória)
      <input name=key value='${v(pix.key)}' required></label>
      <label>Nome do recebedor<input name=name value='${v(pix.name)}' required maxlength=25></label>
      <label>Cidade<input name=city value='${v(pix.city)}' required maxlength=15></label>
      <label>Valor (vazio = cliente digita)<input name=amount value='${v((pix.amount || "").replace(".", ","))}' placeholder='25,90'></label>
      <label>Identificador (opcional)<input name=txid value='${v(pix.txid)}' maxlength=25></label></div>`,
    wifi: `<div class=fields><label>Nome da rede<input name=ssid value='${v(wf.ssid)}' required placeholder='Loja_Clientes'></label>
      <label>Senha (vazio = rede aberta)<input name=password value='${v(wf.password)}'></label>
      <label>Segurança<select name=security>${options(core.WIFI_SECURITY, wf.security || "WPA")}</select></label>
      <label>Nome que aparece no topo (opcional)<input name=title value='${v(wf.title)}' placeholder='Wi-Fi da Padaria'></label></div>
      <p class=note>Digite o nome da rede e a senha <b>exatamente</b> como estão no roteador (maiúsculas e minúsculas contam).</p>`,
    menu: `<label>Link do cardápio (site ou PDF)<input type=url name=url value='${v(mn.url)}' required placeholder='https://...'></label>
      <p class=note>Quem ler a placa abre o cardápio direto. Dica: suba o PDF no Google Drive, deixe público e cole o link aqui.</p>`,
    google: `<label>Link de avaliação da loja ou Place ID<input name=place value='${v(g.input)}' required
      placeholder='https://g.page/r/.../review  ou  ChIJ...'></label>
      <p class=note>No Perfil da Empresa no Google, clique em <b>Pedir avaliações</b> e copie o link.</p>`,
    whatsapp: `<div class=fields><label>Número com DDD<input name=number value='${v(wa.number)}' required placeholder='(81) 99999-1234'></label>
      <label>Mensagem pronta (opcional)<input name=message value='${v(wa.message)}' placeholder='Olá! Vim pela placa da loja.'></label></div>`,
    link: `<label>Endereço completo<input type=url name=url value='${v(kind === "link" ? p.destination : "")}' required placeholder='https://...'></label>`,
    page: `<label>Nome que aparece no topo<input name=title value='${v(pg.title)}' placeholder='Restaurante XYZ'></label>
      <p class=note>Preencha só os botões que o cliente quer. Os da arte da placa já vêm abertos.</p>
      <details${opened("pix")}><summary>Pix</summary><div class='in fields'>
        <label class=full>Chave Pix<input name=pix_key value='${v(pgPix.key)}'></label>
        <label>Nome do recebedor<input name=pix_name value='${v(pgPix.name)}' maxlength=25></label>
        <label>Cidade<input name=pix_city value='${v(pgPix.city)}' maxlength=15></label>
        <label>Valor (opcional)<input name=pix_amount value='${v((pgPix.amount || "").replace(".", ","))}' placeholder='25,90'></label></div></details>
      <details${opened("wifi")}><summary>Wi-Fi</summary><div class='in fields'>
        <label>Nome da rede<input name=wifi_ssid value='${v(pgWifi.ssid)}'></label>
        <label>Senha (vazio = rede aberta)<input name=wifi_password value='${v(pgWifi.password)}'></label></div></details>
      <details${opened("menu")}><summary>Cardápio</summary><div class=in>
        <label>Link do cardápio<input type=url name=menu value='${v(pg.menu)}' placeholder='https://...'></label></div></details>
      <details${opened("google")}><summary>Avaliação Google</summary><div class=in>
        <label>Link de avaliação ou Place ID<input name=google value='${v((pg.google || {}).input)}'></label></div></details>
      <details${opened("instagram")}><summary>Instagram</summary><div class=in>
        <label>Usuário ou link do perfil<input name=instagram value='${v(pg.instagram)}' placeholder='@restaurantexyz'></label></div></details>
      <details${opened("whatsapp")}><summary>WhatsApp</summary><div class=in>
        <label>Número com DDD<input name=whatsapp value='${v(pg.whatsapp)}' placeholder='11 99999-0000'></label></div></details>
      <details${opened("site")}><summary>Site</summary><div class=in>
        <label>Link do site<input type=url name=site value='${v(pg.site)}' placeholder='https://...'></label></div></details>`,
  };
  const direct = core.directQrText(p);
  const directBlock = direct ? `<div class=pixfixo><img class=qr data-qr='${esc(direct)}' data-caption='${esc(
    p.kind === "pix" ? `${core.plateLabel(p)}  ${p.code}  Pix` : `${core.plateLabel(p)}  ${p.code}  Wi-Fi`)}' alt='QR direto'>
    <div><b>${p.kind === "pix" ? "QR Pix direto" : "QR Wi-Fi direto: conecta sozinho"}</b> <span class='badge s-neutral'>fixo</span>
    <p class=note>${p.kind === "pix"
    ? "O app do banco lê este QR na hora, sem abrir página. Mas ele é fixo: mudou a chave ou o valor, precisa reimprimir."
    : "Use este QR no <b>adesivo da placa</b>: a câmera do iPhone ou do Android mostra <b>Conectar à rede</b>, sem digitar senha. Se a senha do roteador mudar, imprima outro adesivo. No <b>NFC</b>, grave o link da placa."}</p>
    <div class=actions><button class=sm data-click=dl-direct>Baixar PNG</button>
    <button class='sec sm' data-click=dl-direct-svg>SVG</button></div></div></div>` : "";
  return Object.keys(core.DEST_TYPES).map((k) => `<div class=dform data-dform=${k}${k === (kind || rec[0] || "instagram") ? "" : " hidden"}>
    <form data-action=dest><input type=hidden name=kind value=${k}>
    <h3>${tileIcon(k, 16)}${core.DEST_TYPES[k][0]}</h3>${bodies[k]}
    <div class=actions><button>Salvar ${core.DEST_TYPES[k][0]}</button></div></form>
    ${k === kind || (k === "wifi" && kind === "page") ? directBlock : ""}</div>`).join("");
}

function renderPlate(code, tab = "destino") {
  const p = core.findPlate(state.store.db, code);
  if (!p) {
    $app.innerHTML = "<div class='card empty'><h1>Placa não encontrada</h1><p><a href='#/'>Voltar para as placas</a></p></div>";
    return;
  }
  const rec = core.ART_SETUP[p.art] || [null, []];
  const selected = p.kind || rec[0] || "instagram";
  const checks = p.checks || {};
  const done = Object.keys(core.CHECKS).filter((k) => checks[k]).length;
  const total = Object.keys(core.CHECKS).length;
  const blockers = core.shipBlockers(p);
  const url = core.scanUrl(p.code);
  const events = state.store.db.events.filter((e) => e.code === p.code).reverse().slice(0, 50);
  const ship = p.status === "enviada" ? "<div class='alert ok' style='margin:1rem 0 0'>&#10003; <b>Placa enviada.</b></div>"
    : blockers.length ? `<div class=note><b>Para despachar falta:</b><ul>${blockers.map((b) => `<li>${esc(b)}</li>`).join("")}</ul></div>`
      : "<div class=actions><button class=ok data-click=ship>&#10003; Tudo conferido: marcar como enviada</button></div>";
  const tiles = Object.entries(core.DEST_TYPES).map(([k, [name, hint]]) => `<label class=tile>
    <input type=radio name=dkind value=${k}${k === selected ? " checked" : ""}>
    <span class=tbox>${tileIcon(k)}<span><b>${name}</b><small>${hint}</small></span>
    ${p.kind === k ? "<span class='tag tpos'>Em uso</span>" : rec[0] === k ? "<span class='badge s-neutral tpos'>Sugerido</span>" : ""}
    </span></label>`).join("");
  const tabLink = (id, label) => `<a href='#/placa/${p.code}/${id}' data-tab=${id}${tab === id ? " class=on" : ""}>${label}</a>`;
  const pane = (id) => (tab === id ? "" : " hidden");

  $app.innerHTML = `
    <a class=back href='#/'>&larr; Placas</a>${state.flash}
    <div class=head><div><p class=eyebrow>Placa ${core.plateLabel(p)}${p.art ? ` · ${esc(p.art)}` : ""}</p>
      <h1><span class=mono>${p.code}</span>${badge(p.status)}</h1><p class=muted>${summary(p)}</p></div>
      <a class=btn href='${esc(url)}' target=_blank rel=noopener>Abrir como o cliente &#8599;</a></div>
    <div class='card linkbar'><span class=muted>Link da placa (QR e NFC)</span>
      <div class=copy><input readonly value='${esc(url)}' id=plateurl>
      <button class=sec data-click=copy data-text='${esc(url)}'>Copiar</button></div><div></div></div>
    <nav class=tabs>${tabLink("destino", "Destino")}${tabLink("pedido", "Pedido")}
      ${tabLink("producao", `Produção <span class='badge s-${blockers.length ? "neutral" : "ok"}'>${done}/${total}</span>`)}
      ${tabLink("historico", "Histórico")}</nav>
    <div class=layout2><div>
      <section${pane("destino")}>
        ${p.kind ? "" : "<div class='alert info'><b>Placa virgem.</b> Escolha abaixo para onde ela vai levar e salve.</div>"}
        <div class=card><h3>Para onde a placa leva?</h3><div class=tiles>${tiles}</div></div>
        <div class=card>${destForms(p, rec)}
          ${p.kind ? "<div class=actions><button class='sec sm' data-click=clear-dest>Deixar virgem (sem destino)</button></div>" : ""}</div>
      </section>
      <section${pane("pedido")}><div class=card><h3>Pedido e cliente</h3>
        <form data-action=order><div class=fields>
          <label>Status<select name=status>${options(core.STATUSES, p.status)}</select></label>
          <label>Arte<select name=art>${options(core.ARTS, p.art, "—")}</select></label>
          <label>Cliente<input name=customer value='${esc(p.customer)}' placeholder='Restaurante XYZ'></label>
          <label>Pedido<input name=order_ref value='${esc(p.order_ref)}' placeholder='ML-123456'></label>
          <label>Contato<input name=contact value='${esc(p.contact)}' placeholder='WhatsApp ou e-mail'></label>
          <label>Observações<input name=notes value='${esc(p.notes || p.label)}'></label>
        </div><div class=actions><button>Salvar pedido</button></div></form></div></section>
      <section${pane("producao")}>
        <div class=card><h3>NFC ${p.nfc ? "<span class='badge s-ok'><span class=dot></span>Gravado</span>"
          : "<span class='badge s-neutral'><span class=dot></span>Não gravado</span>"}</h3>
          <p class=note style='margin-top:0'>No app <b>NFC Tools</b>: Escrever &gt; Adicionar registro &gt; URL, cole o link
          da placa (botão Copiar lá em cima) e aproxime a tag.</p>
          <div class=actions>${p.nfc ? "<button class='sec sm' data-click=nfc data-done=0>Desmarcar gravação</button>"
            : "<button data-click=nfc data-done=1>Marcar NFC como gravado</button>"}</div></div>
        <div class=card><h3>Conferência antes do envio <span class='badge s-${done === total ? "ok" : "neutral"}'>${done}/${total}</span></h3>
          <div class=progress><span style='width:${Math.floor((done * 100) / total)}%'></span></div>
          <form data-action=checks><div class=checks>${Object.entries(core.CHECKS).map(([k, label]) => `
            <label><input type=checkbox name=c value=${k}${checks[k] ? " checked" : ""}>${esc(label)}</label>`).join("")}</div>
          <div class=actions><button class=sec>Salvar conferência</button></div></form>${ship}</div>
        <div class=card><h3>Logo no centro do QR</h3>
          <form data-action=logo class=row><input type=file name=logo accept='image/png,image/jpeg,image/webp' required>
          <button class='sec sm'>${p.logo ? "Trocar" : "Enviar"} logo</button></form>
          ${p.logo ? "<div class=actions><button class='sec sm' data-click=logo-remove>Remover logo</button></div>" : ""}
          <p class=note>Só muda a imagem para impressão. O link da placa continua o mesmo.</p></div>
        <div class='card danger'><h3>Reaproveitar a placa</h3>
          <p class=note style='margin-top:0'>Apaga cliente, pedido, destino e conferência, e deixa a placa disponível para
          outra venda. O QR e o NFC continuam os mesmos. Fica registrado no histórico.</p>
          <div class=actions><button class=danger data-click=unlink>Desvincular cliente</button></div></div>
      </section>
      <section${pane("historico")}><div class=card><h3>Histórico</h3><ul class=timeline>
        ${events.map((e) => `<li><time>${esc(e.at)}</time><span>${esc(e.text)}</span></li>`).join("")
          || "<li><span class=muted>Sem alterações ainda.</span></li>"}</ul></div></section>
    </div>
    <aside class=sticky>
      <div class=card><h3>Como o cliente vê</h3>
        <div class=phone><iframe sandbox='allow-scripts allow-popups' title='Prévia da placa'
          srcdoc='${esc(core.previewHtml(p))}'></iframe></div></div>
      <div class=card><h3>${p.kind === "wifi" ? "QR do link da placa" : "QR para imprimir"}</h3>
        ${p.kind === "wifi" ? "<p class=note style='margin-top:0'>Para o Wi-Fi conectar sozinho, imprima o <b>QR Wi-Fi direto</b>. Este é o QR editável do link.</p>" : ""}
        <img class=qr data-qr='${esc(url)}' data-logo='${plateLogo(p)}' alt='QR da placa ${p.code}'>
        <div class=actions><button class='sec sm' data-click=dl-png>Baixar PNG</button>
        <button class='sec sm' data-click=dl-svg>SVG</button></div></div>
    </aside></div>`;
  state.flash = "";
  state.current = p.code;
}

// ---------------------------------------------------------------- Gerar QR (dados dentro do QR)

const QUICK_CAPTION = { google: () => "Avaliação Google", instagram: (d) => `Instagram @${d.user}`, whatsapp: () => "WhatsApp",
  pix: () => "Pix", menu: () => "Cardápio", link: () => "", wifi: (d) => `Wi-Fi: ${d.ssid}` };

function quickInfo(kind, dest, d) {
  switch (kind) {
    case "google": return [["Avaliação", dest]];
    case "instagram": return [["Perfil", `@${d.user}`]];
    case "whatsapp": return [["Número", `+${d.number}`], ...(d.message ? [["Mensagem", d.message]] : [])];
    case "pix": return [["Chave", d.key], ["Recebedor", d.name], ["Cidade", d.city],
      ["Valor", d.amount ? `R$ ${d.amount.replace(".", ",")}` : "cliente digita no app"]];
    case "wifi": return [["Rede", d.ssid], ["Senha", d.password || "sem senha (rede aberta)"]];
    default: return [["Endereço", dest]];
  }
}

function renderQuick() {
  const q = state.quick;
  const f = q.form;
  const v = (k) => esc(f[k] || "");
  const tiles = core.QUICK_TYPES.map((k) => `<label class=tile><input type=radio name=dkind value=${k}${k === q.tipo ? " checked" : ""}>
    <span class=tbox>${tileIcon(k)}<span><b>${core.DEST_TYPES[k][0]}</b></span></span></label>`).join("");
  const bodies = {
    google: `<label>Link de avaliação da loja ou Place ID<input name=place value='${v("place")}' required
      placeholder='https://g.page/r/.../review  ou  ChIJ...'></label>
      <p class=note>No Perfil da Empresa no Google: <b>Pedir avaliações</b> &gt; copiar o link.</p>`,
    instagram: `<label>Usuário ou link do perfil<input name=user value='${v("user")}' required placeholder='@restaurantexyz'></label>`,
    whatsapp: `<div class=fields><label>Número com DDD<input name=number value='${v("number")}' required placeholder='(81) 99999-1234'></label>
      <label>Mensagem pronta (opcional)<input name=message value='${v("message")}' placeholder='Olá! Vim pela placa.'></label></div>`,
    pix: `<div class=fields><label class=full>Chave Pix (CPF, CNPJ, e-mail, celular com +55 ou aleatória)<input name=key value='${v("key")}' required></label>
      <label>Nome do recebedor<input name=name value='${v("name")}' required maxlength=25></label>
      <label>Cidade<input name=city value='${v("city")}' required maxlength=15></label>
      <label>Valor (vazio = cliente digita)<input name=amount value='${v("amount")}' placeholder='25,90'></label>
      <label>Identificador (opcional)<input name=txid value='${v("txid")}' maxlength=25></label></div>
      <p class=note>O app do banco lê o QR e já abre o pagamento.</p>`,
    menu: `<label>Link do cardápio (site ou PDF)<input type=url name=url value='${q.tipo === "menu" ? v("url") : ""}' required placeholder='https://...'></label>`,
    link: `<label>Endereço completo<input type=url name=url value='${q.tipo === "link" ? v("url") : ""}' required placeholder='https://...'></label>`,
    wifi: `<div class=fields><label>Nome da rede Wi-Fi<input name=ssid value='${v("ssid")}' required placeholder='Ex.: Padaria_Clientes'></label>
      <label>Senha do Wi-Fi<input name=password value='${v("password")}' placeholder='Vazio = rede aberta'></label>
      <label>Segurança<select name=security>${options(core.WIFI_SECURITY, f.security || "WPA")}</select></label></div>
      <p class=note>Use o nome da rede e a senha do <b>Wi-Fi</b>, não o login da operadora. Copie e cole para não errar maiúsculas.</p>`,
  };
  const logoField = (k) => {
    const keep = q.logoB64 && k === q.tipo;
    const modes = { ...(keep ? { keep: "Manter a logo enviada" } : {}), icon: "Ícone do tipo", none: "Sem logo" };
    const current = keep ? "keep" : f.logo_mode || "icon";
    return `<label>Logo no centro<select name=logo_mode>${Object.entries(modes).map(([m, label]) =>
      `<option value=${m}${m === current ? " selected" : ""}>${label}</option>`).join("")}</select></label>
      <label>Ou envie a logo do cliente (PNG, JPG)<input type=file name=logo accept='image/png,image/jpeg,image/webp'></label>`;
  };
  const forms = core.QUICK_TYPES.map((k) => `<div class=dform data-dform=${k}${k === q.tipo ? "" : " hidden"}>
    <form data-action=quick><input type=hidden name=tipo value=${k}>
    <h3>${tileIcon(k, 16)}${core.DEST_TYPES[k][0]}</h3>${bodies[k]}
    <div class=fields style='margin-top:.8rem'>${logoField(k)}
      <label>Salvar também na placa (opcional)<input name=plate_code value='${v("plate_code")}' placeholder='Código da placa, ex.: PWNBCL'></label>
    </div><div class=actions><button>Gerar QR</button></div></form></div>`).join("");
  const r = q.result;
  const result = r ? `<div class='card result' id=quick-result>
    <div class=head style='margin:0 0 1rem'><div><p class=eyebrow>${tileIcon(r.tipo, 14)} ${core.DEST_TYPES[r.tipo][0]}</p>
      <h1>QR pronto</h1><p class=muted>Imprima e cole na placa. Quem apontar a câmera vai direto.</p></div></div>
    ${r.saved ? `<div class='alert ok'>&#10003; Salvo na placa <a class=mono href='#/placa/${r.saved}'>${r.saved}</a>. O link e o NFC da placa levam ao mesmo destino.</div>` : ""}
    <div class=result-grid><div><dl class=kv style='margin-top:0'>${r.info.map(([k, val]) => `<dt>${esc(k)}</dt><dd><b>${esc(val)}</b></dd>`).join("")}</dl>
      <div class=actions><button data-click=quick-dl>Baixar PNG para imprimir</button></div>
      <p class=note><b>Teste antes de entregar:</b> aponte a câmera do seu celular para o QR e confira se abre o destino
      certo. Este QR é fixo: se os dados do cliente mudarem, gere e imprima outro.</p></div>
      <img class=qr data-qr='${esc(r.text)}' data-logo='${esc(r.logo)}' data-caption='${esc(r.caption)}' alt='QR pronto'></div></div>` : "";
  $app.innerHTML = `
    <div class=head><div><h1>Gerar QR</h1><p class=muted>Escolha o tipo e preencha os dados do cliente. Tudo fica gravado
      dentro do QR: quem apontar a câmera vai direto.</p></div></div>
    ${result}
    <div class=card><h3>Qual QR?</h3><div class=tiles>${tiles}</div></div>
    <div class=card>${forms}</div>`;
}

// ---------------------------------------------------------------- rotas

function render() {
  if (!state.store) return;
  const [, view, code, tab] = (location.hash || "#/").split("/");
  document.querySelectorAll("#nav a").forEach((a) => a.classList.toggle("on", a.getAttribute("href") === `#/${view || ""}`));
  if (view === "placa" && code) renderPlate(decodeURIComponent(code), tab || "destino");
  else if (view === "gerar") renderQuick();
  else renderList();
  hydrate();
}
window.addEventListener("hashchange", () => { render(); window.scrollTo(0, 0); });

// ---------------------------------------------------------------- acoes dos formularios

const go = (hash) => { if (location.hash === hash) render(); else location.hash = hash; };
const saved = "<div class='alert ok toast-in'>&#10003; <b>Salvo.</b> O site atualiza sozinho em cerca de 1 minuto.</div>";

const forms = {
  async setup(f) {
    if (f.password !== f.password2) throw new core.UserError("As senhas não são iguais.");
    const problem = passwordProblem(f.password);
    if (problem) throw new core.UserError(problem);
    const token = f.token.trim();
    const gh = makeGh(token);
    const store = new Store(gh);
    try {
      await store.load();
      if (!store.sha) await store.mutate(() => null, "Cria o banco das placas"); // primeiro uso: banco vazio
    } catch (e) {
      if (e instanceof ApiError) throw new core.UserError(`A chave não acessa o repositório ${core.DATA_REPO}. Confira o passo 3 e 4.`);
      throw e;
    }
    const cfg = await encryptToken(token, f.password);
    if (MOCK) {
      localStorage.setItem("qrMockConfig", JSON.stringify(cfg));
    } else {
      try {
        const current = await gh.readJson(core.PAGES_REPO, "painel/config.json");
        await gh.writeFile(core.PAGES_REPO, "painel/config.json", JSON.stringify(cfg), current?.sha, "Configura o painel");
      } catch (e) {
        if (e instanceof ApiError) throw new core.UserError(`A chave não consegue gravar em ${core.PAGES_REPO}. Confira o passo 3 e 4.`);
        throw e;
      }
    }
    sessionStorage.setItem(TOKEN_KEY, token);
    history.replaceState(null, "", location.pathname + (MOCK ? "?teste" : "") + "#/");
    toast("Painel configurado. Guarde a senha!");
    await start(token);
  },

  async login(f) {
    const token = await decryptToken(state.cfg, f.password);
    (f.remember ? localStorage : sessionStorage).setItem(TOKEN_KEY, token);
    await start(token);
  },

  async batch(f, form) {
    const file = form.querySelector("input[name=logo]").files[0];
    const b64 = file ? await qr.normalizeLogo(file) : null;
    const id = b64 ? await qr.logoId(b64) : null;
    const { batch, plates } = await change((db) => {
      if (id) db.logos[id] = b64;
      return core.newBatch(db, f.quantity, f.art, id);
    }, "Gera lote de placas");
    publish(plates.map((p) => p.code));
    state.filters = { q: "", status: "", art: "", lote: batch };
    state.flash = `<div class='alert ok'>&#10003; <b>${plates.length} placas geradas</b> (${core.plateLabel(plates[0])} a
      ${core.plateLabel(plates[plates.length - 1])}). Baixe o ZIP do lote lá embaixo, em Estoque.</div>`;
    go("#/");
  },

  async "new-plate"(f) {
    const p = await change((db) => core.newPlate(db, { label: f.label.trim() }), "Gera placa avulsa");
    publish([p.code]);
    go(`#/placa/${p.code}`);
  },

  async dest(f) {
    const [kind, dest, data] = core.buildDestination(f.kind, f);
    await change((db) => core.setDestination(db, state.current, kind, dest, data), "Configura destino", [state.current]);
    state.flash = saved;
    go(`#/placa/${state.current}/destino`);
  },

  async order(f) {
    await change((db) => core.saveOrder(db, state.current, f), "Atualiza pedido");
    toast("Pedido salvo.");
    go(`#/placa/${state.current}/pedido`);
  },

  async checks(f, form) {
    const keys = [...form.querySelectorAll("input[name=c]:checked")].map((i) => i.value);
    await change((db) => core.setChecks(db, state.current, keys), "Atualiza conferência");
    toast("Conferência salva.");
    go(`#/placa/${state.current}/producao`);
  },

  async logo(f, form) {
    const b64 = await qr.normalizeLogo(form.querySelector("input[name=logo]").files[0]);
    const id = await qr.logoId(b64);
    await change((db) => { db.logos[id] = b64; core.setLogo(db, state.current, id); core.pruneLogos(db); }, "Troca logo");
    toast("Logo salva.");
    go(`#/placa/${state.current}/producao`);
  },

  async quick(f, form) {
    const q = state.quick;
    q.form = f;
    q.tipo = f.tipo;
    const [kind, dest, data] = core.buildDestination(f.tipo, f);
    const text = kind === "pix" ? core.pixBrcode(data) : kind === "wifi" ? core.wifiQrText(data) : dest;
    const file = form.querySelector("input[name=logo]").files[0];
    let logo = "";
    let logoLabel = "Sem logo";
    if (file) { q.logoB64 = await qr.normalizeLogo(file); logo = "quick"; logoLabel = "Logo enviada"; }
    else if (f.logo_mode === "keep" && q.logoB64) { logo = "quick"; logoLabel = "Logo enviada"; }
    else if (f.logo_mode === "icon") { q.logoB64 = ""; logo = `icon:${kind}`; logoLabel = "Ícone do tipo"; }
    else q.logoB64 = "";
    let savedCode = "";
    if (f.plate_code.trim()) {
      const p = await change((db) => core.setDestination(db, f.plate_code, kind, dest, data), "Configura destino");
      publish([p.code]);
      savedCode = p.code;
    }
    q.result = { tipo: kind, text, caption: QUICK_CAPTION[kind](data || {}), logo, info: [...quickInfo(kind, dest, data || {}), ["Logo", logoLabel]], saved: savedCode };
    renderQuick();
    await hydrate();
    document.getElementById("quick-result").scrollIntoView({ behavior: "smooth" });
  },
};

// ---------------------------------------------------------------- acoes dos botoes

function currentPlate() { return core.getPlate(state.store.db, state.current); }

async function plateCanvas(p) {
  return qrFor(core.scanUrl(p.code), plateLogo(p), `${core.plateLabel(p)}  ${p.code}`);
}

const clicks = {
  suggest() {
    const pw = suggestPassword();
    document.querySelector("input[name=password]").value = pw;
    document.querySelector("input[name=password2]").value = pw;
  },
  async logout() {
    forget();
    location.href = location.pathname + (MOCK ? "?teste" : "");
  },
  async reload() {
    await state.store.load();
    render();
    await hydrate();
    toast("Dados atualizados.");
  },
  "retry-publish"() { flushPublish(); },
  "scroll-estoque"() { document.getElementById("estoque")?.scrollIntoView({ behavior: "smooth" }); },
  "filter-status"(d) {
    state.filters.status = state.filters.status === d.status ? "" : d.status;
    render();
  },
  "filter-batch"(d) { state.filters = { q: "", status: "", art: "", lote: d.batch }; render(); window.scrollTo(0, 0); },
  "clear-filters"() { state.filters = { q: "", status: "", art: "", lote: "" }; go("#/"); },
  async copy(d, button) {
    const input = document.getElementById("plateurl");
    input.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch { /* navegador antigo */ }
    if (!ok && navigator.clipboard) { await navigator.clipboard.writeText(d.text); ok = true; }
    button.textContent = ok ? "Copiado!" : "Copie manualmente";
    setTimeout(() => { button.textContent = "Copiar"; }, 2000);
  },
  async "clear-dest"() {
    if (!confirm("Deixar a placa virgem? Quem ler vai ver \"Placa ainda não ativada\".")) return;
    await change((db) => core.setDestination(db, state.current, null, null, null), "Deixa placa virgem", [state.current]);
    state.flash = saved;
    go(`#/placa/${state.current}/destino`);
  },
  async nfc(d) {
    await change((db) => core.setNfc(db, state.current, d.done === "1"), "Atualiza NFC");
    go(`#/placa/${state.current}/producao`);
  },
  async ship() {
    await change((db) => core.ship(db, state.current), "Marca placa como enviada");
    toast("Placa marcada como enviada.");
    go(`#/placa/${state.current}/producao`);
  },
  async unlink() {
    if (!confirm("Desvincular o cliente e voltar a placa para disponível? O QR e o NFC continuam os mesmos.")) return;
    await change((db) => core.unlink(db, state.current), "Desvincula cliente", [state.current]);
    toast("Placa disponível de novo.");
    go(`#/placa/${state.current}/producao`);
  },
  async "logo-remove"() {
    await change((db) => { core.setLogo(db, state.current, null); core.pruneLogos(db); }, "Remove logo");
    go(`#/placa/${state.current}/producao`);
  },
  async "dl-png"() {
    const p = currentPlate();
    qr.download(await qr.canvasBlob(await plateCanvas(p)), `${p.code}.png`);
  },
  "dl-svg"() {
    const p = currentPlate();
    qr.download(new Blob([qr.qrSvg(core.scanUrl(p.code), logoB64(plateLogo(p)))], { type: "image/svg+xml" }), `${p.code}.svg`);
  },
  async "dl-direct"() {
    const p = currentPlate();
    const kind = p.kind === "pix" ? "pix" : "wifi";
    const canvas = qr.qrCanvas(core.directQrText(p), { caption: `${core.plateLabel(p)}  ${p.code}  ${kind === "pix" ? "Pix" : "Wi-Fi"}` });
    qr.download(await qr.canvasBlob(canvas), `${kind}-${p.code}.png`);
  },
  "dl-direct-svg"() {
    const p = currentPlate();
    qr.download(new Blob([qr.qrSvg(core.directQrText(p))], { type: "image/svg+xml" }), `${p.kind === "pix" ? "pix" : "wifi"}-${p.code}.svg`);
  },
  async "quick-dl"() {
    const r = state.quick.result;
    const canvas = await qrFor(r.text, r.logo, r.caption);
    const name = `qr-${r.tipo}-${r.info[0][1]}`.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
    qr.download(await qr.canvasBlob(canvas), `${name}.png`);
  },
  async zip(d) {
    const plates = state.store.db.plates.filter((p) => p.batch === d.batch).sort((a, b) => a.plate_no - b.plate_no);
    const zip = new JSZip();
    const rows = [["placa", "codigo", "link_nfc_e_qr", "arte"]];
    for (const p of plates) {
      const name = `${String(p.plate_no).padStart(3, "0")}-${p.code}`;
      zip.file(`png/${name}.png`, await qr.canvasBlob(await plateCanvas(p)));
      zip.file(`svg/${name}.svg`, qr.qrSvg(core.scanUrl(p.code), logoB64(plateLogo(p))));
      rows.push([core.plateLabel(p), p.code, core.scanUrl(p.code), p.art || ""]);
    }
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\r\n");
    zip.file("links.csv", "﻿" + csv); // BOM: Excel abre com acentos certos
    qr.download(await zip.generateAsync({ type: "blob" }), `lote-${d.batch}.zip`);
  },
  async print(d) {
    const win = window.open("", "_blank"); // abre antes de desenhar, para o navegador nao bloquear
    if (!win) throw new core.UserError("O navegador bloqueou a janela. Permita pop-ups para este site.");
    const plates = state.store.db.plates.filter((p) => p.batch === d.batch).sort((a, b) => a.plate_no - b.plate_no);
    const cells = [];
    for (const p of plates) {
      const src = (await qrFor(core.scanUrl(p.code), plateLogo(p), "")).toDataURL("image/png");
      cells.push(`<div class=cell><img src='${src}'><b>${core.plateLabel(p)} ${p.code}</b></div>`);
    }
    win.document.write(`<!doctype html><meta charset=utf-8><title>Lote ${esc(d.batch)}</title><style>
      @page{size:A4;margin:10mm}body{margin:0;font-family:monospace}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:6mm}
      .cell{text-align:center;break-inside:avoid;border:1px dashed #bbb;padding:3mm}.cell img{width:100%;display:block}
      .cell b{font-size:12pt;letter-spacing:.05em}@media print{.noprint{display:none}}</style>
      <p class=noprint><button onclick='print()'>Imprimir / salvar PDF</button></p><div class=grid>${cells.join("")}</div>`);
    win.document.close();
  },
};

// ---------------------------------------------------------------- eventos

document.addEventListener("submit", (e) => {
  const form = e.target.closest("form[data-action]");
  if (!form) return;
  e.preventDefault();
  const fd = new FormData(form);
  const f = {};
  for (const [k, v] of fd.entries()) if (typeof v === "string") f[k] = v;
  run(() => forms[form.dataset.action](f, form));
});

document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-click]");
  if (el) {
    e.preventDefault();
    run(() => clicks[el.dataset.click]({ ...el.dataset }, el));
    return;
  }
  const row = e.target.closest("tr[data-href]");
  if (row && !e.target.closest("a,button,input")) location.hash = row.dataset.href;
});

document.addEventListener("change", (e) => {
  if (e.target.name !== "dkind") return;
  $app.querySelectorAll("[data-dform]").forEach((el) => { el.hidden = el.dataset.dform !== e.target.value; });
  if (location.hash.startsWith("#/gerar")) state.quick.tipo = e.target.value;
});

window.addEventListener("focus", () => { // pai e filho usando ao mesmo tempo: atualiza a lista ao voltar para a aba
  if (state.store && Date.now() - state.store.loadedAt > 60000 && (location.hash || "#/") === "#/") {
    run(async () => { await state.store.load(); render(); });
  }
});

if (MOCK) document.title = "Placas QR (teste)";
run(boot);
