/* =====================================================================
   api.js — Camada "Requisição API" do front-end

   É o ÚNICO arquivo do front que fala com o back (única chamada a fetch).
   - Não mexe no DOM, não redireciona e não guarda dados.
   - Devolve o corpo da resposta do back exatamente como veio (sem
     transformar). Quem decide o que fazer com o resultado (mostrar erro,
     ir para o login, desenhar a tela...) é a lógica de cada tela, por
     exemplo o login.js e o monitor.js.

   Local: frontend/js/api.js
   ===================================================================== */


/* ---------------------------------------------------------------------
   1) CONFIGURAÇÃO
   --------------------------------------------------------------------- */

// Endereço do back-end. É o único lugar que precisa mudar se o back mudar de pasta.
// O caminho é calculado a partir deste arquivo (frontend/js/api.js), então
// "../../backend" aponta para a pasta backend/ ao lado da pasta frontend/,
// funcionando em qualquer página (index.html ou pages/*.html).
// Se o back estiver em outro endereço, troque por algo como:
//   const BASE_URL = "http://localhost/hidrocontrol/backend";
const BASE_URL = new URL("../../backend", import.meta.url).href;

// Tempo máximo de espera por uma resposta (ms). Como as telas atualizam a
// cada poucos segundos, uma requisição travada não pode prender o ciclo para
// sempre: passado esse tempo ela é cancelada e vira um erro de conexão.
const TEMPO_LIMITE_MS = 10000;


/* ---------------------------------------------------------------------
   2) ERRO PADRONIZADO
   --------------------------------------------------------------------- */

// Todo erro de comunicação vira um ApiError. Assim a tela só precisa tratar
// um tipo de erro, sem se preocupar com fetch, JSON ou rede.
//   status   -> código HTTP (400, 401, 409, 500...) ou 0 se não conseguiu falar com o servidor
//   message  -> texto pronto para mostrar ao usuário
export class ApiError extends Error {
  constructor(status, mensagem) {
    super(mensagem);
    this.name = "ApiError";
    this.status = status;
  }
}


/* ---------------------------------------------------------------------
   3) REQUISIÇÃO GENÉRICA (privada: não é exportada)
   --------------------------------------------------------------------- */

async function requisicao(metodo, caminho, corpo) {
  const opcoes = {
    method: metodo,
    // Envia e recebe o cookie da sessão PHP (PHPSESSID). Sem isto o login não "gruda".
    credentials: "same-origin",
    headers: { Accept: "application/json" },
    // Cancela a requisição se o servidor não responder a tempo
    signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
  };

  // Só envia corpo quando existe (login, cadastro e liga/desliga enviam; GET não)
  if (corpo !== undefined) {
    opcoes.headers["Content-Type"] = "application/json";
    opcoes.body = JSON.stringify(corpo);
  }

  // 1) Chama o servidor. Se falhar aqui, nem chegou a haver resposta
  //    (servidor desligado, sem rede ou tempo esgotado).
  let resposta;
  try {
    resposta = await fetch(BASE_URL + caminho, opcoes);
  } catch {
    throw new ApiError(0, "Não foi possível conectar ao servidor.");
  }

  // 2) Lê o JSON. Se o corpo vier vazio ou não for JSON (ex.: erro fatal do PHP), segue com null.
  let dados = null;
  try {
    dados = await resposta.json();
  } catch {
    dados = null;
  }

  // 3) Status fora de 200-299: o back manda a mensagem no campo "erro".
  if (!resposta.ok) {
    const mensagem = dados?.erro ?? "Erro inesperado. Tente novamente.";
    throw new ApiError(resposta.status, mensagem);
  }

  return dados;
}


/* ---------------------------------------------------------------------
   4) FUNÇÕES DA API (uma por rota do back)
   --------------------------------------------------------------------- */

// Todas as rotas abaixo (exceto o login) exigem sessão: sem ela o back
// responde 401, e quem trata isso (voltar ao login) é o monitor.js.

// POST /api/login
// Envia { email, senha }. Sucesso (200): { id, nome, usina }.
// Falhas lançam ApiError: 400 dados inválidos, 401 credenciais erradas, 500 erro no servidor.
export function login(email, senha) {
  return requisicao("POST", "/api/login", { email, senha });
}

// POST /api/logout  (rota ainda não existe no back: será criada depois)
// Encerra a sessão do PHP. Sucesso (200): corpo sem uso.
export function sair() {
  return requisicao("POST", "/api/logout");
}

// GET /api/usina
// Sucesso (200): { nome, nivelAgua, statusNivel, vazao, energiaGerada, temperaturaMaxima }
//   statusNivel: "nível baixo" | "nível normal" | "nível muito alto"
// Cada chamada avança a simulação no back. Falhas: 401 sem sessão, 404 usina não encontrada.
export function obterUsina() {
  return requisicao("GET", "/api/usina");
}

// GET /api/turbinas
// Sucesso (200): { turbinas: [ { id, nome, modelo, energiaNominal, energiaGerada,
//   temperatura, statusTemperatura, ligada, status } ] }
//   statusTemperatura: "Normal" | "Atenção" | "Crítico"   status: "Operando" | "Desligada"
// Cada chamada avança a simulação no back. Falha: 401 sem sessão.
export function listarTurbinas() {
  return requisicao("GET", "/api/turbinas");
}

// POST /api/turbinas
// Envia { nome, modelo, energiaNominal }. Sucesso (201): a turbina criada (mesmo formato da lista).
// Falhas: 400 dados inválidos (a mensagem do back já vem pronta para mostrar), 401 sem sessão.
export function cadastrarTurbina({ nome, modelo, energiaNominal }) {
  return requisicao("POST", "/api/turbinas", { nome, modelo, energiaNominal });
}

// PATCH /api/turbinas/{id}/estado
// Envia { ligada: true|false }. Sucesso (200): { turbina, usina: { potenciaGerada, turbinasOperando } }.
// Falhas: 400 corpo inválido, 401 sem sessão, 404 turbina não encontrada,
// 409 turbina em temperatura crítica não pode ser ligada.
export function alterarEstadoTurbina(id, ligada) {
  return requisicao("PATCH", `/api/turbinas/${encodeURIComponent(id)}/estado`, { ligada });
}

// GET /api/alertas  (ou /api/alertas?filtro=atencao|critico)
// Sem filtro (ou "todos") devolve o histórico completo. É o que o front usa:
// o filtro das abas é feito na tela, porque o "Ativo/Resolvido" de cada alerta
// depende de ver também os alertas "Normal" do histórico.
// Sucesso (200): { resumo: { total, ativos, atencao, critico },
//   alertas: [ { id, turbina, origem, mensagem, status, dataEmissao } ] }
//   turbina: id da turbina, ou null se o alerta é do reservatório.
//   status: "Normal" | "Atenção" | "Crítico", do mais recente ao mais antigo.
// Falhas: 400 filtro inválido, 401 sem sessão.
export function listarAlertas(filtro) {
  const consulta = filtro ? `?filtro=${encodeURIComponent(filtro)}` : "";
  return requisicao("GET", `/api/alertas${consulta}`);
}