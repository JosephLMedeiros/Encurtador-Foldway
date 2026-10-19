# Produto

## O que é

Um encurtador de links com identidade própria, feito para o hackathon de CloudOps. Ele transforma URLs longas em links curtos, guarda a relação entre os dois e redireciona quem acessa o link curto. Por baixo, roda inteiro em Kubernetes, com CI/CD no GitHub Actions, deploy por GitOps com ArgoCD e observabilidade com OpenTelemetry e Grafana.

A equipe trabalha com Spec-Driven Development: o escopo e as decisões ficam no `SSOT.md`, e cada área tem sua spec em `.kiro/specs/`.

## Equipe

| Pessoa | Responsável por |
|---|---|
| Joseph | Frontend e telas (interface, animação da dobra, mascote no app) |
| Fábio | Identidade do produto: brand book do Foldway (personagem, tema, tom de voz e features) |
| Diêgo | DevOps e GitOps (Kubernetes, pipeline, ArgoCD), backend, banco de dados e integração; aprova documentos e decisões |
| Abby | SRE e observabilidade |
| Lucas | Backend |

## Identidade (proposta)

O nome, o personagem e a feature exclusiva já estão implementados, mas ainda aguardam a aprovação do Diêgo (D-08, D-15, D-16 e D-17 no SSOT). Até lá, trate tudo abaixo como proposta. A referência completa é o brand book do Fábio (`docs/brand-book.md`, hoje na branch `feat/identidade-fabio`).

- **Nome:** Foldway, "o ateliê de atalhos".
- **Personagem:** Furl, um artesão de origami que dobra links longos até caberem no bolso. Calmo, caprichoso, fala pouco e direto. Tem cinco poses (boas-vindas, dobrando, pronto, erro e mesa vazia), em `frontend/public/mascot/`.
- **Tema:** encurtar um link é dobrar um papel: o tamanho muda, o destino não.
- **Visual:** índigo, branco-papel, kraft, ciano e um único destaque quente, o coral, reservado ao origami.
- **Tom de voz:** frases curtas, calmas, com o vocabulário do ateliê, sem virar charada. Exemplo: "Dobrado. Cabe no bolso agora."

## Funcionalidades

Obrigatórias, todas implementadas:

- criar link curto, com código aleatório ou personalizado e expiração opcional;
- listar os links criados;
- redirecionar para a URL original, com 404 para link inexistente e 410 para expirado;
- guardar tudo no PostgreSQL.

Exclusivas do Foldway:

- **a dobra do link:** ao criar, o endereço vira um papel kraft que é dobrado até virar o origami com o código curto;
- **QR Code do ateliê:** cada link tem um QR Code com o origami no centro e download em PNG; os acessos pelo QR são contados no Grafana;
- **origami desfeito:** link inexistente ou expirado mostra o Furl diante de um origami rasgado, mantendo o status HTTP;
- **analytics:** estatísticas por link (cliques por hora) e ranking dos mais clicados, que alimentam o "link do dia" no dashboard.

## Público

Quem precisa criar e compartilhar links curtos de forma simples. A interface prioriza clareza: um campo, um botão, o resultado e a lista.

## Diretrizes

- O essencial funcionando ponta a ponta vem antes de qualquer feature extra.
- Toda feature exclusiva deve gerar algum sinal observável (métrica ou trace), para aparecer na demo.
- Personagem, textos e visual contam a mesma história. Texto novo na interface segue o tom do Furl.
- Não invente funcionalidade ou regra de negócio que não esteja no SSOT ou numa spec.
