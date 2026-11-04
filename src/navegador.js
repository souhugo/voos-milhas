// Abre as páginas públicas de busca num navegador de verdade (Playwright)
// e guarda as respostas JSON que o próprio site recebe.
//
// Por que um navegador? Smiles, LATAM e Azul não têm API pública e protegem
// as chamadas internas contra robôs. Abrindo o site como uma pessoa abriria,
// os dados chegam do mesmo jeito que chegam para você.

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const PASTA_PERFIL = path.resolve(process.env.PERFIL_NAVEGADOR || '.perfil-navegador');
const PASTA_DUMPS = path.resolve('dumps');
// Com a janela visível os sites bloqueiam bem menos. Use HEADLESS=true para escondê-la.
const HEADLESS = process.env.HEADLESS === 'true';
// "chrome" usa o Google Chrome instalado no computador (recomendado).
const CANAL = process.env.NAVEGADOR ?? 'chrome';

let contextoPromessa = null;

async function contexto() {
  if (!contextoPromessa) {
    contextoPromessa = (async () => {
      const { chromium } = await import('playwright');
      const opcoes = {
        headless: HEADLESS,
        locale: 'pt-BR',
        timezoneId: 'America/Sao_Paulo',
        viewport: { width: 1366, height: 860 },
        args: ['--disable-blink-features=AutomationControlled'],
      };
      try {
        return await chromium.launchPersistentContext(PASTA_PERFIL, { ...opcoes, channel: CANAL || undefined });
      } catch (erro) {
        if (!CANAL) throw erro;
        // Sem Chrome instalado: cai para o Chromium do Playwright.
        return chromium.launchPersistentContext(PASTA_PERFIL, opcoes);
      }
    })();
    contextoPromessa.catch(() => { contextoPromessa = null; });
  }
  return contextoPromessa;
}

export async function fecharNavegador() {
  if (!contextoPromessa) return;
  const ctx = await contextoPromessa.catch(() => null);
  contextoPromessa = null;
  await ctx?.close().catch(() => {});
}

/**
 * Abre `url` e devolve os corpos JSON das respostas cujo endereço passa em `filtro`.
 * Espera a primeira resposta útil e depois mais `folgaMs` sem novidades.
 */
export async function capturarJson({ fonte, url, filtro, timeoutMs = 60000, folgaMs = 4000 }) {
  const ctx = await contexto();
  const pagina = await ctx.newPage();
  const capturas = [];
  let ultimaEm = 0;

  pagina.on('response', async (resposta) => {
    try {
      if (!filtro(resposta.url())) return;
      const tipo = resposta.headers()['content-type'] || '';
      if (!tipo.includes('json')) return;
      const corpo = await resposta.json();
      capturas.push({ url: resposta.url(), status: resposta.status(), corpo });
      ultimaEm = Date.now();
    } catch {
      // resposta sem corpo ou página fechada: ignora
    }
  });

  try {
    await pagina.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    const limite = Date.now() + timeoutMs;
    while (Date.now() < limite) {
      if (ultimaEm && Date.now() - ultimaEm > folgaMs) break;
      await pagina.waitForTimeout(500);
    }
  } finally {
    await pagina.close().catch(() => {});
  }

  if (process.env.DEBUG_DUMP) {
    await mkdir(PASTA_DUMPS, { recursive: true });
    const arquivo = path.join(PASTA_DUMPS, `${fonte}-${Date.now()}.json`);
    await writeFile(arquivo, JSON.stringify({ url, capturas }, null, 2));
  }

  if (!capturas.length) {
    throw new Error('O site não devolveu resultados (pode ter pedido captcha ou mudado o formato).');
  }
  return capturas;
}
