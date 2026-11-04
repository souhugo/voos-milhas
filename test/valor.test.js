import assert from 'node:assert/strict';
import { test } from 'node:test';
import { custoEmReais, melhorOferta, milheiroObtido } from '../public/valor.js';

const voo = {
  ofertas: [
    { tipo: 'reais', fonte: 'latam', valor: 1230 },
    { tipo: 'pontos', programa: 'LATAM Pass', valor: 30000, taxas: 30 },
  ],
};

test('milheiro obtido desconta as taxas do preço em reais', () => {
  assert.equal(milheiroObtido(voo, voo.ofertas[1]), 40);
});

test('pontos viram reais pelo custo do milheiro', () => {
  assert.equal(custoEmReais(voo.ofertas[1], { 'LATAM Pass': 25 }), 780);
});

test('melhor oferta compara tudo em reais', () => {
  assert.equal(melhorOferta(voo, { 'LATAM Pass': 25 }).oferta.tipo, 'pontos');
  assert.equal(melhorOferta(voo, { 'LATAM Pass': 45 }).oferta.tipo, 'reais');
});

test('sem preço em reais não há milheiro obtido', () => {
  const soPontos = { ofertas: [voo.ofertas[1]] };
  assert.equal(milheiroObtido(soPontos, soPontos.ofertas[0]), null);
});
