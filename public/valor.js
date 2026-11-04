// Contas de "vale a pena usar pontos?". Usado pela tela e pelos testes.

/** Quanto você paga, em média, por 1.000 pontos de cada programa (editável na tela). */
export const CUSTO_MILHEIRO_PADRAO = {
  Smiles: 17,
  'LATAM Pass': 25,
  'Azul Fidelidade': 15,
};

/** Custo em reais de uma oferta. Pontos viram reais pelo seu custo do milheiro. */
export function custoEmReais(oferta, custos = CUSTO_MILHEIRO_PADRAO) {
  if (oferta.tipo === 'reais') return oferta.valor;
  const custo = custos[oferta.programa];
  if (!custo) return null;
  return (oferta.valor / 1000) * custo + (oferta.taxas || 0);
}

/** Menor preço em reais do mesmo voo, se alguma fonte trouxe. */
export function precoReais(voo) {
  const reais = voo.ofertas.filter((o) => o.tipo === 'reais').map((o) => o.valor);
  return reais.length ? Math.min(...reais) : null;
}

/**
 * Quanto cada 1.000 pontos "rendem" nesta passagem:
 * (preço em reais − taxas pagas em reais) ÷ (pontos ÷ 1.000).
 */
export function milheiroObtido(voo, oferta) {
  if (oferta.tipo !== 'pontos' || !oferta.valor) return null;
  const reais = precoReais(voo);
  if (reais === null) return null;
  return (reais - (oferta.taxas || 0)) / (oferta.valor / 1000);
}

/** Oferta mais barata do voo, comparando tudo em reais. */
export function melhorOferta(voo, custos = CUSTO_MILHEIRO_PADRAO) {
  let melhor = null;
  for (const oferta of voo.ofertas) {
    const custo = custoEmReais(oferta, custos);
    if (custo === null) continue;
    if (!melhor || custo < melhor.custo) melhor = { oferta, custo };
  }
  return melhor;
}
