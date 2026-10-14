# 💧 HidroControl

Painel de monitoramento de uma usina hidrelétrica. O operador faz login, acompanha em tempo real o reservatório e a geração de energia, liga e desliga turbinas e consulta o histórico de alertas.

O sistema é dividido em um **front-end** (HTML, CSS e JavaScript puros) e uma **API REST** em **PHP com POO**, organizada em camadas **MSC** (Model – Service – Controller) e integrada a um banco **MySQL**. Os dados da usina são **simulados** pelo back-end a cada requisição, sem sensores reais.

---

## Sumário

- [Funcionalidades](#funcionalidades)
- [Tecnologias](#tecnologias)
- [Regras de negócio](#regras-de-negócio)
- [Arquitetura](#arquitetura)
- [Estrutura do projeto](#estrutura-do-projeto)
- [Como executar](#como-executar)
- [API](#api)
- [Banco de dados](#banco-de-dados)
- [Diagramas](#diagramas)
- [Próximos passos](#próximos-passos)
- [Autor](#autor)
- [Licença](#licença)

---

## Funcionalidades

- **Login do operador** com e-mail e senha (hash bcrypt) e sessão PHP.
- **Dashboard** com nome da usina, nível do reservatório (%), vazão (m³/s), potência gerada (MW) e temperatura máxima (°C).
- **Turbinas**: listagem com nome, modelo, potência, temperatura e status; cadastro de nova turbina (modal) e liga/desliga.
- **Alertas**: histórico do mais recente ao mais antigo, com resumo (total, ativos, atenção e crítico) e filtro por severidade.
- **Atualização automática**: o front consulta a API de tempos em tempos e o back gera novos valores simulados a cada consulta.

## Tecnologias

| Camada | Tecnologias |
| --- | --- |
| Front-end | HTML5, CSS3 (variáveis CSS), JavaScript (ES Modules, `fetch`) |
| Back-end | PHP 8.1+ (POO, `enum`, `strict_types`), PDO, Composer, [`vlucas/phpdotenv`](https://github.com/vlucas/phpdotenv) |
| Banco de dados | MySQL 8.0.16+ (procedures, triggers, view e `CHECK`) |
| Ambiente | Laragon (Apache + MySQL) e Visual Studio Code |

## Regras de negócio

| Regra | Descrição |
| --- | --- |
| **RN01** | Nível do reservatório: **< 30 %** nível baixo · **30 % a 90 %** normal · **> 90 %** nível muito alto. |
| **RN02** | Temperatura da turbina: **< 70 °C** normal · **70 °C a 85 °C** atenção · **> 85 °C** crítico. |
| **RN03** | Estado da turbina: `true` = **Operando**, `false` = **Desligada**. |
| **RN04** | Turbina em temperatura **crítica** é desligada automaticamente e não pode ser religada enquanto estiver crítica (a API responde `409`). |
| **RN05** | Um alerta só é gravado quando o status **muda** em relação ao último alerta, incluindo a **volta ao Normal**. O histórico fica no banco, com data e hora. |

## Arquitetura

O back-end segue o padrão **MSC**, em que o *Model* é o próprio *Repository*:

```
Requisição → index.php → routes.php → Controller → Service → Repository (Model) → MySQL
```

- **Controller**: recebe a requisição, valida a sessão e o corpo, e responde em JSON com o status HTTP adequado.
- **Service**: concentra as regras de negócio (RN01 a RN05) e a simulação dos dados.
- **Model**: entidades (`Usina`, `Turbina`, `Alerta`, `Usuario`), o enum `StatusTemperatura` e os repositórios que falam com o banco via PDO e *prepared statements*.
- **Database**: classe `Conexao` (**Singleton**) que implementa a interface `IConexao`, usada pelos repositórios por injeção de dependência.
- **`bootstrap.php`**: único arquivo que conhece a ligação entre as camadas. Carrega o `.env`, monta a cadeia de dependências e devolve os controllers.
- **`index.php` + `.htaccess`**: toda requisição passa pelo `index.php`, que encaminha para o mapa de rotas.

No front, `api.js` é o **único** arquivo que faz requisições; os demais (`login.js`, `monitor.js`, `dashboard.js`, `turbinas.js`, `alertas.js`) cuidam de cada tela.

## Estrutura do projeto

```
hidro_painel_control/
├── backend/
│   ├── src/
│   │   ├── Controller/        # AuthController, UsinaController, TurbinaController, AlertaController
│   │   ├── Service/           # AuthService, UsinaService, TurbinaService, AlertaService
│   │   ├── Model/
│   │   │   ├── Entidades/     # Usina, Turbina, Alerta, Usuario
│   │   │   ├── Enums/         # StatusTemperatura
│   │   │   └── Repositorios/  # Usina, Turbina, Alerta, Usuario
│   │   ├── Database/          # Conexao.php, IConexao.php e o script SQL (db.txt)
│   │   ├── Routes/            # routes.php (mapa de rotas)
│   │   └── bootstrap.php
│   ├── .env.example
│   ├── .htaccess
│   ├── composer.json
│   └── index.php
├── frontend/
│   ├── index.html             # tela de login
│   ├── pages/                 # dashboard, turbinas e alertas
│   ├── css/
│   ├── js/
│   └── templates/
├── diagramas/                 # caso de uso, classes, componentes, sequência e processos
├── documentação/
├── LICENSE
└── README.md
```

## Como executar

### Pré-requisitos

- [Laragon](https://laragon.org/) com Apache e MySQL **8.0.16 ou superior**
- PHP **8.1 ou superior** com a extensão `pdo_mysql`
- [Composer](https://getcomposer.org/)
- Um cliente SQL que entenda o comando `DELIMITER` (HeidiSQL, MySQL Workbench, DBeaver ou o cliente `mysql`)

### Passo a passo

**1. Clone o repositório dentro da pasta `www` do Laragon**

```bash
cd C:\laragon\www
git clone https://github.com/<seu-usuario>/hidro_painel_control.git
```

> Mantenha o nome da pasta `hidro_painel_control` e as pastas `frontend` e `backend` lado a lado: o front calcula o endereço da API a partir da própria localização (`../../backend`), então a API e o front ficam na mesma origem e não é preciso configurar CORS.

**2. Instale as dependências do back-end**

```bash
cd hidro_painel_control/backend
composer install
```

**3. Crie o banco de dados**

Execute o script `backend/src/Database/db.txt` **inteiro** no seu cliente SQL. Ele cria o banco `hidrocontrol`, as procedures, as tabelas, os triggers, a view e a carga inicial. O script pode ser reexecutado, porque usa `IF NOT EXISTS` e `DROP ... IF EXISTS`.

> ⚠️ A carga inicial insere turbinas e usuário com `INSERT` simples. Se reexecutar o script sobre um banco que já tem dados, as turbinas serão duplicadas. Para recomeçar do zero, apague o banco antes (`DROP DATABASE hidrocontrol;`).

**4. Configure as variáveis de ambiente**

Copie o arquivo de exemplo e preencha:

```bash
cp .env.example .env
```

```env
DB_NAME=hidrocontrol
DB_HOST=localhost
DB_USER=root
DB_PASS=
DB_CHARSET=utf8mb4
DB_PORT=3306
```

Esses são os valores padrão do Laragon. O `.env` não vai para o Git.

**5. Acesse o sistema**

Com o Apache e o MySQL do Laragon ligados, abra:

```
http://localhost/hidro_painel_control/frontend/
```

### Acesso de teste

| E-mail | Senha |
| --- | --- |
| `operador@senai.com` | `senai123` |

> Não há cadastro de usuários pela interface: os operadores são criados direto no banco (procedure `sp_cadastrar_usuario`, que recebe a senha **já com hash**, gerado com `password_hash()`).

## API

Base: `http://localhost/hidro_painel_control/backend`

Todas as respostas são JSON. Com exceção do login, as rotas exigem sessão ativa e respondem `401` sem ela.

| Método | Rota | Descrição | Sucesso | Erros |
| --- | --- | --- | --- | --- |
| `POST` | `/api/login` | Autentica o operador. Corpo: `{ "email", "senha" }` | `200` | `400`, `401` |
| `GET` | `/api/usina` | Dados do dashboard e avanço da simulação | `200` | `401`, `404` |
| `GET` | `/api/turbinas` | Lista as turbinas e avança a simulação | `200` | `401` |
| `POST` | `/api/turbinas` | Cadastra turbina. Corpo: `{ "nome", "modelo", "energiaNominal" }` | `201` | `400`, `401` |
| `PATCH` | `/api/turbinas/{id}/estado` | Liga ou desliga. Corpo: `{ "ligada": true }` | `200` | `400`, `401`, `404`, `409` |
| `GET` | `/api/alertas` | Histórico e resumo. Aceita `?filtro=atencao` ou `?filtro=critico` | `200` | `400`, `401` |

Rotas inexistentes respondem `404` com `{ "erro": "Rota não encontrada" }`, e falhas inesperadas respondem `500` em JSON.

<details>
<summary>Exemplo: <code>POST /api/login</code></summary>

```json
// Requisição
{ "email": "operador@senai.com", "senha": "senai123" }

// Resposta 200
{ "id": 1, "nome": "Operador SENAI", "usina": 1 }
```

</details>

## Banco de dados

```
usinas 1 ────< usuarios
  │
  └────1 ────< turbinas 1 ────< alertas ──> vw_historico_alertas
```

| Objeto | Descrição |
| --- | --- |
| `usinas` | Medições da usina e quantidade de turbinas (mantida por triggers). |
| `usuarios` | Operadores, com e-mail único e senha em hash. |
| `turbinas` | Nome, modelo, potência nominal, energia gerada, temperatura e estado ligada/desligada. |
| `alertas` | Mensagem, severidade (`Normal`, `ALERTA`, `CRITICO`) e data/hora de emissão. Ao apagar uma turbina, o alerta é mantido com `turbina = NULL`. |
| `vw_historico_alertas` | View que junta alerta, turbina e usina, do mais recente ao mais antigo. |
| Triggers | `trg_turbinas_after_insert` e `trg_turbinas_after_delete` mantêm `usinas.turbinas`. |
| Procedures | `sp_cadastrar_turbina`, `sp_atualizar_turbina`, `sp_deletar_turbina`, `sp_cadastrar_usuario`, `sp_atualizar_usuario`, `sp_deletar_usuario`, `sp_atualizar_usina` e `sp_inserir_alerta`. |

## Diagramas

Os diagramas ficam na pasta [`diagramas/`](diagramas/).

### Caso de uso

<img href='[diagramas/Caso%20de%20Uso/Hidro%20painel%20Caso%20de%20Uso.png]' alt='Diagrama de caso de uso'>

/diagramas/Caso%20de%20Uso/Hidro%20painel%20Caso%20de%20Uso.png)

### Arquitetura e classes

| Diagrama | Arquivo |
| --- | --- |
| Componentes | [`Diagrama de Componentes@1x.png`](/diagramas/Componentes/Diagrama%20de%20Componentes@1x.png) |
| Classes | [`diagrama_classes.png`](/diagramas/Classes/diagrama_classes.png) |

### Diagramas de sequência

| Fluxo | Arquivo |
| --- | --- |
| Login | [`01_login.png`](diagramas/Sequencia/01_login.png) |
| Nova turbina | [`02_nova_turbina.png`](diagramas/Sequencia/02_nova_turbina.png) |
| Liga/desliga turbina | [`03_liga_desliga_turbina.png`](diagramas/Sequencia/03_liga_desliga_turbina.png) |
| Histórico de alertas | [`04_historico_alertas.png`](diagramas/Sequencia/04_historico_alertas.png) |

### Diagramas de processo

| Processo | Arquivo |
| --- | --- |
| Autenticação do operador | [`Operador Authentication.png`](diagramas/Processos/Operador%20Authentication.png) |
| Dashboard | [`Hidro Painel -- Dashboard processos.png`](diagramas/Processos/Hidro%20Painel%20--%20Dashboard%20processos.png) |
| Carregamento e processamento | [`Processo de Carregamento e Processamento.png`](diagramas/Processos/Processo%20de%20Carregamento%20e%20Processamento.png) |
| Nova turbina | [`Turbina Management Process (nova turbina).png`](diagramas/Processos/Turbina%20Management%20Process%20%28nova%20turbina%29.png) |
| Ligar/desligar turbina | [`Turbina Management Process (Desligar-Ligar).png`](diagramas/Processos/Turbina%20Management%20Process%20%28Desligar-Ligar%29.png) |
| Filtragem do histórico | [`Processo de Filtragem do Histórico.png`](diagramas/Processos/Processo%20de%20Filtragem%20do%20Hist%C3%B3rico.png) |

## Próximos passos

- [ ] Rota `POST /api/logout` no back-end (a função `sair()` já existe no `api.js`)
- [ ] Três modos de visualização no front: claro, escuro e híbrido

## Autor

**Richard Henrique**

## Licença

Distribuído sob a licença MIT. Veja o arquivo [LICENSE](LICENSE).
