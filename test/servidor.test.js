import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';

process.env.DEMO = 'true';
process.env.PASTA_DADOS = await mkdtemp(path.join(tmpdir(), 'voos-srv-'));
const { servidor } = await import('../server.js');
let base;

before(async () => {
  await new Promise((ok) => servidor.listen(0, ok));
  base = `http://localhost:${servidor.address().port}`;
});
after(() => servidor.close());

test('busca de ida e volta no modo demonstração', async () => {
  const r = await fetch(`${base}/api/buscar?origem=ssa&destino=GRU&ida=2026-12-10&volta=2026-12-17&modo=ambos`);
  assert.equal(r.status, 200);
  const dados = await r.json();
  assert.ok(dados.ida.voos.length > 0);
  assert.ok(dados.volta.voos.length > 0);
  assert.equal(dados.volta.voos[0].origem, 'GRU');
  const comDoisTipos = dados.ida.voos.find((v) => v.ofertas.some((o) => o.tipo === 'reais') && v.ofertas.some((o) => o.tipo === 'pontos'));
  assert.ok(comDoisTipos, 'voos LATAM/Azul devem ter reais e pontos juntos');
});

test('valida a busca', async () => {
  const r = await fetch(`${base}/api/buscar?origem=SS&destino=GRU&ida=`);
  assert.equal(r.status, 400);
  assert.ok((await r.json()).erros.length >= 2);
});

test('não serve arquivos fora da pasta public', async () => {
  const r = await fetch(`${base}/..%2Fpackage.json`);
  assert.notEqual(r.status, 200);
});

const acao = (caminho, corpo, extra = {}) => fetch(`${base}${caminho}`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-voos': '1', ...extra },
  body: corpo ? JSON.stringify(corpo) : undefined,
});

test('ações sem o cabeçalho do app são recusadas', async () => {
  const r = await fetch(`${base}/api/push/teste`, { method: 'POST' });
  assert.equal(r.status, 403);
});

test('recusa endereços desconhecidos (DNS rebinding)', async () => {
  const { hostPermitido } = await import('../server.js');
  assert.equal(hostPermitido('localhost:3000'), true);
  assert.equal(hostPermitido('meupc.tail1234.ts.net'), true);
  assert.equal(hostPermitido('site-malicioso.com'), false);
});

test('contas: conectar e verificar no modo demonstração', async () => {
  assert.equal((await acao('/api/contas/smiles/conectar')).status, 200);
  const r = await acao('/api/contas/smiles/verificar');
  const conta = await r.json();
  assert.equal(conta.status, 'conectado');
  assert.equal(conta.saldo, 48200);
  const lista = await (await fetch(`${base}/api/contas`)).json();
  assert.equal(lista.contas.find((c) => c.id === 'smiles').status, 'conectado');
  assert.equal(lista.contas.find((c) => c.id === 'livelo').status, 'nunca');
});

test('alertas: criar, listar e apagar', async () => {
  const ida = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  const criado = await acao('/api/alertas', { origem: 'SSA', destino: 'GRU', ida, limite: 50000, tipo: 'pontos' });
  assert.equal(criado.status, 201);
  const { alerta } = await criado.json();
  const ruim = await acao('/api/alertas', { origem: 'X' });
  assert.equal(ruim.status, 400);
  assert.equal((await (await fetch(`${base}/api/alertas`)).json()).alertas.length, 1);
  await fetch(`${base}/api/alertas/${alerta.id}`, { method: 'DELETE', headers: { 'x-voos': '1' } });
  assert.equal((await (await fetch(`${base}/api/alertas`)).json()).alertas.length, 0);
});

test('notificações: chave pública e aviso de teste', async () => {
  const { chave } = await (await fetch(`${base}/api/push/chave`)).json();
  assert.ok(chave.length > 40);
  assert.equal((await acao('/api/push/teste')).status, 200);
  const { avisos } = await (await fetch(`${base}/api/avisos`)).json();
  assert.equal(avisos[0].tipo, 'teste');
});

test('serve o manifesto e o service worker', async () => {
  const m = await fetch(`${base}/manifest.webmanifest`);
  assert.equal(m.headers.get('content-type'), 'application/manifest+json');
  assert.equal((await fetch(`${base}/sw.js`)).status, 200);
});

// Requisição como se viesse pelo túnel (outro endereço + cabeçalho de repasse).
const remoto = (caminho, opcoes = {}) => fetch(`${base}${caminho}`, {
  ...opcoes,
  headers: { host: 'meupc.tail1234.ts.net', 'x-forwarded-for': '200.1.2.3', 'x-voos': '1', 'content-type': 'application/json', ...opcoes.headers },
});

test('senha: pelo túnel, pede login; no computador, não', async () => {
  assert.equal((await fetch(`${base}/api/contas`)).status, 200);
  const r = await remoto('/api/contas');
  assert.equal(r.status, 401);
  assert.equal((await r.json()).login, true);
  // Mesmo dizendo "localhost", com cabeçalho de repasse continua remoto.
  assert.equal((await remoto('/api/contas', { headers: { host: 'localhost:3000' } })).status, 401);
  // Arquivos da tela abrem (não têm dados), para mostrar a página de login.
  assert.equal((await remoto('/login.html')).status, 200);
});

test('senha: só pode ser criada no computador, e o login funciona', async () => {
  assert.equal((await remoto('/api/senha', { method: 'POST', body: JSON.stringify({ senha: 'invasor123' }) })).status, 403);
  assert.equal((await acao('/api/senha', { senha: 'curta' })).status, 400);
  assert.equal((await acao('/api/senha', { senha: 'minha-senha-boa' })).status, 200);

  const errada = await remoto('/api/login', { method: 'POST', body: JSON.stringify({ senha: 'nao-e-essa' }) });
  assert.equal(errada.status, 401);

  const certa = await remoto('/api/login', { method: 'POST', body: JSON.stringify({ senha: 'minha-senha-boa' }) });
  assert.equal(certa.status, 200);
  const cookie = certa.headers.get('set-cookie');
  assert.match(cookie, /HttpOnly; Secure; SameSite=Lax/);
  const sessao = cookie.split(';')[0];

  assert.equal((await remoto('/api/contas', { headers: { cookie: sessao } })).status, 200);
  assert.equal((await remoto('/api/contas', { headers: { cookie: 'voos_sessao=' + 'a'.repeat(64) } })).status, 401);

  await remoto('/api/sair', { method: 'POST', headers: { cookie: sessao } });
  assert.equal((await remoto('/api/contas', { headers: { cookie: sessao } })).status, 401);
});
