<?php

declare(strict_types=1);

/**
 * Controller dos alertas (GET /api/alertas).
 * Cuida só do HTTP: confere a sessão, lê o filtro da query, chama o Service
 * e responde em JSON. A regra de negócio fica no AlertaService.
 */
class AlertaController
{
    private AlertaService $alertaService;

    public function __construct(AlertaService $alertaService)
    {
        $this->alertaService = $alertaService;
    }

    /**
     * GET /api/alertas?filtro=todos|atencao|critico (o filtro é opcional)
     * 200: resumo (cards) e lista de alertas | 400: filtro inválido | 401: sem sessão
     */
    public function listar(): void
    {
        if (session_status() === PHP_SESSION_NONE) {
            session_start();
        }

        // Os alertas não são filtrados por usina (só existe a usina SENAI),
        // então a sessão serve apenas para saber se há operador logado
        if (!isset($_SESSION['usina'])) {
            $this->responder(401, ['erro' => 'Não autenticado.']);
            return;
        }

        $filtro = $_GET['filtro'] ?? null;

        // ?filtro[]=x chega como array: não é um filtro válido
        if ($filtro !== null && !is_string($filtro)) {
            $this->responder(400, ['erro' => 'Filtro inválido. Use todos, atencao ou critico.']);
            return;
        }

        try {
            $resposta = $this->alertaService->listar($filtro);
        } catch (InvalidArgumentException $e) {
            $this->responder(400, ['erro' => $e->getMessage()]);
            return;
        }

        $this->responder(200, $resposta);
    }

    /**
     * Envia a resposta em JSON com o status HTTP informado.
     */
    private function responder(int $status, array $corpo): void
    {
        http_response_code($status);
        echo json_encode($corpo, JSON_UNESCAPED_UNICODE);
    }
}