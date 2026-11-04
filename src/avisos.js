// Avisos: ficam salvos (aba "Avisos") e são enviados como notificação para os
// celulares e computadores que ativaram as notificações no app.
import { randomUUID } from 'node:crypto';
import { alterar, ler } from './dados.js';

const MAX_AVISOS = 200;
let webpush = null;
let chaves = null;

async function prepararPush() {
  if (webpush) return webpush;
  webpush = (await import('web-push')).default;
  chaves = await ler('vapid', null);
  if (!chaves) {
    chaves = webpush.generateVAPIDKeys();
    await alterar('vapid', null, () => chaves);
  }
  webpush.setVapidDetails('mailto:voos-milhas@localhost', chaves.publicKey, chaves.privateKey);
  return webpush;
}

export async function chavePublica() {
  await prepararPush();
  return chaves.publicKey;
}

export async function inscrever(inscricao) {
  if (!inscricao?.endpoint || !inscricao?.keys?.p256dh || !inscricao?.keys?.auth) {
    throw new Error('Inscrição de notificação inválida.');
  }
  await alterar('inscricoes', [], (lista) => [
    ...lista.filter((i) => i.endpoint !== inscricao.endpoint),
    { endpoint: inscricao.endpoint, keys: inscricao.keys, em: new Date().toISOString() },
  ]);
}

export async function desinscrever(endpoint) {
  await alterar('inscricoes', [], (lista) => lista.filter((i) => i.endpoint !== endpoint));
}

export function listarAvisos() {
  return ler('avisos', []);
}

/**
 * Registra um aviso e manda a notificação.
 * `chave` evita repetir o mesmo aviso: se já houver um com a mesma chave, não envia de novo.
 */
export async function avisar({ titulo, texto, tipo = 'geral', chave = null, link = '/' }) {
  let novo = null;
  await alterar('avisos', [], (lista) => {
    if (chave && lista.some((a) => a.chave === chave)) return lista;
    novo = { id: randomUUID(), em: new Date().toISOString(), tipo, titulo, texto, chave, link };
    return [novo, ...lista].slice(0, MAX_AVISOS);
  });
  if (novo) await enviarPush(novo);
  return novo;
}

async function enviarPush(aviso) {
  const inscricoes = await ler('inscricoes', []);
  if (!inscricoes.length) return;
  const push = await prepararPush();
  const corpo = JSON.stringify({ titulo: aviso.titulo, texto: aviso.texto, link: aviso.link, id: aviso.id });
  const expiradas = [];
  await Promise.all(inscricoes.map(async (inscricao) => {
    try {
      await push.sendNotification(inscricao, corpo, { TTL: 24 * 3600 });
    } catch (erro) {
      // 404/410: o aparelho desativou as notificações ou o app foi removido.
      if (erro.statusCode === 404 || erro.statusCode === 410) expiradas.push(inscricao.endpoint);
      else console.error('Falha ao enviar notificação:', erro.statusCode || erro.message);
    }
  }));
  for (const endpoint of expiradas) await desinscrever(endpoint);
}
