import { CUSTO_MILHEIRO_PADRAO, custoEmReais, melhorOferta, milheiroObtido } from './valor.js';

const $ = (sel, raiz = document) => raiz.querySelector(sel);
const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const inteiro = new Intl.NumberFormat('pt-BR');
const NOME_CIA = { G3: 'GOL', LA: 'LATAM', JJ: 'LATAM', AD: 'Azul' };
const NOME_FONTE = { smiles: 'Smiles', latam: 'LATAM', azul: 'Azul', demo: 'Demonstração' };

const guardar = (chave, valor) => { try { localStorage.setItem(chave, JSON.stringify(valor)); } catch {} };
const ler = (chave, padrao) => { try { return JSON.parse(localStorage.getItem(chave)) ?? padrao; } catch { return padrao; } };

let custos = { ...CUSTO_MILHEIRO_PADRAO, ...ler('custos', {}) };
let ultimo = null;
const vista = { ordem: ler('ordem', 'custo'), soDiretos: false };

// ---------- formulário ----------

function dataMais(dias) {
  const d = new Date(Date.now() + dias * 86400000);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

async function iniciar() {
  const sessao = await fetch('/api/sessao').then((r) => r.json()).catch(() => null);
  if (sessao && !sessao.autorizado) { location.replace('/login.html'); return; }
  const form = $('#busca');
  const salvo = ler('busca', {});
  form.origem.value = salvo.origem || '';
  form.destino.value = salvo.destino || '';
  form.ida.value = salvo.ida && salvo.ida >= dataMais(0) ? salvo.ida : dataMais(30);
  form.volta.value = salvo.volta && salvo.volta >= form.ida.value ? salvo.volta : '';
  form.adultos.value = salvo.adultos || 1;
  form.ida.min = dataMais(0);
  if (salvo.modo) form.modo.value = salvo.modo;

  const info = await fetch('/api/fontes').then((r) => r.json());
  $('#aviso-demo').hidden = !info.demo;
  const marcadas = info.demo ? info.padrao : (salvo.fontes || info.padrao);
  $('#lista-fontes').innerHTML = info.fontes.map((f) => `
    <label><input type="checkbox" name="fonte" value="${f.id}" ${marcadas.includes(f.id) ? 'checked' : ''}>
      ${f.nome} <span class="leve">${f.tipos.map((t) => (t === 'reais' ? 'R$' : 'pts')).join(' · ')}</span></label>`).join('');

  desenharCustos();
  form.addEventListener('submit', buscar);
  form.ida.addEventListener('change', () => { form.volta.min = form.ida.value; });
  $('#inverter').addEventListener('click', () => {
    [form.origem.value, form.destino.value] = [form.destino.value, form.origem.value];
  });
  for (const campo of [form.origem, form.destino]) {
    campo.addEventListener('input', () => { campo.value = campo.value.toUpperCase().replace(/[^A-Z]/g, ''); });
  }
}

function desenharCustos() {
  const caixa = $('#custos');
  caixa.innerHTML = Object.keys(CUSTO_MILHEIRO_PADRAO).map((p) => `
    <label>${p}<span class="com-prefixo"><span>R$</span>
      <input type="number" min="1" step="0.5" data-programa="${p}" value="${custos[p]}"></span></label>`).join('');
  caixa.addEventListener('input', (e) => {
    const programa = e.target.dataset.programa;
    const n = Number(e.target.value);
    if (!programa || !(n > 0)) return;
    custos[programa] = n;
    guardar('custos', custos);
    if (ultimo) desenharResultados();
  });
}

async function buscar(evento) {
  evento.preventDefault();
  const form = evento.target;
  const fontes = [...form.querySelectorAll('[name=fonte]:checked')].map((c) => c.value);
  const busca = {
    origem: form.origem.value, destino: form.destino.value,
    ida: form.ida.value, volta: form.volta.value,
    adultos: form.adultos.value, modo: form.modo.value, fontes,
  };
  guardar('busca', busca);
  mostrarErro('');
  const botao = $('#botao-buscar');
  botao.disabled = true;
  botao.textContent = 'Buscando…';
  $('#resultados').innerHTML = `<div class="cartao carregando"><span class="girando"></span>
    Consultando ${fontes.map((f) => NOME_FONTE[f] || f).join(', ')}. Os sites podem levar até um minuto.</div>`;
  try {
    const params = new URLSearchParams({ ...busca, fontes: fontes.join(',') });
    const resposta = await fetch(`/api/buscar?${params}`);
    const dados = await resposta.json();
    if (!resposta.ok) throw new Error((dados.erros || ['Erro na busca.']).join(' '));
    ultimo = dados;
    desenharResultados();
  } catch (erro) {
    $('#resultados').innerHTML = '';
    mostrarErro(erro.message);
  } finally {
    botao.disabled = false;
    botao.textContent = 'Buscar voos';
  }
}

function mostrarErro(texto) {
  const caixa = $('#erro');
  caixa.textContent = texto;
  caixa.hidden = !texto;
}

// ---------- resultados ----------

const hora = (iso) => (iso ? iso.slice(11, 16) : '--:--');
const dataCurta = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' });
const duracao = (min) => (min ? `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}` : '');

function ordenar(voos) {
  const custo = (v) => melhorOferta(v, custos)?.custo ?? Infinity;
  const regras = {
    custo: (a, b) => custo(a) - custo(b),
    partida: (a, b) => (a.partida || '').localeCompare(b.partida || ''),
    duracao: (a, b) => (a.duracaoMin ?? 1e9) - (b.duracaoMin ?? 1e9),
  };
  return [...voos].sort(regras[vista.ordem]);
}

function desenharResultados() {
  const { busca, ida, volta } = ultimo;
  const area = $('#resultados');
  area.innerHTML = '';
  area.append(barra());
  area.append(secao(`Ida · ${busca.origem} → ${busca.destino}`, busca.ida, ida, { origem: busca.origem, destino: busca.destino }));
  if (volta) area.append(secao(`Volta · ${busca.destino} → ${busca.origem}`, busca.volta, volta, { origem: busca.destino, destino: busca.origem }));
}

function barra() {
  const div = document.createElement('div');
  div.className = 'barra';
  div.innerHTML = `
    <label>Ordenar por
      <select id="ordem">
        <option value="custo">Menor custo</option>
        <option value="partida">Horário de partida</option>
        <option value="duracao">Menor duração</option>
      </select></label>
    <label class="caixa"><input type="checkbox" id="so-diretos"> Só voos diretos</label>`;
  $('#ordem', div).value = vista.ordem;
  $('#so-diretos', div).checked = vista.soDiretos;
  $('#ordem', div).addEventListener('change', (e) => { vista.ordem = e.target.value; guardar('ordem', vista.ordem); desenharResultados(); });
  $('#so-diretos', div).addEventListener('change', (e) => { vista.soDiretos = e.target.checked; desenharResultados(); });
  return div;
}

function secao(titulo, data, { voos, status }, rota) {
  const sec = document.createElement('section');
  sec.className = 'trecho';
  const lista = ordenar(voos.filter((v) => !vista.soDiretos || v.paradas === 0));
  const melhores = lista.map((v) => melhorOferta(v, custos)).filter(Boolean);
  const maisBarato = melhores.length ? Math.min(...melhores.map((m) => m.custo)) : null;

  sec.innerHTML = `
    <header><h2>${titulo}</h2><span class="leve">${dataCurta(data)}</span>
      ${maisBarato !== null ? `<span class="selo bom">A partir de ${brl.format(maisBarato)}</span>` : ''}
      <button type="button" class="texto criar-alerta">🔔 Criar alerta</button></header>
    <ul class="status">${status.map(linhaStatus).join('')}</ul>`;
  $('.criar-alerta', sec).addEventListener('click', () => {
    window.dispatchEvent(new CustomEvent('criar-alerta', { detail: { ...rota, ida: data, adultos: ultimo.busca.adultos } }));
  });

  if (!lista.length) {
    sec.insertAdjacentHTML('beforeend', '<p class="cartao vazio">Nenhum voo encontrado nesta data com as fontes escolhidas.</p>');
    return sec;
  }
  for (const voo of lista) sec.append(cartaoVoo(voo, maisBarato));
  return sec;
}

function linhaStatus(s) {
  const tipo = s.tipo === 'reais' ? 'R$' : 'pontos';
  const texto = s.ok ? `${s.qtd} ${s.qtd === 1 ? 'voo' : 'voos'}${s.cache ? ' · salvo' : ''}` : s.erro;
  return `<li class="${s.ok ? 'ok' : 'falha'}" title="${s.ms ? `${(s.ms / 1000).toFixed(1)}s` : ''}">
    <strong>${s.nome}</strong> ${tipo}: ${texto}</li>`;
}

function cartaoVoo(voo, maisBarato) {
  const no = $('#modelo-voo').content.firstElementChild.cloneNode(true);
  const melhor = melhorOferta(voo, custos);
  const virouDia = voo.chegada && voo.partida && voo.chegada.slice(0, 10) > voo.partida.slice(0, 10);

  $('.partida', no).textContent = hora(voo.partida);
  $('.chegada', no).innerHTML = `${hora(voo.chegada)}${virouDia ? '<sup>+1</sup>' : ''}`;
  $('.origem', no).textContent = voo.origem;
  $('.destino', no).textContent = voo.destino;
  $('.duracao', no).textContent = duracao(voo.duracaoMin);
  $('.paradas', no).textContent = voo.paradas ? `${voo.paradas} parada${voo.paradas > 1 ? 's' : ''}` : 'direto';
  $('.paradas', no).classList.toggle('direto', !voo.paradas);
  $('.cia', no).innerHTML = `<strong>${NOME_CIA[voo.cia] || voo.ciaNome || voo.cia || ''}</strong>
    <span class="leve">${voo.voos.join(' + ')}</span>`;
  if (melhor && maisBarato !== null && melhor.custo <= maisBarato + 0.01) no.classList.add('destaque');

  const ofertas = [...voo.ofertas].sort((a, b) => (custoEmReais(a, custos) ?? Infinity) - (custoEmReais(b, custos) ?? Infinity));
  $('.ofertas', no).append(...ofertas.map((o) => linhaOferta(voo, o, o === melhor?.oferta)));
  return no;
}

function linhaOferta(voo, oferta, eMelhor) {
  const li = document.createElement('li');
  li.className = `oferta ${oferta.tipo}${eMelhor ? ' melhor' : ''}`;
  const nome = oferta.tipo === 'reais' ? `Reais · ${NOME_FONTE[oferta.fonte] || oferta.fonte}` : oferta.programa;
  let preco;
  let detalhe = '';

  if (oferta.tipo === 'reais') {
    preco = brl.format(oferta.valor);
  } else {
    preco = `${inteiro.format(oferta.valor)} pts`;
    preco += oferta.taxas ? ` <span class="leve">+ ${brl.format(oferta.taxas)}</span>` : ' <span class="leve">+ taxas</span>';
    const custo = custoEmReais(oferta, custos);
    const obtido = milheiroObtido(voo, oferta);
    const seu = custos[oferta.programa];
    const partes = [];
    if (custo !== null) partes.push(`≈ ${brl.format(custo)} pelo seu custo`);
    if (obtido !== null) {
      const vale = obtido >= seu;
      partes.push(`<span class="${vale ? 'bom' : 'ruim'}">milheiro a ${brl.format(obtido)} · ${vale ? 'vale usar pontos' : 'melhor pagar em reais'}</span>`);
    }
    detalhe = partes.join(' · ');
  }

  li.innerHTML = `
    <span class="nome">${nome}${oferta.nota ? ` <span class="leve">(${oferta.nota})</span>` : ''}${eMelhor ? ' <span class="selo bom">melhor</span>' : ''}</span>
    <span class="preco">${preco}</span>
    ${detalhe ? `<span class="detalhe">${detalhe}</span>` : ''}
    ${oferta.link ? `<a class="abrir" href="${oferta.link}" target="_blank" rel="noopener">abrir no site</a>` : ''}`;
  return li;
}

iniciar();
