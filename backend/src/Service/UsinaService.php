<?php

declare(strict_types=1);

/**
 * Service da usina (GET /api/usina).
 * Monta os dados do dashboard (RF01), aplica a RN01 (classificação do
 * nível do reservatório) e simula a vazão e o nível do reservatório.
 * Não conhece HTTP nem SQL: recebe o id da usina do Controller e usa o
 * UsinaRepository (usina), o TurbinaService (turbinas) e o AlertaService (RN05).
 */
class UsinaService
{
    // Limites da RN01 (em %): abaixo de 30 = nível baixo; acima de 90 = muito alto
    private const NIVEL_MINIMO = 30.0;
    private const NIVEL_MAXIMO = 90.0;

    // Simulação da vazão (m³/s)
    // Vazão por MW gerado: de P = ρ·g·H·Q·η, com queda de ~50 m e rendimento de ~90%
    private const VAZAO_POR_MW = 2.3;
    // Vazão residual quando todas as turbinas estão desligadas
    private const VAZAO_MINIMA = 2;
    // Ruído aleatório da vazão (±5%)
    private const RUIDO_VAZAO = 0.05;

    // Simulação do nível do reservatório
    // Vazão média que chega ao reservatório (m³/s)
    private const AFLUENCIA_MEDIA = 160.0;
    // Ruído aleatório da afluência (±15%)
    private const RUIDO_AFLUENCIA = 0.15;
    // Quanto o nível (%) muda por m³/s de saldo (afluência - vazão), por consulta
    private const FATOR_NIVEL = 0.003;

    private UsinaRepository $usinaRepository;
    private TurbinaService $turbinaService;
    private AlertaService $alertaService;

    public function __construct(
        UsinaRepository $usinaRepository,
        TurbinaService $turbinaService,
        AlertaService $alertaService
    ) {
        $this->usinaRepository = $usinaRepository;
        $this->turbinaService = $turbinaService;
        $this->alertaService = $alertaService;
    }

    /**
     * Devolve os dados do dashboard da usina, prontos para virar JSON,
     * ou null se a usina não existir (o Controller responde 404).
     * A cada chamada avança a simulação das turbinas e da usina e grava no banco.
     */
    public function obterDadosDashboard(int $idUsina): ?array
    {
        $usina = $this->usinaRepository->buscarPorId($idUsina);

        if ($usina === null) {
            return null;
        }

        // Avança a simulação das turbinas (temperatura e RN04) e usa o resultado
        $turbinas = $this->turbinaService->atualizarSimulacao($idUsina);

        $energiaGerada = 0;
        $temperaturaMaxima = 0.0;

        foreach ($turbinas as $turbina) {
            if ($turbina->isLigada()) {
                $energiaGerada += $turbina->getEnergiaGerada();
            }

            $temperaturaMaxima = max($temperaturaMaxima, $turbina->getTemperatura());
        }

        // A vazão depende da potência gerada; o nível depende da vazão
        $vazao = $this->simularVazao($energiaGerada);
        $nivelAgua = $this->simularNivel($usina->getNivelAgua(), $vazao);
        $statusNivel = $this->classificarNivel($nivelAgua);

        $this->usinaRepository->atualizarMedicoes($idUsina, $nivelAgua, $energiaGerada, $vazao, $statusNivel);

        // RN05: grava alerta se a situação do reservatório mudou (RN01) desde o último alerta
        $this->alertaService->registrarNivel($statusNivel, $nivelAgua);

        return [
            'nome'              => $usina->getNome(),
            'nivelAgua'         => $nivelAgua,
            'statusNivel'       => $statusNivel,
            'vazao'             => $vazao,
            'energiaGerada'     => $energiaGerada,
            'temperaturaMaxima' => $temperaturaMaxima,
        ];
    }

    /**
     * Simula a vazão: proporcional à potência gerada, com ruído aleatório.
     * Com todas as turbinas desligadas, fica na vazão residual.
     */
    private function simularVazao(int $energiaGerada): int
    {
        $vazao = (int) round($energiaGerada * self::VAZAO_POR_MW * $this->ruido(self::RUIDO_VAZAO));

        return max(self::VAZAO_MINIMA, $vazao);
    }

    /**
     * Simula o nível do reservatório como um saldo: o que chega (afluência,
     * aleatória) menos o que sai (vazão). Vazão alta baixa o nível; vazão
     * baixa o eleva. O resultado fica entre 0 e 100%.
     */
    private function simularNivel(float $nivelAtual, int $vazao): float
    {
        $afluencia = self::AFLUENCIA_MEDIA * $this->ruido(self::RUIDO_AFLUENCIA);
        $nivel = $nivelAtual + ($afluencia - $vazao) * self::FATOR_NIVEL;

        return round(min(max($nivel, 0.0), 100.0), 2);
    }

    /**
     * Fator multiplicativo aleatório entre (1 - variacao) e (1 + variacao).
     * Ex.: variacao 0.05 devolve um valor entre 0,95 e 1,05.
     */
    private function ruido(float $variacao): float
    {
        return 1 + (random_int(-1000, 1000) / 1000) * $variacao;
    }

    /**
     * RN01: classifica o nível do reservatório.
     * Devolve os mesmos valores do ENUM statusUsina do banco.
     */
    private function classificarNivel(float $nivelAgua): string
    {
        if ($nivelAgua < self::NIVEL_MINIMO) {
            return 'nível baixo';
        }

        if ($nivelAgua > self::NIVEL_MAXIMO) {
            return 'nível muito alto';
        }

        return 'nível normal';
    }
}