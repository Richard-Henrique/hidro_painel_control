<?php
declare(strict_types=1);
require_once __DIR__ . "/../Model/Repositorios/UsuarioRepository.php";
require_once __DIR__ . "/../Model/Entidades/Usuario.php";

class AuthService {
    private UsuarioRepository $repository;

    public function __construct(UsuarioRepository $repository){
        $this->repository = $repository; 
    }

    public function autenticar(string $email, string $senha):?Usuario{
        $usuario = $this->repository->buscarPorEmail($email);

        if($usuario === null){
            return null;
        }

        if(!password_verify($senha,$usuario->getSenha())) {
            return null;
        }

        return $usuario;
    }
}