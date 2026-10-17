# Brand Book: Foldway

**Foldway, o ateliê de atalhos.** *"Links longos demais? Deixa comigo."*

## 1. Personagem

**Nome:** Furl.

**Quem é:** um artesão de origami que descobriu que todo link longo é uma folha de papel desdobrada demais. Ele não corta nada (o destino continua o mesmo), só dobra até caber no bolso.

**Personalidade:** calmo, caprichoso e um pouco orgulhoso do trabalho. Fala pouco e direto. Não aceita dobra torta: se o vinco não encaixa, desfaz e começa de novo.

**Identidade visual:** jovem de cabelo escuro e cacheado, camisa branca, colete escuro, luvas sem dedos e detalhes em dourado. A marca registrada são as faixas de papel facetado que saem dos braços, como um origami ainda sendo dobrado. Tem 5 poses que mudam conforme a tela: boas-vindas, dobrando, pronto, origami rasgado (erro) e mesa vazia.

## 2. Identidade

**Tema:** origami. Encurtar um link é dobrar um papel: o tamanho muda, o destino não.

**História:** o Furl começou dobrando bilhetes para encurtar recados entre vizinhos. Um dia recebeu um link de três linhas. Dobrou, dobrou de novo, e na terceira dobra o papel virou um avião coral que voava direto para o destino. Assim nasceu o ateliê: cada link que entra vira um origami, e cada origami é um atalho.

**Tom de voz:** curto, calmo, com o vocabulário do ateliê, sem virar charada.

| Situação | O Furl diz |
|---|---|
| Link criado | "Dobrado. Cabe no bolso agora." |
| URL inválida | "Esse papel tá rasgado. Confere o endereço?" |
| Link inexistente ou expirado | "Esse origami não encontrou destino." |
| Página inexistente | "Nem uma dobra leva até aqui." |

**Visual:** índigo (`#14182B`), branco-papel (`#F7F3EA`), kraft (`#CDB28A`), ciano (`#2DE2E6`) e um único destaque quente, o coral (`#F2553D`), reservado ao origami. Fundo em facetas low-poly e cartões com o canto dobrado.

**O que nos torna diferentes:** o Foldway não trata o link curto como um código, e sim como um objeto feito à mão. Cada link nasce de uma dobra que o visitante vê acontecer, ganha uma forma física no QR Code e, quando some, vira um origami desfeito. Personagem, visual, textos e features contam a mesma história.

## 3. Features exclusivas

1. **A dobra do link:** ao criar um link, o endereço aparece num papel kraft que é dobrado três vezes até virar o origami coral com o código curto. Se der erro, o vinco não encaixa e o papel treme. É a origem do Furl acontecendo a cada link.
2. **QR Code do ateliê:** cada link tem um QR Code com o origami no centro, num cartão de canto dobrado, com download em PNG. O origami sai da tela e vai para o papel de verdade. Os acessos pelo QR aparecem no Grafana em `kiro_feature_used_total{feature="qrcode"}`.
3. **Origami desfeito:** link inexistente (404) ou expirado (410) mostra o Furl diante de um origami rasgado, mantendo o status HTTP original.
