// Roda as fontes em paralelo e junta as ofertas do mesmo voo.
import azul from './conectores/azul.js';
import demo from './conectores/demo.js';
import latam from './conectores/latam.js';
import smiles from './conectores/smiles.js';

export const CONECTORES = { smiles, latam, azul, demo };

const CACHE_MS = 15 * 60 * 1000;
const TEMPO_MAX_MS = 90 * 1000;
const cache = new Map();

/** Mesma companhia + mesmo primeiro voo + mesmo horário = mesmo voo. */
export function chaveVoo(t) {
  return `${t.voos[0] || t.cia}|${t.partida}`;
}

export function juntar(trechos) {
  const mapa = new Map();
  for (const t of trechos) {
    const chave = chaveVoo(t);
    const { oferta, ...voo } = t;
    if (!mapa.has(chave)) mapa.set(chave, { id: chave, ...voo, ofertas: [] });
    const atual = mapa.get(chave);
    const repetida = atual.ofertas.some((o) =>
      o.fonte === oferta.fonte && o.tipo === oferta.tipo && o.valor === oferta.valor && o.nota === oferta.nota);
    if (!repetida) atual.ofertas.push(oferta);
  }
  return [...mapa.values()].sort((a, b) => (a.partida || '').localeCompare(b.partida || ''));
}

function comTempoMax(promessa, ms) {
  let timer;
  const limite = new Promise((_, falha) => {
    timer = setTimeout(() => falha(new Error(`Sem resposta em ${ms / 1000}s`)), ms);
  });
  return Promise.race([promessa, limite]).finally(() => clearTimeout(timer));
}

async function rodar(conector, busca, tipo) {
  const chave = JSON.stringify([conector.id, tipo, busca.origem, busca.destino, busca.data, busca.adultos]);
  const guardado = cache.get(chave);
  if (guardado && Date.now() - guardado.em < CACHE_MS) {
    return { ...guardado.resultado, cache: true };
  }
  const inicio = Date.now();
  try {
    const trechos = await comTempoMax(conector.buscar(busca, tipo), TEMPO_MAX_MS);
    const resultado = { fonte: conector.id, nome: conector.nome, tipo, ok: true, qtd: trechos.length, ms: Date.now() - inicio, trechos };
    cache.set(chave, { em: Date.now(), resultado });
    return resultado;
  } catch (erro) {
    return { fonte: conector.id, nome: conector.nome, tipo, ok: false, erro: erro.message, ms: Date.now() - inicio, trechos: [] };
  }
}

/** busca = { origem, destino, data, adultos, modo: 'reais'|'pontos'|'ambos', fontes: ['smiles', ...] } */
export async function buscarTrecho(busca) {
  const tipos = busca.modo === 'ambos' ? ['reais', 'pontos'] : [busca.modo];
  const tarefas = [];
  for (const id of busca.fontes) {
    const conector = CONECTORES[id];
    if (!conector) continue;
    for (const tipo of conector.tipos) {
      if (tipos.includes(tipo)) tarefas.push(rodar(conector, busca, tipo));
    }
  }
  const resultados = await Promise.all(tarefas);
  return {
    voos: juntar(resultados.flatMap((r) => r.trechos)),
    status: resultados.map(({ trechos, ...r }) => r),
  };
}
