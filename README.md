# Voos em Reais e Pontos

App **pessoal** de passagens aéreas, inspirado no Oktoplus, para usar no celular.

- **Buscar**: para cada voo, mostra lado a lado o preço em **reais** e em **pontos** (Smiles, LATAM Pass e Azul Fidelidade), o **milheiro obtido** `(preço em R$ − taxas) ÷ (pontos ÷ 1.000)` e o custo convertido pelo valor que *você* paga por 1.000 pontos. A opção mais barata fica marcada.
- **Contas**: conecta Smiles, LATAM Pass, Azul Fidelidade e Livelo para acompanhar o saldo e os pontos que vão vencer, e mostra os bônus de transferência da Livelo.
- **Alertas**: você escolhe rota, data e limite (em pontos ou em reais), e o app busca sozinho e avisa quando encontrar.
- **Avisos**: notificações no celular para saldo que mudou, pontos perto de vencer, sessão expirada, bônus da Livelo e alertas de preço.

## Como funciona

```
Celular ──(Tailscale, privado)──▶ Computador do trabalho, sempre ligado
                                   ├─ este app (Node.js)
                                   └─ Chrome com as suas sessões salvas ──▶ Smiles, LATAM, Azul, Livelo
```

A busca e as contas rodam no **seu computador**, com a internet dele. Isso é de propósito:

- Esses sites bloqueiam quase sempre os acessos que vêm de servidores na nuvem.
- **A senha nunca passa pelo app.** "Conectar" só abre o site numa janela do Chrome do computador para você entrar normalmente. A sessão fica salva naquele computador, em `.perfil-navegador/`, como o "lembrar de mim" do navegador.
- O app só aceita conexões do próprio computador. Ninguém mais na rede da empresa consegue abrir. O celular chega até ele pelo Tailscale, uma rede privada que só os seus aparelhos acessam.

> **Computador do trabalho:** confirme com a TI se você pode instalar o Tailscale e deixar o app rodando. Redes corporativas às vezes bloqueiam esse tipo de programa ou o acesso automatizado aos sites.

## Instalação no computador

1. Instale o [Node.js](https://nodejs.org) 20 ou mais novo e o Google Chrome.
2. Baixe o projeto e instale as dependências:

   ```bash
   git clone https://github.com/souhugo/voos-milhas.git
   cd voos-milhas
   npm install
   ```

3. Inicie:

   ```bash
   npm start
   ```

   Abra http://localhost:3000 para conferir. Para testar a tela com dados inventados, use `npm run demo`.

Sem o Google Chrome instalado, rode uma vez `npx playwright install chromium`.

### Deixar rodando sempre

O app precisa ficar aberto para fazer as verificações automáticas. O jeito mais simples é o [pm2](https://pm2.keymetrics.io), que reinicia o app se ele cair e quando o computador ligar:

```bash
npm install -g pm2
pm2 start server.js --name voos
pm2 save
pm2 startup
```

O último comando mostra uma linha para copiar e rodar (no Windows, use o pacote `pm2-windows-startup`). Não bloqueie a tela com o usuário deslogado: o Chrome precisa de uma sessão aberta para mostrar a janela.

## Acesso pelo celular (Tailscale)

1. Crie uma conta grátis em https://tailscale.com e instale o Tailscale **no computador** e **no celular**, entrando com a mesma conta nos dois.
2. No painel do Tailscale (https://login.tailscale.com/admin/dns), ative **MagicDNS** e **HTTPS Certificates**.
3. No computador, rode:

   ```bash
   tailscale serve --bg 3000
   ```

   O comando mostra um endereço como `https://nome-do-pc.algo.ts.net`. Esse endereço só abre nos seus aparelhos com o Tailscale ligado.
4. No celular, com o Tailscale ligado, abra esse endereço.

Use `tailscale serve`, **não** `tailscale funnel`: o funnel deixaria o app aberto para a internet inteira.

### Instalar como app e ativar notificações

- **iPhone** (iOS 16.4 ou mais novo): abra no Safari → Compartilhar → **Adicionar à Tela de Início**. Abra pelo ícone, vá em **Avisos** → **Ativar notificações**.
- **Android**: abra no Chrome → menu ⋮ → **Instalar app** (ou "Adicionar à tela inicial"). Depois, **Avisos** → **Ativar notificações**.

Toque em **Enviar teste** para conferir.

## Conectar as contas

Precisa ser feito **na frente do computador**, porque a janela de login abre nele:

1. No app (no próprio computador ou no celular), vá em **Contas** e toque em **Conectar**.
2. Na janela do Chrome que abriu no computador, entre na sua conta (senha, código por SMS, captcha).
3. Toque em **Verificar**. O saldo deve aparecer.

As sessões costumam durar alguns dias ou semanas. Quando uma expirar, chega o aviso "Reconecte sua conta" e você repete os passos.

## Verificações automáticas

Valores padrão, que você muda em **Avisos → Frequência das verificações**:

| O quê | Frequência | Aviso quando |
|---|---|---|
| Saldo e vencimento das contas | a cada 6 horas | o saldo muda, há pontos vencendo em até 60 dias ou a sessão expirou |
| Bônus da Livelo | junto com as contas | a transferência para Smiles, LATAM Pass ou Azul tem 80% de bônus ou mais |
| Alertas de preço | a cada 12 horas | o preço fica igual ou abaixo do limite (e só avisa de novo se baixar mais) |

Os horários variam um pouco a cada vez, para não parecer robô. Verificar mais vezes aumenta a chance de bloqueio.

## Quando um site muda e para de funcionar

Os sites mudam de tempos em tempos. Se uma busca, um saldo ou o bônus da Livelo der erro:

1. Pare o app e rode `DEBUG_DUMP=1 npm start`.
2. Repita a busca ou toque em **Verificar** na conta.
3. Na pasta `dumps/` aparece um arquivo com o que o site devolveu. Ele pode conter seus dados pessoais (nome, saldo), então apague essas partes antes de compartilhar.
4. Ajuste o leitor correspondente e o exemplo nos testes, e rode `npm test`:
   - busca: `src/conectores/<fonte>.js`
   - contas e bônus: `src/contas.js` (os endereços das páginas ficam no início do arquivo)

## Configurações (variáveis de ambiente)

| Variável | Padrão | Para quê |
|---|---|---|
| `PORT` | `3000` | Porta do servidor |
| `HOST` | `127.0.0.1` | Endereço em que o app escuta. Não mude, a não ser que saiba o que está fazendo |
| `HOSTS_PERMITIDOS` | – | Outros nomes de endereço aceitos, separados por vírgula (os `*.ts.net` já são aceitos) |
| `HEADLESS` | `false` | `true` esconde a janela do navegador (mais bloqueios) |
| `NAVEGADOR` | `chrome` | Canal do Playwright; vazio usa o Chromium do Playwright |
| `DEBUG_DUMP` | – | `1` salva em `dumps/` tudo o que cada site devolveu |
| `PASTA_DADOS` | `dados` | Onde ficam alertas, avisos, saldos e chaves de notificação |
| `URL_BONUS_LIVELO` | página inicial da Livelo | Página lida para achar os bônus de transferência |

## Estrutura

```
server.js               servidor e API
src/busca.js            roda as fontes em paralelo, junta ofertas do mesmo voo, cache
src/conectores/         busca: smiles, latam, azul e demo
src/contas.js           contas conectadas, saldo, vencimentos e bônus da Livelo
src/monitor.js          verificações automáticas e alertas de preço
src/avisos.js           avisos e notificações (Web Push)
src/navegador.js        abre as páginas no Chrome (Playwright)
src/dados.js            arquivos JSON em dados/
public/                 a tela (HTML, CSS e JS, sem build), manifesto e service worker
test/                   testes (npm test)
```

## Limites e cuidados

- É para uso pessoal e com moderação. Acesso automatizado pode contrariar os termos de uso dos sites e dos programas de pontos.
- As pastas `dados/` e `.perfil-navegador/` têm suas informações e sessões. Elas não vão para o Git, mas não as copie para outros lugares.
- A leitura de saldo procura os campos mais comuns ("saldo", "pontos", "milhas" e parecidos). Na primeira vez, confira se o número bate com o site.
