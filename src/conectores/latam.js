// LATAM: tarifa em reais e em pontos LATAM Pass (mesma página, parâmetro redemption).
import { capturarJson } from '../navegador.js';
import { menor, numero, trecho } from '../util.js';

export function urlLatam({ origem, destino, data, adultos }, tipo) {
  const p = new URLSearchParams({
    origin: origem, destination: destino,
    outbound: `${data}T12:00:00.000Z`, inbound: 'null',
    adt: adultos, chd: 0, inf: 0, trip: 'OW', cabin: 'Economy',
    redemption: tipo === 'pontos', sort: 'RECOMMENDED',
  });
  return `https://www.latamairlines.com/br/pt/oferta-voos?${p}`;
}

export function lerLatam(capturas, busca, tipo) {
  const trechos = [];
  for (const { corpo } of capturas) {
    for (const item of corpo?.content || []) {
      const s = item.summary || {};
      const pernas = item.itinerary || [];
      const precos = [s.lowestPrice, ...(s.brands || []).map((b) => b.price)].filter(Boolean);
      const valor = menor(precos.map((p) => p.amount));
      if (!valor) continue;
      const taxas = tipo === 'pontos'
        ? menor(precos.map((p) => p.taxes ?? p.taxAmount ?? p.money?.amount))
        : null;
      const voos = pernas.length
        ? pernas.map((p) => p.flight?.flightNumber && `${p.flight.airlineCode || 'LA'}${p.flight.flightNumber}`)
        : [s.flightCode];
      trechos.push(trecho({
        cia: 'LA',
        voos,
        origem: s.origin?.iataCode || busca.origem,
        destino: s.destination?.iataCode || busca.destino,
        partida: s.origin?.departure,
        chegada: s.destination?.arrival,
        duracao: numero(s.duration),
        paradas: s.stopsCount,
      }, {
        fonte: 'latam',
        tipo,
        programa: tipo === 'pontos' ? 'LATAM Pass' : null,
        valor,
        taxas,
        link: urlLatam(busca, tipo),
      }));
    }
  }
  return trechos;
}

export default {
  id: 'latam',
  nome: 'LATAM',
  tipos: ['reais', 'pontos'],
  async buscar(busca, tipo) {
    const capturas = await capturarJson({
      fonte: `latam-${tipo}`,
      url: urlLatam(busca, tipo),
      filtro: (u) => u.includes('latamairlines.com') && u.includes('/offers/search'),
    });
    return lerLatam(capturas, busca, tipo);
  },
};
