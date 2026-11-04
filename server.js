// Servidor local: http://localhost:3000
// Por segurança, só escuta neste computador (127.0.0.1). Para abrir no celular,
// use um túnel (ngrok ou Tailscale, veja o README). Pelo túnel, o app pede senha.
import { readFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SO_DEMO = process.argv.includes('--demo') || process.env.DEMO === 'true';
if (SO_DEMO) process.env.DEMO = 'true';

const { chavePublica, avisar, desinscrever, inscrever, listarAvisos } = await import('./src/avisos.js');
const { buscarTrecho, CONECTORES } = await import('./src/busca.js');
const { conectar, desconectar, listarContas, verificar } = await import('./src/contas.js');
const acesso = await import('./src/acesso.js');
const { ler } = await import('./src/dados.js');
const { fecharNavegador } = await import('./src/navegador.js');
const monitor = await import('./src/monitor.js');

const PASTA_PUBLICA = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');
const PORTA = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '127.0.0.1';
const FONTES_ATIVAS = SO_DEMO ? ['demo'] : ['smiles', 'latam', 'azul', 'demo'];
const FONTES_PADRAO = SO_DEMO ? ['demo'] : ['smiles', 'latam', 'azul'];

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
};

function json(res, status, corpo) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(corpo));
}

async function lerCorpo(req) {
  let texto = '';
  for await (const pedaco of req) {
    texto += pedaco;
    if (texto.length > 100000) throw new Error('Corpo grande demais.');
  }
  return texto ? JSON.parse(texto) : {};
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

async function rotaBuscar(res, url) {
  const { busca, erros } = lerBusca(url.searchParams);
  if (erros.length) return json(res, 400, { erros });
  const base = { adultos: busca.adultos, modo: busca.modo, fontes: busca.fontes };
  const [ida, volta] = await Promise.all([
    buscarTrecho({ ...base, origem: busca.origem, destino: busca.destino, data: busca.ida }),
    busca.volta ? buscarTrecho({ ...base, origem: busca.destino, destino: busca.origem, data: busca.volta }) : null,
  ]);
  return json(res, 200, { busca, ida, volta });
}

// Só responde quando aberto por estes endereços (evita que um site qualquer
// aberto no navegador consiga ler os dados pelo truque de "DNS rebinding").
const HOSTS_PERMITIDOS = (process.env.HOSTS_PERMITIDOS || '').split(',').map((h) => h.trim()).filter(Boolean);
export function hostPermitido(host = '') {
  const nome = host.replace(/:\d+$/, '').replace(/^\[|\]$/g, '').toLowerCase();
  const tuneis = ['.ts.net', '.ngrok-free.app', '.ngrok-free.dev', '.ngrok.app', '.ngrok.dev'];
  return ['localhost', '127.0.0.1', '::1'].includes(nome) || tuneis.some((t) => nome.endsWith(t)) || HOSTS_PERMITIDOS.includes(nome);
}

async function api(req, res, url) {
  // Ações exigem um cabeçalho que só o próprio app envia: outro site não
  // consegue mandar esse cabeçalho para cá sem permissão (CORS).
  if (req.method !== 'GET' && req.headers['x-voos'] !== '1') return json(res, 403, { erros: ['Proibido.'] });
  const rota = `${req.method} ${url.pathname}`;

  // Acesso: estas rotas funcionam sem estar logado.
  if (rota === 'GET /api/sessao') {
    return json(res, 200, { local: acesso.ehLocal(req), temSenha: await acesso.temSenha(), autorizado: await acesso.autorizado(req) });
  }
  if (rota === 'POST /api/senha') {
    // Criar ou trocar a senha: só no próprio computador.
    if (!acesso.ehLocal(req)) return json(res, 403, { erros: ['A senha só pode ser criada ou trocada no próprio computador.'] });
    try {
      await acesso.definirSenha((await lerCorpo(req)).senha);
    } catch (erro) {
      return json(res, 400, { erros: [erro.message] });
    }
    return json(res, 200, { ok: true });
  }
  if (rota === 'POST /api/login') {
    try {
      const { token, maxAge } = await acesso.entrar((await lerCorpo(req)).senha, req.headers['user-agent']);
      res.setHeader('set-cookie', acesso.cookieSessao(token, maxAge));
      return json(res, 200, { ok: true });
    } catch (erro) {
      return json(res, 401, { erros: [erro.message] });
    }
  }
  if (rota === 'POST /api/sair') {
    await acesso.sair(acesso.lerCookie(req));
    res.setHeader('set-cookie', acesso.cookieSessao('', 0));
    return json(res, 200, { ok: true });
  }
  if (!(await acesso.autorizado(req))) return json(res, 401, { erros: ['Entre com a senha do app.'], login: true });
  const partes = url.pathname.split('/').filter(Boolean); // ['api', 'contas', 'smiles', 'verificar']

  if (rota === 'GET /api/fontes') {
    return json(res, 200, {
      demo: SO_DEMO,
      padrao: FONTES_PADRAO,
      fontes: FONTES_ATIVAS.map((id) => ({ id, nome: CONECTORES[id].nome, tipos: CONECTORES[id].tipos })),
    });
  }
  if (rota === 'GET /api/buscar') return rotaBuscar(res, url);

  // Contas
  if (rota === 'GET /api/contas') {
    return json(res, 200, { contas: await listarContas(), bonus: await ler('bonus', null), monitor: monitor.statusMonitor() });
  }
  if (req.method === 'POST' && partes[1] === 'contas' && partes.length === 4) {
    const [, , id, acao] = partes;
    if (acao === 'conectar') return json(res, 200, await conectar(id));
    if (acao === 'verificar') {
      const anterior = (await listarContas()).find((c) => c.id === id);
      let atual;
      await monitor.rodar(`conta-${id}`, async () => {
        atual = await verificar(id);
        if (anterior) await monitor.avisosDaConta(anterior, atual, await monitor.lerConfig());
      });
      return json(res, 200, atual || { erro: 'Falha ao verificar.' });
    }
    if (acao === 'desconectar') { await desconectar(id); return json(res, 200, { ok: true }); }
  }
  if (rota === 'POST /api/bonus/verificar') {
    let bonus = {};
    await monitor.rodar('bonus', async () => { bonus = await monitor.verificarBonus(); });
    return json(res, 200, { bonus });
  }

  // Alertas
  if (rota === 'GET /api/alertas') return json(res, 200, { alertas: await monitor.listarAlertas() });
  if (rota === 'POST /api/alertas') {
    const resultado = await monitor.criarAlerta(await lerCorpo(req));
    return json(res, resultado.erros ? 400 : 201, resultado);
  }
  if (req.method === 'DELETE' && partes[1] === 'alertas' && partes.length === 3) {
    await monitor.apagarAlerta(partes[2]);
    return json(res, 200, { ok: true });
  }
  if (req.method === 'POST' && partes[1] === 'alertas' && partes[3] === 'verificar') {
    const alerta = (await monitor.listarAlertas()).find((a) => a.id === partes[2]);
    if (!alerta) return json(res, 404, { erros: ['Alerta não encontrado.'] });
    let atual;
    await monitor.rodar('alerta', async () => { atual = await monitor.verificarAlerta(alerta); });
    return json(res, 200, { alerta: atual });
  }

  // Avisos e notificações
  if (rota === 'GET /api/avisos') return json(res, 200, { avisos: await listarAvisos() });
  if (rota === 'GET /api/push/chave') return json(res, 200, { chave: await chavePublica() });
  if (rota === 'POST /api/push/inscrever') { await inscrever(await lerCorpo(req)); return json(res, 200, { ok: true }); }
  if (rota === 'POST /api/push/desinscrever') { await desinscrever((await lerCorpo(req)).endpoint); return json(res, 200, { ok: true }); }
  if (rota === 'POST /api/push/teste') {
    await avisar({ tipo: 'teste', titulo: 'Notificações funcionando ✈️', texto: 'Você vai receber aqui os avisos de pontos e preços.' });
    return json(res, 200, { ok: true });
  }

  // Configurações
  if (rota === 'GET /api/config') return json(res, 200, await monitor.lerConfig());
  if (rota === 'POST /api/config') return json(res, 200, await monitor.salvarConfig(await lerCorpo(req)));
  if (rota === 'POST /api/monitor/rodar') {
    monitor.rodar('contas', async () => { await monitor.verificarContas(); await monitor.verificarBonus(); });
    monitor.rodar('alertas', monitor.verificarAlertas);
    return json(res, 202, { ok: true });
  }

  json(res, 404, { erros: ['Rota não encontrada.'] });
}

async function arquivo(res, url) {
  const nome = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
  const caminho = path.join(PASTA_PUBLICA, path.normalize(nome));
  if (!caminho.startsWith(PASTA_PUBLICA)) return json(res, 403, { erros: ['Proibido.'] });
  try {
    const conteudo = await readFile(caminho);
    const cabecalhos = { 'content-type': TIPOS[path.extname(caminho)] || 'application/octet-stream' };
    if (nome === 'sw.js') cabecalhos['cache-control'] = 'no-cache';
    res.writeHead(200, cabecalhos);
    res.end(conteudo);
  } catch {
    json(res, 404, { erros: ['Arquivo não encontrado.'] });
  }
}

export const servidor = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (!hostPermitido(req.headers.host)) return json(res, 403, { erros: ['Endereço não permitido. Veja HOSTS_PERMITIDOS no README.'] });
  try {
    if (url.pathname.startsWith('/api/')) await api(req, res, url);
    else await arquivo(res, url);
  } catch (erro) {
    console.error(erro);
    json(res, erro instanceof SyntaxError ? 400 : 500, { erros: [erro.message] });
  }
});

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  servidor.listen(PORTA, HOST, () => {
    console.log(`Voos em Reais e Pontos em http://localhost:${PORTA}${SO_DEMO ? ' (modo demonstração)' : ''}`);
    if (HOST !== '127.0.0.1' && HOST !== 'localhost') {
      console.warn(`Atenção: aceitando conexões de outros aparelhos em ${HOST}. Qualquer pessoa na rede pode abrir.`);
    }
  });
  monitor.iniciarMonitor();
  const sair = async () => { await fecharNavegador(); process.exit(0); };
  process.on('SIGINT', sair);
  process.on('SIGTERM', sair);
}
