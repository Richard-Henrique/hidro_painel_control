<?php
declare(strict_types=1);

/*
 * bootstrap.php
 * Prepara o ambiente e monta a cadeia de dependências do back-end.
 * Este é o único arquivo que sabe como as camadas se ligam.
 * No final, devolve um array com os Controllers prontos para uso.
 *
 * Local: src/bootstrap.php
 */

// Autoload do Composer (necessário para a biblioteca Dotenv)
require_once __DIR__ . "/../vendor/autoload.php";

// Carrega as variáveis do arquivo .env (que fica na raiz do projeto) em $_ENV
$dotenv = Dotenv\Dotenv::createImmutable(__DIR__ . "/..");
$dotenv->load();

// Toda resposta da API é JSON, então já deixamos isso fixo aqui em
// vez de repetir em cada controller.
header('Content-Type: application/json; charset=utf-8');

// As classes de src/ são carregadas automaticamente pelo autoload do Composer (classmap).
// Ao criar um arquivo de classe novo, rode "composer dump-autoload" para atualizar o mapa.

// Montagem da cadeia de baixo para cima:
// cada camada recebe pelo construtor a camada que ela usa

// Conexão com o banco (Singleton, implementa IConexao)
$conexao = Conexao::getInstancia();

// Usuario: Model -> Service -> Controller (POST /api/login)
$usuarioRepository = new UsuarioRepository($conexao);
$authService = new AuthService($usuarioRepository);
$authController = new AuthController($authService);

// Alertas: Model -> Service -> Controller (GET /api/alertas)
// O AlertaService é criado antes porque o TurbinaService e o UsinaService
// também o usam para gravar os alertas (RN05)
$alertaRepository = new AlertaRepository($conexao);
$alertaService = new AlertaService($alertaRepository);
$alertaController = new AlertaController($alertaService);

// Turbinas: Model -> Service -> Controller (GET/POST /api/turbinas e PATCH /api/turbinas/{id}/estado)
$turbinaRepository = new TurbinaRepository($conexao);
$turbinaService = new TurbinaService($turbinaRepository, $alertaService);
$turbinaController = new TurbinaController($turbinaService);

// Usina: Model -> Service -> Controller (GET /api/usina)
// O UsinaService também recebe o TurbinaService para avançar a simulação das turbinas
// e o AlertaService para gravar o alerta do nível do reservatório
$usinaRepository = new UsinaRepository($conexao);
$usinaService = new UsinaService($usinaRepository, $turbinaService, $alertaService);
$usinaController = new UsinaController($usinaService);

// Devolve os Controllers para quem incluiu este arquivo.
// Ao criar um novo Controller, basta adicionar uma chave aqui.
return [
    'auth' => $authController,
    'usina' => $usinaController,
    'turbina' => $turbinaController,
    'alerta' => $alertaController,
];