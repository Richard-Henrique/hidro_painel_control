/* =====================================================================
   layout.js — Parte comum das telas protegidas (sidebar e topbar)

   Dashboard, turbinas e alertas repetem a mesma moldura. Este arquivo cuida
   do que nela é dinâmico, para cada tela não reescrever:
   - iniciais e nome do usuário no avatar;
   - contagem de turbinas e de alertas ativos na sidebar;
   - bolinha do sino quando há alertas ativos;
   - nome da usina;
   - "SCADA Online / Offline" de verdade (vem do monitor.js);
   - botão "Sair".

   Como acha os elementos: pelo atributo data-layout no HTML (ver a lista na
   seção 1). Elementos que a página não tem são simplesmente ignorados (por
   exemplo, a tela de turbinas pode não ter o sino).

   - Não faz requisição direta (usa o api.js) e não decide quando atualizar
     (isso é do monitor.js: cada página chama iniciar() dele).

   Uso em cada página (dashboard.js, turbinas.js, alertas.js):
       montarLayout();
       assinar(desenharMinhaTela);
       iniciar();

   Local: frontend/js/layout.js
   ===================================================================== */

import { assinar, parar, encerrarSessao } from "./monitor.js";
import { exigirSessao } from "./sessao.js";
import { sair } from "./api.js";
import { iniciais, formatarHora } from "./formatadores.js";


/* ---------------------------------------------------------------------
   1) ELEMENTOS DA MOLDURA (atributos data-layout definidos no HTML)
   ---------------------------------------------------------------------
   data-layout="avatar"            botão com as iniciais do usuário
   data-layout="sair"              item "Sair" do menu do usuário
   data-layout="usina-nome"        onde vai o nome da usina (ex.: <span> no subtítulo)
   data-layout="badge-turbinas"    selo de contagem do link Turbinas
   data-layout="badge-alertas"     selo de contagem do link Alertas
   data-layout="sino"              botão do sino de notificações
   data-layout="sino-ponto"        bolinha do sino (só aparece com alertas ativos)
   data-layout="status-ponto"      bolinha do rodapé da sidebar
   data-layout="status-texto"      texto do rodapé da sidebar ("SCADA Online")
   --------------------------------------------------------------------- */

function elemento(nome) {
  return document.querySelector(`[data-layout="${nome}"]`);
}

// Cores possíveis da bolinha de status (classes status-dot--<variante>)
const VARIANTES_DO_PONTO = ["success", "warning", "danger", "neutral"];


/* ---------------------------------------------------------------------
   2) FUNÇÕES AUXILIARES DE INTERFACE
   --------------------------------------------------------------------- */

// "1 turbina" / "4 turbinas"
function contar(quantidade, singular, plural) {
  return `${quantidade} ${quantidade === 1 ? singular : plural}`;
}

// Selo da sidebar: mostra o número e atualiza o texto lido por leitores de tela.
// Com "esconderZero" o selo some quando o número é 0 (ex.: nenhum alerta ativo).
function desenharSelo(selo, quantidade, descricao, esconderZero) {
  if (selo === null) {
    return;
  }

  selo.textContent = String(quantidade);
  selo.setAttribute("aria-label", descricao);
  selo.hidden = esconderZero && quantidade === 0;
}

// Sino: a bolinha só aparece com alertas ativos
function desenharSino(ativos) {
  const sino = elemento("sino");
  const ponto = elemento("sino-ponto");

  if (ponto !== null) {
    ponto.hidden = ativos === 0;
  }

  if (sino !== null) {
    sino.setAttribute(
      "aria-label",
      ativos === 0
        ? "Notificações (nenhum alerta ativo)"
        : `Notificações (${contar(ativos, "alerta ativo", "alertas ativos")})`
    );
  }
}

// Rodapé da sidebar: reflete se o último ciclo do monitor deu certo
function desenharConexao(estado) {
  const ponto = elemento("status-ponto");
  const texto = elemento("status-texto");

  let rotulo;
  let variante;
  let detalhe;

  if (estado.conexao === "online") {
    rotulo = "SCADA Online";
    variante = "success";
    detalhe = `Última atualização às ${formatarHora(estado.ultimaAtualizacao)}`;
  } else if (estado.conexao === "offline") {
    rotulo = "SCADA Offline";
    variante = "danger";
    detalhe = estado.erro ?? "Falha ao atualizar os dados.";
  } else {
    rotulo = "Conectando...";
    variante = "neutral";
    detalhe = "";
  }

  if (texto !== null) {
    texto.textContent = rotulo;
    texto.title = detalhe;
  }

  if (ponto !== null) {
    ponto.classList.remove(...VARIANTES_DO_PONTO.map((v) => `status-dot--${v}`));
    ponto.classList.add(`status-dot--${variante}`);
  }
}

// Chamada a cada ciclo do monitor. Os campos ainda "null" (primeiro ciclo,
// ou rota que falhou) são pulados: o HTML inicial continua valendo.
function desenhar(estado) {
  desenharConexao(estado);

  if (estado.usina !== null) {
    const nome = elemento("usina-nome");

    if (nome !== null) {
      nome.textContent = estado.usina.nome;
    }
  }

  if (estado.resumoTurbinas !== null) {
    const total = estado.resumoTurbinas.total;

    desenharSelo(elemento("badge-turbinas"), total, contar(total, "turbina", "turbinas"), false);
  }

  if (estado.alertas !== null) {
    const ativos = estado.alertas.resumo.ativos;

    desenharSelo(
      elemento("badge-alertas"),
      ativos,
      contar(ativos, "alerta ativo", "alertas ativos"),
      true
    );
    desenharSino(ativos);
  }
}


/* ---------------------------------------------------------------------
   3) SAIR
   --------------------------------------------------------------------- */

let saindo = false;

async function aoClicarEmSair(evento) {
  // O item é um link: impede de navegar para "#"
  evento.preventDefault();

  // Evita dois cliques seguidos disparando duas saídas
  if (saindo) {
    return;
  }

  saindo = true;

  // Para os ciclos antes: não faz sentido atualizar dados enquanto se sai
  parar();

  // Avisa o back para encerrar a sessão do PHP. Se falhar (rota ainda não
  // criada, servidor fora do ar), sai do mesmo jeito: o usuário pediu para sair
  // e a tela precisa respeitar isso. Enquanto o back não tiver essa rota, o
  // cookie do PHP continua válido até o navegador fechar.
  try {
    await sair();
  } catch {
    /* segue para o encerramento local */
  }

  encerrarSessao();
}


/* ---------------------------------------------------------------------
   4) FUNÇÃO PÚBLICA
   --------------------------------------------------------------------- */

// Monta a moldura da página: confere o login, preenche o avatar, liga o
// "Sair" e passa a acompanhar o monitor. Devolve { id, nome, usina } do
// usuário, ou null se não há login (nesse caso já mandou para a tela de login
// e a página não deve continuar).
export function montarLayout() {
  const usuario = exigirSessao();

  if (usuario === null) {
    return null;
  }

  const avatar = elemento("avatar");

  if (avatar !== null) {
    avatar.textContent = iniciais(usuario.nome);
    avatar.title = usuario.nome;
  }

  const botaoSair = elemento("sair");

  if (botaoSair !== null) {
    botaoSair.addEventListener("click", aoClicarEmSair);
  }

  assinar(desenhar);

  return usuario;
}