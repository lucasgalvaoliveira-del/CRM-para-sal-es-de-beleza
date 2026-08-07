# Spec — Agenda e Agendamentos v1

Status: **proposta, não implementada**. Item #2 do roadmap de prioridade 2
(`docs/roadmap/ROADMAP.md`). Este documento é a especificação para
implementação, não a implementação em si — nada aqui foi codificado.

## Problema

A Agenda hoje (`src/app/(app)/agenda/page.tsx`) é só uma grade visual:
colunas por profissional ativo, linhas de horário de 30 em 30 minutos, sem
nenhuma interação. A tabela `agendamentos` já existe no schema com todos os
campos necessários, mas nada na aplicação cria, edita ou exibe uma linha
dela. Esta é a lacuna nº 1 mais citada tanto no `README.md` original quanto
no roadmap consolidado.

## Entidades afetadas

- `agendamentos` (existente, sem mudança de coluna necessária) — campos:
  `empresa_id`, `cliente_id` (nullable), `profissional_id`, `servico_id`,
  `inicio`, `fim`, `status`, `observacoes`.
- `profissionais`, `servicos`, `clientes` — só leitura, para popular os
  seletores do formulário de criação.
- Nenhuma tabela nova proposta para v1.

## Pré-requisito de segurança (bloqueante, não é opcional)

Antes de expor criação de agendamento, fechar o **risco #2**
(`docs/architecture/ARCHITECTURE.md#riscos-técnicos`): hoje
`agendamentos.profissional_id`/`servico_id`/`cliente_id` não validam que a
linha referenciada pertence à mesma `empresa_id` do agendamento. Assim que
existe um formulário de criação real (em vez de só a tabela existir sem uso
prático), esse risco deixa de ser teórico. Ver
`docs/database/DATABASE.md#risco-2--referências-cross-tenant-não-validadas`
para as duas abordagens de correção — decisão de qual delas usar fica para
a fase de implementação, mas **a correção precisa entrar junto com esta
feature, não depois**.

## Fluxo proposto

1. Usuário clica num horário vazio na grade (coluna = profissional já
   conhecida, linha = horário de início já conhecido).
2. Abre um formulário (modal ou painel lateral — decisão de UI na
   implementação) pré-preenchido com profissional e horário do clique.
3. Usuário busca e seleciona um cliente existente (busca por nome).
4. Usuário seleciona um serviço — a duração do serviço
   (`servicos.duracao_minutos`) preenche automaticamente o horário de fim
   (`inicio + duracao_minutos`), editável manualmente se necessário.
5. Ao salvar, a Server Action valida (nesta ordem): serviço/profissional/
   cliente pertencem à empresa do usuário → não há sobreposição de horário
   para o mesmo profissional → cria o agendamento com `status = 'agendado'`.
6. O bloco aparece na grade imediatamente, com cor/estilo por status.
7. Usuário pode alterar o status do agendamento (ao menos: confirmar,
   cancelar) a partir de um clique no bloco já criado.

## Critérios de aceite

- **AC1**: clicar num horário vazio abre o formulário de criação
  pré-preenchido com o profissional da coluna e o horário da linha
  clicados.
- **AC2**: o formulário exige cliente (busca entre os já cadastrados) e
  serviço (a duração do serviço define o fim automaticamente); profissional
  vem pré-selecionado mas é editável.
- **AC3**: submeter um horário que sobrepõe outro agendamento não-cancelado
  do mesmo profissional é rejeitado com uma mensagem clara, sem criar linha
  nenhuma.
- **AC4**: submeter com cliente/serviço/profissional de outra empresa (não
  deveria ser possível pela UI, mas a Server Action valida de qualquer
  forma) é rejeitado.
- **AC5**: agendamento criado aparece na grade sem precisar de reload
  manual da página (via `revalidatePath` ou equivalente).
- **AC6**: é possível cancelar um agendamento existente a partir da grade.
- **AC7**: a grade continua utilizável (não necessariamente com o mesmo
  layout) numa tela estreita — formato exato é uma pendência de decisão,
  ver abaixo.

## Regra de conflito (dupla reserva)

Duas camadas, não uma só:

1. **Camada de banco (garantia real, protege contra corrida)**: exclusion
   constraint usando a extensão `btree_gist`:

   ```sql
   create extension if not exists btree_gist;

   alter table agendamentos add constraint sem_sobreposicao_profissional
     exclude using gist (
       profissional_id with =,
       tstzrange(inicio, fim) with &&
     ) where (status not in ('cancelado', 'faltou'));
   ```

   Isso impede a sobreposição **no banco**, mesmo que duas requisições
   cheguem simultaneamente — uma checagem só na aplicação (Server Action)
   tem uma janela de corrida entre o `select` de conflito e o `insert`.
2. **Camada de aplicação (UX)**: a Server Action faz o mesmo tipo de
   checagem antes de tentar o insert, só para devolver uma mensagem
   amigável (`"Este profissional já tem um agendamento nesse horário."`)
   em vez de deixar o usuário ver o erro cru da constraint do banco.

Cancelar ou marcar "faltou" libera o horário automaticamente (a constraint
já exclui esses status via `where`).

## Permissões

**Pendência de decisão de produto.** Hoje nenhuma tela do sistema restringe
por `perfis.papel` — todo usuário autenticado da empresa tem acesso igual.
Não existe ainda conceito de "profissional logado vendo só a própria
agenda" porque não há fluxo de convite/login para staff (profissional é
hoje só um registro de cadastro, sem `auth.users` vinculado). Recomendação
para v1: manter o padrão atual (qualquer usuário autenticado da empresa
pode criar/editar qualquer agendamento) e tratar "profissional só vê a
própria agenda" como parte do trabalho futuro de "convite de profissional"
(já listado no roadmap), não desta feature.

## UX responsiva

**Pendência de decisão de produto** (ligada à decisão geral de
responsividade em `docs/roadmap/ROADMAP.md`). A grade atual
(`grid-template-columns: 80px repeat(N profissionais, 1fr)`) não funciona
numa tela estreita com mais de 2-3 profissionais. Proposta de fallback,
sujeita a validação: abaixo de um breakpoint, trocar a grade por uma visão
de "um profissional por vez" — seletor de profissional + lista vertical dos
horários daquele dia. Decisão de qual breakpoint e se esse é o padrão certo
fica para quando a estratégia responsiva geral do projeto for definida.

## Timezone

Assumido para v1 (não validado com o usuário): **um fuso horário por
empresa**, não por profissional — coerente com um salão ser um único local
físico. `inicio`/`fim` continuam `timestamptz` (já corretos, armazenam em
UTC), a conversão para exibição usa o fuso do navegador do usuário via
`toLocaleString("pt-BR", ...)` como já é feito em `/relatorios` e `/caixa`
hoje. **Não** propor uma coluna `empresas.timezone` nem seleção de fuso por
enquanto — YAGNI até existir um caso real de empresa multi-região.

## Fora de escopo v1 (explicitamente adiado)

- Agendamento recorrente.
- Agendamento online (cliente final marcando sozinho, sem staff) — existe
  no backlog GestorSim como referência, não é v1.
- Geração automática de movimentação de caixa ao concluir um agendamento —
  acopla com Caixa/Comissionamento, fica para quando essas features
  avançarem.
- Cálculo de comissão do profissional sobre o agendamento.
- Notificações/lembretes.
- Criar cliente novo inline a partir do formulário de agendamento (v1 exige
  que o cliente já exista, cadastrado via `/clientes`) — candidato natural
  a fast-follow, mas não necessário para o fluxo funcionar.

## Riscos específicos desta feature

| Risco | Mitigação |
|---|---|
| Corrida entre duas criações simultâneas do mesmo profissional/horário | Exclusion constraint no banco (camada 1 da regra de conflito) — não confiar só na checagem da aplicação. |
| Regressão do risco #2 (referência cross-tenant) se a correção não entrar junto | Tratado como pré-requisito bloqueante desta feature, não item separado a lembrar depois. |
| Fuso horário incorreto se a empresa operar em múltiplas regiões | Assumido fora de escopo (1 fuso por empresa) — documentado como suposição explícita, não decisão silenciosa. |
| Grade inutilizável em mobile | Fallback proposto mas não decidido — ver UX responsiva acima. |

## Plano de implementação (fases)

1. **Banco**: extensão `btree_gist`, exclusion constraint de conflito, e a
   correção do risco #2 para `agendamentos` (FK composta ou trigger —
   decidir na implementação com base no que já existir de FK composta em
   outras tabelas nesse momento).
2. **Server Action de criação**: `criarAgendamento`, validação de tenant +
   conflito espelhando as constraints do banco (para mensagens amigáveis),
   `revalidatePath("/agenda")`.
3. **UI de criação**: clique no slot vazio → formulário → busca de cliente,
   seleção de serviço (auto-preenche fim), submit.
4. **Gestão de status**: alterar status a partir do bloco já criado
   (mínimo viável: cancelar; confirmar/em andamento/concluído podem ser a
   mesma UI reaproveitada).
5. **Passo responsivo**: aplicar a decisão de fallback mobile quando a
   estratégia geral estiver definida — não bloqueia as fases 1-4.

Cada fase acima é candidata a virar uma task de um plano de implementação
formal (`docs/superpowers/plans/`) quando esta spec for aprovada e entrar
em execução.
