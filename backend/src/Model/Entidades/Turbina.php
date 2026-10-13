<?php

declare(strict_types=1);

class Turbina
{
    private ?int $id;
    private int $usina;
    private string $nome;
    private string $modelo;
    private int $energiaNominal;
    private int $energiaGerada;
    private float $temperatura;
    private bool $ligada;

    public function __construct(
        ?int $id,
        int $usina,
        string $nome,
        string $modelo,
        int $energiaNominal,
        int $energiaGerada,
        float $temperatura,
        bool $ligada
    ) {
        $this->id = $id;
        $this->usina = $usina;
        $this->nome = $nome;
        $this->modelo = $modelo;
        $this->energiaNominal = $energiaNominal;
        $this->energiaGerada = $energiaGerada;
        $this->temperatura = $temperatura;
        $this->ligada = $ligada;
    }

    public function getId(): ?int
    {
        return $this->id;
    }

    public function getUsina(): int
    {
        return $this->usina;
    }

    public function getNome(): string
    {
        return $this->nome;
    }

    public function getModelo(): string
    {
        return $this->modelo;
    }

    public function getEnergiaNominal(): int
    {
        return $this->energiaNominal;
    }

    public function getEnergiaGerada(): int
    {
        return $this->energiaGerada;
    }

    public function getTemperatura(): float
    {
        return $this->temperatura;
    }

    public function isLigada(): bool
    {
        return $this->ligada;
    }

    // Setters apenas dos campos que o Service altera (RF03, RN02 e RN04)
    public function setEnergiaGerada(int $energiaGerada): void
    {
        $this->energiaGerada = $energiaGerada;
    }

    public function setTemperatura(float $temperatura): void
    {
        $this->temperatura = $temperatura;
    }

    public function setLigada(bool $ligada): void
    {
        $this->ligada = $ligada;
    }
}