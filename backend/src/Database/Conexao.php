<?php
declare(strict_types=1);
require_once __DIR__ . "/IConexao.php";

final class Conexao implements IConexao {
    //Variavel para armazenar a instancia da classe Conexão
    private static ?Conexao $instancia = null;

    //Variavel para armazena a Instancia do PDO (conexão com o banco de dados)
    private PDO $pdo;

    //Metodo construtor que cria uma instancia da classe PDO (conexão com o banco de dados)
    private function __construct(){

        $dbName = $_ENV['DB_NAME'];
        $dbHost = $_ENV['DB_HOST'];
        $dbPass = $_ENV['DB_PASS'];
        $dbCharset = $_ENV['DB_CHARSET'];
        $dbUser = $_ENV['DB_USER'];
        $dbPort = $_ENV['DB_PORT'];

        //Variavel para armazenar os dados basicos para conexão com o banco de dados
        $dsn = "mysql:host={$dbHost};port={$dbPort};"
                ."dbname={$dbName};charset={$dbCharset}";
        
        //Array associativo para armazenar configurações adicionais de segurança a ataques contra o banco de dados
        $opcoes = [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false
        ];

        //Bloco de código instanciando a classe PDO
        try{
            $this->pdo = new PDO($dsn,$dbUser,$dbPass,$opcoes);
        } //Caso algum erro seja capturado o sistema cai no catch
        catch(PDOException $e){
            //Exceção generica manual para evitar expor o host ou o usuario na mensagem de erro original do PDO
            throw new RuntimeException('Falha ao conectar com o banco de dados.', 0, $e);
        }
    }

    //Metodo clone privado para impedir clones da conexão com o banco de dados
    private function __clone(){}

    //Metodo com exceção para impedir serialização da conexão com o banco de dados
    //Serialização === transformar em string.
    public function __serialize(){
        //Erro manual para impedir que o objeto da conexão com o banco e dados seja serializada
        throw new Exception('Não é permitido serializar a Conexão com o banco.');
    }

    //Bloqueia também a desserialização por segurança
    public function __unserialize(array $data): void {
        throw new Exception("Não é permitido desserializar a Conexão com o banco.");
    }

    //Metodo estatico para obter a instancia da classe Conexao
    public static function getInstancia():Conexao{
        //Caso a instancia não existe criamos uma
        if(self::$instancia === null){
            self::$instancia = new Conexao();
        }

        //se já existe só retornamos ela
        return self::$instancia;
    }


    //Metodo para retorna a conexão do PDO
    public function getConexao():PDO{
        return $this->pdo;
    }
}