<?php

declare(strict_types=1);

class TurbinaService
{
    // RN02: limites de temperatura (°C)
    private const TEMPERATURA_ATENCAO = 70.0;
    private const TEMPERATURA_CRITICA = 85.0;

    // Ao ligar, a turbina passa a gerar este percentual da potência nominal
    // (os dados são simulados, conforme o documento de requisitos)
    private const FATOR_GERACAO = 0.8;

    // Tamanho máximo de nome e modelo (VARCHAR(100) no banco)
    private const TAMANHO_MAXIMO_TEXTO = 100;

    // Simulação de temperatura (°C). Os valores em décimos de grau
    // (ex.: -20 = -2,0 °C) permitem sortear com random_int, que só aceita inteiros.
    private const TEMPERATURA_AMBIENTE = 25.0;       // piso de uma turbina desligada
    private const TEMPERATURA_OPERACAO = 60.0;       // abaixo disso a turbina ainda está aquecendo
    private const TEMPERATURA_MAXIMA = 100.0;        // teto da simulação
    private const AQUECIMENTO_MIN = 20;              // +2,0 °C por consulta enquanto aquece
    private const AQUECIMENTO_MAX = 50;              // +5,0 °C por consulta enquanto aquece
    private const VARIACAO_MIN = -20;                // -2,0 °C por consulta em operação
    private const VARIACAO_MAX = 30;                 // +3,0 °C por consulta em operação
    private const RESFRIAMENTO = 3.0;                // -3,0 °C por consulta quando desligada

    private TurbinaRepository $turbinaRepository;
    private AlertaService $alertaService;

    public function __construct(TurbinaRepository $turbinaRepository, AlertaService $alertaService)
    {
        $this->turbinaRepository = $turbinaRepository;
        $this->alertaService = $alertaService;
    }

    /**
     * GET /api/turbinas (RF02).
     * Avança a simulação e devolve a lista já com as temperaturas atualizadas.
     */
    public function listar(int $usina): array
    {
        $resposta = [];

        foreach ($this->atualizarSimulacao($usina) as $turbina) {
            $resposta[] = $this->montarTurbina($turbina);
        }

        return $resposta;
    }

    /**
     * Avança um passo da simulação das turbinas da usina: varia a temperatura,
     * aplica a RN04 e grava o resultado no banco.
     * É público para que outras telas (ex.: dashboard) possam avançar a simulação.
     *
     * @return Turbina[]
     */
    public function atualizarSimulacao(int $usina): array
    {
        $turbinas = $this->turbinaRepository->listarPorUsina($usina);

        foreach ($turbinas as $turbina) {
            $this->simularTemperatura($turbina);
            $this->aplicarSegurancaAutomatica($turbina);
            $this->turbinaRepository->atualizar($turbina);

            // RN05: grava alerta se o status da temperatura mudou (RN02) desde o último alerta
            $this->alertaService->registrarTemperatura(
                $turbina,
                $this->classificarTemperatura($turbina->getTemperatura())
            );
        }

        return $turbinas;
    }

    /**
     * POST /api/turbinas (RF02).
     * Valida os dados e cadastra a turbina desligada, com energia e temperatura zeradas.
     *
     * @throws InvalidArgumentException se algum dado for inválido
     */
    public function cadastrar(int $usina, string $nome, string $modelo, int $energiaNominal): array
    {
        $nome = trim($nome);
        $modelo = trim($modelo);

        if ($nome === '') {
            throw new InvalidArgumentException('O nome da turbina não pode ser vazio.');
        }

        if (mb_strlen($nome) > self::TAMANHO_MAXIMO_TEXTO) {
            throw new InvalidArgumentException('O nome da turbina deve ter no máximo 100 caracteres.');
        }

        if ($modelo === '') {
            throw new InvalidArgumentException('O modelo da turbina não pode ser vazio.');
        }

        if (mb_strlen($modelo) > self::TAMANHO_MAXIMO_TEXTO) {
            throw new InvalidArgumentException('O modelo da turbina deve ter no máximo 100 caracteres.');
        }

        if ($energiaNominal <= 0) {
            throw new InvalidArgumentException('A potência da turbina deve ser maior que zero.');
        }

        $nova = new Turbina(null, $usina, $nome, $modelo, $energiaNominal, 0, 0.0, false);
        $id = $this->turbinaRepository->cadastrar($nova);

        $criada = $this->turbinaRepository->buscarPorId($id);

        if ($criada === null) {
            throw new RuntimeException('Não foi possível recuperar a turbina cadastrada.');
        }

        return $this->montarTurbina($criada);
    }

    /**
     * PATCH /api/turbinas/{id}/estado (RF03).
     * Liga ou desliga a turbina e recalcula a potência gerada e as turbinas operando.
     * Devolve null se a turbina não existir ou não for da usina do operador.
     *
     * @throws DomainException se tentar ligar uma turbina em temperatura crítica
     */
    public function alterarEstado(int $usina, int $id, bool $ligada): ?array
    {
        $turbina = $this->turbinaRepository->buscarPorId($id);

        if ($turbina === null || $turbina->getUsina() !== $usina) {
            return null;
        }

        if ($ligada) {
            // RN04: uma turbina crítica seria desligada na hora, então nem liga
            if ($this->classificarTemperatura($turbina->getTemperatura()) === StatusTemperatura::CRITICO) {
                throw new DomainException('A turbina está em temperatura crítica e não pode ser ligada.');
            }

            $turbina->setLigada(true);
            $turbina->setEnergiaGerada((int) round($turbina->getEnergiaNominal() * self::FATOR_GERACAO));
        } else {
            $turbina->setLigada(false);
            $turbina->setEnergiaGerada(0);
        }

        $this->turbinaRepository->atualizar($turbina);

        return [
            'turbina' => $this->montarTurbina($turbina),
            'usina' => $this->calcularResumoUsina($usina),
        ];
    }

    /**
     * Simula a variação de temperatura (só em memória; quem grava é o chamador).
     * Ligada e abaixo da temperatura de operação: aquece.
     * Ligada e já aquecida: oscila para cima e para baixo, com leve tendência de alta.
     * Desligada: esfria até a temperatura ambiente.
     */
    private function simularTemperatura(Turbina $turbina): void
    {
        $temperatura = $turbina->getTemperatura();

        if ($turbina->isLigada()) {
            if ($temperatura < self::TEMPERATURA_OPERACAO) {
                $temperatura += random_int(self::AQUECIMENTO_MIN, self::AQUECIMENTO_MAX) / 10;
            } else {
                $temperatura += random_int(self::VARIACAO_MIN, self::VARIACAO_MAX) / 10;
            }
        } else {
            $temperatura = max(self::TEMPERATURA_AMBIENTE, $temperatura - self::RESFRIAMENTO);
        }

        // Mantém a temperatura dentro dos limites da simulação (o banco não aceita negativos)
        $temperatura = min(max($temperatura, 0.0), self::TEMPERATURA_MAXIMA);

        $turbina->setTemperatura(round($temperatura, 2));
    }

    /**
     * RN02: classifica a temperatura.
     * Abaixo de 70 °C: Normal; de 70 a 85 °C: Atenção; acima de 85 °C: Crítico.
     */
    private function classificarTemperatura(float $temperatura): StatusTemperatura
    {
        if ($temperatura > self::TEMPERATURA_CRITICA) {
            return StatusTemperatura::CRITICO;
        }

        if ($temperatura >= self::TEMPERATURA_ATENCAO) {
            return StatusTemperatura::ATENCAO;
        }

        return StatusTemperatura::NORMAL;
    }

    /**
     * RN04: se a turbina está ligada e em temperatura crítica, desliga (só em memória).
     */
    private function aplicarSegurancaAutomatica(Turbina $turbina): void
    {
        $critica = $this->classificarTemperatura($turbina->getTemperatura()) === StatusTemperatura::CRITICO;

        if ($critica && $turbina->isLigada()) {
            $turbina->setLigada(false);
            $turbina->setEnergiaGerada(0);
        }
    }

    /**
     * Soma a potência gerada e conta as turbinas operando da usina.
     */
    private function calcularResumoUsina(int $usina): array
    {
        $potenciaGerada = 0;
        $turbinasOperando = 0;

        foreach ($this->turbinaRepository->listarPorUsina($usina) as $turbina) {
            if ($turbina->isLigada()) {
                $potenciaGerada += $turbina->getEnergiaGerada();
                $turbinasOperando++;
            }
        }

        return [
            'potenciaGerada' => $potenciaGerada,
            'turbinasOperando' => $turbinasOperando,
        ];
    }

    /**
     * Converte a entidade no array que o Controller devolve em JSON.
     * A RN03 define o texto do status operacional.
     */
    private function montarTurbina(Turbina $turbina): array
    {
        return [
            'id' => $turbina->getId(),
            'nome' => $turbina->getNome(),
            'modelo' => $turbina->getModelo(),
            'energiaNominal' => $turbina->getEnergiaNominal(),
            'energiaGerada' => $turbina->getEnergiaGerada(),
            'temperatura' => $turbina->getTemperatura(),
            'statusTemperatura' => $this->classificarTemperatura($turbina->getTemperatura())->value,
            'ligada' => $turbina->isLigada(),
            'status' => $turbina->isLigada() ? 'Operando' : 'Desligada',
        ];
    }
}