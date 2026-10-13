/* =====================================================================
   sessao.js — Dados do usuário logado guardados no navegador

   Guarda { id, nome, usina } que o back devolve no login, para as telas
   poderem mostrar o nome do usuário (ex.: avatar do dashboard).

   IMPORTANTE: isto é só para EXIBIÇÃO. Quem autentica de verdade é o
   cookie de sessão do PHP; o back confere a sessão em cada rota protegida
   (ex.: GET /api/usina responde 401 sem sessão). Nunca confie nestes dados
   para decidir segurança e nunca guarde a senha aqui.

   - Não faz requisição (isso é do api.js) e não mexe no DOM.
   - Sabe para onde mandar o usuário quando não há sessão (tela de login).

   Local: frontend/js/sessao.js
   ===================================================================== */


// Chave sob a qual o usuário fica guardado no sessionStorage
const CHAVE = "hidrocontrol:usuario";

// Tela de login. O caminho é calculado a partir deste arquivo
// (frontend/js/sessao.js), então "../index.html" é o frontend/index.html
// e funciona de qualquer página.
const PAGINA_LOGIN = new URL("../index.html", import.meta.url).href;

// sessionStorage vale por aba e some ao fechar o navegador, o que combina
// com o cookie de sessão do PHP (que também dura até fechar o navegador).


// Guarda os dados do usuário após o login.
// Salva só os três campos que o back devolve, ignorando qualquer outro.
export function salvarSessao({ id, nome, usina }) {
  sessionStorage.setItem(CHAVE, JSON.stringify({ id, nome, usina }));
}

// Devolve { id, nome, usina } ou null se não houver ninguém guardado.
export function obterSessao() {
  const texto = sessionStorage.getItem(CHAVE);

  if (texto === null) {
    return null;
  }

  // Se o conteúdo estiver corrompido, trata como "sem sessão" em vez de quebrar a página
  try {
    return JSON.parse(texto);
  } catch {
    return null;
  }
}

// Apaga os dados do usuário (usado no "Sair" e quando o back responde 401).
export function limparSessao() {
  sessionStorage.removeItem(CHAVE);
}

// Troca a página atual pela tela de login. replace() não deixa a página
// anterior no histórico: o botão "voltar" não retorna a uma tela protegida.
export function irParaLogin() {
  window.location.replace(PAGINA_LOGIN);
}

// Guarda de acesso das telas protegidas: chame no início de cada página.
// Devolve { id, nome, usina } se há usuário guardado; se não há, já manda
// para o login e devolve null (quem chamou deve parar por aí).
// É só conveniência: se o cookie do PHP tiver expirado, o back responde 401
// e o monitor.js também leva ao login.
export function exigirSessao() {
  const usuario = obterSessao();

  if (usuario === null) {
    irParaLogin();
  }

  return usuario;
}