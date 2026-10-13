<?php

declare(strict_types=1);

/**
 * Controller da usina (GET /api/usina).
 * Cuida só do HTTP: confere a sessão, chama o Service e responde em JSON.
 * A regra de negócio fica no UsinaService.
 */
class UsinaController
{
    private UsinaService $usinaService;

    public function __construct(UsinaService $usinaService)
    {
        $this->usinaService = $usinaService;
    }

    /**
     * GET /api/usina
     * 200: dados do dashboard | 401: sem sessão | 404: usina não encontrada
     */
    public function mostrar(): void
    {
        if (session_status() === PHP_SESSION_NONE) {
            session_start();
        }

        // O id da usina vem da sessão (gravada no login), nunca da URL
        if (!isset($_SESSION['usina'])) {
            $this->responder(401, ['erro' => 'Usuário não autenticado.']);
            return;
        }

        $dados = $this->usinaService->obterDadosDashboard((int) $_SESSION['usina']);

        if ($dados === null) {
            $this->responder(404, ['erro' => 'Usina não encontrada.']);
            return;
        }

        $this->responder(200, $dados);
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