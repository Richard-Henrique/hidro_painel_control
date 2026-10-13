<?php

declare(strict_types=1);

class TurbinaController
{
    private TurbinaService $turbinaService;

    public function __construct(TurbinaService $turbinaService)
    {
        $this->turbinaService = $turbinaService;
    }

    /**
     * GET /api/turbinas
     * 200: lista de turbinas | 401: sem sessão
     */
    public function listar(): void
    {
        $usina = $this->obterUsinaDaSessao();

        if ($usina === null) {
            $this->responder(401, ['erro' => 'Não autenticado.']);
            return;
        }

        $this->responder(200, ['turbinas' => $this->turbinaService->listar($usina)]);
    }

    /**
     * POST /api/turbinas
     * Corpo: {"nome": "...", "modelo": "...", "energiaNominal": 50}
     * 201: turbina criada | 400: dados inválidos | 401: sem sessão
     */
    public function cadastrar(): void
    {
        $usina = $this->obterUsinaDaSessao();

        if ($usina === null) {
            $this->responder(401, ['erro' => 'Não autenticado.']);
            return;
        }

        $dados = $this->lerCorpoJson();

        if ($dados === null) {
            $this->responder(400, ['erro' => 'Corpo da requisição inválido. Envie um JSON.']);
            return;
        }

        // Nome e modelo que não sejam texto viram vazio; o Service recusa com a mensagem certa
        $nome = is_string($dados['nome'] ?? null) ? $dados['nome'] : '';
        $modelo = is_string($dados['modelo'] ?? null) ? $dados['modelo'] : '';
        $energiaNominal = $this->lerInteiro($dados['energiaNominal'] ?? null);

        if ($energiaNominal === null) {
            $this->responder(400, ['erro' => 'A potência da turbina deve ser um número inteiro.']);
            return;
        }

        try {
            $turbina = $this->turbinaService->cadastrar($usina, $nome, $modelo, $energiaNominal);
        } catch (InvalidArgumentException $e) {
            $this->responder(400, ['erro' => $e->getMessage()]);
            return;
        }

        $this->responder(201, $turbina);
    }

    /**
     * PATCH /api/turbinas/{id}/estado
     * Corpo: {"ligada": true}
     * 200: turbina e resumo da usina | 400: corpo inválido | 401: sem sessão
     * 404: turbina não encontrada | 409: turbina crítica não pode ser ligada
     */
    public function alterarEstado(int $id): void
    {
        $usina = $this->obterUsinaDaSessao();

        if ($usina === null) {
            $this->responder(401, ['erro' => 'Não autenticado.']);
            return;
        }

        $dados = $this->lerCorpoJson();

        if ($dados === null) {
            $this->responder(400, ['erro' => 'Corpo da requisição inválido. Envie um JSON.']);
            return;
        }

        if (!isset($dados['ligada']) || !is_bool($dados['ligada'])) {
            $this->responder(400, ['erro' => 'Informe "ligada" como true ou false.']);
            return;
        }

        try {
            $resultado = $this->turbinaService->alterarEstado($usina, $id, $dados['ligada']);
        } catch (DomainException $e) {
            $this->responder(409, ['erro' => $e->getMessage()]);
            return;
        }

        if ($resultado === null) {
            $this->responder(404, ['erro' => 'Turbina não encontrada.']);
            return;
        }

        $this->responder(200, $resultado);
    }

    /**
     * Devolve o id da usina do operador logado, ou null se não houver sessão.
     */
    private function obterUsinaDaSessao(): ?int
    {
        if (session_status() === PHP_SESSION_NONE) {
            session_start();
        }

        if (!isset($_SESSION['usina'])) {
            return null;
        }

        return (int) $_SESSION['usina'];
    }

    /**
     * Lê o corpo da requisição como JSON. Devolve null se estiver vazio,
     * quebrado ou se não for um objeto/array JSON.
     */
    private function lerCorpoJson(): ?array
    {
        $dados = json_decode((string) file_get_contents('php://input'), true);

        return is_array($dados) ? $dados : null;
    }

    /**
     * Converte para inteiro aceitando número ou texto numérico ("50").
     * Devolve null para qualquer outra coisa (decimal, texto, booleano, ausente).
     */
    private function lerInteiro(mixed $valor): ?int
    {
        if (is_bool($valor)) {
            return null;
        }

        $inteiro = filter_var($valor, FILTER_VALIDATE_INT);

        return $inteiro === false ? null : $inteiro;
    }

    /**
     * Responde em JSON com o status HTTP informado.
     */
    private function responder(int $status, array $dados): void
    {
        http_response_code($status);
        echo json_encode($dados, JSON_UNESCAPED_UNICODE);
    }
}