/* =====================================================================
   formatadores.js — Transforma dados do back em texto/estilo para a tela

   Reúne o que as 3 telas (dashboard, turbinas e alertas) repetiriam:
   números em pt-BR, "há 5 segundos", cor de cada status...

   - Só funções puras: recebem um valor e devolvem outro. Não mexem no DOM,
     não fazem requisição e não guardam estado.
   - Aqui NÃO entram cálculos sobre as listas (total nominal, alerta ativo
     ou resolvido...): isso é lógica de negócio da tela/monitor.

   Local: frontend/js/formatadores.js
   ===================================================================== */


/* ---------------------------------------------------------------------
   1) NÚMEROS COM UNIDADE
   --------------------------------------------------------------------- */

// pt-BR usa vírgula nos decimais (72,4). Mostra no máximo 1 casa e some com
// o ",0" quando o número é inteiro (78 em vez de 78,0).
const formatoNumero = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
});

// 78 -> "78%"  |  55.34 -> "55,3%"
export function formatarPercentual(valor) {
  return `${formatoNumero.format(valor)}%`;
}

// 65 -> "65 MW"
export function formatarPotencia(mw) {
  return `${formatoNumero.format(mw)} MW`;
}

// 72.4 -> "72,4°C"
// Mantém 1 casa (e não arredonda para 72) porque o limite de atenção é 70 °C:
// 69,6 não pode aparecer como "70°C" se a turbina ainda está Normal.
export function formatarTemperatura(celsius) {
  return `${formatoNumero.format(celsius)}°C`;
}

// 420 -> "420 m³/s"
export function formatarVazao(metrosCubicosPorSegundo) {
  return `${formatoNumero.format(metrosCubicosPorSegundo)} m³/s`;
}

// Compara duas leituras e devolve a variação em percentual:
//   { texto: "2,1%", direcao: "up" | "down" | "stable" }
// A tela escolhe a seta/cor a partir da direção. Devolve null quando não há
// leitura anterior para comparar (primeiro ciclo) ou ela é zero.
export function calcularTendencia(atual, anterior) {
  if (typeof anterior !== "number" || anterior === 0) {
    return null;
  }

  const variacao = ((atual - anterior) / anterior) * 100;

  // Variação menor que 0,05% apareceria como "0%": trata como estável
  if (Math.abs(variacao) < 0.05) {
    return { texto: "0%", direcao: "stable" };
  }

  return {
    texto: formatarPercentual(Math.abs(variacao)),
    direcao: variacao > 0 ? "up" : "down",
  };
}


/* ---------------------------------------------------------------------
   2) DATAS E TEMPO RELATIVO
   --------------------------------------------------------------------- */

// O back manda a data do alerta como o MySQL grava: "2026-10-13 14:03:22"
// (sem fuso). Trocando o espaço por "T" todos os navegadores entendem, e a
// data é lida na hora local, a mesma em que o servidor (Laragon) gravou.
// Devolve um Date, ou null se o texto estiver ausente ou inválido.
export function lerDataDoBanco(texto) {
  if (typeof texto !== "string") {
    return null;
  }

  const data = new Date(texto.trim().replace(" ", "T"));

  return Number.isNaN(data.getTime()) ? null : data;
}

// Date -> "21:14"
export function formatarHora(data) {
  return data.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

// Escolhe singular ou plural: (1, "minuto", "minutos") -> "minuto"
function plural(quantidade, singular, pluralTexto) {
  return quantidade === 1 ? singular : pluralTexto;
}

// Quantos dias de calendário separam as duas datas (hoje - ontem = 1),
// ignorando a hora. Round absorve a mudança de horário de verão.
function diasDeCalendario(data, agora) {
  const inicioDe = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

  return Math.round((inicioDe(agora) - inicioDe(data)) / 86400000);
}

// "há 5 segundos", "há 42 minutos", "há 2 horas", "ontem, 21:14", "há 3 dias".
// Com { curto: true } abrevia o que é recente: "há 5 s", "há 42 min", "há 2 h"
// (usado no banner do dashboard). O texto vem em minúsculas; a tela que
// quiser "Há ..." no começo de uma frase capitaliza.
// "agora" existe só para testes ou para fixar a hora de referência.
export function tempoRelativo(data, { curto = false, agora = new Date() } = {}) {
  if (!(data instanceof Date) || Number.isNaN(data.getTime())) {
    return "";
  }

  const referencia = new Date(agora);

  // Relógio do navegador um pouco atrás do servidor daria diferença negativa
  const segundos = Math.max(0, Math.floor((referencia - data) / 1000));

  if (segundos < 1) {
    return "agora";
  }

  if (segundos < 60) {
    return curto
      ? `há ${segundos} s`
      : `há ${segundos} ${plural(segundos, "segundo", "segundos")}`;
  }

  const minutos = Math.floor(segundos / 60);

  if (minutos < 60) {
    return curto
      ? `há ${minutos} min`
      : `há ${minutos} ${plural(minutos, "minuto", "minutos")}`;
  }

  const horas = Math.floor(minutos / 60);

  if (horas < 24) {
    return curto
      ? `há ${horas} h`
      : `há ${horas} ${plural(horas, "hora", "horas")}`;
  }

  // A partir de 24 h conta por dia de calendário (igual nas duas versões)
  const dias = Math.max(1, diasDeCalendario(data, referencia));

  if (dias === 1) {
    return `ontem, ${formatarHora(data)}`;
  }

  return `há ${dias} dias`;
}


/* ---------------------------------------------------------------------
   3) STATUS -> ROTULO E COR
   --------------------------------------------------------------------- */

// A "variante" é o sufixo da cor nas classes do CSS (ex.: status-badge--success).
// Quatro variantes: success (verde), warning (amarelo), danger (vermelho)
// e neutral (cinza). As de success, warning e neutral já existem no
// dashboard.css; a danger será criada junto com o CSS de cada tela.

// "Normal" | "Operando" -> success | "Atenção" -> warning | "Crítico" -> danger | "Desligada" -> neutral
// Serve para o status de turbina e de alerta (ambos usam esses mesmos rótulos).
export function varianteDoStatus(rotulo) {
  switch (rotulo) {
    case "Normal":
    case "Operando":
      return "success";
    case "Atenção":
      return "warning";
    case "Crítico":
      return "danger";
    default:
      return "neutral";
  }
}

// Selo da turbina (o "Normal / Atenção / Desligada" dos cards): { rotulo, variante }.
// - Ligada: mostra a situação da temperatura (Normal, Atenção ou Crítico).
// - Desligada: mostra "Desligada" (cinza)...
// - ...exceto se a temperatura ainda está crítica: aí mostra "Crítico", que
//   explica por que o botão "Ligar" vai ser recusado pelo back (erro 409).
// Recebe a turbina como o back devolve ({ ligada, statusTemperatura, ... }).
export function estadoVisualTurbina(turbina) {
  const critica = turbina.statusTemperatura === "Crítico";

  if (!turbina.ligada && !critica) {
    return { rotulo: "Desligada", variante: "neutral" };
  }

  return {
    rotulo: turbina.statusTemperatura,
    variante: varianteDoStatus(turbina.statusTemperatura),
  };
}

// Selo do reservatório, a partir do statusNivel de GET /api/usina.
// Nível baixo e muito alto são ambos "Alerta" na RN01, então ambos warning.
export function estadoVisualNivel(statusNivel) {
  switch (statusNivel) {
    case "nível normal":
      return { rotulo: "Normal", variante: "success" };
    case "nível baixo":
      return { rotulo: "Nível baixo", variante: "warning" };
    case "nível muito alto":
      return { rotulo: "Nível muito alto", variante: "warning" };
    default:
      return { rotulo: "Indisponível", variante: "neutral" };
  }
}


/* ---------------------------------------------------------------------
   4) NOME DO USUÁRIO
   --------------------------------------------------------------------- */

// Iniciais para o avatar: "Operador SENAI" -> "OS"; "Richard" -> "RI".
// Pega a primeira letra da primeira e da última palavra; com uma palavra só,
// as duas primeiras letras. Sem nome, devolve "?".
export function iniciais(nome) {
  const palavras = String(nome ?? "").trim().split(/\s+/).filter(Boolean);

  if (palavras.length === 0) {
    return "?";
  }

  if (palavras.length === 1) {
    return palavras[0].slice(0, 2).toUpperCase();
  }

  return (palavras[0][0] + palavras[palavras.length - 1][0]).toUpperCase();
}