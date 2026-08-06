# Backlog de referência — inventário funcional do GestorSim

Levantado em 2026-08-06 navegando o sistema GestorSim (gestorsim.com), um
concorrente maduro de gestão para salões/estúdios de beleza, para orientar
paridade funcional futura do Alva. **Uso exclusivamente como referência de
quais funcionalidades existem no mercado** — nada de texto, layout, nomes de
campo específicos ou design foi ou deve ser copiado (ver nota de autoria no
`README.md`). Cada item aqui é um candidato a avaliar em um ciclo futuro de
brainstorming próprio, não uma lista de tarefas.

## Módulos já cobertos no Alva (v0.2), com gaps observados no GestorSim

- **Clientes**: GestorSim tem abas extras (Anamnese, Histórico, Responsável
  Financeiro, Crédito, Grupo, VIP, agendamento online). Alva hoje só tem
  nome/telefone/email/nascimento/observações.
- **Serviços**: GestorSim tem Setor/Subsetor, "Foco", "Estratégico", Pontos,
  clonagem. Alva hoje é nome/categoria/duração/preço.
- **Produtos**: GestorSim tem 3 preços (custo, **profissional**, venda),
  diluição, balanço, importação XML, filtro por família técnica. Alva hoje
  só tem custo/venda (2 preços) — vale considerar preço-profissional se
  formos permitir venda interna a profissionais.
- **Caixa**: GestorSim tem "Identificação" do operador, "Origem", e uma
  regra de restrição de caixa por profissional/usuário na abertura. Alva
  hoje só pede valor de abertura.
- **Agenda**: GestorSim tem bem mais status (Cliente no Salão, Confirmado,
  Pago, Não Pago, Agendado Online, Agendado pela IA) que o enum atual do
  Alva (`agendado, confirmado, em_andamento, concluido, cancelado, faltou`).
- **Relatórios**: GestorSim tem DRE, DRP, Fluxo de Caixa, Faturamento por
  auxiliar, Ticket Médio, Rentabilidade, Ranking de Profissionais, Ocupação
  da agenda, Adiantamentos — muito além do único relatório de faturamento
  diário que o Alva tem hoje. Já é o item 5 do "próximos passos" do README.

## Módulos que não existem no Alva

- **Profissionais** — inexistente na UI hoje (tabela existe no schema).
  **Entra no ciclo atual**, escala mínima (ver design de autenticação).
  GestorSim tem 15 abas incluindo folha de pagamento completa (FGTS, INSS,
  13º, vale-transporte) e permissionamento granular — fora de escopo por
  muito tempo, provavelmente nunca no formato do GestorSim para um MVP.
- **Comissionamento** — já é o item 4 do "próximos passos" do README.
  GestorSim configura comissão por serviço × profissional (percentual OU
  valor fixo, mais taxa operacional, com toggles "desconta produto"/
  "desconta taxa de cartão") e separadamente um "Grupo de Comissionamento"
  por produto (não por profissional). Útil como referência de design quando
  chegar a vez desse item.
- **Pacotes** (venda de pacote de serviços com desconto)
- **Fornecedores**, **Contas Bancárias**, **Formas de Pagamento** (cadastros
  auxiliares)
- **Ficha de Anamnese** (formulário customizável de avaliação do cliente)
- **Metas** (diárias, por profissional)
- **Orçamento** (proposta prévia antes de virar agendamento/venda)
- **Eventos**, **Cursos & Mentoria**, **Pesquisa de Clima/Satisfação** —
  claramente fora do núcleo de gestão operacional; improvável que entrem no
  Alva.

## Decisão de escopo

Ciclo atual (autenticação): só entra **Profissionais**, com o schema mínimo
que já existe (`nome`, `especialidade`, `percentual_comissao`, `ativo`) —
sem folha de pagamento, permissões ou abas extras. O resto desta lista fica
como candidato para ciclos futuros de brainstorming, priorizado conforme o
README for evoluindo.
