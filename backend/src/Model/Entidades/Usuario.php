<?php
declare(strict_types=1);

class Usuario {
    private int $id;
    private int $usina;
    private string $nome;
    private string $email;
    private string $senha;

    public function __construct(int $id, int $usina, string $nome, string $email, string $senha){
        $this->id = $id;
        $this->usina = $usina;
        $this->nome = $nome;
        $this->email = $email;
        $this->senha = $senha;
    }

    public function getId():int{
        return $this->id;
    }

    public function getUsina():int{
        return $this->usina;
    }

    public function getNome():string{
        return $this->nome;
    }

    public function getEmail():string{
        return $this->email;
    }

    public function getSenha():string{
        return $this->senha;
    }
}