// Abas Contas, Alertas e Avisos, notificações e instalação como app.
const $ = (sel, raiz = document) => raiz.querySelector(sel);
const inteiro = new Intl.NumberFormat('pt-BR');
const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const quando = (iso) => (iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
const dataBR = (iso) => iso.split('-').reverse().join('/');
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function api(caminho, opcoes = {}) {
  const resposta = await fetch(`/api/${caminho}`, {
    ...opcoes,
    headers: { 'content-type': 'application/json', 'x-voos': '1', ...opcoes.headers },
    body: opcoes.body ? JSON.stringify(opcoes.body) : undefined,
  });
  const dados = await resposta.json().catch(() => ({}));
  if (!resposta.ok) throw new Error((dados.erros || ['Erro.']).join(' '));
  return dados;
}

// ---------- abas ----------

const carregar = { contas: carregarContas, alertas: carregarAlertas, avisos: carregarAvisos };

function mostrarAba() {
  const aba = (location.hash.slice(1) || 'buscar').split('?')[0];
  const existe = document.getElementById(`aba-${aba}`) ? aba : 'buscar';
  for (const el of document.querySelectorAll('.aba')) el.hidden = el.id !== `aba-${existe}`;
  for (const link of document.querySelectorAll('.abas a')) link.toggleAttribute('aria-current', link.dataset.aba === existe);
  carregar[existe]?.();
  if (existe === 'avisos') marcarAvisosLidos();
}
window.addEventListener('hashchange', mostrarAba);

// ---------- contas ----------

const ROTULO_STATUS = {
  nunca: ['Não conectada', ''],
  aguardando: ['Entre na janela do Chrome e toque em Verificar', 'atencao'],
  conectado: ['Conectada', 'bom'],
  desconectado: ['Sessão expirada: conecte de novo', 'ruim'],
  erro: ['Não consegui ler', 'ruim'],
};

async function carregarContas() {
  const { contas, bonus } = await api('contas').catch((e) => ({ contas: [], erro: e }));
  $('#lista-contas').innerHTML = contas.map((c) => {
    const [rotulo, classe] = ROTULO_STATUS[c.status] || ROTULO_STATUS.erro;
    const vencendo = (c.vencimentos || []).slice(0, 3).map((v) =>
      `<li>${inteiro.format(v.quantidade)} vencem em ${dataBR(v.data)}</li>`).join('');
    return `
      <article class="cartao conta" data-id="${c.id}">
        <header><h3>${esc(c.nome)}</h3><span class="selo ${classe}">${esc(rotulo)}</span></header>
        ${Number.isFinite(c.saldo) ? `<p class="saldo">${inteiro.format(c.saldo)} <span class="leve">pontos</span></p>` : ''}
        ${vencendo ? `<ul class="vencimentos">${vencendo}</ul>` : ''}
        ${c.erro ? `<p class="leve erro-texto">${esc(c.erro)}</p>` : ''}
        ${c.verificadoEm ? `<p class="leve pequeno">Verificado ${quando(c.verificadoEm)}</p>` : ''}
        <div class="botoes">
          <button type="button" class="secundario" data-acao="conectar">${c.status === 'conectado' ? 'Reconectar' : 'Conectar'}</button>
          <button type="button" class="secundario" data-acao="verificar" ${c.status === 'nunca' ? 'disabled' : ''}>Verificar</button>
          ${c.status !== 'nunca' ? '<button type="button" class="texto" data-acao="desconectar">Sair</button>' : ''}
        </div>
      </article>`;
  }).join('');
  desenharBonus(bonus);
}

function desenharBonus(dados) {
  const caixa = $('#bonus-livelo');
  if (!dados?.em) { caixa.textContent = 'Ainda não verificado.'; return; }
  const itens = Object.entries(dados.bonus || {});
  caixa.innerHTML = itens.length
    ? `<ul class="bonus">${itens.map(([p, pct]) => `<li><strong>${esc(p)}</strong> ${pct}% de bônus</li>`).join('')}</ul>
       <p class="pequeno">Verificado ${quando(dados.em)}</p>`
    : `Nenhuma promoção encontrada. <span class="pequeno">(${quando(dados.em)})</span>`;
}

$('#lista-contas').addEventListener('click', async (e) => {
  const botao = e.target.closest('button[data-acao]');
  if (!botao) return;
  const id = botao.closest('.conta').dataset.id;
  const acao = botao.dataset.acao;
  if (acao === 'desconectar' && !confirm('Sair desta conta no app? A sessão salva no computador será apagada.')) return;
  botao.disabled = true;
  const textoOriginal = botao.textContent;
  botao.textContent = acao === 'verificar' ? 'Verificando…' : 'Aguarde…';
  try {
    await api(`contas/${id}/${acao}`, { method: 'POST' });
    if (acao === 'conectar') alert('Abri o site no Chrome do computador onde o app está rodando. Entre na sua conta lá e depois toque em Verificar.');
  } catch (erro) {
    alert(erro.message);
  } finally {
    botao.textContent = textoOriginal;
    await carregarContas();
  }
});

$('#verificar-bonus').addEventListener('click', async (e) => {
  e.target.disabled = true;
  e.target.textContent = 'Verificando…';
  try {
    await api('bonus/verificar', { method: 'POST' });
  } catch (erro) {
    alert(erro.message);
  }
  e.target.disabled = false;
  e.target.textContent = 'Verificar agora';
  carregarContas();
});

// ---------- alertas ----------

const precoAlerta = (a, valor) => (a.tipo === 'reais' ? brl.format(valor) : `${inteiro.format(valor)} pts`);

async function carregarAlertas() {
  const { alertas } = await api('alertas').catch(() => ({ alertas: [] }));
  const lista = $('#lista-alertas');
  if (!alertas.length) {
    lista.innerHTML = '<p class="cartao vazio">Nenhum alerta ainda.</p>';
    return;
  }
  lista.innerHTML = alertas.map((a) => `
    <article class="cartao alerta ${a.ativo ? '' : 'inativo'}" data-id="${a.id}">
      <header>
        <h3>${a.origem} → ${a.destino} <span class="leve">${dataBR(a.ida)}</span></h3>
        ${a.ativo ? '' : '<span class="selo">data passou</span>'}
      </header>
      <p>${a.tipo === 'reais' ? 'Em reais' : esc(a.programa || 'Qualquer programa')} até <strong>${precoAlerta(a, a.limite)}</strong>
        ${a.adultos > 1 ? ` · ${a.adultos} adultos` : ''}${a.soDiretos ? ' · só diretos' : ''}</p>
      ${a.ultimo ? `<p class="leve">Última busca: ${precoAlerta(a, a.ultimo.valor)}${a.ultimo.programa ? ` (${esc(a.ultimo.programa)})` : ''} · ${quando(a.verificadoEm)}</p>` : ''}
      ${a.verificadoEm && !a.ultimo ? `<p class="leve">Nenhum voo encontrado · ${quando(a.verificadoEm)}</p>` : ''}
      ${a.melhor ? `<p class="bom-texto">Menor já avisado: ${precoAlerta(a, a.melhor.valor)} em ${quando(a.melhor.em)}</p>` : ''}
      ${a.erro ? `<p class="leve erro-texto">${esc(a.erro)}</p>` : ''}
      <div class="botoes">
        <button type="button" class="secundario" data-acao="verificar" ${a.ativo ? '' : 'disabled'}>Buscar agora</button>
        <button type="button" class="texto" data-acao="apagar">Apagar</button>
      </div>
    </article>`).join('');
}

$('#form-alerta').ida.min = new Date().toISOString().slice(0, 10);

$('#form-alerta').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  const erro = $('#erro-alerta');
  erro.hidden = true;
  const reais = f.programa.value === 'reais';
  try {
    await api('alertas', {
      method: 'POST',
      body: {
        origem: f.origem.value, destino: f.destino.value, ida: f.ida.value, adultos: f.adultos.value,
        tipo: reais ? 'reais' : 'pontos', programa: reais ? null : f.programa.value || null,
        limite: f.limite.value, soDiretos: f.soDiretos.checked,
      },
    });
    f.reset();
    carregarAlertas();
  } catch (err) {
    erro.textContent = err.message;
    erro.hidden = false;
  }
});

$('#form-alerta').programa.addEventListener('change', (e) => {
  $('#form-alerta').limite.placeholder = e.target.value === 'reais' ? '900' : '70000';
});

$('#lista-alertas').addEventListener('click', async (e) => {
  const botao = e.target.closest('button[data-acao]');
  if (!botao) return;
  const id = botao.closest('.alerta').dataset.id;
  if (botao.dataset.acao === 'apagar') {
    if (!confirm('Apagar este alerta?')) return;
    await api(`alertas/${id}`, { method: 'DELETE' }).catch((err) => alert(err.message));
  } else {
    botao.disabled = true;
    botao.textContent = 'Buscando…';
    await api(`alertas/${id}/verificar`, { method: 'POST' }).catch((err) => alert(err.message));
  }
  carregarAlertas();
});

// A busca pode pedir para criar um alerta com a rota já preenchida.
window.addEventListener('criar-alerta', (e) => {
  const f = $('#form-alerta');
  for (const [campo, valor] of Object.entries(e.detail)) if (f[campo]) f[campo].value = valor;
  location.hash = 'alertas';
  setTimeout(() => f.limite.focus(), 50);
});

// ---------- avisos ----------

async function carregarAvisos() {
  const [{ avisos }, config] = await Promise.all([
    api('avisos').catch(() => ({ avisos: [] })),
    api('config').catch(() => null),
  ]);
  $('#lista-avisos').innerHTML = avisos.length
    ? avisos.map((a) => `
      <li class="aviso ${a.tipo}">
        <strong>${esc(a.titulo)}</strong>
        <span>${esc(a.texto)}</span>
        <span class="leve pequeno">${quando(a.em)}</span>
      </li>`).join('')
    : '<li class="cartao vazio">Nenhum aviso ainda.</li>';
  if (config) for (const [k, v] of Object.entries(config)) if ($('#form-config')[k]) $('#form-config')[k].value = v;
  atualizarContador(avisos);
}

function lerVisto() { try { return localStorage.getItem('avisosVistos') || ''; } catch { return ''; } }

function atualizarContador(avisos) {
  const visto = lerVisto();
  const novos = avisos.filter((a) => a.em > visto).length;
  const contador = $('.contador');
  contador.hidden = !novos || location.hash === '#avisos';
  contador.textContent = novos > 9 ? '9+' : novos;
}

function marcarAvisosLidos() {
  try { localStorage.setItem('avisosVistos', new Date().toISOString()); } catch {}
  $('.contador').hidden = true;
}

$('#form-config').addEventListener('submit', async (e) => {
  e.preventDefault();
  const dados = Object.fromEntries(new FormData(e.target));
  try {
    await api('config', { method: 'POST', body: dados });
    e.target.querySelector('button').textContent = 'Salvo ✓';
    setTimeout(() => { e.target.querySelector('button').textContent = 'Salvar'; }, 2000);
  } catch (err) {
    alert(err.message);
  }
});

$('#rodar-agora').addEventListener('click', async (e) => {
  await api('monitor/rodar', { method: 'POST' }).catch((err) => alert(err.message));
  e.target.textContent = 'Verificando em segundo plano…';
  setTimeout(() => { e.target.textContent = 'Verificar tudo agora'; carregarAvisos(); }, 60000);
});

// ---------- notificações ----------

const ehIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
const instalado = matchMedia('(display-mode: standalone)').matches || navigator.standalone;

function base64ParaBytes(b64) {
  const limpo = (b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(limpo), (c) => c.charCodeAt(0));
}

async function estadoPush() {
  const texto = $('#texto-push');
  const ativar = $('#ativar-push');
  const testar = $('#testar-push');
  if (!('serviceWorker' in navigator) || !window.isSecureContext) {
    texto.textContent = 'Notificações precisam de um endereço seguro (https). Abra o app pelo endereço do Tailscale (veja o README).';
    ativar.hidden = true;
    return;
  }
  if (!('PushManager' in window)) {
    texto.textContent = ehIOS && !instalado
      ? 'No iPhone, primeiro adicione o app à tela inicial: toque em Compartilhar → "Adicionar à Tela de Início". Depois abra pelo ícone e ative aqui.'
      : 'Este navegador não suporta notificações.';
    ativar.hidden = true;
    return;
  }
  const registro = await navigator.serviceWorker.ready;
  const inscricao = await registro.pushManager.getSubscription();
  if (inscricao && Notification.permission === 'granted') {
    texto.textContent = 'Ativadas neste aparelho. Você recebe avisos de saldo, pontos vencendo, bônus da Livelo e alertas de preço.';
    ativar.textContent = 'Desativar neste aparelho';
    ativar.dataset.ativo = '1';
    testar.hidden = false;
  } else {
    texto.textContent = Notification.permission === 'denied'
      ? 'As notificações foram bloqueadas neste navegador. Libere nas configurações do site e tente de novo.'
      : 'Receba os avisos neste aparelho, mesmo com o app fechado.';
    ativar.textContent = 'Ativar notificações';
    delete ativar.dataset.ativo;
    testar.hidden = true;
  }
}

$('#ativar-push').addEventListener('click', async (e) => {
  const botao = e.target;
  botao.disabled = true;
  try {
    const registro = await navigator.serviceWorker.ready;
    if (botao.dataset.ativo) {
      const inscricao = await registro.pushManager.getSubscription();
      if (inscricao) {
        await api('push/desinscrever', { method: 'POST', body: { endpoint: inscricao.endpoint } });
        await inscricao.unsubscribe();
      }
    } else {
      if (await Notification.requestPermission() !== 'granted') throw new Error('Permissão de notificação negada.');
      const { chave } = await api('push/chave');
      const inscricao = await registro.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64ParaBytes(chave) });
      await api('push/inscrever', { method: 'POST', body: inscricao.toJSON() });
    }
  } catch (erro) {
    alert(erro.message);
  }
  botao.disabled = false;
  estadoPush();
});

$('#testar-push').addEventListener('click', () => api('push/teste', { method: 'POST' }).then(carregarAvisos).catch((e) => alert(e.message)));

// ---------- início ----------

if ('serviceWorker' in navigator && window.isSecureContext) {
  navigator.serviceWorker.register('sw.js').then(estadoPush).catch(() => estadoPush());
} else {
  estadoPush();
}
mostrarAba();
api('avisos').then(({ avisos }) => atualizarContador(avisos)).catch(() => {});
