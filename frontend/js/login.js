/* =====================================================================
   login.js — Lógica da tela de login (index.html)

   Controla o formulário: valida, chama o back (via api.js), mostra o
   erro, guarda a sessão (via sessao.js) e vai para o dashboard.

   - Não chama fetch diretamente: toda comunicação com o back é do api.js.

   Local: frontend/js/login.js
   (carregado no index.html com <script type="module">)
   ===================================================================== */

import { login, ApiError } from "./api.js";
import { salvarSessao } from "./sessao.js";


/* ---------------------------------------------------------------------
   1) ELEMENTOS DA TELA (ids definidos no index.html)
   --------------------------------------------------------------------- */
const formulario = document.getElementById("login-form");
const campoEmail = document.getElementById("login-email");
const campoSenha = document.getElementById("login-password");
const botaoMostrarSenha = document.getElementById("login-toggle-senha");
const mensagemErro = document.getElementById("login-error");
const botaoEntrar = document.getElementById("login-submit");

// Página para onde o usuário vai após logar (caminho relativo ao index.html)
const PAGINA_DASHBOARD = "pages/dashboard.html";


/* ---------------------------------------------------------------------
   2) FUNÇÕES AUXILIARES DE INTERFACE
   --------------------------------------------------------------------- */

// Mostra a mensagem de erro acima do botão.
// textContent (e não innerHTML) garante que o texto vindo do back nunca seja tratado como HTML.
function mostrarErro(texto) {
  mensagemErro.textContent = texto;
  mensagemErro.hidden = false;
}

// Esconde a mensagem de erro
function limparErro() {
  mensagemErro.textContent = "";
  mensagemErro.hidden = true;
}

// Trava o botão durante a requisição (evita clique duplo) e troca o texto
function definirCarregando(carregando) {
  botaoEntrar.disabled = carregando;
  botaoEntrar.textContent = carregando ? "Entrando..." : "Entrar";
}


/* ---------------------------------------------------------------------
   3) MOSTRAR / OCULTAR SENHA
   --------------------------------------------------------------------- */
botaoMostrarSenha.addEventListener("click", () => {
  const estavaVisivel = campoSenha.type === "text";

  campoSenha.type = estavaVisivel ? "password" : "text";

  // Mantém os atributos de acessibilidade em sincronia com o estado
  botaoMostrarSenha.setAttribute("aria-pressed", String(!estavaVisivel));
  botaoMostrarSenha.setAttribute(
    "aria-label",
    estavaVisivel ? "Mostrar senha" : "Ocultar senha"
  );
});


/* ---------------------------------------------------------------------
   4) ENVIO DO FORMULÁRIO
   --------------------------------------------------------------------- */
formulario.addEventListener("submit", async (evento) => {
  // Impede o envio padrão do navegador (que recarregaria a página)
  evento.preventDefault();
  limparErro();

  const email = campoEmail.value.trim();
  const senha = campoSenha.value;

  // Checagem rápida no front (o back valida de novo)
  if (email === "" || senha === "") {
    mostrarErro("Informe seu e-mail e sua senha.");
    return;
  }

  definirCarregando(true);

  try {
    // Chama POST /api/login; devolve { id, nome, usina }
    const usuario = await login(email, senha);

    salvarSessao(usuario);

    // replace() troca a página no histórico: o botão "voltar" não retorna ao login.
    // O botão fica travado de propósito até a página mudar (evita clique duplo).
    window.location.replace(PAGINA_DASHBOARD);
  } catch (erro) {
    if (erro instanceof ApiError) {
      // 400/401: mensagem do back | 500: erro no servidor | 0: servidor inacessível
      mostrarErro(erro.message);

      // Credenciais erradas: limpa a senha e devolve o foco para digitar de novo
      if (erro.status === 401) {
        campoSenha.value = "";
        campoSenha.focus();
      }
    } else {
      // Erro inesperado no próprio código: avisa o usuário e deixa o detalhe no console
      mostrarErro("Erro inesperado. Tente novamente.");
      console.error(erro);
    }

    definirCarregando(false);
  }
});