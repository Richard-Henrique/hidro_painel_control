<?php

declare(strict_types=1);

class TurbinaRepository
{
    private IConexao $conexao;

    public function __construct(IConexao $conexao)
    {
        $this->conexao = $conexao;
    }

    /**
     * Lista as turbinas de uma usina (GET /api/turbinas).
     *
     * @return Turbina[]
     */
    public function listarPorUsina(int $usina): array
    {
        $sql = 'SELECT id, usina, nome, modelo, energiaNominal, energiaGerada, temperatura, ligada
                FROM turbinas
                WHERE usina = :usina
                ORDER BY id';

        $stmt = $this->conexao->getConexao()->prepare($sql);
        $stmt->bindValue(':usina', $usina, PDO::PARAM_INT);
        $stmt->execute();

        $turbinas = [];
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $linha) {
            $turbinas[] = $this->criarTurbina($linha);
        }

        return $turbinas;
    }

    /**
     * Busca uma turbina pelo id (usado no PATCH /api/turbinas/{id}/estado).
     * Devolve null se ela não existir.
     */
    public function buscarPorId(int $id): ?Turbina
    {
        $sql = 'SELECT id, usina, nome, modelo, energiaNominal, energiaGerada, temperatura, ligada
                FROM turbinas
                WHERE id = :id';

        $stmt = $this->conexao->getConexao()->prepare($sql);
        $stmt->bindValue(':id', $id, PDO::PARAM_INT);
        $stmt->execute();

        $linha = $stmt->fetch(PDO::FETCH_ASSOC);

        if ($linha === false) {
            return null;
        }

        return $this->criarTurbina($linha);
    }

    /**
     * Cadastra a turbina (POST /api/turbinas) pela procedure sp_cadastrar_turbina
     * e devolve o id gerado. Energia gerada, temperatura e estado assumem
     * os valores padrão da tabela (0, 0 e desligada).
     */
    public function cadastrar(Turbina $turbina): int
    {
        $stmt = $this->conexao->getConexao()->prepare(
            'CALL sp_cadastrar_turbina(:usina, :nome, :modelo, :energiaNominal)'
        );
        $stmt->bindValue(':usina', $turbina->getUsina(), PDO::PARAM_INT);
        $stmt->bindValue(':nome', $turbina->getNome(), PDO::PARAM_STR);
        $stmt->bindValue(':modelo', $turbina->getModelo(), PDO::PARAM_STR);
        $stmt->bindValue(':energiaNominal', $turbina->getEnergiaNominal(), PDO::PARAM_INT);
        $stmt->execute();

        // A procedure termina com SELECT LAST_INSERT_ID() AS id
        $linha = $stmt->fetch(PDO::FETCH_ASSOC);
        // Libera a conexão: um CALL que devolve resultado deixa o cursor aberto
        $stmt->closeCursor();

        return (int) $linha['id'];
    }

    /**
     * Grava o estado atual da turbina pela procedure sp_atualizar_turbina:
     * nome, modelo, potência nominal, energia gerada, temperatura e ligada/desligada.
     * Serve para ligar/desligar (RF03) e para o desligamento automático (RN04).
     */
    public function atualizar(Turbina $turbina): void
    {
        $stmt = $this->conexao->getConexao()->prepare(
            'CALL sp_atualizar_turbina(:id, :nome, :modelo, :energiaNominal, :energiaGerada, :temperatura, :ligada)'
        );
        $stmt->bindValue(':id', $turbina->getId(), PDO::PARAM_INT);
        $stmt->bindValue(':nome', $turbina->getNome(), PDO::PARAM_STR);
        $stmt->bindValue(':modelo', $turbina->getModelo(), PDO::PARAM_STR);
        $stmt->bindValue(':energiaNominal', $turbina->getEnergiaNominal(), PDO::PARAM_INT);
        $stmt->bindValue(':energiaGerada', $turbina->getEnergiaGerada(), PDO::PARAM_INT);
        // DECIMAL(10,2): vai como texto para não perder precisão
        $stmt->bindValue(':temperatura', (string) $turbina->getTemperatura(), PDO::PARAM_STR);
        // BOOLEAN no MySQL é TINYINT(1): manda 1 ou 0
        $stmt->bindValue(':ligada', $turbina->isLigada() ? 1 : 0, PDO::PARAM_INT);
        $stmt->execute();
        $stmt->closeCursor();
    }

    /**
     * Converte uma linha do banco em Turbina. O PDO costuma devolver tudo
     * como string, então cada campo é convertido para o tipo certo.
     */
    private function criarTurbina(array $linha): Turbina
    {
        return new Turbina(
            (int) $linha['id'],
            (int) $linha['usina'],
            (string) $linha['nome'],
            (string) $linha['modelo'],
            (int) $linha['energiaNominal'],
            (int) $linha['energiaGerada'],
            (float) $linha['temperatura'],
            (bool) (int) $linha['ligada']
        );
    }
}