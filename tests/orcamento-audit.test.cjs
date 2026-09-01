'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const raiz = path.resolve(__dirname, '..');

function carregarAplicacao(script = 'assets/orcamento-prototype.src.js') {
  const contexto = {
    window: {
      localStorage: { getItem() { return null; }, setItem() {} },
    },
    document: { getElementById() { return { value: '0' }; } },
    console,
  };
  contexto.window.window = contexto.window;
  vm.createContext(contexto);
  for (const arquivo of ['assets/sicro-catalog.js', 'assets/ipr-736-consumos.js', script]) {
    vm.runInContext(fs.readFileSync(path.join(raiz, arquivo), 'utf8'), contexto, { filename: arquivo });
  }
  return contexto.window.HIDXOrcamento;
}

function planilhaFalsa(nome, linhas, rowCount = null, columnCount = 20) {
  const indices = Object.keys(linhas).map(Number);
  return {
    name: nome,
    rowCount: rowCount ?? Math.max(0, ...indices),
    columnCount,
    getCell(linha, coluna) { return { value: linhas[linha]?.[coluna] ?? null }; },
  };
}

function quaseIgual(atual, esperado, tolerancia = 1e-9) {
  assert.ok(Math.abs(atual - esperado) <= tolerancia, `${atual} deveria ser ${esperado}`);
}

function testar(script) {
  const api = carregarAplicacao(script);

  const compactos = [
    ['MFC3', 'm', /MFC 03/],
    ['BLS2', 'un', /BLS 02/],
    ['BLSG2', 'un', /BLSG 02/],
    ['CLP6', 'un', /CLP 06/],
    ['PVI4', 'un', /PVI 04/],
    ['EDA7A', 'un', /EDA 07 A/],
    ['STC7315', 'm', /STC 73-15/],
    ['STC 73x15', 'm', /STC 73-15/],
    ['VPCG12030', 'm', /VPCG 120-30/],
    ['VPCC12030', 'm', /VPCC 120-30/],
    ['CCS20060A', 'un', /CCS 200-60 A/],
    ['CCS200x60A', 'un', /CCS 200-60 A/],
    ['CCS 200 x 60 A', 'un', /CCS 200-60 A/],
  ];
  for (const [consulta, unidade, descricaoEsperada] of compactos) {
    const resultado = api.resolverEntrada(consulta, '', unidade);
    assert.ok(resultado.selecionado, `${consulta} deveria encontrar uma composição`);
    assert.match(resultado.selecionado.descricao, descricaoEsperada, consulta);
  }

  const familiaAmbigua = api.resolverEntrada('CCS20060A', '', 'un');
  assert.ok(familiaAmbigua.confianca < 1, 'família com material/execução alternativos não pode ter confiança 1');
  assert.match(familiaAmbigua.metodo, /revisar/i);
  const materialExplicito = api.resolverEntrada('MFC03 areia extraída e brita produzida fôrma de madeira', '', 'm');
  assert.match(materialExplicito.selecionado.descricao, /areia extraída e brita produzida/i);
  assert.ok(materialExplicito.confianca > familiaAmbigua.confianca);

  const unidadeIncompativel = api.resolverEntrada('MFC03', '', 'un');
  assert.equal(unidadeIncompativel.selecionado, null);
  assert.match(unidadeIncompativel.metodo, /unidade incompatível/i);
  for (const consultaGenerica of ['concreto', 'caixa', 'drenagem']) {
    assert.equal(api.resolverEntrada(consultaGenerica, '', 'un').selecionado, null, `${consultaGenerica} é ambíguo`);
  }
  const descricoesSemCodigo = [
    ['caixa ligacao passagem 05', 'un', /CLP 05/],
    ['boca lobo simples grelha 01', 'un', /BLSG 01/],
    ['sarjeta triangular concreto 73 15', 'm', /STC 73-15/],
    ['valeta protecao corte concreto 120 30', 'm', /VPCC 120-30/],
    ['meio fio concreto 01', 'm', /MFC 01/],
    ['entrada descida agua 07 A', 'un', /EDA 07 A/],
    ['chamine poco visita 01', 'un', /CPV 01/],
  ];
  for (const [consulta, unidade, descricaoEsperada] of descricoesSemCodigo) {
    const resultado = api.resolverEntrada(consulta, '', unidade);
    assert.ok(resultado.selecionado, `${consulta} deveria identificar uma família SICRO`);
    assert.match(resultado.selecionado.descricao, descricaoEsperada, consulta);
    assert.match(resultado.metodo, /revisar/i, `${consulta} deve manter material/execução para revisão`);
  }

  assert.equal(api.buscarConsumoIpr('MFC3').codigo, 'MFC03');
  assert.equal(api.buscarConsumoIpr('CCS20060A').codigo, 'CCS200-60-A');
  assert.equal(api.buscarConsumoIpr('STC73x15').codigo, 'STC73-15');
  const memoriaMfc = api.aplicarConsumosIpr({ dispositivo: 'MFC3', unidadePrincipal: 'm', quantidade: 100 });
  quaseIgual(memoriaMfc.escavacao, 3);
  quaseIgual(memoriaMfc.concreto20, 4.2);
  quaseIgual(memoriaMfc.area, 56.15);
  const memoriaCcs = api.aplicarConsumosIpr({ dispositivo: 'CCS20060A', unidadePrincipal: 'un', quantidade: 2 });
  quaseIgual(memoriaCcs.escavacao, 29.64);
  quaseIgual(memoriaCcs.concreto25, 0.1848);
  quaseIgual(memoriaCcs.aco, 249.0556);
  assert.equal(api.aplicarConsumosIpr({ dispositivo: 'MFC3', unidadePrincipal: 'un', quantidade: 1 }).consumoIpr, null);

  const resumoLongo = planilhaFalsa('RESUMO', {
    1: { 2: 'RESUMO DE DRENAGEM' },
    2: { 2: 'DISPOSITIVO / SERVIÇO', 3: 'QUANTIDADE' },
    600: { 2: 'PVI 03', 3: 7 },
  }, 650, 7);
  const extraidoLongo = api.extrairResumoPlanilha(resumoLongo);
  assert.equal(extraidoLongo.itens.length, 1);
  assert.equal(extraidoLongo.itens[0].linha, 600);
  assert.equal(extraidoLongo.totais.quantidade, 7);

  const lineares = planilhaFalsa('LINEARES A', {
    8: { 1: 'NOTA DE SERVIÇO DE DRENAGEM' },
    10: { 5: 'EXTENSÃO', 6: 'TIPO' },
    11: { 5: 100, 6: 'MFC3' },
  });
  const redes = planilhaFalsa('REDES B', {
    8: { 1: 'NOTAS DE SERVIÇO DE DRENAGEM' },
    11: { 6: 'MFC03', 11: 50 },
  });
  const resumoNotas = api.extrairNotasServico([lineares, redes]);
  assert.equal(resumoNotas.abasReconhecidas.length, 2, 'título singular após a sexta linha deve ser reconhecido');
  assert.equal(resumoNotas.itens.length, 1, 'aliases equivalentes devem ser consolidados');
  assert.equal(resumoNotas.itens[0].dispositivo, 'MFC03');
  assert.equal(resumoNotas.itens[0].quantidade, 150);
  quaseIgual(resumoNotas.totais.escavacao, 4.5);
  quaseIgual(resumoNotas.totais.concreto20, 6.3);
  assert.deepEqual([...resumoNotas.itens[0].quantidadesPorCategoria.values()], [100, 50]);

  const caixas = planilhaFalsa('CAIXA COLETORA', {
    1: { 1: 'NOTAS DE SERVIÇO DE DRENAGEM - CAIXAS' },
    2: { 3: 'Projeto Tipo', 13: 'Cota (m)' },
    3: { 3: 'CCS-01', 13: 127.55 },
    4: { 3: 'CLP-06', 13: 128.9 },
  });
  const entradas = planilhaFalsa('ENTRADAS DESCIDAS E DISS', {
    1: { 1: 'NOTAS DE SERVIÇO DE DRENAGEM - ENTRADAS, DESCIDAS E DISSIPADORES' },
    3: { 3: 'Saída / Entrada', 5: 'Descida', 8: 'Dissipador', 11: 'Saída / Entrada', 12: 'Descida', 16: 'Dissipador' },
    4: { 3: 'Tipo', 4: 'Tipo', 7: 'Ext. (m)', 8: 'Tipo', 11: 'Tipo', 12: 'Tipo', 15: 'Ext. (m)', 16: 'Tipo' },
    6: { 3: 'EDA-01', 4: 'DCD-02', 7: 5, 8: 'DED-01', 11: 'EDA-02', 12: 'DAR-03', 15: 4, 16: 'DEB-04' },
  });
  const bueiros = planilhaFalsa('BUEIROS DE GREIDE', {
    1: { 1: 'BUEIROS DE GREIDE - RODOVIA ES - NOTA DE SERVIÇO' },
    5: { 5: 'IMPLANTAR', 6: 'BSTC Ø 1,20', 11: 25, 12: 'ALA BSTC Ø 1,20', 13: 'IMPLANTAR', 14: 'ALA BSTC Ø 1,20', 15: 'IMPLANTAR' },
    6: { 5: 'EXISTENTE', 6: 'BSTC Ø 0,80', 11: 10, 12: 'ALA BSTC Ø 0,80', 13: 'EXISTENTE' },
  }, 10, 20);
  const resumoEstruturas = api.extrairNotasServico([caixas, entradas, bueiros]);
  assert.equal(resumoEstruturas.abasReconhecidas.length, 3, 'caixas, entradas e bueiros devem ser reconhecidos');
  const porDispositivo = new Map(resumoEstruturas.itens.map((item) => [`${api.normalizar(item.dispositivo)}|${item.unidadePrincipal}`, item]));
  assert.equal(porDispositivo.get('CCS 01|un').quantidade, 1);
  assert.equal(porDispositivo.get('CLP06|un').quantidade, 1);
  assert.equal(porDispositivo.get('EDA 01|un').quantidade, 1);
  assert.equal(porDispositivo.get('DCD 02|m').quantidade, 5);
  assert.equal(porDispositivo.get('DAR 03|m').quantidade, 4);
  assert.equal(porDispositivo.get('DED 01|un').quantidade, 1);
  assert.equal(porDispositivo.get('DEB 04|un').quantidade, 1);
  assert.equal(porDispositivo.get('BSTC 1 20|m').quantidade, 25);
  assert.equal(porDispositivo.get('ALA BSTC 1 20|un').quantidade, 2);
  assert.ok(!resumoEstruturas.itens.some((item) => /127|128/.test(item.dispositivo)), 'cotas não podem virar dispositivos');
  assert.ok(!resumoEstruturas.itens.some((item) => api.normalizar(item.dispositivo).includes('0 80')), 'bueiro existente não pode entrar no orçamento');

  const legados = [
    ['DCD-02', 'm', /DCD 60-30/],
    ['DAR-03', 'm', /DAR 60-30/],
    ['DAD-02', 'm', /DAD 60-36/],
    ['DAD-04', 'm', /DAD 110-26/],
    ['DAD-06', 'm', /DAD 125-30/],
    ['DAD-16', 'm', /DAD 370-45/],
    ['DEB-03', 'un', /DEB 180-263/],
    ['DEB-04', 'un', /DEB 240-316/],
    ['VPC-03', 'm', /VPCC 160-30/],
    ['CCS-01', 'un', /CCS 200-60/],
    ['CCS-10', 'un', /CCS 300-80/],
  ];
  for (const [consulta, unidade, descricaoEsperada] of legados) {
    const resultado = api.resolverEntrada(consulta, '', unidade);
    assert.ok(resultado.selecionado, `${consulta} deveria usar a equivalência oficial de nomenclatura`);
    assert.match(resultado.selecionado.descricao, descricaoEsperada);
    assert.match(resultado.metodo, /legado/i);
  }
  const alaBueiro = api.resolverEntrada('ALA BSTC Ø 1,20', '', 'un');
  assert.ok(alaBueiro.selecionado, 'ala de bueiro deve sugerir uma boca compatível por diâmetro');
  assert.match(alaBueiro.selecionado.descricao, /adaptável em BSTC D = 1,20 m/i);
  assert.match(alaBueiro.metodo, /revisar/i, 'geometria da boca deve continuar em revisão');
  for (const excluido of [['TSS-01', 'm'], ['STC-04', 'm'], ['STC-07', 'm'], ['DEB-01', 'un'], ['DEB-02', 'un']]) {
    const resultado = api.resolverEntrada(excluido[0], '', excluido[1]);
    assert.equal(resultado.selecionado, null);
    assert.match(resultado.metodo, /excluído/i);
  }
  assert.equal(api.resolverEntrada('CANALETA DP-01', '', 'm').selecionado, null, 'código de família desconhecida não deve selecionar outra sigla');

  const servicoMfc = api.resolverEntrada('MFC3', '', 'm').selecionado;
  api.estado.itens = [{
    id: 1,
    dispositivo: 'MFC03',
    quantidade: 150,
    bdi: 0,
    selecionado: servicoMfc,
    resumoCategoria: resumoNotas.itens[0].categoria,
    quantidadesPorCategoria: resumoNotas.itens[0].quantidadesPorCategoria,
  }];
  api.estado.resumo = resumoNotas;
  const dashboard = api.dadosDashboard();
  assert.equal(dashboard.custosPorCategoria.length, 2);
  quaseIgual(dashboard.custosPorCategoria.reduce((soma, item) => soma + item.valor, 0), dashboard.totalCom);
  const custos = new Map(dashboard.custosPorCategoria.map((item) => [item.rotulo, item.valor]));
  quaseIgual(custos.get('Meio-fio e sarjetas') / custos.get('Drenagem subterrânea'), 2);

  api.estado.resumo = null;
  api.estado.itens = [
    { id: 1, dispositivo: 'A', quantidade: 1, bdi: 0, selecionado: { codigo: 'A', descricao: 'A', unidade: 'un', preco_sem_bdi: 80 } },
    { id: 2, dispositivo: 'B', quantidade: 1, bdi: 0, selecionado: { codigo: 'B', descricao: 'B', unidade: 'un', preco_sem_bdi: 15 } },
    { id: 3, dispositivo: 'C', quantidade: 1, bdi: 0, selecionado: { codigo: 'C', descricao: 'C', unidade: 'un', preco_sem_bdi: 5 } },
  ];
  const pareto = api.dadosPareto();
  assert.deepEqual(pareto.grupos.map((grupo) => grupo.classe), ['A', 'B', 'C']);
  quaseIgual(pareto.total, 100);

  api.estado.itens = [{ id: 1, dispositivo: 'Teste', quantidade: 3, bdi: 20, selecionado: { codigo: 'T', descricao: 'Teste', unidade: 'un', preco_sem_bdi: 10.005 } }];
  const totais = api.dadosDashboard();
  quaseIgual(totais.totalSem, 30.015);
  quaseIgual(totais.totalCom, 36.01);
}

const script = process.argv[2] || 'assets/orcamento-prototype.src.js';
testar(script);
console.log(`OK: auditoria de matching, IPR 736, consolidação, totais e Curva ABC (${script})`);
