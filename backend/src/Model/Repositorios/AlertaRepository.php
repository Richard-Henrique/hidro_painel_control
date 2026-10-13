<?php

declare(strict_types=1);

/**
 * Repository dos alertas (GET /api/alertas e gravação da RN05).
 * Depende de IConexao; a conexão PDO vem do Singleton, injetada de fora.
 * Só fala com o banco: não decide quando um alerta deve ser gravado
 * nem como o status é apresentado (isso é papel do Service).
 */
class AlertaRepository
{
    private IConexao $conexao;

    public function __construct(IConexao $conexao)
    {
        $this->conexao = $conexao;
    }

    /**
     * Lista o histórico de alertas, do mais recente ao mais antigo.
     * Sem filtro ($status = null) devolve todos; com filtro devolve só os
     * alertas daquele status do banco ('Normal', 'ALERTA' ou 'CRITICO').
     *
     * @return Alerta[]
     */
    public function listar(?string $status = null): array
    {
        $sql = 'SELECT idAlerta, idTurbina, nomeTurbina, mensagem, status, dataEmissao
                FROM vw_historico_alertas';

        if ($status !== null) {
            $sql .= ' WHERE status = :status';
        }

        // O id desempata alertas emitidos no mesmo segundo
        $sql .= ' ORDER BY dataEmissao DESC, idAlerta DESC';

        $stmt = $this->conexao->getConexao()->prepare($sql);

        if ($status !== null) {
            $stmt->bindValue(':status', $status, PDO::PARAM_STR);
        }

        $stmt->execute();

        $alertas = [];
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $linha) {
            $alertas[] = $this->criarAlerta($linha);
        }

        return $alertas;
    }

    /**
     * Conta quantos alertas existem em cada status (base dos cards da tela).
     * Todos os status aparecem no resultado, com 0 quando não há alertas.
     *
     * @return array<string, int> ex.: ['Normal' => 0, 'ALERTA' => 4, 'CRITICO' => 1]
     */
    public function contarPorStatus(): array
    {
        $contagem = ['Normal' => 0, 'ALERTA' => 0, 'CRITICO' => 0];

        $stmt = $this->conexao->getConexao()->prepare(
            'SELECT status, COUNT(*) AS total FROM alertas GROUP BY status'
        );
        $stmt->execute();

        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $linha) {
            $contagem[(string) $linha['status']] = (int) $linha['total'];
        }

        return $contagem;
    }

    /**
     * Busca o alerta mais recente de uma turbina, ou o mais recente do
     * reservatório quando $turbina é null (alertas sem turbina).
     * O Service compara o status dele com o status atual para decidir se
     * um novo alerta deve ser gravado. Devolve null se ainda não há alerta.
     */
    public function buscarUltimo(?int $turbina): ?Alerta
    {
        // Em SQL, "= NULL" nunca é verdadeiro: para o reservatório é preciso IS NULL.
        // Só texto fixo é concatenado aqui; o id da turbina continua indo por bindValue.
        $filtro = $turbina === null ? 'idTurbina IS NULL' : 'idTurbina = :turbina';

        $sql = 'SELECT idAlerta, idTurbina, nomeTurbina, mensagem, status, dataEmissao
                FROM vw_historico_alertas
                WHERE ' . $filtro . '
                ORDER BY dataEmissao DESC, idAlerta DESC
                LIMIT 1';

        $stmt = $this->conexao->getConexao()->prepare($sql);

        if ($turbina !== null) {
            $stmt->bindValue(':turbina', $turbina, PDO::PARAM_INT);
        }

        $stmt->execute();

        $linha = $stmt->fetch(PDO::FETCH_ASSOC);

        if ($linha === false) {
            return null;
        }

        return $this->criarAlerta($linha);
    }

    /**
     * Grava um alerta pela procedure sp_inserir_alerta (RN05) e devolve o id gerado.
     * A data e hora de emissão é preenchida pelo próprio banco.
     * $turbina é null para alertas que não pertencem a uma turbina (nível do reservatório).
     */
    public function inserir(?int $turbina, string $mensagem, string $status): int
    {
        $stmt = $this->conexao->getConexao()->prepare(
            'CALL sp_inserir_alerta(:turbina, :mensagem, :status)'
        );
        // PARAM_NULL manda o NULL de verdade (a FK aceita, a coluna é NULL)
        $stmt->bindValue(
            ':turbina',
            $turbina,
            $turbina === null ? PDO::PARAM_NULL : PDO::PARAM_INT
        );
        $stmt->bindValue(':mensagem', $mensagem, PDO::PARAM_STR);
        $stmt->bindValue(':status', $status, PDO::PARAM_STR);
        $stmt->execute();

        // A procedure termina com SELECT LAST_INSERT_ID() AS id
        $linha = $stmt->fetch(PDO::FETCH_ASSOC);
        // Libera a conexão: um CALL que devolve resultado deixa o cursor aberto
        $stmt->closeCursor();

        return (int) $linha['id'];
    }

    /**
     * Converte uma linha da view em Alerta. O PDO costuma devolver tudo
     * como string, então cada campo é convertido para o tipo certo.
     * idTurbina e nomeTurbina vêm NULL nos alertas sem turbina.
     */
    private function criarAlerta(array $linha): Alerta
    {
        return new Alerta(
            (int) $linha['idAlerta'],
            $linha['idTurbina'] === null ? null : (int) $linha['idTurbina'],
            $linha['nomeTurbina'] === null ? null : (string) $linha['nomeTurbina'],
            (string) $linha['mensagem'],
            (string) $linha['status'],
            (string) $linha['dataEmissao']
        );
    }
}