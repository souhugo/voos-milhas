import assert from 'node:assert/strict';
import { test } from 'node:test';
import { lerBonus, lerSaldo, lerVencimentos } from '../src/contas.js';

test('saldo: prefere o campo mais específico', () => {
  const corpo = { member: { name: 'Hugo', miles: 10, availableMiles: 48200 } };
  assert.equal(lerSaldo([{ corpo }]), 48200);
});

test('saldo: aceita {amount} dentro de balance', () => {
  const corpo = { data: { balance: { amount: 23750, currency: 'PTS' } } };
  assert.equal(lerSaldo([{ corpo }]), 23750);
});

test('saldo: ignora "amount" solto (pode ser preço)', () => {
  assert.equal(lerSaldo([{ corpo: { price: { amount: 599 } } }]), null);
});

test('saldo: cai para o texto da página', () => {
  assert.equal(lerSaldo([], 'Olá, Hugo\nVocê tem 61.000 pontos disponíveis'), 61000);
});

test('vencimentos: acha data e quantidade, em ordem', () => {
  const corpo = { expirations: [
    { expirationDate: '2027-03-31T00:00:00', miles: 1500 },
    { dataVencimento: '15/01/2027', quantidade: 3200 },
  ] };
  assert.deepEqual(lerVencimentos([{ corpo }]), [
    { data: '2027-01-15', quantidade: 3200 },
    { data: '2027-03-31', quantidade: 1500 },
  ]);
});

test('bônus da Livelo: lê o percentual de cada parceiro', () => {
  const texto = [
    'Transfira seus pontos',
    'Smiles',
    'Até 100% de bônus',
    'LATAM Pass: bônus de até 30%',
    'Azul Fidelidade',
    'Sem promoção no momento',
  ].join('\n');
  assert.deepEqual(lerBonus(texto), { Smiles: 100, 'LATAM Pass': 30 });
});
