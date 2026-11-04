// Smiles (GOL e parceiras), somente em milhas.
import { capturarJson } from '../navegador.js';
import { menor, numero, trecho } from '../util.js';

export function urlSmiles({ origem, destino, data, adultos }) {
  const ida = Date.parse(`${data}T12:00:00-03:00`);
  const p = new URLSearchParams({
    adults: adultos, children: 0, infants: 0, cabin: 'ALL',
    departureDate: ida, returnDate: '', tripType: 2, segments: 1, searchType: 'g3',
    originAirport: origem, destinationAirport: destino,
    originAirportIsAny: false, destinAirportIsAny: false,
    isFlexibleDateChecked: false, 'novo-resultado-voos': true,
  });
  return `https://www.smiles.com.br/mfe/emissao-passagem/?${p}`;
}

function tarifa(lista, tipo) {
  return menor(lista.filter((f) => f.type === tipo && !numero(f.money)).map((f) => f.miles));
}

export function lerSmiles(capturas, { origem, destino, adultos }) {
  const trechos = [];
  for (const { corpo } of capturas) {
    for (const segmento of corpo?.requestedFlightSegmentList || []) {
      for (const voo of segmento.flightList || []) {
        const pernas = voo.legList || [];
        const cia = pernas[0]?.marketingAirline?.code || voo.airline?.code;
        const base = {
          cia,
          ciaNome: voo.airline?.name,
          voos: pernas.map((p) => `${p.marketingAirline?.code || cia}${p.flightNumber}`),
          origem: voo.departure?.airport?.code || origem,
          destino: voo.arrival?.airport?.code || destino,
          partida: voo.departure?.date,
          chegada: voo.arrival?.date,
          duracao: voo.duration,
          paradas: voo.stops,
        };
        const taxas = numero(voo.boardingTax?.total ?? voo.airlineTax);
        const link = urlSmiles({ origem, destino, data: base.partida?.slice(0, 10), adultos });
        const fares = voo.fareList || [];
        const normal = tarifa(fares, 'SMILES');
        const clube = tarifa(fares, 'SMILES_CLUB');
        if (normal) trechos.push(trecho(base, { fonte: 'smiles', tipo: 'pontos', programa: 'Smiles', valor: normal, taxas, link }));
        if (clube && clube !== normal) {
          trechos.push(trecho(base, { fonte: 'smiles', tipo: 'pontos', programa: 'Smiles', valor: clube, taxas, link, nota: 'Clube Smiles' }));
        }
      }
    }
  }
  return trechos;
}

export default {
  id: 'smiles',
  nome: 'Smiles',
  tipos: ['pontos'],
  async buscar(busca) {
    const capturas = await capturarJson({
      fonte: 'smiles',
      url: urlSmiles(busca),
      filtro: (u) => u.includes('smiles.com.br') && u.includes('/airlines/search'),
    });
    return lerSmiles(capturas, busca);
  },
};
