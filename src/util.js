// Funções pequenas usadas pelos conectores.

/** Converte valores como "1.234,56", "1234.56" ou 1234 em número. */
export function numero(valor) {
  if (valor === null || valor === undefined || valor === '') return null;
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : null;
  let s = String(valor).replace(/[^\d.,-]/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Mantém só "AAAA-MM-DDTHH:MM" (horário local do aeroporto, sem fuso). */
export function horaLocal(valor) {
  if (!valor) return null;
  const m = String(valor).match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/);
  return m ? `${m[1]}T${m[2]}` : null;
}

export function minutosEntre(inicio, fim) {
  if (!inicio || !fim) return null;
  const a = Date.parse(`${inicio}:00Z`);
  const b = Date.parse(`${fim}:00Z`);
  return Number.isFinite(a) && Number.isFinite(b) ? Math.round((b - a) / 60000) : null;
}

/** Aceita 140, "PT2H20M", "02:20" ou {hours, minutes}. */
export function duracaoMin(valor) {
  if (valor === null || valor === undefined) return null;
  if (typeof valor === 'number') return valor;
  if (typeof valor === 'object') {
    const h = numero(valor.hours ?? valor.hour ?? 0) ?? 0;
    const m = numero(valor.minutes ?? valor.minute ?? 0) ?? 0;
    return h * 60 + m || null;
  }
  const iso = String(valor).match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
  if (iso && (iso[1] || iso[2])) return Number(iso[1] || 0) * 60 + Number(iso[2] || 0);
  const hm = String(valor).match(/^(\d+):(\d{2})/);
  if (hm) return Number(hm[1]) * 60 + Number(hm[2]);
  return numero(valor);
}

/** Menor número de uma lista, ignorando vazios. */
export function menor(lista) {
  const ns = lista.map(numero).filter((n) => n !== null && n > 0);
  return ns.length ? Math.min(...ns) : null;
}

/** Monta um trecho no formato comum a todas as fontes. */
export function trecho({ cia, ciaNome, voos, origem, destino, partida, chegada, duracao, paradas }, oferta) {
  const p = horaLocal(partida);
  const c = horaLocal(chegada);
  return {
    cia: cia || null,
    ciaNome: ciaNome || NOMES_CIA[cia] || cia || null,
    voos: (voos || []).filter(Boolean),
    origem,
    destino,
    partida: p,
    chegada: c,
    duracaoMin: duracaoMin(duracao) ?? minutosEntre(p, c),
    paradas: numero(paradas) ?? 0,
    oferta,
  };
}

export const NOMES_CIA = { G3: 'GOL', LA: 'LATAM', JJ: 'LATAM', AD: 'Azul' };

/** Percorre um JSON e devolve todos os objetos que satisfazem o teste. */
export function procurar(json, teste, achados = []) {
  if (Array.isArray(json)) {
    for (const item of json) procurar(item, teste, achados);
  } else if (json && typeof json === 'object') {
    if (teste(json)) achados.push(json);
    for (const v of Object.values(json)) procurar(v, teste, achados);
  }
  return achados;
}
