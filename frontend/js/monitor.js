/* =====================================================================
   monitor.js — Ciclo de atualização e estado compartilhado das telas

   É o arquivo único que dashboard, turbinas e alertas usam para ter dados
   "ao vivo". A cada ciclo (5 s) ele pede ao back, pelo api.js, usina,
   turbinas e alertas; guarda o resultado num estado único; e avisa as
   telas que assinaram. Cada tela só desenha o que quer a partir do estado.

   Por que as 3 telas rodam o mesmo ciclo: no back, só GET /api/usina e
   GET /api/turbinas avançam a simulação (e geram alertas). Se a tela de
   alertas pedisse só /api/alertas, nada de novo apareceria nela. E a
   sidebar (contagem de turbinas e de alertas ativos) existe em todas.

   Regras do ciclo:
   - Sempre em sequência: usina -> turbinas -> alertas. Assim o alerta
     gerado pelas duas primeiras já vem na terceira, no mesmo ciclo.
   - Nunca dois ciclos ao mesmo tempo; o próximo é agendado quando o atual termina.
   - Aba escondida: pausa (a simulação não anda sem ninguém olhando).
     Ao voltar, atualiza na hora.
   - 401 (sessão expirada): encerra a sessão local e volta ao login.
   - Falha de conexão ou erro do servidor: mantém os últimos dados, marca
     a conexão como "offline" e tenta de novo no próximo ciclo.

   - Não mexe no DOM e não chama fetch (isso é do api.js).

   Local: frontend/js/monitor.js
   ===================================================================== */

import { obterUsina, listarTurbinas, listarAlertas, ApiError } from "./api.js";
import { exigirSessao, limparSessao, irParaLogin } from "./sessao.js";
import { registrarLeitura, limparHistorico } from "./historico.js";
import { lerDataDoBanco } from "./formatadores.js";


/* ---------------------------------------------------------------------
   1) CONFIGURAÇÃO E VARIÁVEIS INTERNAS
   --------------------------------------------------------------------- */

// Tempo entre o fim de um ciclo e o começo do próximo
const INTERVALO_PADRAO_MS = 5000;

let intervaloMs = INTERVALO_PADRAO_MS;
let iniciado = false;          // iniciar() já foi chamado
let parado = false;            // parar() foi chamado ou a sessão expirou
let temporizador = null;       // id do setTimeout do próximo ciclo
let cicloEmAndamento = null;   // Promise do ciclo que está rodando agora (ou null)

// Telas que pediram para ser avisadas a cada ciclo
const assinantes = new Set();

// Estado compartilhado. Campos "null" = ainda não carregado (diferente de
// "carregado e vazio", como uma lista de turbinas com 0 itens).
//
//   conexao            "conectando" (1º ciclo) | "online" | "offline" (o último ciclo falhou)
//   erro               mensagem do último erro, ou null
//   ultimaAtualizacao  Date do último ciclo 100% bem-sucedido, ou null
//   usina              { nome, nivelAgua, statusNivel, vazao }
//   vazaoAnterior      vazão da leitura anterior (para a tendência), ou null
//   turbinas           lista do back, como veio
//   resumoTurbinas     números calculados sobre a lista (ver resumirTurbinas)
//   alertas            { resumo, lista, ativos } (ver derivarAlertas)
let estado = {
  conexao: "conectando",
  erro: null,
  ultimaAtualizacao: null,
  usina: null,
  vazaoAnterior: null,
  turbinas: null,
  resumoTurbinas: null,
  alertas: null,
};


/* ---------------------------------------------------------------------
   2) CÁLCULOS SOBRE OS DADOS DO BACK
   --------------------------------------------------------------------- */

// Números das turbinas que o dashboard e a tela de turbinas mostram.
// São calculados a partir da MESMA lista que desenha os cards, e não
// copiados de /api/usina: as duas rotas avançam a simulação, então as
// temperaturas de uma e de outra diferem um passo e a tela ficaria incoerente.
//
//   total, operando
//   potenciaGerada        soma das turbinas ligadas (MW)
//   potenciaNominal       soma da potência nominal de todas (MW)
//   percentualDaNominal   potenciaGerada / potenciaNominal, de 0 a 100
//   turbinaMaisQuente     a turbina de maior temperatura (ou null se não há turbinas)
//   temperaturaMaxima     temperatura dela (0 se não há turbinas)
function resumirTurbinas(turbinas) {
  let operando = 0;
  let potenciaGerada = 0;
  let potenciaNominal = 0;
  let maisQuente = null;

  for (const turbina of turbinas) {
    potenciaNominal += turbina.energiaNominal;

    if (turbina.ligada) {
      operando++;
      potenciaGerada += turbina.energiaGerada;
    }

    if (maisQuente === null || turbina.temperatura > maisQuente.temperatura) {
      maisQuente = turbina;
    }
  }

  return {
    total: turbinas.length,
    operando,
    potenciaGerada,
    potenciaNominal,
    percentualDaNominal: potenciaNominal > 0 ? (potenciaGerada / potenciaNominal) * 100 : 0,
    turbinaMaisQuente: maisQuente,
    temperaturaMaxima: maisQuente === null ? 0 : maisQuente.temperatura,
  };
}

// Completa a resposta de GET /api/alertas com o que a tela precisa:
//   resumo   os 4 cards, como o back mandou
//   lista    todos os alertas, do mais recente ao mais antigo, cada um com
//            { ...campos do back, data (Date), ativo (true/false) }
//   ativos   só os alertas ativos (para o banner do dashboard)
//
// "Ativo" = o alerta mais recente da sua origem (uma turbina ou o reservatório)
// e que não é "Normal". O back só grava alerta quando a situação muda, então o
// último alerta de cada origem é a situação atual dela.
// A origem é identificada pelo campo "turbina" (id da turbina, ou null quando
// o alerta é do reservatório): assim duas turbinas com o mesmo nome não se misturam.
function derivarAlertas(resposta) {
  const origensVistas = new Set();

  const lista = resposta.alertas.map((alerta) => {
    const origem = alerta.turbina ?? "reservatorio";
    const primeiroDaOrigem = !origensVistas.has(origem);
    origensVistas.add(origem);

    return {
      ...alerta,
      data: lerDataDoBanco(alerta.dataEmissao),
      ativo: primeiroDaOrigem && alerta.status !== "Normal",
    };
  });

  return {
    resumo: resposta.resumo,
    lista,
    ativos: lista.filter((alerta) => alerta.ativo),
  };
}


/* ---------------------------------------------------------------------
   3) APLICAR CADA RESPOSTA NO ESTADO
   --------------------------------------------------------------------- */

// Troca o objeto inteiro (em vez de alterar os campos) para que quem ainda
// guarda uma "foto" antiga do estado não veja mudanças inesperadas.

function aplicarUsina(dados) {
  // Só nome, nível, status e vazão. A potência e a temperatura máxima que o
  // back também manda não entram: as telas usam resumoTurbinas (ver acima).
  estado.vazaoAnterior = estado.usina === null ? null : estado.usina.vazao;
  estado.usina = {
    nome: dados.nome,
    nivelAgua: dados.nivelAgua,
    statusNivel: dados.statusNivel,
    vazao: dados.vazao,
  };

  // Alimenta o gráfico do dashboard (o historico.js decide se já é hora de anotar)
  registrarLeitura({ nivel: dados.nivelAgua, vazao: dados.vazao });
}

function aplicarTurbinas(dados) {
  estado.turbinas = dados.turbinas;
  estado.resumoTurbinas = resumirTurbinas(dados.turbinas);
}

function aplicarAlertas(dados) {
  estado.alertas = derivarAlertas(dados);
}


/* ---------------------------------------------------------------------
   4) O CICLO
   --------------------------------------------------------------------- */

// Os três passos de um ciclo, em ordem
const PASSOS = [
  { buscar: obterUsina, aplicar: aplicarUsina },
  { buscar: listarTurbinas, aplicar: aplicarTurbinas },
  { buscar: () => listarAlertas(), aplicar: aplicarAlertas },
];

// Executa os três passos. Devolve false se o ciclo foi abandonado por causa
// do 401 (nesse caso ninguém deve ser notificado, a página está saindo).
async function lerTudo() {
  let erro = null;

  for (const passo of PASSOS) {
    try {
      passo.aplicar(await passo.buscar());
    } catch (excecao) {
      if (excecao instanceof ApiError && excecao.status === 401) {
        encerrarSessao();
        return false;
      }

      if (excecao instanceof ApiError) {
        erro = excecao.message;

        // Status 0 = não chegou ao servidor: tentar os outros passos só
        // empilharia mais esperas. Os demais erros (404, 500) afetam uma rota só.
        if (excecao.status === 0) {
          break;
        }
      } else {
        // Não é erro de comunicação: resposta num formato inesperado ou bug nosso
        console.error(excecao);
        erro = "Erro inesperado ao atualizar os dados.";
      }
    }
  }

  estado.erro = erro;
  estado.conexao = erro === null ? "online" : "offline";

  if (erro === null) {
    estado.ultimaAtualizacao = new Date();
  }

  return true;
}

// Roda um ciclo agora. Se já há um em andamento, devolve o mesmo (nunca
// dois ao mesmo tempo). Ao terminar, avisa as telas e agenda o próximo.
function executarCiclo() {
  if (cicloEmAndamento !== null) {
    return cicloEmAndamento;
  }

  cicloEmAndamento = (async () => {
    let notificarTelas;

    try {
      notificarTelas = await lerTudo();
    } catch (erro) {
      // Não deveria acontecer (lerTudo trata os próprios erros), mas o ciclo
      // nunca pode morrer em silêncio: registra e segue para o próximo
      console.error(erro);
      notificarTelas = true;
    } finally {
      cicloEmAndamento = null;
    }

    if (notificarTelas) {
      notificar();
      agendar();
    }
  })();

  return cicloEmAndamento;
}

function cancelarAgendamento() {
  clearTimeout(temporizador);
  temporizador = null;
}

// Marca o próximo ciclo para daqui a "intervaloMs". Não agenda se o monitor
// está parado ou a aba está escondida (ela retoma em aoMudarVisibilidade).
function agendar() {
  cancelarAgendamento();

  if (parado || document.hidden) {
    return;
  }

  temporizador = setTimeout(executarCiclo, intervaloMs);
}

// Pausa ao esconder a aba; ao voltar, atualiza na hora
function aoMudarVisibilidade() {
  if (parado) {
    return;
  }

  if (document.hidden) {
    cancelarAgendamento();
  } else {
    executarCiclo();
  }
}


/* ---------------------------------------------------------------------
   5) FUNÇÕES PÚBLICAS
   --------------------------------------------------------------------- */

// Devolve uma "foto" do estado atual. É somente leitura: as telas não
// devem alterar o que vem dentro dela.
export function obterEstado() {
  return { ...estado };
}

// Chama a função de uma tela protegendo quem chamou: um erro no desenho de
// uma tela não pode parar o ciclo, as outras telas nem a própria assinatura.
function chamarComSeguranca(funcao, foto) {
  try {
    funcao(foto);
  } catch (erro) {
    console.error(erro);
  }
}

// Avisa todas as telas assinadas
function notificar() {
  const foto = obterEstado();

  for (const funcao of assinantes) {
    chamarComSeguranca(funcao, foto);
  }
}

// Registra uma função para ser chamada com o estado a cada ciclo concluído.
// Devolve uma função que cancela a assinatura. Se já houve algum ciclo, a
// função é chamada na hora, para a tela não esperar o próximo.
export function assinar(funcao) {
  assinantes.add(funcao);

  if (estado.ultimaAtualizacao !== null || estado.erro !== null) {
    chamarComSeguranca(funcao, obterEstado());
  }

  return () => assinantes.delete(funcao);
}

// Liga o monitor: confere a sessão e começa os ciclos. Chamar de novo não
// duplica nada. Sem usuário guardado, manda para o login e não faz nada.
// "intervaloMs" só precisa ser informado em testes.
export function iniciar({ intervaloMs: intervalo = INTERVALO_PADRAO_MS } = {}) {
  if (iniciado) {
    return;
  }

  if (exigirSessao() === null) {
    return;
  }

  iniciado = true;
  parado = false;
  intervaloMs = intervalo;

  document.addEventListener("visibilitychange", aoMudarVisibilidade);
  executarCiclo();
}

// Para tudo: usado no "Sair" e quando a sessão expira. Um ciclo que esteja
// no ar termina, mas nenhum outro é agendado.
export function parar() {
  parado = true;
  cancelarAgendamento();
  document.removeEventListener("visibilitychange", aoMudarVisibilidade);
}

// Encerra a sessão no navegador: para os ciclos, apaga os dados guardados
// (usuário e histórico do gráfico) e vai para o login. Usada quando o back
// responde 401 e no "Sair" (o layout.js avisa o back antes, via api.js).
export function encerrarSessao() {
  parar();
  limparSessao();
  limparHistorico();
  irParaLogin();
}

// Pede um ciclo novo agora e devolve uma Promise que se resolve quando um
// ciclo que COMEÇOU depois da chamada termina. Serve para depois de uma ação
// (ligar/desligar, cadastrar turbina), para a tela ver o resultado já.
// Se há um ciclo em andamento, espera ele acabar (pode ter lido dados de
// antes da ação) e roda mais um.
export async function atualizarAgora() {
  if (cicloEmAndamento !== null) {
    await cicloEmAndamento;
  }

  return executarCiclo();
}