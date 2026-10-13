/* =====================================================================
   historico.js — Série de leituras (nível e vazão) para o gráfico

   O back não guarda histórico de nível e vazão, só o valor de agora. Para o
   gráfico do dashboard ter o que mostrar, o front vai anotando cada leitura
   aqui. As anotações ficam no sessionStorage: sobrevivem à troca de página
   (dashboard -> turbinas -> dashboard) e somem ao fechar o navegador.

   - Quem anota é o monitor.js, que roda em todas as telas; por isso o gráfico
     tem dados mesmo de quem acabou de abrir o dashboard.
   - Não faz requisição e não mexe no DOM. Quem desenha o gráfico é o dashboard.js.

   Local: frontend/js/historico.js
   ===================================================================== */


/* ---------------------------------------------------------------------
   1) CONFIGURAÇÃO
   --------------------------------------------------------------------- */

const CHAVE = "hidrocontrol:historico";

// Uma leitura nova só é anotada se a anterior tiver pelo menos este tempo.
// O monitor lê a cada 5 s, mas guardar tudo faria 17 mil pontos em 24 h
// regravados no sessionStorage a cada ciclo. Com 15 s são ~5,8 mil pontos,
// de sobra para o gráfico (que tem ~700 pixels de largura).
const INTERVALO_MINIMO_MS = 15 * 1000;

// Leituras mais antigas que isso são descartadas (a maior janela do gráfico é 24 h)
const RETENCAO_MS = 24 * 60 * 60 * 1000;

// Janelas do seletor 1 h / 6 h / 24 h do dashboard, em milissegundos
export const JANELAS_MS = {
  "1h": 1 * 60 * 60 * 1000,
  "6h": 6 * 60 * 60 * 1000,
  "24h": RETENCAO_MS,
};


/* ---------------------------------------------------------------------
   2) ARMAZENAMENTO
   --------------------------------------------------------------------- */

// Cada ponto: { t: instante em ms, nivel: % do reservatório, vazao: m³/s }
let pontos = carregar();

// Lê o que já estava guardado ao abrir a página. Qualquer coisa estranha
// (sem storage, JSON quebrado, formato antigo) vira lista vazia, nunca erro.
function carregar() {
  try {
    const lista = JSON.parse(sessionStorage.getItem(CHAVE));

    if (!Array.isArray(lista)) {
      return [];
    }

    return lista.filter(
      (p) =>
        p !== null &&
        Number.isFinite(p.t) &&
        Number.isFinite(p.nivel) &&
        Number.isFinite(p.vazao)
    );
  } catch {
    return [];
  }
}

// Grava a lista inteira. Se o storage estiver cheio ou bloqueado, o histórico
// continua funcionando em memória nesta página e só se perde ao trocar de tela.
function salvar() {
  try {
    sessionStorage.setItem(CHAVE, JSON.stringify(pontos));
  } catch {
    /* sem storage: segue só em memória */
  }
}


/* ---------------------------------------------------------------------
   3) FUNÇÕES PÚBLICAS
   --------------------------------------------------------------------- */

// Anota uma leitura { nivel, vazao }. Devolve true se anotou, false se a
// leitura anterior é recente demais (ou os valores não são números).
// "agora" existe só para testes.
export function registrarLeitura({ nivel, vazao }, agora = Date.now()) {
  if (!Number.isFinite(nivel) || !Number.isFinite(vazao)) {
    return false;
  }

  const ultimo = pontos[pontos.length - 1];

  if (ultimo !== undefined && agora - ultimo.t < INTERVALO_MINIMO_MS) {
    return false;
  }

  pontos.push({ t: agora, nivel, vazao });

  // Descarta o que passou da retenção (os pontos estão em ordem de tempo)
  const limite = agora - RETENCAO_MS;
  let antigos = 0;

  while (antigos < pontos.length && pontos[antigos].t < limite) {
    antigos++;
  }

  if (antigos > 0) {
    pontos.splice(0, antigos);
  }

  salvar();
  return true;
}

// Devolve os pontos da janela pedida (use JANELAS_MS["1h"], etc.), do mais
// antigo ao mais recente. É uma cópia: mexer no resultado não altera o histórico.
export function obterHistorico(janelaMs, agora = Date.now()) {
  const inicio = agora - janelaMs;

  return pontos.filter((p) => p.t >= inicio);
}

// Apaga todo o histórico (usado ao sair ou quando a sessão expira).
export function limparHistorico() {
  pontos = [];

  try {
    sessionStorage.removeItem(CHAVE);
  } catch {
    /* sem storage: nada a apagar */
  }
}