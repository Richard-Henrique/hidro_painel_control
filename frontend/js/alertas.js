/* =====================================================================
   alertas.js — Tela de alertas

   Desenha a tela a partir do estado que o monitor.js mantém:
   - 4 cards de resumo (total, ativos, atenção e crítico);
   - filtro Todos / Atenção / Crítico (feito aqui na tela: o back devolve
     o histórico completo, e o "Ativo / Resolvido" de cada alerta depende
     de enxergar também os alertas "Normal");
   - lista de mensagens, do alerta mais recente ao mais antigo.

   Como acha os elementos: pelo atributo data-alertas no alertas.html.
   A moldura (sidebar e topbar) é do layout.js (atributos data-layout).

   - Não faz requisição (isso é do api.js) e não decide quando atualizar
     (isso é do monitor.js): só desenha o estado recebido.
   - Todo texto vindo do back entra com textContent, nunca com innerHTML.

   Local: frontend/js/alertas.js
   ===================================================================== */

import { montarLayout } from "./layout.js";
import { assinar, iniciar } from "./monitor.js";
import { tempoRelativo, varianteDoStatus } from "./formatadores.js";


/* ---------------------------------------------------------------------
   1) ELEMENTOS DA TELA (atributos data-alertas definidos no HTML)
   --------------------------------------------------------------------- */

function buscar(nome, raiz = document) {
  return raiz.querySelector(`[data-alertas="${nome}"]`);
}

const ui = {
  // Cards de resumo
  resumoTotal: buscar("resumo-total"),
  resumoAtivos: buscar("resumo-ativos"),
  resumoAtencao: buscar("resumo-atencao"),
  resumoCritico: buscar("resumo-critico"),

  // Filtro (os números entre parênteses vêm do resumo)
  filtros: document.querySelectorAll('[data-alertas="filtro"]'),
  contagemTodos: buscar("filtro-contagem-todos"),
  contagemAtencao: buscar("filtro-contagem-atencao"),
  contagemCritico: buscar("filtro-contagem-critico"),

  // Lista
  lista: buscar("lista"),
  vazio: buscar("vazio"),
};

// Modelo (<template>) do HTML
const modeloAlerta = document.getElementById("tpl-alerta");


/* ---------------------------------------------------------------------
   2) CONFIGURAÇÃO
   --------------------------------------------------------------------- */

// Cada filtro (value do radio, igual ao da API) -> status que ele deixa passar.
// null = todos. Os rótulos são os que o back devolve em "status".
const FILTROS = {
  todos: { status: null, vazio: "Nenhum alerta registrado." },
  atencao: { status: "Atenção", vazio: "Nenhum alerta de atenção." },
  critico: { status: "Crítico", vazio: "Nenhum alerta crítico." },
};

// Aparência do item por status: variante do <li> (alert-item--...) e ícone
const VISUAL_DO_STATUS = {
  "Atenção": { variante: "warning", icone: "bi-exclamation-triangle" },
  "Crítico": { variante: "danger", icone: "bi-x-octagon" },
  "Normal": { variante: "normal", icone: "bi-check-circle" },
};

const TODAS_AS_VARIANTES = Object.values(VISUAL_DO_STATUS).map((v) => `alert-item--${v.variante}`);
const TODOS_OS_ICONES = Object.values(VISUAL_DO_STATUS).map((v) => v.icone);

// Última foto do estado recebida: a troca de filtro redesenha com ela, sem esperar o ciclo
let ultimoEstado = null;


/* ---------------------------------------------------------------------
   3) FUNÇÕES AUXILIARES
   --------------------------------------------------------------------- */

// Troca a variante de cor do selo (status-badge--<variante>)
function trocarVarianteDoSelo(selo, variante) {
  selo.classList.remove(
    "status-badge--success",
    "status-badge--warning",
    "status-badge--danger",
    "status-badge--neutral"
  );
  selo.classList.add(`status-badge--${variante}`);
}

// Filtro marcado no momento (padrão: todos)
function filtroSelecionado() {
  const marcado = [...ui.filtros].find((opcao) => opcao.checked);

  return marcado !== undefined && marcado.value in FILTROS ? marcado.value : "todos";
}


/* ---------------------------------------------------------------------
   4) CARDS DE RESUMO E CONTAGENS DO FILTRO
   --------------------------------------------------------------------- */

function desenharResumo(resumo) {
  ui.resumoTotal.textContent = String(resumo.total);
  ui.resumoAtivos.textContent = String(resumo.ativos);
  ui.resumoAtencao.textContent = String(resumo.atencao);
  ui.resumoCritico.textContent = String(resumo.critico);

  // O filtro "Todos" conta o histórico inteiro, inclusive as voltas ao Normal
  ui.contagemTodos.textContent = String(resumo.total);
  ui.contagemAtencao.textContent = String(resumo.atencao);
  ui.contagemCritico.textContent = String(resumo.critico);
}


/* ---------------------------------------------------------------------
   5) LISTA DE ALERTAS
   --------------------------------------------------------------------- */

// Monta o item de um alerta a partir do <template>
function montarItem(alerta) {
  const cartao = modeloAlerta.content.cloneNode(true);
  const visual = VISUAL_DO_STATUS[alerta.status] ?? VISUAL_DO_STATUS["Atenção"];

  // Cor da borda e do ícone; "resolvido" deixa o item discreto
  const item = buscar("alerta-item", cartao);
  item.classList.remove(...TODAS_AS_VARIANTES);
  item.classList.add(`alert-item--${visual.variante}`);
  item.classList.toggle("alert-item--resolved", !alerta.ativo);

  const icone = buscar("alerta-icone", cartao);
  icone.classList.remove(...TODOS_OS_ICONES);
  icone.classList.add(visual.icone);

  // Título = mensagem; abaixo, a origem ("Turbina 02" ou "Reservatório")
  buscar("alerta-titulo", cartao).textContent = alerta.mensagem;
  buscar("alerta-origem", cartao).textContent = alerta.origem;

  // Selo de severidade
  const selo = buscar("alerta-selo", cartao);
  selo.textContent = alerta.status;
  trocarVarianteDoSelo(selo, varianteDoStatus(alerta.status));

  // "há 5 segundos · Ativo" / "ontem, 21:14 · Resolvido"
  const situacao = alerta.ativo ? "Ativo" : "Resolvido";
  const tempo = tempoRelativo(alerta.data);
  const meta = buscar("alerta-meta", cartao);

  meta.textContent = tempo === "" ? situacao : `${tempo} · ${situacao}`;

  if (alerta.data !== null) {
    meta.dateTime = alerta.data.toISOString();
  }

  return cartao;
}

function desenharLista(estado) {
  // Ainda sem resposta do back: mantém "Carregando…", ou avisa da falha
  if (estado.alertas === null) {
    ui.vazio.hidden = false;
    ui.vazio.textContent =
      estado.conexao === "offline"
        ? "Não foi possível carregar os alertas."
        : "Carregando alertas…";
    return;
  }

  const filtro = FILTROS[filtroSelecionado()];

  const alertas =
    filtro.status === null
      ? estado.alertas.lista
      : estado.alertas.lista.filter((alerta) => alerta.status === filtro.status);

  ui.lista.replaceChildren(...alertas.map(montarItem));

  ui.vazio.hidden = alertas.length > 0;
  ui.vazio.textContent = filtro.vazio;
}


/* ---------------------------------------------------------------------
   6) CICLO DE DESENHO
   --------------------------------------------------------------------- */

// Chamada pelo monitor a cada ciclo. Campos ainda "null" (primeiro ciclo,
// ou rota que falhou) são pulados: o HTML inicial continua valendo.
function desenhar(estado) {
  ultimoEstado = estado;

  if (estado.alertas !== null) {
    desenharResumo(estado.alertas.resumo);
  }

  desenharLista(estado);
}


/* ---------------------------------------------------------------------
   7) INTERAÇÕES
   --------------------------------------------------------------------- */

function ligarControles() {
  // Trocar o filtro redesenha só a lista (os dados já estão no estado)
  for (const opcao of ui.filtros) {
    opcao.addEventListener("change", () => {
      if (ultimoEstado !== null) {
        desenharLista(ultimoEstado);
      }
    });
  }
}


/* ---------------------------------------------------------------------
   8) INICIALIZAÇÃO
   --------------------------------------------------------------------- */

// Sem login, o montarLayout já mandou para a tela de entrada: a página para aqui
if (montarLayout() !== null) {
  ligarControles();
  assinar(desenhar);
  iniciar();
}