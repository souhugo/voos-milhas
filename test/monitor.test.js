import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

process.env.PASTA_DADOS = await mkdtemp(path.join(tmpdir(), 'voos-'));
process.env.DEMO = 'true';
const monitor = await import('../src/monitor.js');
const { listarAvisos } = await import('../src/avisos.js');

const daqui = (dias) => new Date(Date.now() + dias * 86400000).toISOString().slice(0, 10);

test('valida alertas', () => {
  assert.ok(monitor.validarAlerta({ origem: 'SS', destino: 'GRU', ida: '2000-01-01', limite: 0 }).erros.length >= 3);
  const { alerta, erros } = monitor.validarAlerta({ origem: 'ssa', destino: 'lis', ida: daqui(30), limite: '70000', programa: 'Smiles' });
  assert.deepEqual(erros, []);
  assert.equal(alerta.origem, 'SSA');
  assert.equal(alerta.programa, 'Smiles');
});

test('melhor oferta respeita programa e voos diretos', () => {
  const voos = [
    { voos: ['G31'], paradas: 1, partida: '2026-12-10T08:00', ofertas: [{ tipo: 'pontos', programa: 'Smiles', valor: 9000 }] },
    { voos: ['G32'], paradas: 0, partida: '2026-12-10T09:00', ofertas: [{ tipo: 'pontos', programa: 'Smiles', valor: 12000 }] },
    { voos: ['LA1'], paradas: 0, partida: '2026-12-10T10:00', ofertas: [{ tipo: 'pontos', programa: 'LATAM Pass', valor: 5000 }] },
  ];
  assert.equal(monitor.melhorParaAlerta({ tipo: 'pontos', programa: 'Smiles' }, voos).valor, 9000);
  assert.equal(monitor.melhorParaAlerta({ tipo: 'pontos', programa: 'Smiles', soDiretos: true }, voos).valor, 12000);
  assert.equal(monitor.melhorParaAlerta({ tipo: 'pontos', programa: null }, voos).valor, 5000);
  assert.equal(monitor.melhorParaAlerta({ tipo: 'reais' }, voos), null);
});

test('alerta avisa uma vez quando o preço fica abaixo do limite', async () => {
  const { alerta } = await monitor.criarAlerta({ origem: 'SSA', destino: 'GRU', ida: daqui(20), limite: 10000000, tipo: 'pontos' });
  const primeira = await monitor.verificarAlerta(alerta);
  assert.ok(primeira.melhor, 'deveria ter achado preço abaixo do limite');
  const atualizado = (await monitor.listarAlertas()).find((a) => a.id === alerta.id);
  await monitor.verificarAlerta(atualizado);
  const avisos = (await listarAvisos()).filter((a) => a.tipo === 'preco');
  assert.equal(avisos.length, 1, 'mesmo preço não deve avisar de novo');
});

test('avisos de conta: saldo mudou, vencimento próximo e sessão expirada', async () => {
  const config = { ...monitor.CONFIG_PADRAO };
  await monitor.avisosDaConta(
    { id: 'smiles', nome: 'Smiles', status: 'conectado', saldo: 40000 },
    { id: 'smiles', nome: 'Smiles', status: 'conectado', saldo: 48200, vencimentos: [{ data: daqui(10), quantidade: 3200 }, { data: daqui(400), quantidade: 1 }] },
    config,
  );
  await monitor.avisosDaConta({ id: 'azul', nome: 'Azul Fidelidade', status: 'conectado' }, { id: 'azul', nome: 'Azul Fidelidade', status: 'desconectado' }, config);
  const tipos = (await listarAvisos()).map((a) => a.tipo);
  assert.ok(tipos.includes('saldo'));
  assert.equal(tipos.filter((t) => t === 'vencimento').length, 1, 'só o vencimento dentro do prazo');
  assert.ok(tipos.includes('conta'));
});

test('bônus da Livelo acima do mínimo vira aviso', async () => {
  await monitor.salvarConfig({ bonusMinimo: 80 });
  const bonus = await monitor.verificarBonus();
  assert.equal(bonus.Smiles, 90);
  const titulos = (await listarAvisos()).filter((a) => a.tipo === 'bonus').map((a) => a.titulo);
  assert.deepEqual(titulos, ['Livelo → Smiles com 90% de bônus']);
});
