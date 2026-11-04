// Dados inventados (sempre os mesmos para a mesma rota e data) para testar a
// tela sem abrir os sites das companhias. Use: npm run demo
import { trecho } from '../util.js';

function sorteador(semente) {
  let h = 2166136261;
  for (const c of semente) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

const CIAS = [
  { cia: 'G3', programa: 'Smiles', reais: false, prefixo: 1 },
  { cia: 'LA', programa: 'LATAM Pass', reais: true, prefixo: 3 },
  { cia: 'AD', programa: 'Azul Fidelidade', reais: true, prefixo: 4 },
];

const hhmm = (min) => `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

export function voosDemo({ origem, destino, data, adultos = 1 }, tipo) {
  const r = sorteador(`${origem}${destino}${data}`);
  const base = 60 + Math.floor(r() * 180);
  const trechos = [];
  for (const c of CIAS) {
    const quantos = 2 + Math.floor(r() * 3);
    for (let i = 0; i < quantos; i++) {
      const sai = 330 + Math.floor(r() * 960 / 5) * 5;
      const paradas = r() < 0.6 ? 0 : 1;
      const dur = base + paradas * (70 + Math.floor(r() * 120));
      const chega = sai + dur;
      const dia = chega >= 1440 ? new Date(Date.parse(`${data}T00:00:00Z`) + 86400000).toISOString().slice(0, 10) : data;
      const numero = `${c.cia}${c.prefixo}${String(Math.floor(r() * 1000)).padStart(3, '0')}`;
      const reais = Math.round((250 + dur * (2 + r() * 6)) * adultos);
      const milheiro = 14 + r() * 26;
      const taxas = Math.round((30 + r() * 40) * adultos * 100) / 100;
      const voo = {
        cia: c.cia,
        voos: paradas ? [numero, `${c.cia}${c.prefixo}${String(Math.floor(r() * 1000)).padStart(3, '0')}`] : [numero],
        origem, destino,
        partida: `${data}T${hhmm(sai)}`,
        chegada: `${dia}T${hhmm(chega % 1440)}`,
        duracao: dur,
        paradas,
      };
      if (tipo === 'reais' && c.reais) {
        trechos.push(trecho(voo, { fonte: 'demo', tipo, programa: null, valor: reais, taxas: null, link: null }));
      }
      if (tipo === 'pontos') {
        const pontos = Math.round(((reais - taxas) / milheiro) * 1000 / 500) * 500;
        trechos.push(trecho(voo, { fonte: 'demo', tipo, programa: c.programa, valor: pontos, taxas, link: null }));
      }
    }
  }
  return trechos;
}

export default {
  id: 'demo',
  nome: 'Demonstração',
  tipos: ['reais', 'pontos'],
  async buscar(busca, tipo) {
    await new Promise((ok) => setTimeout(ok, 300));
    return voosDemo(busca, tipo);
  },
};
