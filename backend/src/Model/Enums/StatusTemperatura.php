<?php

declare(strict_types=1);

// Resultado da RN02 (classificação da temperatura da turbina)
enum StatusTemperatura: string
{
    case NORMAL = 'Normal';
    case ATENCAO = 'Atenção';
    case CRITICO = 'Crítico';
}