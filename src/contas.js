// Contas conectadas (Smiles, LATAM Pass, Azul Fidelidade e Livelo).
//
// A senha nunca passa por aqui: "Conectar" só abre o site numa janela do
// Chrome deste computador para você entrar normalmente. A sessão fica salva
// no perfil do navegador (.perfil-navegador/), como o "lembrar de mim".
//
// Os endereços abaixo são os que os sites usavam; se algum mudar, ajuste aqui.
import { alterar, ler } from './dados.js';
import { abrirPagina, limparCookies, visitar } from './navegador.js';
import { numero, procurar } from './util.js';

export const PROGRAMAS = {
  smiles: {
    nome: 'Smiles',
    inicio: 'https://www.smiles.com.br/',
    conta: 'https://www.smiles.com.br/group/guest/minha-conta',
    dominio: 'smiles.com.br',
  },
  latam: {
    nome: 'LATAM Pass',
    inicio: 'https://www.latamairlines.com/br/pt',
    conta: 'https://www.latamairlines.com/br/pt/minha-conta',
    dominio: 'latamairlines.com',
  },
  azul: {
    nome: 'Azul Fidelidade',
    inicio: 'https://www.voeazul.com.br/br/pt/home',
    conta: 'https://www.voeazul.com.br/br/pt/azul-fidelidade/minha-conta',
    dominio: 'voeazul.com.br',
  },
  livelo: {
    nome: 'Livelo',
    inicio: 'https://www.livelo.com.br/',
    conta: 'https://www.livelo.com.br/minha-conta',
    dominio: 'livelo.com.br',
  },
};

// Página da Livelo onde aparecem as promoções de transferência.
export const URL_BONUS_LIVELO = process.env.URL_BONUS_LIVELO || 'https://www.livelo.com.br/';

const SO_DEMO = () => process.env.DEMO === 'true';
const paginasDeLogin = new Map();

// ---------- leitura (funções puras, testadas em test/contas.test.js) ----------

// Nomes de campo que costumam guardar o saldo, do mais confiável ao menos.
const CAMPOS_SALDO = [
  'availablemiles', 'availablepoints', 'availablebalance', 'milesbalance', 'pointsbalance',
  'balancepoints', 'balance', 'saldo', 'saldopontos', 'totalmiles', 'totalpoints',
  'points', 'miles', 'pontos', 'milhas', 'amount',
];

function valorNumerico(v) {
  if (v && typeof v === 'object') return valorNumerico(v.amount ?? v.value ?? v.total);
  const n = numero(v);
  return n !== null && n >= 0 && n < 1e9 && Number.isInteger(n) ? n : null;
}

/** Procura o saldo nas respostas JSON; se não achar, no texto da página. */
export function lerSaldo(capturas, texto = '') {
  let melhor = null;
  for (const { corpo } of capturas) {
    procurar(corpo, (obj) => {
      for (const [chave, valor] of Object.entries(obj)) {
        const prioridade = CAMPOS_SALDO.indexOf(chave.toLowerCase());
        if (prioridade < 0) continue;
        // "amount" só vale dentro de algo que fale de saldo/pontos.
        if (chave.toLowerCase() === 'amount' && !Object.keys(obj).some((k) => /balance|saldo|point|mile/i.test(k))) continue;
        const n = valorNumerico(valor);
        if (n !== null && (!melhor || prioridade < melhor.prioridade)) melhor = { prioridade, saldo: n };
      }
      return false;
    });
  }
  if (melhor) return melhor.saldo;
  const m = texto.match(/(\d{1,3}(?:\.\d{3})+|\d{3,})\s*(?:milhas|pontos|pts)\b/i);
  return m ? numero(m[1].replace(/\./g, '')) : null;
}

function lerData(v) {
  if (typeof v !== 'string') return null;
  let m = v.match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1];
  m = v.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

/** Pontos que vão vencer: [{ data: 'AAAA-MM-DD', quantidade }] em ordem de data. */
export function lerVencimentos(capturas) {
  const achados = new Map();
  for (const { corpo } of capturas) {
    procurar(corpo, (obj) => {
      const chaves = Object.keys(obj);
      const chaveData = chaves.find((k) => /expir|venc/i.test(k) && lerData(obj[k]));
      if (!chaveData) return false;
      const chaveQtd = chaves.find((k) => k !== chaveData && /mile|point|amount|quant|ponto|milha|value|balance/i.test(k) && valorNumerico(obj[k]));
      if (!chaveQtd) return false;
      const data = lerData(obj[chaveData]);
      achados.set(`${data}|${valorNumerico(obj[chaveQtd])}`, { data, quantidade: valorNumerico(obj[chaveQtd]) });
      return false;
    });
  }
  return [...achados.values()].sort((a, b) => a.data.localeCompare(b.data));
}

const PARCEIROS_LIVELO = {
  Smiles: /smiles/i,
  'LATAM Pass': /latam/i,
  'Azul Fidelidade': /azul|tudoazul/i,
};

/**
 * Bônus de transferência da Livelo anunciados no texto da página: { Smiles: 100, ... }
 * O percentual vale para o parceiro citado na mesma linha ou, se não houver,
 * no parceiro citado nas duas linhas logo acima (cartões de promoção).
 */
export function lerBonus(texto) {
  const bonus = {};
  const linhas = texto.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const parceiroDa = (linha) => Object.keys(PARCEIROS_LIVELO).find((p) => PARCEIROS_LIVELO[p].test(linha));
  linhas.forEach((linha, i) => {
    const m = linha.match(/(\d{2,3})\s*%\s*(?:de\s+)?b[oô]nus|b[oô]nus\s+de\s+(?:at[eé]\s+)?(\d{2,3})\s*%/i);
    if (!m) return;
    const parceiro = parceiroDa(linha) || parceiroDa(linhas[i - 1] || '') || parceiroDa(linhas[i - 2] || '');
    if (parceiro) bonus[parceiro] = Math.max(bonus[parceiro] || 0, Number(m[1] || m[2]));
  });
  return bonus;
}

const pareceLogin = (url, texto) =>
  /login|signin|sign-in|entrar|auth|acesso/i.test(new URL(url).pathname) ||
  /(fa[cç]a (seu )?login|entre na sua conta|acesse sua conta|esqueci (minha )?senha)/i.test(texto.slice(0, 3000));

// ---------- ações ----------

export async function listarContas() {
  const salvas = await ler('contas', {});
  return Object.entries(PROGRAMAS).map(([id, p]) => ({ id, nome: p.nome, status: 'nunca', ...salvas[id] }));
}

/** Abre o site para você entrar. Depois toque em "Verificar". */
export async function conectar(id) {
  const programa = PROGRAMAS[id];
  if (!programa) throw new Error('Programa desconhecido.');
  if (!SO_DEMO()) {
    await paginasDeLogin.get(id)?.close().catch(() => {});
    paginasDeLogin.set(id, await abrirPagina(programa.inicio));
  }
  await alterar('contas', {}, (c) => ({ ...c, [id]: { ...c[id], status: 'aguardando', erro: null } }));
  return { aberto: true };
}

function demo(id) {
  const base = { smiles: 48200, latam: 23750, azul: 61000, livelo: 15400 }[id];
  const hoje = new Date();
  const daqui = (dias) => new Date(hoje.getTime() + dias * 86400000).toISOString().slice(0, 10);
  return { saldo: base, vencimentos: id === 'smiles' ? [{ data: daqui(40), quantidade: 3200 }] : [] };
}

/** Abre a página da conta e lê saldo e vencimentos. */
export async function verificar(id) {
  const programa = PROGRAMAS[id];
  if (!programa) throw new Error('Programa desconhecido.');
  await paginasDeLogin.get(id)?.close().catch(() => {});
  paginasDeLogin.delete(id);

  let resultado;
  if (SO_DEMO()) {
    resultado = { status: 'conectado', ...demo(id), erro: null };
  } else {
    try {
      const { capturas, urlFinal, texto } = await visitar({
        fonte: `conta-${id}`,
        url: programa.conta,
        filtro: (u) => u.includes(programa.dominio),
        timeoutMs: 45000,
        desistirSemRespostaMs: 20000,
      });
      const saldo = lerSaldo(capturas, texto);
      if (saldo !== null) {
        resultado = { status: 'conectado', saldo, vencimentos: lerVencimentos(capturas), erro: null };
      } else if (pareceLogin(urlFinal, texto)) {
        resultado = { status: 'desconectado', erro: 'A sessão expirou. Conecte de novo.' };
      } else {
        resultado = { status: 'erro', erro: 'Entrei na conta, mas não achei o saldo na página. Rode com DEBUG_DUMP=1 para ajustar a leitura.' };
      }
    } catch (erro) {
      resultado = { status: 'erro', erro: erro.message };
    }
  }

  const agora = new Date().toISOString();
  const salvo = await alterar('contas', {}, (c) => ({
    ...c,
    [id]: { ...c[id], ...resultado, verificadoEm: agora, ...(resultado.status === 'conectado' ? { atualizadoEm: agora } : {}) },
  }));
  return { id, nome: programa.nome, ...salvo[id] };
}

export async function desconectar(id) {
  const programa = PROGRAMAS[id];
  if (!programa) throw new Error('Programa desconhecido.');
  await paginasDeLogin.get(id)?.close().catch(() => {});
  paginasDeLogin.delete(id);
  if (!SO_DEMO()) await limparCookies(programa.dominio);
  await alterar('contas', {}, (c) => { delete c[id]; return c; });
}

/** Lê os bônus de transferência anunciados pela Livelo. */
export async function verificarBonusLivelo() {
  if (SO_DEMO()) return { Smiles: 90, 'LATAM Pass': 30 };
  const { texto } = await visitar({ fonte: 'bonus-livelo', url: URL_BONUS_LIVELO, filtro: () => false, timeoutMs: 30000, desistirSemRespostaMs: 8000 });
  return lerBonus(texto);
}
