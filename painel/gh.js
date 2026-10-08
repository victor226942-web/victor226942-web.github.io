// Acesso ao GitHub (dados privados + publicacao das placas) e criptografia da chave de acesso.
import { DATA_REPO, OWNER, emptyDb, UserError } from "./core.js";

const API = "https://api.github.com";

export function b64encode(text) {
  const bytes = typeof text === "string" ? new TextEncoder().encode(text) : text;
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export function b64bytes(b64) {
  const bin = atob(b64.replace(/\s/g, ""));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

export const b64decode = (b64) => new TextDecoder().decode(b64bytes(b64));

export class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

/** Cliente minimo da API do GitHub, autenticado com a chave de acesso (fine-grained token). */
export class GitHub {
  constructor(token) { this.token = token; }

  async req(path, { method = "GET", body, accept = "application/vnd.github+json" } = {}) {
    const res = await fetch(API + path, {
      method,
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: accept,
        "X-GitHub-Api-Version": "2022-11-28",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      let msg = res.statusText;
      try { msg = (await res.json()).message || msg; } catch { /* corpo vazio */ }
      throw new ApiError(res.status, msg);
    }
    if (accept.endsWith(".raw")) return res.text();
    return res.status === 204 ? null : res.json();
  }

  repo(repo) { return this.req(`/repos/${OWNER}/${repo}`); }

  /** Le um arquivo JSON do repositorio. Devolve null se nao existir. */
  async readJson(repo, path) {
    let meta;
    try {
      meta = await this.req(`/repos/${OWNER}/${repo}/contents/${path}`);
    } catch (e) {
      if (e.status === 404) return null;
      throw e;
    }
    // acima de 1 MB a API nao manda o conteudo junto: busca o arquivo bruto
    const text = meta.content ? b64decode(meta.content)
      : await this.req(`/repos/${OWNER}/${repo}/contents/${path}`, { accept: "application/vnd.github.raw" });
    return { data: JSON.parse(text), sha: meta.sha };
  }

  /** Grava um arquivo (cria ou atualiza). sha = versao lida antes; conflito gera ApiError 409/422. */
  async writeFile(repo, path, text, sha, message) {
    const res = await this.req(`/repos/${OWNER}/${repo}/contents/${path}`, {
      method: "PUT",
      body: { message, content: b64encode(text), ...(sha ? { sha } : {}) },
    });
    return res.content.sha;
  }

  /** Publica varios arquivos num commit so (paginas das placas). */
  async commitFiles(repo, files, message) {
    const base = `/repos/${OWNER}/${repo}/git`;
    for (let attempt = 0; ; attempt++) {
      const ref = await this.req(`${base}/ref/heads/main`);
      const parent = await this.req(`${base}/commits/${ref.object.sha}`);
      const tree = await this.req(`${base}/trees`, {
        method: "POST",
        body: {
          base_tree: parent.tree.sha,
          tree: Object.entries(files).map(([path, content]) => ({ path, mode: "100644", type: "blob", content })),
        },
      });
      const commit = await this.req(`${base}/commits`, {
        method: "POST", body: { message, tree: tree.sha, parents: [ref.object.sha] },
      });
      try {
        await this.req(`${base}/refs/heads/main`, { method: "PATCH", body: { sha: commit.sha } });
        return commit.sha;
      } catch (e) {
        if (e.status !== 422 || attempt >= 3) throw e; // outro commit entrou no meio: tenta de novo
      }
    }
  }
}

/** Versao em memoria do GitHub, para testar o painel sem internet (?teste=1). */
export class MockGitHub {
  constructor() {
    this.files = JSON.parse(localStorage.getItem("qrMockFiles") || "{}");
    this.commits = JSON.parse(localStorage.getItem("qrMockCommits") || "[]");
  }
  persist() {
    localStorage.setItem("qrMockFiles", JSON.stringify(this.files));
    localStorage.setItem("qrMockCommits", JSON.stringify(this.commits));
  }
  async repo() { return { permissions: { push: true }, private: true }; }
  async readJson(repo, path) {
    const f = this.files[`${repo}/${path}`];
    return f ? { data: JSON.parse(f.text), sha: f.sha } : null;
  }
  async writeFile(repo, path, text, sha) {
    const key = `${repo}/${path}`;
    const current = this.files[key];
    if ((current?.sha || null) !== (sha || null)) throw new ApiError(409, "conflito");
    const newSha = Math.random().toString(16).slice(2);
    this.files[key] = { text, sha: newSha };
    this.persist();
    return newSha;
  }
  async commitFiles(repo, files, message) {
    for (const [path, content] of Object.entries(files)) this.files[`${repo}/${path}`] = { text: content, sha: "x" };
    this.commits.push({ repo, message, paths: Object.keys(files) });
    this.persist();
    return "mock";
  }
}

// ---------------------------------------------------------------- banco (db.json no repositorio privado)

export class Store {
  constructor(gh) { this.gh = gh; this.db = null; this.sha = null; this.loadedAt = 0; }

  async load() {
    const res = await this.gh.readJson(DATA_REPO, "db.json");
    this.db = res ? res.data : emptyDb();
    this.sha = res ? res.sha : null;
    this.loadedAt = Date.now();
    return this.db;
  }

  /** Aplica uma alteracao e grava. Se alguem gravou antes (pai/filho ao mesmo tempo), recarrega e refaz. */
  async mutate(fn, message) {
    for (let attempt = 0; ; attempt++) {
      if (attempt > 0 || !this.db) await this.load();
      const draft = structuredClone(this.db);
      const result = fn(draft);
      try {
        this.sha = await this.gh.writeFile(DATA_REPO, "db.json", JSON.stringify(draft), this.sha, message);
        this.db = draft;
        return result;
      } catch (e) {
        if (!(e.status === 409 || e.status === 422) || attempt >= 3) throw e;
      }
    }
  }
}

// ---------------------------------------------------------------- senha -> chave de acesso criptografada

const ITERATIONS = 600000;

async function deriveKey(password, salt, iterations) {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" }, material, { name: "AES-GCM", length: 256 }, false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptToken(token, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt, ITERATIONS);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(token)));
  return { v: 1, iter: ITERATIONS, salt: b64encode(salt), iv: b64encode(iv), ct: b64encode(ct) };
}

export async function decryptToken(cfg, password) {
  try {
    const key = await deriveKey(password, b64bytes(cfg.salt), cfg.iter);
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64bytes(cfg.iv) }, key, b64bytes(cfg.ct));
    return new TextDecoder().decode(pt);
  } catch {
    throw new UserError("Senha incorreta");
  }
}

/** Regras minimas para a senha que protege o painel publico. */
export function passwordProblem(password) {
  if (password.length < 12) return "Use pelo menos 12 caracteres.";
  if (/^\d+$/.test(password)) return "Não use só números.";
  return "";
}
