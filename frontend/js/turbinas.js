/* =====================================================================
   turbinas.js — Tela de turbinas

   Desenha a tela a partir do estado que o monitor.js mantém e cuida das
   duas ações do operador:
   - indicadores (turbinas operando, potência gerada e nominal, temperatura máxima);
   - cards das turbinas, cada um com o botão Ligar / Desligar
     (PATCH /api/turbinas/{id}/estado);
   - modal "Nova turbina" (POST /api/turbinas).

   Como acha os elementos: pelo atributo data-turbinas no turbinas.html.
   A moldura (sidebar e topbar) é do layout.js (atributos data-layout).

   - Não chama fetch (isso é do api.js) e não decide quando atualizar
     (isso é do monitor.js). Depois de cada ação pede um ciclo novo com
     atualizarAgora(), para o resultado aparecer na hora.
   - Todo texto vindo do back entra com textContent, nunca com innerHTML.
   - O modal abre e fecha pelo Bootstrap (data-bs-*); o JS só usa a API
     dele para fechar após o cadastro.

   Local: frontend/js/turbinas.js
   ===================================================================== */

import { montarLayout } from "./layout.js";
import { assinar, iniciar, atualizarAgora, encerrarSessao } from "./monitor.js";
import { cadastrarTurbina, alterarEstadoTurbina, ApiError } from "./api.js";
import {
  formatarPotencia,
  formatarTemperatura,
  varianteDoStatus,
  estadoVisualTurbina,
} from "./formatadores.js";


/* ---------------------------------------------------------------------
   1) ELEMENTOS DA TELA (atributos data-turbinas definidos no HTML)
   --------------------------------------------------------------------- */

function buscar(nome, raiz = document) {
  return raiz.querySelector(`[data-turbinas="${nome}"]`);
}

const ui = {
  // Aviso de erro das ações (ligar/desligar)
  aviso: buscar("aviso"),
  avisoMensagem: buscar("aviso-mensagem"),
  avisoFechar: buscar("aviso-fechar"),

  // Indicadores
  kpiOperando: buscar("kpi-operando"),
  kpiPotencia: buscar("kpi-potencia"),
  kpiNominal: buscar("kpi-nominal"),
  kpiTemperatura: buscar("kpi-temperatura"),
  kpiTemperaturaStatus: buscar("kpi-temperatura-status"),

  // Cards
  grade: buscar("grade"),
  vazio: buscar("vazio"),

  // Modal "Nova turbina"
  modal: buscar("modal"),
  form: buscar("form"),
  campoNome: buscar("campo-nome"),
  campoPotencia: buscar("campo-potencia"),
  modalErro: buscar("modal-erro"),
  modalEnviar: buscar("modal-enviar"),
  modalEnviarTexto: buscar("modal-enviar-texto"),
};

// Modelo (<template>) do card
const modeloTurbina = document.getElementById("tpl-turbina-gerenciar");

// Opções do formulário (radios): lidas na hora do envio
const radiosModelo = document.querySelectorAll('[data-turbinas="campo-modelo"]');
const radiosEstado = document.querySelectorAll('[data-turbinas="campo-estado"]');


/* ---------------------------------------------------------------------
   2) FUNÇÕES AUXILIARES
   --------------------------------------------------------------------- */

const VARIANTES = ["success", "warning", "danger", "neutral"];

// Troca a variante de cor de um elemento (classes "<prefixo>--<variante>")
function trocarVariante(elemento, prefixo, variante) {
  elemento.classList.remove(...VARIANTES.map((v) => `${prefixo}--${v}`));
  elemento.classList.add(`${prefixo}--${variante}`);
}

function limitar(valor, minimo, maximo) {
  return Math.min(Math.max(valor, minimo), maximo);
}

// Texto do radio marcado de um grupo
function valorMarcado(radios) {
  return [...radios].find((radio) => radio.checked)?.value;
}

// Sessão expirada no meio de uma ação: mesmo tratamento do monitor (volta ao login).
// Devolve true se tratou, para quem chamou parar por aí.
function tratarSessaoExpirada(erro) {
  if (erro instanceof ApiError && erro.status === 401) {
    encerrarSessao();
    return true;
  }

  return false;
}

// Texto para mostrar ao usuário a partir de qualquer erro
function mensagemDoErro(erro) {
  if (erro instanceof ApiError) {
    return erro.message;
  }

  console.error(erro);
  return "Erro inesperado. Tente novamente.";
}


/* ---------------------------------------------------------------------
   3) AVISO DE ERRO DAS AÇÕES
   --------------------------------------------------------------------- */

function mostrarAviso(texto) {
  ui.avisoMensagem.textContent = texto;
  ui.aviso.hidden = false;
}

function esconderAviso() {
  ui.avisoMensagem.textContent = "";
  ui.aviso.hidden = true;
}


/* ---------------------------------------------------------------------
   4) INDICADORES
   --------------------------------------------------------------------- */

function desenharIndicadores(resumo) {
  ui.kpiOperando.textContent = `${resumo.operando} de ${resumo.total}`;
  ui.kpiPotencia.textContent = formatarPotencia(resumo.potenciaGerada);
  ui.kpiNominal.textContent = formatarPotencia(resumo.potenciaNominal);

  const maisQuente = resumo.turbinaMaisQuente;

  if (maisQuente === null) {
    ui.kpiTemperatura.textContent = "—";
    ui.kpiTemperaturaStatus.textContent = "—";
    trocarVariante(ui.kpiTemperaturaStatus, "status-badge", "neutral");
    return;
  }

  ui.kpiTemperatura.textContent = formatarTemperatura(maisQuente.temperatura);
  ui.kpiTemperaturaStatus.textContent = maisQuente.statusTemperatura;
  trocarVariante(
    ui.kpiTemperaturaStatus,
    "status-badge",
    varianteDoStatus(maisQuente.statusTemperatura)
  );
}


/* ---------------------------------------------------------------------
   5) CARDS DAS TURBINAS
   --------------------------------------------------------------------- */

// Variante de cor -> classe do card (as mesmas do dashboard)
const CLASSE_DO_CARD = {
  success: "turbine-card--running",
  warning: "turbine-card--warning",
  danger: "turbine-card--critical",
  neutral: "turbine-card--offline",
};

// Monta o card de uma turbina a partir do <template>
function montarCard(turbina) {
  const cartao = modeloTurbina.content.cloneNode(true);

  // Cor do card, da barra e do selo: situação da temperatura (ou "Desligada")
  const visual = estadoVisualTurbina(turbina);

  const card = buscar("turbina-card", cartao);
  card.classList.remove(...Object.values(CLASSE_DO_CARD));
  card.classList.add(CLASSE_DO_CARD[visual.variante]);

  // Guardados no card para o clique do botão (ver aoClicarNaGrade)
  card.dataset.id = String(turbina.id);
  card.dataset.ligada = String(turbina.ligada);

  buscar("turbina-nome", cartao).textContent = turbina.nome;
  buscar("turbina-meta", cartao).textContent =
    `${turbina.modelo} · nominal ${formatarPotencia(turbina.energiaNominal)}`;

  const selo = buscar("turbina-selo", cartao);
  selo.textContent = visual.rotulo;
  trocarVariante(selo, "status-badge", visual.variante);

  // Desligada não gera nada, mesmo que o back ainda guarde o último valor
  const potencia = turbina.ligada ? turbina.energiaGerada : 0;
  const percentual =
    turbina.energiaNominal > 0 ? limitar((potencia / turbina.energiaNominal) * 100, 0, 100) : 0;

  // A barra mostra a potência gerada em relação à nominal
  const progresso = buscar("turbina-progresso", cartao);
  const barra = buscar("turbina-barra", cartao);
  progresso.setAttribute("aria-label", `Potência de ${turbina.nome} em relação à nominal`);
  progresso.setAttribute("aria-valuenow", String(Math.round(percentual)));
  barra.style.width = `${percentual}%`;
  trocarVariante(barra, "turbine-card__progress-bar", visual.variante);

  buscar("turbina-estado", cartao).textContent = turbina.status;
  buscar("turbina-potencia", cartao).textContent = formatarPotencia(potencia);

  const temperatura = buscar("turbina-temperatura", cartao);
  temperatura.textContent = formatarTemperatura(turbina.temperatura);

  if (turbina.statusTemperatura === "Atenção") {
    temperatura.classList.add("turbine-card__temp--warning");
  } else if (turbina.statusTemperatura === "Crítico") {
    temperatura.classList.add("turbine-card__temp--danger");
  }

  buscar("turbina-alternar-texto", cartao).textContent = turbina.ligada ? "Desligar" : "Ligar";

  return cartao;
}

function desenharCards(estado) {
  // Ainda sem resposta do back: mantém "Carregando…", ou avisa da falha
  if (estado.turbinas === null) {
    ui.vazio.hidden = false;
    ui.vazio.textContent =
      estado.conexao === "offline"
        ? "Não foi possível carregar as turbinas."
        : "Carregando turbinas…";
    return;
  }

  ui.grade.replaceChildren(...estado.turbinas.map(montarCard));

  ui.vazio.hidden = estado.turbinas.length > 0;
  ui.vazio.textContent = "Nenhuma turbina cadastrada. Use “Nova turbina” para começar.";
}


/* ---------------------------------------------------------------------
   6) LIGAR / DESLIGAR
   --------------------------------------------------------------------- */

// Ids das turbinas com uma troca de estado em andamento. Como os cards são
// redesenhados a cada ciclo (o botão do clique pode já ter sido substituído),
// é este conjunto, e não o botão, que impede dois cliques seguidos.
const emAndamento = new Set();

async function alternarEstado(botao) {
  const card = botao.closest('[data-turbinas="turbina-card"]');
  const id = Number(card.dataset.id);
  const ligar = card.dataset.ligada !== "true";

  if (emAndamento.has(id)) {
    return;
  }

  emAndamento.add(id);
  esconderAviso();

  botao.disabled = true;
  buscar("turbina-alternar-texto", botao).textContent = ligar ? "Ligando…" : "Desligando…";

  try {
    await alterarEstadoTurbina(id, ligar);
    await atualizarAgora();
  } catch (erro) {
    if (tratarSessaoExpirada(erro)) {
      return;
    }

    // Ex.: 409 "A turbina está em temperatura crítica e não pode ser ligada."
    mostrarAviso(mensagemDoErro(erro));

    // Turbina que não existe mais (404): atualiza a tela para ela sair da lista
    if (erro instanceof ApiError && erro.status === 404) {
      await atualizarAgora();
    }
  } finally {
    emAndamento.delete(id);
    botao.disabled = false;
  }
}

// Um único ouvinte na grade (os cards são recriados a cada ciclo)
function aoClicarNaGrade(evento) {
  const botao = evento.target.closest('[data-turbinas="turbina-alternar"]');

  if (botao !== null && ui.grade.contains(botao)) {
    alternarEstado(botao);
  }
}


/* ---------------------------------------------------------------------
   7) MODAL "NOVA TURBINA"
   --------------------------------------------------------------------- */

let enviando = false;

// true quando é o próprio JS que está fechando o modal (cadastro concluído).
// Sem isto, o ouvinte de "hide.bs.modal" (que bloqueia o fechamento enquanto
// "enviando" é true) cancelaria o hide() chamado aqui.
let fechando = false;

function mostrarErroDoModal(texto) {
  ui.modalErro.textContent = texto;
  ui.modalErro.hidden = false;
}

function limparErroDoModal() {
  ui.modalErro.textContent = "";
  ui.modalErro.hidden = true;
}

// Trava o botão durante a requisição (evita clique duplo) e troca o texto
function definirEnviando(valor) {
  enviando = valor;
  ui.modalEnviar.disabled = valor;
  ui.modalEnviarTexto.textContent = valor ? "Cadastrando..." : "Cadastrar turbina";
}

function fecharModal() {
  fechando = true;
  window.bootstrap?.Modal.getOrCreateInstance(ui.modal).hide();
}

// Confere os campos antes de chamar o back. Devolve { dados } se estiver tudo certo
// ou { erro, campo } com a mensagem e o campo a focar. O back confere de novo.
function lerFormulario() {
  const nome = ui.campoNome.value.trim();
  const modelo = valorMarcado(radiosModelo);
  const potencia = Number(ui.campoPotencia.value);

  if (nome === "") {
    return { erro: "O nome da turbina não pode ser vazio.", campo: ui.campoNome };
  }

  if (ui.campoPotencia.value.trim() === "" || !Number.isInteger(potencia) || potencia <= 0) {
    return {
      erro: "A potência nominal deve ser um número inteiro maior que zero.",
      campo: ui.campoPotencia,
    };
  }

  return { dados: { nome, modelo, energiaNominal: potencia } };
}

async function aoEnviarFormulario(evento) {
  // Sem isto o navegador recarregaria a página
  evento.preventDefault();

  if (enviando) {
    return;
  }

  limparErroDoModal();

  const leitura = lerFormulario();

  if (leitura.erro !== undefined) {
    mostrarErroDoModal(leitura.erro);
    leitura.campo.focus();
    return;
  }

  const ligarDepois = valorMarcado(radiosEstado) === "operando";

  definirEnviando(true);

  try {
    const turbina = await cadastrarTurbina(leitura.dados);

    // O back sempre cadastra a turbina desligada: "Operando" vira um segundo passo
    if (ligarDepois) {
      try {
        await alterarEstadoTurbina(turbina.id, true);
      } catch (erro) {
        if (tratarSessaoExpirada(erro)) {
          return;
        }

        // A turbina já existe: fecha o modal e avisa só da parte que falhou
        fecharModal();
        mostrarAviso(`Turbina cadastrada, mas não foi possível ligá-la: ${mensagemDoErro(erro)}`);
        await atualizarAgora();
        return;
      }
    }

    esconderAviso();
    fecharModal();
    await atualizarAgora();
  } catch (erro) {
    if (tratarSessaoExpirada(erro)) {
      return;
    }

    // Ex.: 400 com a mensagem pronta do back
    mostrarErroDoModal(mensagemDoErro(erro));
  } finally {
    // Se o modal está fechando, o botão continua travado até o fim da animação
    // (hidden.bs.modal destrava): evita um segundo cadastro por clique duplo.
    if (!fechando) {
      definirEnviando(false);
    }
  }
}


/* ---------------------------------------------------------------------
   8) CICLO DE DESENHO
   --------------------------------------------------------------------- */

// Chamada pelo monitor a cada ciclo. Campos ainda "null" (primeiro ciclo,
// ou rota que falhou) são pulados: o HTML inicial continua valendo.
function desenhar(estado) {
  if (estado.resumoTurbinas !== null) {
    desenharIndicadores(estado.resumoTurbinas);
  }

  desenharCards(estado);
}


/* ---------------------------------------------------------------------
   9) INTERAÇÕES
   --------------------------------------------------------------------- */

function ligarControles() {
  ui.avisoFechar.addEventListener("click", esconderAviso);
  ui.grade.addEventListener("click", aoClicarNaGrade);

  ui.form.addEventListener("submit", aoEnviarFormulario);

  // Mexer em qualquer campo apaga o erro anterior
  ui.form.addEventListener("input", limparErroDoModal);
  ui.form.addEventListener("change", limparErroDoModal);

  // Eventos do Modal do Bootstrap
  // Já com o modal visível, o cursor vai para o primeiro campo
  ui.modal.addEventListener("shown.bs.modal", () => ui.campoNome.focus());

  // Não deixa fechar (Esc, X, clique fora) enquanto o cadastro está em andamento
  ui.modal.addEventListener("hide.bs.modal", (evento) => {
    if (enviando && !fechando) {
      evento.preventDefault();
    }
  });

  // Ao terminar de fechar, volta ao padrão (Francis, Desligada, campos vazios)
  ui.modal.addEventListener("hidden.bs.modal", () => {
    fechando = false;
    definirEnviando(false);
    ui.form.reset();
    limparErroDoModal();
  });
}


/* ---------------------------------------------------------------------
   10) INICIALIZAÇÃO
   --------------------------------------------------------------------- */

// Sem login, o montarLayout já mandou para a tela de entrada: a página para aqui
if (montarLayout() !== null) {
  ligarControles();
  assinar(desenhar);
  iniciar();
}