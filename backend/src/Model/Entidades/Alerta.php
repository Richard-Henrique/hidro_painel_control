<?php

declare(strict_types=1);

/**
 * Entidade Alerta.
 * Espelha a tabela `alertas` e acrescenta o nome da turbina, que não é coluna
 * do alerta: vem da view vw_historico_alertas (JOIN com turbinas).
 * Representa sempre um alerta já gravado (tem id e data de emissão).
 */
class Alerta
{
    private int $id;
    private ?int $turbina;          // null: alerta do reservatório (RN01) ou turbina já apagada
    private ?string $nomeTurbina;   // null quando $turbina é null
    private string $mensagem;
    private string $status;         // 'Normal' | 'ALERTA' | 'CRITICO'
    private string $dataEmissao;    // 'Y-m-d H:i:s', preenchida pelo banco

    public function __construct(
        int $id,
        ?int $turbina,
        ?string $nomeTurbina,
        string $mensagem,
        string $status,
        string $dataEmissao
    ) {
        $this->id = $id;
        $this->turbina = $turbina;
        $this->nomeTurbina = $nomeTurbina;
        $this->mensagem = $mensagem;
        $this->status = $status;
        $this->dataEmissao = $dataEmissao;
    }

    public function getId(): int
    {
        return $this->id;
    }

    public function getTurbina(): ?int
    {
        return $this->turbina;
    }

    public function getNomeTurbina(): ?string
    {
        return $this->nomeTurbina;
    }

    public function getMensagem(): string
    {
        return $this->mensagem;
    }

    public function getStatus(): string
    {
        return $this->status;
    }

    public function getDataEmissao(): string
    {
        return $this->dataEmissao;
    }
}