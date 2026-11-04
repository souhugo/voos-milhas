// Verificações automáticas: saldos e vencimentos, bônus da Livelo e alertas de preço.
import { randomUUID } from 'node:crypto';
import { avisar } from './avisos.js';
import { buscarTrecho } from './busca.js';
import { listarContas, verificar, verificarBonusLivelo } from './contas.js';
import { alterar, ler } from './dados.js';

export const CONFIG_PADRAO = {
  intervaloContasHoras: 6,
  intervaloAlertasHoras: 12,
  bonusMinimo: 80,
  diasVencimento: 60,
};

const inteiro = new Intl.NumberFormat('pt-BR');
const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const dataBR = (iso) => iso.split('-').reverse().join('/');
const hoje = () => new Date().toISOString().slice(0, 10);

export async function lerConfig() {
  return { ...CONFIG_PADRAO, ...(await ler('config', {})) };
}

export async function salvarConfig(novo) {
  const limpo = {};
  for (const [chave, padrao] of Object.entries(CONFIG_PADRAO)) {
    const n = Number(novo[chave]);
    if (Number.isFinite(n) && n > 0) limpo[chave] = chave.startsWith('intervalo') ? Math.max(n, 1) : n;
    else limpo[chave] = padrao;
  }
  await alterar('config', {}, () => limpo);
  if (estado.ativo) await reagendar();
  return limpo;
}

// ---------- contas ----------

export async function verificarContas() {
  const config = await lerConfig();
  const contas = (await listarContas()).filter((c) => c.status !== 'nunca' && c.status !== 'aguardando');
  for (const anterior of contas) {
    const atual = await verificar(anterior.id);
    await avisosDaConta(anterior, atual, config);
  }
}

export async function avisosDaConta(anterior, atual, config) {
  if (atual.status === 'desconectado' && anterior.status !== 'desconectado') {
    await avisar({
      tipo: 'conta',
      titulo: `Reconecte sua conta ${atual.nome}`,
      texto: 'A sessão expirou. Abra o app no computador e toque em Conectar.',
      chave: `desconectado-${atual.id}-${hoje()}`,
      link: '/#contas',
    });
  }
  if (atual.status !== 'conectado') return;
  if (Number.isFinite(anterior.saldo) && anterior.saldo !== atual.saldo) {
    const diferenca = atual.saldo - anterior.saldo;
    await avisar({
      tipo: 'saldo',
      titulo: `${atual.nome}: ${diferenca > 0 ? '+' : '−'}${inteiro.format(Math.abs(diferenca))} pontos`,
      texto: `Saldo foi de ${inteiro.format(anterior.saldo)} para ${inteiro.format(atual.saldo)}.`,
      chave: `saldo-${atual.id}-${atual.saldo}-${hoje()}`,
      link: '/#contas',
    });
  }
  const limite = new Date(Date.now() + config.diasVencimento * 86400000).toISOString().slice(0, 10);
  for (const v of atual.vencimentos || []) {
    if (v.data < hoje() || v.data > limite) continue;
    await avisar({
      tipo: 'vencimento',
      titulo: `${atual.nome}: ${inteiro.format(v.quantidade)} pontos vencem em ${dataBR(v.data)}`,
      texto: 'Use ou transfira antes de perder.',
      chave: `vencimento-${atual.id}-${v.data}-${v.quantidade}`,
      link: '/#contas',
    });
  }
}

export async function verificarBonus() {
  const config = await lerConfig();
  const bonus = await verificarBonusLivelo();
  await alterar('bonus', {}, () => ({ bonus, em: new Date().toISOString() }));
  for (const [parceiro, pct] of Object.entries(bonus)) {
    if (pct < config.bonusMinimo) continue;
    await avisar({
      tipo: 'bonus',
      titulo: `Livelo → ${parceiro} com ${pct}% de bônus`,
      texto: `Cada 1.000 pontos Livelo viram ${inteiro.format(1000 * (1 + pct / 100))} pontos ${parceiro}.`,
      // Um aviso por parceiro e percentual em cada mês.
      chave: `bonus-${parceiro}-${pct}-${hoje().slice(0, 7)}`,
    });
  }
  return bonus;
}

// ---------- alertas de preço ----------

const PROGRAMAS_ALERTA = ['Smiles', 'LATAM Pass', 'Azul Fidelidade'];

export function validarAlerta(dados) {
  const erros = [];
  const a = {
    origem: String(dados.origem || '').toUpperCase(),
    destino: String(dados.destino || '').toUpperCase(),
    ida: String(dados.ida || ''),
    tipo: dados.tipo === 'reais' ? 'reais' : 'pontos',
    programa: PROGRAMAS_ALERTA.includes(dados.programa) ? dados.programa : null,
    limite: Number(dados.limite),
    adultos: Number(dados.adultos || 1),
    soDiretos: Boolean(dados.soDiretos),
  };
  if (!/^[A-Z]{3}$/.test(a.origem) || !/^[A-Z]{3}$/.test(a.destino)) erros.push('Informe origem e destino (ex.: SSA, GRU).');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(a.ida) || a.ida < hoje()) erros.push('Informe uma data futura.');
  if (!(a.limite > 0)) erros.push('Informe o limite de preço.');
  if (!Number.isInteger(a.adultos) || a.adultos < 1 || a.adultos > 9) erros.push('Adultos: de 1 a 9.');
  if (a.tipo === 'reais') a.programa = null;
  return { alerta: a, erros };
}

export const listarAlertas = () => ler('alertas', []);

export async function criarAlerta(dados) {
  const { alerta, erros } = validarAlerta(dados);
  if (erros.length) return { erros };
  const novo = { id: randomUUID(), criadoEm: new Date().toISOString(), ativo: true, melhor: null, ...alerta };
  await alterar('alertas', [], (lista) => [...lista, novo]);
  return { alerta: novo };
}

export async function apagarAlerta(id) {
  await alterar('alertas', [], (lista) => lista.filter((a) => a.id !== id));
}

/** Melhor oferta de um resultado de busca que atende ao alerta. */
export function melhorParaAlerta(alerta, voos) {
  let melhor = null;
  for (const voo of voos) {
    if (alerta.soDiretos && voo.paradas > 0) continue;
    for (const o of voo.ofertas) {
      if (o.tipo !== alerta.tipo) continue;
      if (alerta.programa && o.programa !== alerta.programa) continue;
      if (!melhor || o.valor < melhor.valor) {
        melhor = { valor: o.valor, taxas: o.taxas ?? null, programa: o.programa, voo: voo.voos.join(' + '), partida: voo.partida, link: o.link };
      }
    }
  }
  return melhor;
}

export function textoPreco(alerta, valor) {
  return alerta.tipo === 'reais' ? brl.format(valor) : `${inteiro.format(valor)} pontos`;
}

function fontesDoAlerta(alerta) {
  if (process.env.DEMO === 'true') return ['demo'];
  if (alerta.tipo === 'reais') return ['latam', 'azul'];
  const porPrograma = { Smiles: ['smiles'], 'LATAM Pass': ['latam'], 'Azul Fidelidade': ['azul'] };
  return porPrograma[alerta.programa] || ['smiles', 'latam', 'azul'];
}

export async function verificarAlerta(alerta) {
  const { voos, status } = await buscarTrecho({
    origem: alerta.origem, destino: alerta.destino, data: alerta.ida,
    adultos: alerta.adultos, modo: alerta.tipo, fontes: fontesDoAlerta(alerta),
  });
  const encontrado = melhorParaAlerta(alerta, voos);
  const falhas = status.filter((s) => !s.ok).map((s) => `${s.nome}: ${s.erro}`);
  const atualizacao = { verificadoEm: new Date().toISOString(), ultimo: encontrado, erro: falhas.join(' · ') || null };

  if (encontrado && encontrado.valor <= alerta.limite && (!alerta.melhor || encontrado.valor < alerta.melhor.valor)) {
    atualizacao.melhor = { ...encontrado, em: atualizacao.verificadoEm };
    await avisar({
      tipo: 'preco',
      titulo: `${alerta.origem} → ${alerta.destino} por ${textoPreco(alerta, encontrado.valor)}`,
      texto: `${dataBR(alerta.ida)} · ${encontrado.programa || 'em reais'} · voo ${encontrado.voo} às ${encontrado.partida?.slice(11)}. Seu limite: ${textoPreco(alerta, alerta.limite)}.`,
      chave: `preco-${alerta.id}-${encontrado.valor}`,
      link: encontrado.link || '/#alertas',
    });
  }
  await alterar('alertas', [], (lista) => lista.map((a) => (a.id === alerta.id ? { ...a, ...atualizacao } : a)));
  return { ...alerta, ...atualizacao };
}

export async function verificarAlertas() {
  const alertas = await listarAlertas();
  for (const alerta of alertas) {
    if (!alerta.ativo) continue;
    if (alerta.ida < hoje()) {
      await alterar('alertas', [], (lista) => lista.map((a) => (a.id === alerta.id ? { ...a, ativo: false } : a)));
      continue;
    }
    await verificarAlerta(alerta);
  }
}

// ---------- agendamento ----------

const estado = { rodando: null, timers: [], ultima: {}, geracao: 0 };

/** Roda uma tarefa por vez, para não abrir vários sites ao mesmo tempo. */
export function rodar(nome, tarefa) {
  const anterior = estado.rodando || Promise.resolve();
  const atual = anterior.then(async () => {
    try {
      await tarefa();
      estado.ultima[nome] = { em: new Date().toISOString(), ok: true };
    } catch (erro) {
      console.error(`Monitor (${nome}):`, erro);
      estado.ultima[nome] = { em: new Date().toISOString(), ok: false, erro: erro.message };
    }
  });
  estado.rodando = atual;
  return atual;
}

export const statusMonitor = () => estado.ultima;

function repetir(nome, horas, tarefa, primeiraEmMs) {
  // Um pouco de variação no horário para não parecer robô.
  const proxima = () => horas * 3600000 * (0.9 + Math.random() * 0.2);
  const geracao = estado.geracao;
  const ciclo = async () => {
    await rodar(nome, tarefa);
    // Se a configuração mudou enquanto rodava, o novo agendamento já cuida disso.
    if (geracao === estado.geracao) estado.timers.push(setTimeout(ciclo, proxima()));
  };
  estado.timers.push(setTimeout(ciclo, primeiraEmMs));
}

export async function iniciarMonitor() {
  estado.ativo = true;
  await reagendar();
}

async function reagendar() {
  for (const t of estado.timers) clearTimeout(t);
  estado.timers = [];
  estado.geracao += 1;
  const config = await lerConfig();
  repetir('contas', config.intervaloContasHoras, async () => { await verificarContas(); await verificarBonus(); }, 2 * 60000);
  repetir('alertas', config.intervaloAlertasHoras, verificarAlertas, 5 * 60000);
}
