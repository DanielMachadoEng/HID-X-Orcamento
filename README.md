# HID X Orçamento

Aplicativo desktop para orçamento SICRO e dashboard de drenagem, com leitura de Notas de Serviço e consumos IPR 736.

## Desenvolvimento

Requer Node.js e pnpm.

```powershell
pnpm install
pnpm check
pnpm start
```

Para gerar o instalador NSIS para Windows:

```powershell
pnpm dist
```

O aplicativo aceita planilhas `.xlsx`. Arquivos `.xls` binários não são suportados.

O pacote desktop contém somente os módulos Orçamento e Dashboard. Os cálculos de Hidrologia e Hidráulica pertencem a outro aplicativo e não fazem parte desta distribuição.
