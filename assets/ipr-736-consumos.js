(function () {
  'use strict';

  window.IPR736_CONSUMOS = {
    versao: '2026-08-30',
    metodologia: 'Coeficientes unitários transcritos das tabelas de consumo dos desenhos-tipo IPR 736. A associação exige código exato ou alias explícito.',
    fontes: {
      emenda2: {
        titulo: 'IPR 736 — Emenda 2 / Republicação',
        arquivo: 'ipr_736_emenda-2_republicacao (1).pdf',
      },
      consolidado2025: {
        titulo: 'IPR 736 atualizado com Emenda 4 e Errata 2/2025',
        arquivo: 'ipr_736_atualizadocomaemenda4_errata_2_2025.pdf',
      },
      emenda3: {
        titulo: 'IPR 736 — Emenda 3',
        arquivo: 'emenda_3_ipr_736.pdf',
      },
    },
    dispositivos: [
      { codigo: 'MFC01', aliases: ['MFC 01', 'MFC-01'], unidade: 'm', fonte: 'emenda2', pagina: 18, consumos: { escavacao: 0.0975, concreto20: 0.1025, forma: 0.7356 } },
      { codigo: 'MFC03', aliases: ['MFC 03', 'MFC-03'], unidade: 'm', fonte: 'emenda2', pagina: 18, consumos: { escavacao: 0.0300, concreto20: 0.0420, forma: 0.5615 } },
      { codigo: 'MFC05', aliases: ['MFC 05', 'MFC-05'], unidade: 'm', fonte: 'emenda2', pagina: 19, consumos: { escavacao: 0.0180, concreto20: 0.0334, forma: 0.5141 } },
      { codigo: 'STC73-15', aliases: ['STC 73-15', 'STC 73 15', 'STC73 15'], unidade: 'm', fonte: 'emenda2', pagina: 12, consumos: { escavacao: 0.1276, concreto20: 0.0728, guiaMadeira: 0.4920, apiloamento: 0.9839 } },
      { codigo: 'TSS120', aliases: ['TSS 120', 'TSS-120'], unidade: 'm', fonte: 'emenda2', pagina: 17, consumos: { escavacao: 0.4998, concreto20: 0.7579, concreto25: 0.2520, forma: 3.1656, acoCa50: 24.4548 } },
      { codigo: 'VPCG120-30', aliases: ['VPCG 120-30', 'VPCG 120 30', 'VPCG120 30'], unidade: 'm', fonte: 'emenda2', pagina: 6, consumos: { escavacao: 0.2700, apiloamento: 1.4485, grama: 2.8970 } },
      { codigo: 'VPCC120-30', aliases: ['VPCC 120-30', 'VPCC 120 30', 'VPCC120 30'], unidade: 'm', fonte: 'emenda2', pagina: 7, consumos: { escavacao: 0.3976, concreto20: 0.1276, guiaMadeira: 0.8706 } },
      { codigo: 'EDA07A', aliases: ['EDA 07A', 'EDA-07A', 'EDA 07 A'], unidade: 'un', fonte: 'emenda2', pagina: 22, consumos: { escavacao: 0.9110, apiloamento: 5.3850, forma: 4.3748, concreto20: 0.8822 } },
      { codigo: 'CCS200-60-A', aliases: ['CCS 200-60-A', 'CCS200 60 A', 'CCS 200 60 A'], unidade: 'un', fonte: 'emenda2', pagina: 38, consumos: { escavacao: 14.8200, concretoMagro: 0.2688, forma: 22.2304, acoCa50: 124.5278, concreto20: 2.2760, concreto25: 0.0924 } },
      { codigo: 'BLS01', aliases: ['BLS 01', 'BLS-01'], unidade: 'un', fonte: 'consolidado2025', pagina: 67, consumos: { alvenariaBlocos: 3.81, argamassa: 0.06, forma: 3.10, acoCa50: 4.10, concreto15: 0.250, concreto22: 0.060 } },
      { codigo: 'BLS02', aliases: ['BLS 02', 'BLS-02'], unidade: 'un', fonte: 'consolidado2025', pagina: 67, consumos: { alvenariaBlocos: 5.68, argamassa: 0.09, forma: 3.10, acoCa50: 4.10, concreto15: 0.250, concreto22: 0.060 } },
      { codigo: 'BLSG01', aliases: ['BLSG 01', 'BLSG-01'], unidade: 'un', fonte: 'consolidado2025', pagina: 69, consumos: { alvenariaBlocos: 3.81, argamassa: 0.06, forma: 3.10, acoCa50: 4.10, concreto15: 0.250, concreto22: 0.060 } },
      { codigo: 'BLSG02', aliases: ['BLSG 02', 'BLSG-02'], unidade: 'un', fonte: 'consolidado2025', pagina: 69, consumos: { alvenariaBlocos: 5.68, argamassa: 0.09, forma: 3.10, acoCa50: 4.10, concreto15: 0.250, concreto22: 0.060 } },
      { codigo: 'CLP05', aliases: ['CLP 05', 'CLP-05'], unidade: 'un', fonte: 'consolidado2025', pagina: 71, consumos: { forma: 24.65, acoCa50: 11.6, concreto15: 2.820 } },
      { codigo: 'CLP06', aliases: ['CLP 06', 'CLP-06'], unidade: 'un', fonte: 'consolidado2025', pagina: 71, consumos: { forma: 32.70, acoCa50: 16.2, concreto15: 3.410 } },
      { codigo: 'CLP18', aliases: ['CLP 18', 'CLP-18'], unidade: 'un', fonte: 'consolidado2025', pagina: 71, consumos: { forma: 38.27, acoCa50: 16.2, concreto15: 4.290 } },
      { codigo: 'PVI03', aliases: ['PVI 03', 'PVI-03'], unidade: 'un', fonte: 'consolidado2025', pagina: 72, consumos: { forma: 16.63, acoCa50: 17.5, concreto15: 2.080 } },
      { codigo: 'PVI04', aliases: ['PVI 04', 'PVI-04'], unidade: 'un', fonte: 'consolidado2025', pagina: 72, consumos: { forma: 19.64, acoCa50: 22.9, concreto15: 2.480 } },
      { codigo: 'CPV01', aliases: ['CPV 01', 'CPV-01', 'CHAMINE POCO DE VISITA CPV 01', 'CHAMINÉ POÇO DE VISITA CPV 01'], unidade: 'un', fonte: 'consolidado2025', pagina: 73, consumos: { alvenariaBlocos: 3.93, argamassa: 0.06, forma: 2.59, acoCa50: 5.4, concreto15: 0.190, tampaFerro: 104 } },
    ],
  };
})();
