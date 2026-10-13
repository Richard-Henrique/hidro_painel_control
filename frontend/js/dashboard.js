/* =====================================================================
   dashboard.js — Tela do dashboard

   Desenha o dashboard a partir do estado que o monitor.js mantém:
   - banner de atenção (alerta ativo mais grave);
   - 4 indicadores: reservatório, vazão, potência total e temperatura máxima;
   - gráfico de histórico (nível e vazão) com seletor 1 h / 6 h / 24 h;
   - lista de alertas recentes;
   - cards das turbinas.

   Como acha os elementos: pelo atributo data-dash no dashboard.html.
   A moldura (sidebar e topbar) é do layout.js (atributos data-layout).

   - Não faz requisição (isso é do api.js) e não decide quando atualizar
     (isso é do monitor.js): só desenha o estado recebido.
   - Todo texto vindo do back entra com textContent, nunca com innerHTML.

   Local: frontend/js/dashboard.js
   ===================================================================== */

import { montarLayout } from "./layout.js";
import { assinar, iniciar, atualizarAgora } from "./monitor.js";
import { obterHistorico, JANELAS_MS } from "./historico.js";
import {
  formatarPercentual,
  formatarPotencia,
  formatarTemperatura,
  formatarVazao,
  calcularTendencia,
  formatarHora,
  tempoRelativo,
  varianteDoStatus,
  estadoVisualTurbina,
  estadoVisualNivel,
} from "./formatadores.js";


/* ---------------------------------------------------------------------
   1) ELEMENTOS DA TELA (atributos data-dash definidos no HTML)
   --------------------------------------------------------------------- */

function buscar(nome, raiz = document) {
  return raiz.querySelector(`[data-dash="${nome}"]`);
}

const ui = {
  // Banner de atenção
  banner: buscar("banner"),
  bannerCaixa: buscar("banner-caixa"),
  bannerIcone: buscar("banner-icone"),
  bannerTitulo: buscar("banner-titulo"),
  bannerMensagem: buscar("banner-mensagem"),
  bannerTempo: buscar("banner-tempo"),
  bannerAtualizar: buscar("banner-atualizar"),

  // Indicadores
  reservatorioValor: buscar("reservatorio-valor"),
  reservatorioProgresso: buscar("reservatorio-progresso"),
  reservatorioBarra: buscar("reservatorio-barra"),
  reservatorioStatus: buscar("reservatorio-status"),

  vazaoValor: buscar("vazao-valor"),
  vazaoTendencia: buscar("vazao-tendencia"),
  vazaoTendenciaIcone: buscar("vazao-tendencia-icone"),
  vazaoTendenciaTexto: buscar("vazao-tendencia-texto"),

  potenciaValor: buscar("potencia-valor"),
  potenciaProgresso: buscar("potencia-progresso"),
  potenciaBarra: buscar("potencia-barra"),
  potenciaDetalhe: buscar("potencia-detalhe"),
  potenciaNominal: buscar("potencia-nominal"),

  temperaturaValor: buscar("temperatura-valor"),
  temperaturaStatus: buscar("temperatura-status"),
  temperaturaTurbina: buscar("temperatura-turbina"),

  // Gráfico
  graficoTitulo: buscar("grafico-titulo"),
  graficoDescricao: buscar("grafico-descricao"),
  graficoNivel: buscar("grafico-nivel"),
  graficoVazao: buscar("grafico-vazao"),
  graficoVazio: buscar("grafico-vazio"),
  graficoEixoX: buscar("grafico-eixo-x"),
  janelas: document.querySelectorAll('[data-dash="janela"]'),

  // Alertas recentes
  alertasContagem: buscar("alertas-contagem"),
  alertasLista: buscar("alertas-lista"),
  alertasVazio: buscar("alertas-vazio"),

  // Turbinas
  turbinasResumo: buscar("turbinas-resumo"),
  turbinasPonto: buscar("turbinas-ponto"),
  turbinasGrade: buscar("turbinas-grade"),
  turbinasVazio: buscar("turbinas-vazio"),
};

// Modelos (<template>) do HTML
const modeloTurbina = document.getElementById("tpl-turbina");
const modeloAlerta = document.getElementById("tpl-alerta-recente");


/* ---------------------------------------------------------------------
   2) FUNÇÕES AUXILIARES
   --------------------------------------------------------------------- */

// Cores possíveis dos selos, bolinhas e barras (sufixo --<variante> nas classes)
const VARIANTES = ["success", "warning", "danger", "neutral"];

// Troca a variante de cor de um elemento: tira todas as classes
// "<prefixo>--<variante>" e põe a da variante pedida.
function trocarVariante(elemento, prefixo, variante) {
  elemento.classList.remove(...VARIANTES.map((v) => `${prefixo}--${v}`));
  elemento.classList.add(`${prefixo}--${variante}`);
}

// Mantém o número dentro de um intervalo
function limitar(valor, minimo, maximo) {
  return Math.min(Math.max(valor, minimo), maximo);
}

// Preenche uma barra de progresso (largura + valor lido por leitores de tela)
function desenharBarra(progresso, barra, percentual) {
  const valor = limitar(percentual, 0, 100);

  barra.style.width = `${valor}%`;
  progresso.setAttribute("aria-valuenow", String(Math.round(valor * 10) / 10));
}

// "agora" -> "Agora"; "há 5 segundos" -> "Há 5 segundos"
function capitalizar(texto) {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

// "1 ativo" / "2 ativos"
function contarAtivos(quantidade) {
  return `${quantidade} ${quantidade === 1 ? "ativo" : "ativos"}`;
}


/* ---------------------------------------------------------------------
   3) BANNER DE ATENÇÃO
   --------------------------------------------------------------------- */

// Variantes do banner por severidade do alerta
const BANNER = {
  "Crítico": { caixa: "danger", icone: "bi-x-octagon" },
  "Atenção": { caixa: "warning", icone: "bi-exclamation-triangle" },
};

// Entre os alertas ativos, o Crítico tem prioridade; entre iguais, o mais
// recente (a lista do monitor já vem do mais recente ao mais antigo).
function escolherAlertaDoBanner(ativos) {
  return ativos.find((alerta) => alerta.status === "Crítico") ?? ativos[0];
}

function desenharBanner(alertas) {
  const ativos = alertas.ativos;

  ui.banner.hidden = ativos.length === 0;

  if (ativos.length === 0) {
    return;
  }

  const alerta = escolherAlertaDoBanner(ativos);
  const variante = BANNER[alerta.status] ?? BANNER["Atenção"];

  // Caixa: troca as duas famílias de classe (do projeto e do Bootstrap)
  ui.bannerCaixa.classList.remove(
    "status-banner--warning",
    "status-banner--danger",
    "alert-warning",
    "alert-danger"
  );
  ui.bannerCaixa.classList.add(
    `status-banner--${variante.caixa}`,
    `alert-${variante.caixa}`
  );

  // Ícone
  ui.bannerIcone.classList.remove("bi-exclamation-triangle", "bi-x-octagon");
  ui.bannerIcone.classList.add(variante.icone);

  // Textos
  const outros = ativos.length - 1;
  const complemento =
    outros > 0 ? ` (+${outros} ${outros === 1 ? "alerta ativo" : "alertas ativos"})` : "";

  ui.bannerTitulo.textContent = alerta.status;
  ui.bannerMensagem.textContent = alerta.mensagem + complemento;
  ui.bannerTempo.textContent = tempoRelativo(alerta.data, { curto: true });

  if (alerta.data !== null) {
    ui.bannerTempo.dateTime = alerta.data.toISOString();
  }
}


/* ---------------------------------------------------------------------
   4) INDICADORES
   --------------------------------------------------------------------- */

// Reservatório: nível (%) e situação da RN01
function desenharReservatorio(usina) {
  const nivel = estadoVisualNivel(usina.statusNivel);

  ui.reservatorioValor.textContent = formatarPercentual(usina.nivelAgua);
  desenharBarra(ui.reservatorioProgresso, ui.reservatorioBarra, usina.nivelAgua);

  ui.reservatorioStatus.textContent = nivel.rotulo;
  trocarVariante(ui.reservatorioStatus, "status-badge", nivel.variante);
}

// Seta e cor da tendência da vazão
const TENDENCIAS = {
  up: "bi-arrow-up-right",
  down: "bi-arrow-down-right",
  stable: "bi-dash",
};

// Vazão: valor atual e variação em relação à leitura anterior
function desenharVazao(usina, vazaoAnterior) {
  ui.vazaoValor.textContent = formatarVazao(usina.vazao);

  const tendencia = calcularTendencia(usina.vazao, vazaoAnterior);

  // Sem leitura anterior (primeiro ciclo) não há o que comparar
  ui.vazaoTendencia.hidden = tendencia === null;

  if (tendencia === null) {
    return;
  }

  ui.vazaoTendencia.classList.remove(
    ...Object.keys(TENDENCIAS).map((d) => `kpi-card__trend--${d}`)
  );
  ui.vazaoTendencia.classList.add(`kpi-card__trend--${tendencia.direcao}`);

  ui.vazaoTendenciaIcone.classList.remove(...Object.values(TENDENCIAS));
  ui.vazaoTendenciaIcone.classList.add(TENDENCIAS[tendencia.direcao]);

  ui.vazaoTendenciaTexto.textContent = tendencia.texto;
}

// Potência total: soma das turbinas ligadas em relação à nominal de todas
function desenharPotencia(resumo) {
  ui.potenciaValor.textContent = formatarPotencia(resumo.potenciaGerada);
  desenharBarra(ui.potenciaProgresso, ui.potenciaBarra, resumo.percentualDaNominal);

  ui.potenciaDetalhe.textContent =
    `${formatarPercentual(resumo.percentualDaNominal)} de ${formatarPotencia(resumo.potenciaNominal)}`;
  ui.potenciaNominal.textContent = `Nominal: ${formatarPotencia(resumo.potenciaNominal)}`;
}

// Temperatura máxima: a turbina mais quente e a situação dela (RN02)
function desenharTemperatura(resumo) {
  const turbina = resumo.turbinaMaisQuente;

  if (turbina === null) {
    ui.temperaturaValor.textContent = "—";
    ui.temperaturaStatus.textContent = "—";
    trocarVariante(ui.temperaturaStatus, "status-badge", "neutral");
    ui.temperaturaTurbina.textContent = "";
    return;
  }

  ui.temperaturaValor.textContent = formatarTemperatura(turbina.temperatura);

  ui.temperaturaStatus.textContent = turbina.statusTemperatura;
  trocarVariante(ui.temperaturaStatus, "status-badge", varianteDoStatus(turbina.statusTemperatura));

  ui.temperaturaTurbina.textContent = turbina.nome;
}


/* ---------------------------------------------------------------------
   5) GRÁFICO DE HISTÓRICO
   ---------------------------------------------------------------------
   Escala do desenho (a mesma descrita no dashboard.html):
     eixo X: 43 (leitura mais antiga da janela) até 721 (a mais recente)
     eixo Y: nível 0% em y=250; os limites de 90% e 30% caem em y=58 e y=186
   --------------------------------------------------------------------- */

const X_INICIO = 43;
const X_FIM = 721;
const Y_ZERO = 250;
const Y_POR_PERCENTUAL = (186 - 58) / (90 - 30); // 2,1333 px por 1%

// A janela de 24 h pode ter ~5,8 mil pontos para ~680 px de largura:
// acima disto o desenho usa só uma amostra (sempre com o primeiro e o último)
const MAX_PONTOS_DESENHADOS = 340;

// Quantos rótulos de hora no eixo X
const QUANTIDADE_ROTULOS = 6;

// A vazão (m³/s) não tem a unidade do nível (%): é normalizada para caber na
// mesma escala. O maior valor da janela vira 80% do eixo, deixando folga sem
// encostar na linha de 90%. A linha mostra a FORMA da vazão; os valores reais
// estão no card de vazão e na descrição do gráfico.
const TOPO_DA_VAZAO = 80;

const NS_SVG = "http://www.w3.org/2000/svg";

function janelaSelecionada() {
  const marcada = [...ui.janelas].find((opcao) => opcao.checked);

  return marcada !== undefined && marcada.value in JANELAS_MS ? marcada.value : "24h";
}

function tituloDoGrafico(janela) {
  const horas = janela.replace("h", "");

  return janela === "1h"
    ? `Histórico · última ${horas} h`
    : `Histórico · últimas ${horas} h`;
}

// Escolhe no máximo "limite" pontos, espalhados por toda a lista
function reduzirPontos(pontos, limite) {
  if (pontos.length <= limite) {
    return pontos;
  }

  const passo = (pontos.length - 1) / (limite - 1);

  return Array.from({ length: limite }, (_, i) => pontos[Math.round(i * passo)]);
}

// Posição horizontal proporcional ao instante da leitura
function posicaoX(t, inicio, fim) {
  return X_INICIO + ((t - inicio) / (fim - inicio)) * (X_FIM - X_INICIO);
}

// Posição vertical de um percentual (0 a 100)
function posicaoY(percentual) {
  return Y_ZERO - percentual * Y_POR_PERCENTUAL;
}

// Rótulos de hora do eixo X (criados dentro do grupo <g>)
function desenharEixoX(inicio, fim) {
  ui.graficoEixoX.replaceChildren();

  if (fim === undefined) {
    return;
  }

  for (let i = 0; i < QUANTIDADE_ROTULOS; i++) {
    const fracao = i / (QUANTIDADE_ROTULOS - 1);
    const instante = inicio + fracao * (fim - inicio);

    const rotulo = document.createElementNS(NS_SVG, "text");
    rotulo.setAttribute("class", "chart__label");
    rotulo.setAttribute("x", String(X_INICIO + fracao * (X_FIM - X_INICIO)));
    rotulo.setAttribute("y", "280");
    rotulo.setAttribute("text-anchor", "middle");
    rotulo.textContent = formatarHora(new Date(instante));

    ui.graficoEixoX.append(rotulo);
  }
}

// Resumo em texto para leitores de tela
function descreverGrafico(pontos) {
  const niveis = pontos.map((p) => p.nivel);
  const vazoes = pontos.map((p) => p.vazao);
  const ultimo = pontos[pontos.length - 1];

  const de = formatarHora(new Date(pontos[0].t));
  const ate = formatarHora(new Date(ultimo.t));

  return (
    `Das ${de} às ${ate}. ` +
    `Nível do reservatório entre ${formatarPercentual(Math.min(...niveis))} e ` +
    `${formatarPercentual(Math.max(...niveis))} (atual ${formatarPercentual(ultimo.nivel)}). ` +
    `Vazão entre ${formatarVazao(Math.min(...vazoes))} e ` +
    `${formatarVazao(Math.max(...vazoes))} (atual ${formatarVazao(ultimo.vazao)}).`
  );
}

function desenharGrafico() {
  const janela = janelaSelecionada();
  ui.graficoTitulo.textContent = tituloDoGrafico(janela);

  const pontos = obterHistorico(JANELAS_MS[janela]);
  const temDados = pontos.length >= 2;

  ui.graficoVazio.hidden = temDados;

  if (!temDados) {
    ui.graficoNivel.setAttribute("points", "");
    ui.graficoVazao.setAttribute("points", "");
    ui.graficoDescricao.textContent = "Ainda não há leituras suficientes para desenhar o gráfico.";
    desenharEixoX(0, undefined);
    return;
  }

  const inicio = pontos[0].t;
  const fim = pontos[pontos.length - 1].t;
  const amostra = reduzirPontos(pontos, MAX_PONTOS_DESENHADOS);

  const maiorVazao = Math.max(...pontos.map((p) => p.vazao));
  const escalaVazao = maiorVazao > 0 ? maiorVazao / TOPO_DA_VAZAO : 1;

  const linhaNivel = amostra
    .map((p) => `${posicaoX(p.t, inicio, fim).toFixed(1)},${posicaoY(limitar(p.nivel, 0, 100)).toFixed(1)}`)
    .join(" ");

  const linhaVazao = amostra
    .map((p) => `${posicaoX(p.t, inicio, fim).toFixed(1)},${posicaoY(p.vazao / escalaVazao).toFixed(1)}`)
    .join(" ");

  ui.graficoNivel.setAttribute("points", linhaNivel);
  ui.graficoVazao.setAttribute("points", linhaVazao);
  ui.graficoDescricao.textContent = descreverGrafico(pontos);
  desenharEixoX(inicio, fim);
}


/* ---------------------------------------------------------------------
   6) ALERTAS RECENTES
   --------------------------------------------------------------------- */

// Quantos alertas aparecem no card (o histórico completo fica na tela de alertas)
const ALERTAS_RECENTES = 3;

function desenharAlertas(estado) {
  // Ainda sem resposta do back: o HTML inicial ("Carregando alertas…") continua valendo,
  // a não ser que a conexão tenha falhado
  if (estado.alertas === null) {
    ui.alertasVazio.hidden = false;
    ui.alertasVazio.textContent =
      estado.conexao === "offline"
        ? "Não foi possível carregar os alertas."
        : "Carregando alertas…";
    return;
  }

  const { resumo, lista } = estado.alertas;

  ui.alertasContagem.textContent = contarAtivos(resumo.ativos);

  const itens = lista.slice(0, ALERTAS_RECENTES).map((alerta) => {
    const item = modeloAlerta.content.cloneNode(true);

    trocarVariante(buscar("alerta-ponto", item), "alerts-card__dot", varianteDoStatus(alerta.status));
    buscar("alerta-titulo", item).textContent = alerta.mensagem;

    const tempo = capitalizar(tempoRelativo(alerta.data));
    buscar("alerta-meta", item).textContent = tempo === "" ? alerta.status : `${tempo} · ${alerta.status}`;

    return item;
  });

  ui.alertasLista.replaceChildren(...itens);

  ui.alertasVazio.hidden = itens.length > 0;
  ui.alertasVazio.textContent = "Nenhum alerta registrado.";
}


/* ---------------------------------------------------------------------
   7) TURBINAS
   --------------------------------------------------------------------- */

// Variante de cor -> classe do card da turbina
const CLASSE_DO_CARD = {
  success: "turbine-card--running",
  warning: "turbine-card--warning",
  danger: "turbine-card--critical",
  neutral: "turbine-card--offline",
};

// Monta o card de uma turbina a partir do <template>
function montarCardTurbina(turbina) {
  const cartao = modeloTurbina.content.cloneNode(true);

  // Cor do card, da bolinha e da barra: situação da temperatura (ou "Desligada")
  const visual = estadoVisualTurbina(turbina);

  const card = buscar("turbina-card", cartao);
  card.classList.remove(...Object.values(CLASSE_DO_CARD));
  card.classList.add(CLASSE_DO_CARD[visual.variante]);

  buscar("turbina-nome", cartao).textContent = turbina.nome;

  // Desligada não gera nada, mesmo que o back ainda guarde o último valor
  const potencia = turbina.ligada ? turbina.energiaGerada : 0;
  buscar("turbina-meta", cartao).textContent = `${turbina.modelo} · ${formatarPotencia(potencia)}`;

  const ponto = buscar("turbina-ponto", cartao);
  trocarVariante(ponto, "status-dot", visual.variante);
  ponto.setAttribute("aria-label", visual.rotulo);

  // A barra mostra a temperatura (0 a 100 °C)
  const progresso = buscar("turbina-progresso", cartao);
  const barra = buscar("turbina-barra", cartao);
  progresso.setAttribute("aria-label", `Temperatura de ${turbina.nome}`);
  trocarVariante(barra, "turbine-card__progress-bar", visual.variante);
  desenharBarra(progresso, barra, turbina.temperatura);

  // Selo: estado operacional (Operando / Desligada)
  const selo = buscar("turbina-selo", cartao);
  selo.textContent = turbina.status;
  trocarVariante(selo, "status-badge", varianteDoStatus(turbina.status));

  // Temperatura: destaque em atenção e crítico
  const temperatura = buscar("turbina-temperatura", cartao);
  temperatura.textContent = formatarTemperatura(turbina.temperatura);

  if (turbina.statusTemperatura === "Atenção") {
    temperatura.classList.add("turbine-card__temp--warning");
  } else if (turbina.statusTemperatura === "Crítico") {
    temperatura.classList.add("turbine-card__temp--danger");
  }

  return cartao;
}

function desenharTurbinas(estado) {
  // Ainda sem resposta do back: mantém o texto inicial, ou avisa da falha
  if (estado.turbinas === null) {
    ui.turbinasVazio.hidden = false;
    ui.turbinasVazio.textContent =
      estado.conexao === "offline"
        ? "Não foi possível carregar as turbinas."
        : "Carregando turbinas…";
    return;
  }

  const resumo = estado.resumoTurbinas;

  ui.turbinasResumo.textContent = `Turbinas · ${resumo.operando} de ${resumo.total} operando`;
  trocarVariante(ui.turbinasPonto, "status-dot", resumo.operando > 0 ? "success" : "neutral");

  ui.turbinasGrade.replaceChildren(...estado.turbinas.map(montarCardTurbina));

  ui.turbinasVazio.hidden = estado.turbinas.length > 0;
  ui.turbinasVazio.textContent = "Nenhuma turbina cadastrada.";
}


/* ---------------------------------------------------------------------
   8) CICLO DE DESENHO
   --------------------------------------------------------------------- */

// Chamada pelo monitor a cada ciclo. Campos ainda "null" (primeiro ciclo,
// ou rota que falhou) são pulados: o HTML inicial continua valendo.
function desenhar(estado) {
  if (estado.usina !== null) {
    desenharReservatorio(estado.usina);
    desenharVazao(estado.usina, estado.vazaoAnterior);
  }

  if (estado.resumoTurbinas !== null) {
    desenharPotencia(estado.resumoTurbinas);
    desenharTemperatura(estado.resumoTurbinas);
  }

  if (estado.alertas !== null) {
    desenharBanner(estado.alertas);
  }

  desenharAlertas(estado);
  desenharTurbinas(estado);
  desenharGrafico();
}


/* ---------------------------------------------------------------------
   9) INTERAÇÕES
   --------------------------------------------------------------------- */

// Botão "Atualizar" do banner: pede um ciclo novo e espera ele terminar
async function aoClicarEmAtualizar() {
  ui.bannerAtualizar.disabled = true;

  try {
    await atualizarAgora();
  } finally {
    ui.bannerAtualizar.disabled = false;
  }
}

function ligarControles() {
  ui.bannerAtualizar.addEventListener("click", aoClicarEmAtualizar);

  // Trocar a janela redesenha só o gráfico (os dados já estão no histórico)
  for (const opcao of ui.janelas) {
    opcao.addEventListener("change", desenharGrafico);
  }
}


/* ---------------------------------------------------------------------
   10) INICIALIZAÇÃO
   --------------------------------------------------------------------- */

// Sem login, o montarLayout já mandou para a tela de entrada: a página para aqui
if (montarLayout() !== null) {
  ligarControles();

  // O histórico guardado em outras telas já pode ter pontos: mostra antes do 1º ciclo
  desenharGrafico();

  assinar(desenhar);
  iniciar();
}