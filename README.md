# Voos em Reais e Pontos

Buscador **pessoal** de passagens aéreas, inspirado no Oktoplus. Para cada voo, mostra lado a lado o preço em **reais** e em **pontos** (Smiles, LATAM Pass e Azul Fidelidade) e calcula:

- **Milheiro obtido**: quanto cada 1.000 pontos "rendem" naquela passagem, `(preço em R$ − taxas) ÷ (pontos ÷ 1.000)`.
- **Custo pelo seu milheiro**: os pontos convertidos em reais pelo valor que *você* paga por 1.000 pontos (editável na tela). Assim dá para comparar tudo, e o sistema marca a opção mais barata.

## Como rodar

Precisa do [Node.js](https://nodejs.org) 20 ou mais novo e, de preferência, do Google Chrome instalado.

```bash
npm install
npm start
```

Abra http://localhost:3000. Para ver a tela com dados inventados, sem abrir os sites:

```bash
npm run demo
```

Sem o Google Chrome instalado, baixe uma vez o navegador do Playwright:

```bash
npx playwright install chromium
```

## De onde vêm os dados

Smiles, LATAM e Azul não têm API pública. O sistema abre a **página pública de busca** de cada site num navegador de verdade (Playwright) e lê as respostas que o próprio site recebe, do mesmo jeito que aconteceria se você buscasse à mão.

| Fonte | Reais | Pontos |
|---|---|---|
| Smiles (GOL) | – | ✅ milhas normais e Clube Smiles |
| LATAM | ✅ | ✅ LATAM Pass |
| Azul | ✅ | ✅ Azul Fidelidade |

- Uma janela do Chrome abre durante a busca. Com a janela visível, os sites bloqueiam muito menos. Se aparecer captcha, resolva na própria janela: o perfil fica salvo em `.perfil-navegador/` e as próximas buscas tendem a passar direto.
- Os resultados ficam guardados por 15 minutos, para não repetir a mesma consulta.
- É para uso pessoal e com moderação: muitas buscas seguidas levam a bloqueio, e esse tipo de acesso automatizado pode contrariar os termos de uso dos sites.

### Configurações (variáveis de ambiente)

| Variável | Padrão | Para quê |
|---|---|---|
| `PORT` | `3000` | Porta do servidor |
| `HEADLESS` | `false` | `true` esconde a janela do navegador (mais bloqueios) |
| `NAVEGADOR` | `chrome` | Canal do Playwright; vazio usa o Chromium do Playwright |
| `DEBUG_DUMP` | – | `1` salva em `dumps/` tudo o que cada site devolveu |

## Quando um site muda e para de funcionar

Os sites mudam o formato das respostas de tempos em tempos. Se uma fonte aparecer com erro ou com "0 voos":

1. Rode `DEBUG_DUMP=1 npm start` e faça a busca de novo.
2. Abra o arquivo gerado em `dumps/` e veja o formato novo.
3. Ajuste o leitor em `src/conectores/<fonte>.js` (funções `lerSmiles`, `lerLatam`, `lerAzul`) e o exemplo em `test/conectores.test.js`.
4. Rode `npm test`.

## Estrutura

```
server.js               servidor local e API (/api/buscar, /api/fontes)
src/busca.js            roda as fontes em paralelo, junta ofertas do mesmo voo, cache
src/navegador.js        abre as páginas e captura o JSON (Playwright)
src/conectores/         uma fonte por arquivo: smiles, latam, azul e demo
public/                 a tela (HTML, CSS e JS, sem build)
public/valor.js         contas de milheiro e custo efetivo
test/                   testes (npm test)
```

## Ideias para depois

- Calendário com o menor preço de cada dia do mês
- Alerta quando o preço em pontos cair abaixo de um valor
- Mais fontes para voos internacionais: TAP Miles&Go, Iberia Avios, Seats.aero (API paga)
