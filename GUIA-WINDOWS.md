# Guia passo a passo: Windows

Faça um passo de cada vez. Se algo der diferente do descrito, tire um print e mande para o Claude.

Nada aqui precisa de senha de administrador: o `iniciar.bat` baixa uma versão portátil do Node.js para dentro da pasta do app.

## Passo 1: baixar o app

1. Abra https://github.com/souhugo/voos-milhas, entrando com sua conta do GitHub.
2. Clique no botão verde **Code** → **Download ZIP**.
3. Abra a pasta **Downloads**, clique com o botão direito no arquivo `voos-milhas-main.zip` → **Extrair tudo…**.
4. Em destino, escolha a pasta **Documentos** e confirme. Vai ficar algo como `Documentos\voos-milhas-main`.

## Passo 2: abrir o app pela primeira vez

1. Entre na pasta `voos-milhas-main` e dê dois cliques em **`iniciar.bat`**.
   - Se aparecer "O Windows protegeu o computador", clique em **Mais informações** → **Executar assim mesmo**.
2. Na primeira vez, uma janela preta baixa o Node.js e instala o que o app precisa. Leva alguns minutos.
3. Quando aparecer **"App rodando em http://localhost:3000"**, o navegador abre sozinho no app.

**Deixe a janela preta aberta** (pode minimizar). Fechar a janela fecha o app.

Se a janela mostrar erro de rede, a internet do trabalho pode estar bloqueando nodejs.org ou registry.npmjs.org. Mande um print.

## Passo 3: fazer uma busca de teste

1. No app, preencha origem, destino e uma data, e clique em **Buscar voos**.
2. Vão abrir janelas do Chrome sozinhas, uma para cada site. **Não feche nem mexa nelas**; elas fecham sozinhas.
3. Se algum site mostrar captcha ("não sou um robô"), resolva na própria janela.

Tire um print do resultado e mande para o Claude, principalmente se alguma fonte aparecer em vermelho.

## Passo 4: criar a senha do app

A senha é pedida quando o app é aberto pelo celular. No próprio computador, ela não é pedida.

1. No app, vá em **Avisos** → **Senha do app**.
2. Digite uma senha com pelo menos 8 caracteres, repita e clique em **Salvar senha**.

## Passo 5: conectar as contas

Faça isso **na frente do computador**, porque a janela de login abre nele.

1. No app, vá em **Contas** → **Conectar** (Smiles, por exemplo).
2. Vai abrir o Chrome no site da Smiles. Entre na sua conta normalmente.
3. Volte ao app e clique em **Verificar**. O saldo deve aparecer.
4. Repita para LATAM Pass, Azul Fidelidade e Livelo.

Se o saldo não aparecer ou aparecer errado, tire um print e mande para o Claude.

## Passo 6: abrir sozinho quando o computador ligar

1. Na pasta do app, clique com o botão direito em `iniciar.bat` → **Mostrar mais opções** → **Criar atalho**.
2. Aperte **Windows + R**, digite `shell:startup` e aperte Enter. Abre uma pasta.
3. Arraste o atalho criado para essa pasta.

Também vale conferir em **Configurações → Sistema → Energia** se o computador está configurado para **nunca entrar em suspensão** (desligar só a tela pode).

## Passo 7: acesso pelo celular

Para abrir o app no celular, é preciso um programa que faça a ponte até o computador. A opção indicada é o **Tailscale** (veja "Acesso pelo celular" no README), mas ele precisa de administrador para instalar. Combine com o Claude qual caminho seguir.

## Problemas comuns

| O que acontece | O que fazer |
|---|---|
| A janela preta fecha na hora ou mostra erro | Mande um print da janela |
| Erro de rede ou "proxy" no passo 2 | A rede bloqueia nodejs.org ou registry.npmjs.org |
| Uma fonte aparece em vermelho na busca | Mande um print. Para mais detalhes, veja "Quando um site muda" no README |
| Aviso "Reconecte sua conta" | A sessão expirou: repita o passo 5 para essa conta |
