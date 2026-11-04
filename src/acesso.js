// Senha de acesso ao app.
//
// Aberto pelo próprio computador (localhost), o app não pede senha.
// Aberto por qualquer outro endereço (ngrok, Tailscale), pede.
// A senha é guardada só como "hash" (scrypt), nunca em texto.
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { alterar, ler } from './dados.js';

const scryptAsync = promisify(scrypt);
export const COOKIE = 'voos_sessao';
const DIAS_SESSAO = 180;
const MAX_FALHAS = 10;
const BLOQUEIO_MS = 15 * 60 * 1000;
const falhas = { quantidade: 0, desde: 0 };

/**
 * true só quando a pessoa abriu o app no próprio computador.
 * Túneis (ngrok, Tailscale) chegam com cabeçalhos de repasse: esses contam como remotos
 * mesmo que o endereço pareça "localhost".
 */
export function ehLocal(req) {
  const h = req.headers;
  if (h['x-forwarded-for'] || h.forwarded || h['x-real-ip'] || h['x-forwarded-host']) return false;
  const nome = String(h.host || '').replace(/:\d+$/, '').replace(/^\[|\]$/g, '').toLowerCase();
  return ['localhost', '127.0.0.1', '::1'].includes(nome);
}

export async function temSenha() {
  return Boolean(await ler('senha', null));
}

export async function definirSenha(senha) {
  if (typeof senha !== 'string' || senha.length < 8) throw new Error('A senha precisa ter pelo menos 8 caracteres.');
  const sal = randomBytes(16);
  const hash = await scryptAsync(senha, sal, 64);
  await alterar('senha', null, () => ({ sal: sal.toString('hex'), hash: hash.toString('hex') }));
  // Trocar a senha desconecta todos os aparelhos.
  await alterar('sessoes', {}, () => ({}));
}

async function senhaConfere(senha) {
  const salvo = await ler('senha', null);
  if (!salvo || typeof senha !== 'string') return false;
  const hash = await scryptAsync(senha, Buffer.from(salvo.sal, 'hex'), 64);
  return timingSafeEqual(hash, Buffer.from(salvo.hash, 'hex'));
}

/** Confere a senha e devolve um token de sessão novo. */
export async function entrar(senha, aparelho = '') {
  if (falhas.quantidade >= MAX_FALHAS && Date.now() - falhas.desde < BLOQUEIO_MS) {
    throw new Error('Muitas tentativas erradas. Espere 15 minutos.');
  }
  if (!(await senhaConfere(senha))) {
    if (Date.now() - falhas.desde > BLOQUEIO_MS) Object.assign(falhas, { quantidade: 0, desde: Date.now() });
    falhas.quantidade += 1;
    throw new Error('Senha incorreta.');
  }
  falhas.quantidade = 0;
  const token = randomBytes(32).toString('hex');
  const expira = Date.now() + DIAS_SESSAO * 86400000;
  await alterar('sessoes', {}, (s) => {
    for (const [t, v] of Object.entries(s)) if (v.expira < Date.now()) delete s[t];
    s[token] = { expira, aparelho: String(aparelho).slice(0, 200), criada: new Date().toISOString() };
    return s;
  });
  return { token, maxAge: DIAS_SESSAO * 86400 };
}

export async function sair(token) {
  if (!token) return;
  await alterar('sessoes', {}, (s) => { delete s[token]; return s; });
}

export function lerCookie(req, nome = COOKIE) {
  const cabecalho = req.headers.cookie || '';
  for (const parte of cabecalho.split(';')) {
    const [k, ...v] = parte.trim().split('=');
    if (k === nome) return decodeURIComponent(v.join('='));
  }
  return null;
}

/** true se a requisição pode usar a API. */
export async function autorizado(req) {
  if (ehLocal(req)) return true;
  const token = lerCookie(req);
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return false;
  const sessoes = await ler('sessoes', {});
  return Boolean(sessoes[token] && sessoes[token].expira > Date.now());
}

export function cookieSessao(token, maxAge) {
  return `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}
