// Azul: tarifa em reais (cc=BRL) e em pontos Azul Fidelidade (cc=PTS).
import { capturarJson } from '../navegador.js';
import { menor, trecho } from '../util.js';

export function urlAzul({ origem, destino, data, adultos }, tipo) {
  const [a, m, d] = data.split('-');
  const p = new URLSearchParams({
    'c[0].ds': origem, 'c[0].as': destino, 'c[0].std': `${m}/${d}/${a}`,
    'p[0].t': 'ADT', 'p[0].c': adultos, 'p[0].cp': false,
    'f.dl': 3, 'f.dr': 3, cc: tipo === 'pontos' ? 'PTS' : 'BRL',
  });
  return `https://www.voeazul.com.br/br/pt/home/selecao-voo?${p}`;
}

function precoReais(fare) {
  return menor([
    ...(fare.paxFares || []).map((p) => p.totalAmount ?? p.fareAmount ?? p.originalAmount),
    fare.price?.amount, fare.totalAmount,
  ]);
}

function precoPontos(fare) {
  return menor([
    ...(fare.paxPoints || []).flatMap((p) => (p.levels || [p]).map((l) => l.points?.amount ?? l.points ?? l.amount)),
    fare.points?.amount, fare.totalPoints,
  ]);
}

function taxasPontos(fare) {
  return menor((fare.paxPoints || []).flatMap((p) => (p.levels || [p]).map((l) => l.money?.amount ?? l.taxes)));
}

export function lerAzul(capturas, busca, tipo) {
  const trechos = [];
  for (const { corpo } of capturas) {
    const viagens = corpo?.data?.trips || corpo?.trips || [];
    for (const viagem of viagens) {
      for (const j of viagem.journeys || []) {
        const id = j.identifier || {};
        const fares = j.fares || [];
        const valor = menor(fares.map(tipo === 'pontos' ? precoPontos : precoReais));
        if (!valor) continue;
        const pernas = j.segments || [];
        const voos = pernas.length
          ? pernas.map((s) => `${s.identifier?.carrierCode || 'AD'}${s.identifier?.flightNumber}`)
          : [`${id.carrierCode || 'AD'}${id.flightNumber}`];
        trechos.push(trecho({
          cia: 'AD',
          voos,
          origem: id.departureStation || busca.origem,
          destino: id.arrivalStation || busca.destino,
          partida: id.std,
          chegada: id.sta,
          duracao: id.duration,
          paradas: id.connections?.count ?? Math.max(pernas.length - 1, 0),
        }, {
          fonte: 'azul',
          tipo,
          programa: tipo === 'pontos' ? 'Azul Fidelidade' : null,
          valor,
          taxas: tipo === 'pontos' ? menor(fares.map(taxasPontos)) : null,
          link: urlAzul(busca, tipo),
        }));
      }
    }
  }
  return trechos;
}

export default {
  id: 'azul',
  nome: 'Azul',
  tipos: ['reais', 'pontos'],
  async buscar(busca, tipo) {
    const capturas = await capturarJson({
      fonte: `azul-${tipo}`,
      url: urlAzul(busca, tipo),
      filtro: (u) => u.includes('voeazul.com.br') && u.includes('availability'),
    });
    return lerAzul(capturas, busca, tipo);
  },
};
