<?php
declare(strict_types=1);
try{
    $controllers = require __DIR__ . "/src/bootstrap.php";
    require __DIR__ . "/src/Routes/routes.php";
    
}catch(Throwable $e){
    http_response_code(500);

    echo json_encode(['erro' => 'Ops! alguma coisa deu errado', 'detalhe' => $e->getMessage()], JSON_UNESCAPED_UNICODE);

    error_log($e->getMessage());
}