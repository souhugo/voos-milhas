import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

process.env.DEMO = 'true';
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
