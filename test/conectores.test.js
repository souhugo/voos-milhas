// Os exemplos abaixo imitam o formato das respostas dos sites. Se um site
// mudar o formato, rode com DEBUG_DUMP=1, olhe o arquivo em dumps/ e ajuste
// o leitor e o exemplo correspondente.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { lerAzul, urlAzul } from '../src/conectores/azul.js';
import { lerLatam, urlLatam } from '../src/conectores/latam.js';
import { lerSmiles, urlSmiles } from '../src/conectores/smiles.js';
import { juntar } from '../src/busca.js';

const busca = { origem: 'SSA', destino: 'GRU', data: '2026-12-10', adultos: 1 };

test('Smiles: lê milhas normais e do Clube', () => {
  const corpo = {
    requestedFlightSegmentList: [{
      flightList: [{
        stops: 0,
        departure: { date: '2026-12-10T06:15:00', airport: { code: 'SSA' } },
        arrival: { date: '2026-12-10T08:40:00', airport: { code: 'GRU' } },
        airline: { code: 'G3', name: 'GOL' },
        duration: { hours: 2, minutes: 25 },
        legList: [{ flightNumber: '1655', marketingAirline: { code: 'G3' } }],
        fareList: [
          { type: 'SMILES_CLUB', miles: 9800, money: 0 },
          { type: 'SMILES', miles: 11500, money: 0 },
          { type: 'SMILES_MONEY_CLUB', miles: 4000, money: 210.5 },
        ],
      }],
    }],
  };
  const t = lerSmiles([{ corpo }], busca);
  assert.equal(t.length, 2);
  assert.deepEqual(t[0].voos, ['G31655']);
  assert.equal(t[0].partida, '2026-12-10T06:15');
  assert.equal(t[0].duracaoMin, 145);
  assert.equal(t[0].oferta.valor, 11500);
  assert.equal(t[1].oferta.valor, 9800);
  assert.equal(t[1].oferta.nota, 'Clube Smiles');
});

test('LATAM: lê reais e pontos', () => {
  const corpo = {
    content: [{
      summary: {
        flightCode: 'LA3301',
        origin: { iataCode: 'SSA', departure: '2026-12-10T08:00:00' },
        destination: { iataCode: 'GRU', arrival: '2026-12-10T10:20:00' },
        duration: 140, stopsCount: 0,
        lowestPrice: { amount: 689.9, currency: 'BRL' },
        brands: [{ price: { amount: 689.9 } }, { price: { amount: 899.9 } }],
      },
      itinerary: [{ flight: { flightNumber: '3301', airlineCode: 'LA' } }],
    }],
  };
  const [t] = lerLatam([{ corpo }], busca, 'reais');
  assert.equal(t.oferta.valor, 689.9);
  assert.deepEqual(t.voos, ['LA3301']);
  assert.equal(t.chegada, '2026-12-10T10:20');
  const [p] = lerLatam([{ corpo }], busca, 'pontos');
  assert.equal(p.oferta.programa, 'LATAM Pass');
});

test('Azul: lê reais e pontos', () => {
  const corpo = {
    data: { trips: [{ journeys: [{
      identifier: { carrierCode: 'AD', flightNumber: '4050', departureStation: 'SSA', arrivalStation: 'GRU', std: '2026-12-10T11:05:00', sta: '2026-12-10T13:35:00', connections: { count: 0 } },
      fares: [
        { paxFares: [{ totalAmount: 540.3 }], paxPoints: [{ levels: [{ points: { amount: 21000 }, money: { amount: 41.2 } }] }] },
        { paxFares: [{ totalAmount: 720 }], paxPoints: [{ levels: [{ points: { amount: 28000 } }] }] },
      ],
    }] }] },
  };
  const [r] = lerAzul([{ corpo }], busca, 'reais');
  assert.equal(r.oferta.valor, 540.3);
  assert.equal(r.duracaoMin, 150);
  const [p] = lerAzul([{ corpo }], busca, 'pontos');
  assert.equal(p.oferta.valor, 21000);
  assert.equal(p.oferta.taxas, 41.2);
});

test('mesmo voo vindo de reais e pontos vira um cartão só', () => {
  const corpo = { content: [{ summary: { flightCode: 'LA3301', origin: { departure: '2026-12-10T08:00:00' }, destination: { arrival: '2026-12-10T10:20:00' }, lowestPrice: { amount: 700 } }, itinerary: [{ flight: { flightNumber: '3301', airlineCode: 'LA' } }] }] };
  const voos = juntar([...lerLatam([{ corpo }], busca, 'reais'), ...lerLatam([{ corpo }], busca, 'pontos')]);
  assert.equal(voos.length, 1);
  assert.equal(voos[0].ofertas.length, 2);
});

test('links abrem a busca pública de cada site', () => {
  assert.match(urlSmiles(busca), /originAirport=SSA.*destinationAirport=GRU/);
  assert.match(urlLatam(busca, 'pontos'), /redemption=true/);
  assert.match(urlAzul(busca, 'pontos'), /cc=PTS/);
  assert.match(urlAzul(busca, 'reais'), /c%5B0%5D.std=12%2F10%2F2026/);
});
