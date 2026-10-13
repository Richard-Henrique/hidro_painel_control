<?php

declare(strict_types=1);

/**
 * Entidade Usina.
 * Espelha a tabela `usinas` e acrescenta a temperatura máxima, que não é
 * coluna da usina: é calculada a partir das turbinas (MAX(turbinas.temperatura)).
 */
class Usina
{
    private int $id;
    private string $nome;
    private float $nivelAgua;          // percentual (0 a 100)
    private int $geracaoNominal;       // MW
    private int $energiaGerada;        // MW
    private int $turbinas;             // quantidade de turbinas
    private int $vazao;                // m³/s
    private string $statusUsina;       // 'nível baixo' | 'nível normal' | 'nível muito alto'
    private float $temperaturaMaxima;  // °C

    public function __construct(
        int $id,
        string $nome,
        float $nivelAgua,
        int $geracaoNominal,
        int $energiaGerada,
        int $turbinas,
        int $vazao,
        string $statusUsina,
        float $temperaturaMaxima
    ) {
        $this->id = $id;
        $this->nome = $nome;
        $this->nivelAgua = $nivelAgua;
        $this->geracaoNominal = $geracaoNominal;
        $this->energiaGerada = $energiaGerada;
        $this->turbinas = $turbinas;
        $this->vazao = $vazao;
        $this->statusUsina = $statusUsina;
        $this->temperaturaMaxima = $temperaturaMaxima;
    }

    public function getId(): int
    {
        return $this->id;
    }

    public function getNome(): string
    {
        return $this->nome;
    }

    public function getNivelAgua(): float
    {
        return $this->nivelAgua;
    }

    public function getGeracaoNominal(): int
    {
        return $this->geracaoNominal;
    }

    public function getEnergiaGerada(): int
    {
        return $this->energiaGerada;
    }

    public function getTurbinas(): int
    {
        return $this->turbinas;
    }

    public function getVazao(): int
    {
        return $this->vazao;
    }

    public function getStatusUsina(): string
    {
        return $this->statusUsina;
    }

    public function getTemperaturaMaxima(): float
    {
        return $this->temperaturaMaxima;
    }
}