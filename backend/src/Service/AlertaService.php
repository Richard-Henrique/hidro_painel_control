<?php

declare(strict_types=1);

/**
 * Service dos alertas.
 * Faz duas coisas:
 *  1) GET /api/alertas (RF04): monta a lista filtrada e os 4 cards da tela;
 *  2) RN05: grava o alerta quando a temperatura de uma turbina ou o nível do
 *     reservatório muda de situação. É chamado pelo TurbinaService e pelo
 *     UsinaService, logo depois que eles classificam (RN02 e RN01).
 * Não conhece HTTP nem SQL: usa só o AlertaRepository.
 */
class AlertaService
{
    // Status gravados no ENUM da tabela alertas
    private const STATUS_NORMAL = 'Normal';
    private const STATUS_ALERTA = 'ALERTA';
    private const STATUS_CRITICO = 'CRITICO';

    // Tamanho da coluna mensagem (VARCHAR(150) no banco)
    private const TAMANHO_MAXIMO_MENSAGEM = 150;

    // Filtros aceitos em GET /api/alertas?filtro=... e o status do banco de cada um (null = sem filtro)
    private const FILTROS = [
        'todos'   => null,
        'atencao' => self::STATUS_ALERTA,
        'critico' => self::STATUS_CRITICO,
    ];

    // Como cada status do banco aparece na resposta da API
    private const ROTULOS = [
        self::STATUS_NORMAL  => 'Normal',
        self::STATUS_ALERTA  => 'Atenção',
        self::STATUS_CRITICO => 'Crítico',
    ];

    private AlertaRepository $alertaRepository;

    public function __construct(AlertaRepository $alertaRepository)
    {
        $this->alertaRepository = $alertaRepository;
    }

    /**
     * GET /api/alertas (RF04).
     * Devolve o histórico (do mais recente ao mais antigo, com o filtro aplicado)
     * e os números dos 4 cards. Os cards não mudam com o filtro.
     * O histórico inclui as voltas ao Normal, então "total" conta tudo o que "Todos" lista.
     *
     * @throws InvalidArgumentException se o filtro não for todos, atencao ou critico
     */
    public function listar(?string $filtro): array
    {
        $statusBanco = $this->traduzirFiltro($filtro);

        // Busca o histórico completo uma vez: ele serve para "ativos" e, sem filtro, para a lista
        $todos = $this->alertaRepository->listar(null);
        $historico = $statusBanco === null ? $todos : $this->alertaRepository->listar($statusBanco);

        $contagem = $this->alertaRepository->contarPorStatus();

        $alertas = [];
        foreach ($historico as $alerta) {
            $alertas[] = $this->montarAlerta($alerta);
        }

        return [
            'resumo' => [
                'total'   => array_sum($contagem),
                'ativos'  => $this->contarAtivos($todos),
                'atencao' => $contagem[self::STATUS_ALERTA],
                'critico' => $contagem[self::STATUS_CRITICO],
            ],
            'alertas' => $alertas,
        ];
    }

    /**
     * RN05 (temperatura): registra o alerta da turbina se o status mudou.
     * Chamado pelo TurbinaService com o resultado da RN02.
     */
    public function registrarTemperatura(Turbina $turbina, StatusTemperatura $status): void
    {
        // null significaria "reservatório" em registrarSeMudou: uma turbina sem id seria confundida com ele
        if ($turbina->getId() === null) {
            throw new LogicException('A turbina precisa estar cadastrada para gerar alertas.');
        }

        $nome = $turbina->getNome();
        $temperatura = number_format($turbina->getTemperatura(), 1, ',', '.');

        [$statusBanco, $mensagem] = match ($status) {
            StatusTemperatura::NORMAL  => [self::STATUS_NORMAL, "{$nome} voltou ao normal: temperatura de {$temperatura} °C."],
            StatusTemperatura::ATENCAO => [self::STATUS_ALERTA, "{$nome} em atenção: temperatura de {$temperatura} °C."],
            StatusTemperatura::CRITICO => [self::STATUS_CRITICO, "{$nome} em estado crítico: temperatura de {$temperatura} °C."],
        };

        $this->registrarSeMudou($turbina->getId(), $statusBanco, $mensagem);
    }

    /**
     * RN05 (reservatório): registra o alerta do nível se a situação mudou.
     * Chamado pelo UsinaService com o resultado da RN01 ('nível baixo',
     * 'nível normal' ou 'nível muito alto'). Esse alerta não tem turbina.
     */
    public function registrarNivel(string $statusNivel, float $nivelAgua): void
    {
        $nivel = number_format($nivelAgua, 2, ',', '.');

        [$statusBanco, $mensagem] = match ($statusNivel) {
            'nível baixo'      => [self::STATUS_ALERTA, "Nível do reservatório baixo: {$nivel}%."],
            'nível muito alto' => [self::STATUS_ALERTA, "Nível do reservatório muito alto: {$nivel}%."],
            'nível normal'     => [self::STATUS_NORMAL, "Nível do reservatório voltou ao normal: {$nivel}%."],
            default            => throw new InvalidArgumentException('Status do nível do reservatório inválido.'),
        };

        $this->registrarSeMudou(null, $statusBanco, $mensagem);
    }

    /**
     * Regra de não repetir alerta: só grava se o status for diferente do último
     * alerta da mesma origem (a turbina, ou o reservatório quando $turbina é null).
     * Quem nunca teve alerta parte do Normal; por isso um primeiro "Normal" não grava nada.
     */
    private function registrarSeMudou(?int $turbina, string $status, string $mensagem): void
    {
        $ultimo = $this->alertaRepository->buscarUltimo($turbina);
        $statusAnterior = $ultimo === null ? self::STATUS_NORMAL : $ultimo->getStatus();

        if ($status === $statusAnterior) {
            return;
        }

        // O nome da turbina pode ser longo: corta a mensagem para caber na coluna
        $mensagem = mb_strimwidth($mensagem, 0, self::TAMANHO_MAXIMO_MENSAGEM, '...');

        $this->alertaRepository->inserir($turbina, $mensagem, $status);
    }

    /**
     * Conta os alertas ativos agora: origens (cada turbina e o reservatório)
     * cujo último alerta não é Normal. Como só se grava alerta quando o status
     * muda, o último alerta de cada origem é a situação atual dela.
     *
     * @param Alerta[] $todos histórico completo, do mais recente ao mais antigo
     */
    private function contarAtivos(array $todos): int
    {
        $origensVistas = [];
        $ativos = 0;

        foreach ($todos as $alerta) {
            // Alertas sem turbina pertencem ao reservatório
            $origem = $alerta->getTurbina() ?? 'reservatorio';

            // A lista vem do mais recente: o primeiro alerta de cada origem é o último dela
            if (isset($origensVistas[$origem])) {
                continue;
            }

            $origensVistas[$origem] = true;

            if ($alerta->getStatus() !== self::STATUS_NORMAL) {
                $ativos++;
            }
        }

        return $ativos;
    }

    /**
     * Converte o filtro da query no status do banco (null = todos).
     * Sem filtro ou vazio vale "todos".
     */
    private function traduzirFiltro(?string $filtro): ?string
    {
        $chave = mb_strtolower(trim($filtro ?? ''));

        if ($chave === '') {
            $chave = 'todos';
        }

        if (!array_key_exists($chave, self::FILTROS)) {
            throw new InvalidArgumentException('Filtro inválido. Use todos, atencao ou critico.');
        }

        return self::FILTROS[$chave];
    }

    /**
     * Converte a entidade no array que o Controller devolve em JSON.
     */
    private function montarAlerta(Alerta $alerta): array
    {
        return [
            'id'          => $alerta->getId(),
            'turbina'     => $alerta->getTurbina(),   // NOVO: id da turbina; null se o alerta é do reservatório
            'origem'      => $alerta->getNomeTurbina() ?? 'Reservatório',
            'mensagem'    => $alerta->getMensagem(),
            'status'      => self::ROTULOS[$alerta->getStatus()],
            'dataEmissao' => $alerta->getDataEmissao(),
        ];
    }
}