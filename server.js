// Servidor local: http://localhost:3000
import { readFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buscarTrecho, CONECTORES } from './src/busca.js';
import { fecharNavegador } from './src/navegador.js';

const PASTA_PUBLICA = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');
const PORTA = Number(process.env.PORT) || 3000;
const SO_DEMO = process.argv.includes('--demo') || process.env.DEMO === 'true';
const FONTES_ATIVAS = SO_DEMO ? ['demo'] : ['smiles', 'latam', 'azul', 'demo'];
const FONTES_PADRAO = SO_DEMO ? ['demo'] : ['smiles', 'latam', 'azul'];

const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };

function json(res, status, corpo) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(corpo));
}

export function lerBusca(params) {
  const iata = (v) => String(v || '').trim().toUpperCase();
  const busca = {
    origem: iata(params.get('origem')),
    destino: iata(params.get('destino')),
    ida: params.get('ida') || '',
    volta: params.get('volta') || '',
    adultos: Number(params.get('adultos') || 1),
    modo: params.get('modo') || 'ambos',
    fontes: (params.get('fontes') || FONTES_PADRAO.join(',')).split(',').filter((f) => FONTES_ATIVAS.includes(f)),
  };
  const erros = [];
  if (!/^[A-Z]{3}$/.test(busca.origem)) erros.push('Origem deve ser o código do aeroporto (ex.: SSA).');
  if (!/^[A-Z]{3}$/.test(busca.destino)) erros.push('Destino deve ser o código do aeroporto (ex.: GRU).');
  if (busca.origem && busca.origem === busca.destino) erros.push('Origem e destino são iguais.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(busca.ida)) erros.push('Informe a data de ida.');
  if (busca.volta && !/^\d{4}-\d{2}-\d{2}$/.test(busca.volta)) erros.push('Data de volta inválida.');
  if (busca.volta && busca.volta < busca.ida) erros.push('A volta é antes da ida.');
  if (!Number.isInteger(busca.adultos) || busca.adultos < 1 || busca.adultos > 9) erros.push('Adultos: de 1 a 9.');
  if (!['reais', 'pontos', 'ambos'].includes(busca.modo)) erros.push('Modo inválido.');
  if (!busca.fontes.length) erros.push('Escolha ao menos uma fonte.');
  return { busca, erros };
}

async function api(req, res, url) {
  if (url.pathname === '/api/fontes') {
    return json(res, 200, {
      demo: SO_DEMO,
      padrao: FONTES_PADRAO,
      fontes: FONTES_ATIVAS.map((id) => ({ id, nome: CONECTORES[id].nome, tipos: CONECTORES[id].tipos })),
    });
  }
  if (url.pathname === '/api/buscar') {
    const { busca, erros } = lerBusca(url.searchParams);
    if (erros.length) return json(res, 400, { erros });
    const base = { adultos: busca.adultos, modo: busca.modo, fontes: busca.fontes };
    const [ida, volta] = await Promise.all([
      buscarTrecho({ ...base, origem: busca.origem, destino: busca.destino, data: busca.ida }),
      busca.volta ? buscarTrecho({ ...base, origem: busca.destino, destino: busca.origem, data: busca.volta }) : null,
    ]);
    return json(res, 200, { busca, ida, volta });
  }
  json(res, 404, { erros: ['Rota não encontrada.'] });
}

async function arquivo(res, url) {
  const nome = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
  const caminho = path.join(PASTA_PUBLICA, path.normalize(nome));
  if (!caminho.startsWith(PASTA_PUBLICA)) return json(res, 403, { erros: ['Proibido.'] });
  try {
    const conteudo = await readFile(caminho);
    res.writeHead(200, { 'content-type': TIPOS[path.extname(caminho)] || 'application/octet-stream' });
    res.end(conteudo);
  } catch {
    json(res, 404, { erros: ['Arquivo não encontrado.'] });
  }
}

export const servidor = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname.startsWith('/api/')) await api(req, res, url);
    else await arquivo(res, url);
  } catch (erro) {
    console.error(erro);
    json(res, 500, { erros: [erro.message] });
  }
});

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  servidor.listen(PORTA, () => {
    console.log(`Buscador de voos em http://localhost:${PORTA}${SO_DEMO ? ' (modo demonstração)' : ''}`);
  });
  const sair = async () => { await fecharNavegador(); process.exit(0); };
  process.on('SIGINT', sair);
  process.on('SIGTERM', sair);
}
