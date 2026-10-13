<?php
declare(strict_types=1);

require_once __DIR__ . "/../Entidades/Usuario.php";
require_once __DIR__ . "/../../Database/IConexao.php";


class UsuarioRepository {
    private IConexao $conexao;

    public function __construct(IConexao $conexao){
        $this->conexao = $conexao;
    }

    public function buscarPorEmail(string $email):?Usuario{
        $sql = 'SELECT id, usina, nome, email, senha FROM usuarios WHERE email = :email';
        $stmt = $this->conexao->getConexao()->prepare($sql);
        $stmt->execute(['email' => $email]);
        $result = $stmt->fetch();

        if($result === false){
            return null;
        }

        return new Usuario($result['id'],$result['usina'],$result['nome'],$result['email'],$result['senha']);
    }
}