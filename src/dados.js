// Guarda pequenos arquivos JSON na pasta dados/ (só neste computador).
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

const PASTA = path.resolve(process.env.PASTA_DADOS || 'dados');
const filas = new Map();

export async function ler(nome, padrao) {
  try {
    return JSON.parse(await readFile(path.join(PASTA, `${nome}.json`), 'utf8'));
  } catch {
    return structuredClone(padrao);
  }
}

export async function gravar(nome, valor) {
  await mkdir(PASTA, { recursive: true });
  const destino = path.join(PASTA, `${nome}.json`);
  const temporario = `${destino}.${process.pid}.tmp`;
  await writeFile(temporario, JSON.stringify(valor, null, 2));
  await rename(temporario, destino);
}

/** Lê, altera e grava, um de cada vez por arquivo, para não perder alterações. */
export function alterar(nome, padrao, mudar) {
  const anterior = filas.get(nome) || Promise.resolve();
  const proxima = anterior.then(async () => {
    const atual = await ler(nome, padrao);
    const novo = (await mudar(atual)) ?? atual;
    await gravar(nome, novo);
    return novo;
  });
  filas.set(nome, proxima.catch(() => {}));
  return proxima;
}
