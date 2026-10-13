<?php
declare(strict_types=1);
require_once __DIR__ . "/../Service/AuthService.php";

class AuthController {
    private AuthService $service;

    public function __construct(AuthService $service){
        $this->service = $service;
    }

    public function login():void{
        $texto = file_get_contents('php://input');

        $dados = json_decode($texto,true);


        if(!is_array($dados)){
            $this->resposta(400,['erro' => 'Formato da requisição inválido']);
            return;
        }

        if(!isset($dados['email'], $dados['senha'])){
            $this->resposta(400,['erro' => 'dados inválidos']);
            return;
        }

        if(!is_string($dados['email']) || !is_string($dados['senha'])){
            $this->resposta(400,['erro' => 'dados inválidos']);
            return;
        }

        $email = trim($dados['email']);
        $senha = $dados['senha'];

        if( $email === ''|| $senha === '' ){
            $this->resposta(400,['erro' => 'dados inválidos']);
            return;
        }
        

        try{
            $usuario = $this->service->autenticar($email,$senha);

            if($usuario === null){
                $this->resposta(401,['erro' => 'Email ou senha incorretos']);
                return;
            }

            $id = $usuario->getId();
            $nome = $usuario->getNome();
            $usina = $usuario->getUsina();

            if(session_status() === PHP_SESSION_NONE){
                session_start();
            }
                
            session_regenerate_id(true);
            $_SESSION['id_usuario'] = $id;
            $_SESSION['usina'] = $usina;
            $_SESSION['nome_usuario'] = $nome;

                

            $this->resposta(200,['id' => $id, 'nome' => $nome, 'usina' => $usina]);
            
            

        }catch(Throwable $e){
            $this->resposta(500,[ 'erro' => 'Erro ao autenticar o usuário']);
            error_log($e->getMessage());
        }

    }

    private function resposta(int $status, array $corpo):void{

        http_response_code($status);
        echo json_encode($corpo, JSON_UNESCAPED_UNICODE);
    }
}