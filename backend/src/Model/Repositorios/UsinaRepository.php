<?php

declare(strict_types=1);

/**
 * Repository da usina (leitura para o GET /api/usina e gravação das
 * medições simuladas).
 * Depende de IConexao; a conexão PDO vem do Singleton, injetada de fora.
 */
class UsinaRepository
{
    private IConexao $conexao;

    public function __construct(IConexao $conexao)
    {
        $this->conexao = $conexao;
    }

    /**
     * Busca a usina pelo id, já com a temperatura máxima das suas turbinas.
     * Devolve null se a usina não existir.
     */
    public function buscarPorId(int $id): ?Usina
    {
        $sql = 'SELECT  u.id,
                        u.nome,
                        u.nivelAgua,
                        u.geracaoNominal,
                        u.energiaGerada,
                        u.turbinas,
                        u.vazao,
                        u.statusUsina,
                        COALESCE(
                            (SELECT MAX(t.temperatura)
                                FROM turbinas t
                                WHERE t.usina = u.id),
                            0
                        ) AS temperaturaMaxima
                    FROM usinas u
                    WHERE u.id = :id';

        $stmt = $this->conexao->getConexao()->prepare($sql);
        $stmt->bindValue(':id', $id, PDO::PARAM_INT);
        $stmt->execute();

        $linha = $stmt->fetch(PDO::FETCH_ASSOC);

        if ($linha === false) {
            return null;
        }

        // O PDO devolve DECIMAL como string, então os tipos são convertidos aqui.
        return new Usina(
            (int) $linha['id'],
            (string) $linha['nome'],
            (float) $linha['nivelAgua'],
            (int) $linha['geracaoNominal'],
            (int) $linha['energiaGerada'],
            (int) $linha['turbinas'],
            (int) $linha['vazao'],
            (string) $linha['statusUsina'],
            (float) $linha['temperaturaMaxima']
        );
    }

        /**
     * Grava as medições simuladas da usina pela procedure sp_atualizar_usina:
     * nível da água, energia gerada, vazão e situação do reservatório.
     */
    public function atualizarMedicoes(
        int $id,
        float $nivelAgua,
        int $energiaGerada,
        int $vazao,
        string $statusUsina
    ): void {
        $stmt = $this->conexao->getConexao()->prepare(
            'CALL sp_atualizar_usina(:id, :nivelAgua, :energiaGerada, :vazao, :statusUsina)'
        );
        $stmt->bindValue(':id', $id, PDO::PARAM_INT);
        // DECIMAL(5,2): vai como texto com duas casas para não perder precisão
        $stmt->bindValue(':nivelAgua', number_format($nivelAgua, 2, '.', ''), PDO::PARAM_STR);
        $stmt->bindValue(':energiaGerada', $energiaGerada, PDO::PARAM_INT);
        $stmt->bindValue(':vazao', $vazao, PDO::PARAM_INT);
        $stmt->bindValue(':statusUsina', $statusUsina, PDO::PARAM_STR);
        $stmt->execute();
        $stmt->closeCursor();
    }
}