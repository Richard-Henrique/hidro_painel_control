<?php
declare(strict_types=1);
function normalizarRota($rota):string {
    // Extrai apenas o caminho (ignora query strings como ?id=1)
    $path = parse_url($rota, PHP_URL_PATH);

    $pastaBase = dirname($_SERVER['SCRIPT_NAME']);
    
    if(str_starts_with($path,$pastaBase)){
        $path = substr($path,strlen($pastaBase));
    }

    $path = rtrim($path,'/');

    return $path;
}

//mapa de rotas da API 
$rotas = [
    'POST /api/login' => [$controllers['auth'],'login'],
    'GET /api/usina' => [$controllers['usina'],'mostrar'],
    'GET /api/turbinas' => [$controllers['turbina'],'listar'],
    'POST /api/turbinas' => [$controllers['turbina'],'cadastrar'],
    'GET /api/alertas' => [$controllers['alerta'],'listar']
];

$caminhoRecebido = normalizarRota($_SERVER['REQUEST_URI']);
$rotaRecebida = $_SERVER['REQUEST_METHOD'] . " " . $caminhoRecebido;

// Rota com parâmetro na URL: o mapa acima só aceita caminhos exatos,
// então o id da turbina é extraído aqui com uma expressão regular
if ($_SERVER['REQUEST_METHOD'] === 'PATCH'
    && preg_match('#^/api/turbinas/(\d+)/estado$#', $caminhoRecebido, $partes)) {
    $controllers['turbina']->alterarEstado((int) $partes[1]);
    return;
}

// Verifica se a rota existe no mapa
if (array_key_exists($rotaRecebida, $rotas)) {
    // Executa a função associada àquela rota automaticamente
    $rotas[$rotaRecebida]();
    return;
} else {
    // Se não achar, envia um erro de API padrão (404 Not Found)
    http_response_code(404);
    echo json_encode(["erro" => "Rota não encontrada"],JSON_UNESCAPED_UNICODE);
}