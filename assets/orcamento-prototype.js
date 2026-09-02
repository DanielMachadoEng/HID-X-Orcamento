(function () {
  'use strict';

  const BASE = window.SICRO_CATALOGO || { servicos: [], estado: '', data_base: '' };
  const BASE_CONSUMOS = window.IPR736_CONSUMOS || { fontes: {}, dispositivos: [] };
  const STOPWORDS = new Set(['A', 'AS', 'O', 'OS', 'DE', 'DA', 'DAS', 'DO', 'DOS', 'E', 'EM', 'COM', 'PARA', 'POR', 'UM', 'UMA']);
  const CORRELACOES_DISPOSITIVOS = new Map([
    ['CCS', 'Caixa coletora de sarjeta'],
    ['PVI', 'Po\u00e7o de visita'],
    ['CLP', 'Caixa de liga\u00e7\u00e3o e passagem'],
    ['BLSG', 'Boca de lobo simples com grelha de concreto'],
    ['BLS', 'Boca de lobo simples'],
    ['STC', 'Sarjeta triangular de concreto'],
    ['TSS', 'Transposi\u00e7\u00e3o de sarjeta'],
    ['VPCG', 'Valeta de prote\u00e7\u00e3o de cortes com revestimento vegetal'],
    ['VPCC', 'Valeta de prote\u00e7\u00e3o de cortes revestida com concreto'],
    ['MFC', 'Meio-fio de concreto'],
    ['EDA', 'Entrada para descida de \u00e1gua'],
    ['CPV', 'Chamin\u00e9 de po\u00e7o de visita'],
    ['PEAD', 'Tubo PEAD para drenagem'],
    ['BSTC', 'Bueiro simples tubular de concreto'],
    ['BDTC', 'Bueiro duplo tubular de concreto'],
    ['BTTC', 'Bueiro triplo tubular de concreto'],
  ]);
  const CHAVE_PREFERENCIAS = 'hidx-orcamento-correspondencias-v1';
  const TERMOS_EQUIVALENTES = new Map([
    ['CX', ['CAIXA']],
    ['PV', ['POCO', 'VISITA']],
    ['BL', ['BOCA', 'LOBO']],
    ['TUB', ['TUBO']],
    ['TUBULACAO', ['TUBO']],
    ['MEIOFIO', ['MEIO', 'FIO']],
    ['ALA', ['BOCA']],
    ['ALAS', ['BOCA']],
  ]);
  const CODIGOS_LEGADOS_IPR = new Map([
    ['DCD02', 'DCD 60-30'],
    ['DCD04', 'DCD 80-40'],
    ['DAR03', 'DAR 60-30'],
    ['DAD02', 'DAD 60-36'],
    ['DAD04', 'DAD 110-26'],
    ['DAD06', 'DAD 125-30'],
    ['DAD16', 'DAD 370-45'],
    ['DEB03', 'DEB 180-263'],
    ['DEB04', 'DEB 240-316'],
    ['VPC03', 'VPCC 160-30'],
    ['CCS01', 'CCS 200-60'],
    ['CCS02', 'CCS 200-80'],
    ['CCS05', 'CCS 250-60'],
    ['CCS06', 'CCS 250-80'],
    ['CCS09', 'CCS 300-60'],
    ['CCS10', 'CCS 300-80'],
    ['CCS01A', 'CCS 200-60 A'],
    ['CCS01B', 'CCS 200-60 B'],
    ['CCS02A', 'CCS 200-80 A'],
    ['CCS02B', 'CCS 200-80 B'],
    ['CCS05A', 'CCS 250-60 A'],
    ['CCS05B', 'CCS 250-60 B'],
    ['CCS06A', 'CCS 250-80 A'],
    ['CCS06B', 'CCS 250-80 B'],
    ['CCS09A', 'CCS 300-60 A'],
    ['CCS09B', 'CCS 300-60 B'],
    ['CCS10A', 'CCS 300-80 A'],
    ['CCS10B', 'CCS 300-80 B'],
  ]);
  const CODIGOS_EXCLUIDOS_IPR = new Set([
    'DEB01', 'DEB02', 'STC02', 'STC03', 'STC04', 'STC06', 'STC07', 'STC08', 'TSS1', 'TSS01', 'TSS2', 'TSS02',
  ]);
  const catalogo = (BASE.servicos || []).map((servico) => {
    const descricaoNormalizada = normalizar(servico.descricao);
    const tokensPesquisa = tokenizarPesquisa(descricaoNormalizada);
    return {
      ...servico,
      codigo: String(servico.codigo || '').trim(),
      busca: normalizar(`${servico.codigo} ${servico.descricao} ${servico.unidade}`),
      descricaoNormalizada,
      tokensPesquisa,
      tokenSet: new Set(tokensPesquisa),
      radicalSet: new Set(tokensPesquisa.map(radicalToken)),
      numerosPesquisa: new Set(tokensPesquisa.filter((token) => /^\d+$/.test(token))),
      identificadorDispositivo: extrairIdentificadorDispositivo(servico.descricao),
    };
  });
  const porCodigo = new Map(catalogo.map((servico) => [servico.codigo, servico]));
  const indiceCatalogo = criarIndiceCatalogo(catalogo);
  const preferenciasCorrespondencia = carregarPreferenciasCorrespondencia();

  const estado = {
    itens: [],
    aba: 'orcamento',
    resumo: null,
    modalItemId: null,
    inicializado: false,
    proximoId: 1,
    arquivoOrigem: '',
    deteccao: null,
    checklistAberto: false,
    importando: false,
    progressoImportacao: { percentual: 0, etapa: '', situacao: 'oculto' },
  };

  const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const numero = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  const percentual = new Intl.NumberFormat('pt-BR', { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2 });

  function normalizar(valor) {
    return String(valor ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, ' ')
      .trim();
  }

  function normalizarAtualizacaoProgresso(atual, percentual, etapa, situacao = 'processando', reiniciar = false) {
    const anterior = Number(atual?.percentual || 0);
    const solicitado = Math.max(0, Math.min(100, Math.round(Number(percentual) || 0)));
    const valor = situacao === 'concluido' ? 100 : reiniciar ? solicitado : Math.max(anterior, solicitado);
    return {
      percentual: valor,
      etapa: String(etapa || atual?.etapa || ''),
      situacao,
    };
  }

  function atualizarProgressoImportacao(percentual, etapa, situacao = 'processando', reiniciar = false) {
    estado.progressoImportacao = normalizarAtualizacaoProgresso(
      estado.progressoImportacao,
      percentual,
      etapa,
      situacao,
      reiniciar,
    );
    const progresso = estado.progressoImportacao;
    for (const prefixo of ['orc', 'dashboard']) {
      const container = document.getElementById(`${prefixo}ImportProgress`);
      const barra = document.getElementById(`${prefixo}ImportProgressBar`);
      const rotulo = document.getElementById(`${prefixo}ImportProgressStage`);
      const porcentagem = document.getElementById(`${prefixo}ImportProgressPercent`);
      if (container) {
        container.hidden = false;
        container.dataset.status = progresso.situacao;
        container.setAttribute('aria-valuenow', String(progresso.percentual));
        container.setAttribute('aria-valuetext', `${progresso.percentual}% \u2014 ${progresso.etapa}`);
        container.setAttribute('aria-busy', String(progresso.situacao === 'processando'));
      }
      if (barra) barra.style.width = `${progresso.percentual}%`;
      if (rotulo) rotulo.textContent = progresso.etapa;
      if (porcentagem) porcentagem.textContent = `${progresso.percentual}%`;
    }
    const processando = progresso.situacao === 'processando';
    for (const id of ['orcDrop', 'dashboardDrop']) {
      const area = document.getElementById(id);
      if (area) {
        area.classList.toggle('is-loading', processando);
        area.setAttribute('aria-disabled', String(processando));
      }
    }
    for (const id of ['orcArquivo', 'dashboardArquivo']) {
      const entrada = document.getElementById(id);
      if (entrada) entrada.disabled = processando;
    }
    return progresso;
  }

  function cederInterface() {
    return new Promise((resolver) => window.setTimeout(resolver, 0));
  }

  const indiceConsumosIpr = (() => {
    const indice = new Map();
    for (const dispositivo of BASE_CONSUMOS.dispositivos || []) {
      for (const nome of [dispositivo.codigo, ...(dispositivo.aliases || [])]) {
        const chave = normalizar(nome);
        if (chave) indice.set(chave, dispositivo);
      }
    }
    return indice;
  })();

  const indiceConsumosIprCompacto = (() => {
    const candidatos = new Map();
    for (const dispositivo of BASE_CONSUMOS.dispositivos || []) {
      for (const nome of [dispositivo.codigo, ...(dispositivo.aliases || [])]) {
        const identificador = extrairIdentificadorDispositivo(nome);
        for (const chave of chavesCompactasIdentificador(identificador)) {
          if (!candidatos.has(chave)) candidatos.set(chave, dispositivo);
          else if (candidatos.get(chave)?.codigo !== dispositivo.codigo) candidatos.set(chave, null);
        }
      }
    }
    return new Map([...candidatos].filter(([, dispositivo]) => dispositivo));
  })();

  function compactarCodigoDispositivo(valor) {
    return normalizar(valor).split(' ').filter((token) => !['X', 'VEZES', 'POR'].includes(token))
      .join('').replace(/(?<=\d)X(?=\d)/g, '');
  }

  function buscarConsumoIpr(dispositivo) {
    const exato = indiceConsumosIpr.get(normalizar(dispositivo));
    if (exato) return exato;
    return indiceConsumosIprCompacto.get(compactarCodigoDispositivo(dispositivo)) || null;
  }

  function canonicalizarDispositivoNota(dispositivo) {
    const texto = String(dispositivo || '').trim();
    return buscarConsumoIpr(texto)?.codigo || texto.replace(/\s+/g, ' ');
  }

  function carregarPreferenciasCorrespondencia() {
    try {
      const salvo = window.localStorage?.getItem(CHAVE_PREFERENCIAS);
      const dados = salvo ? JSON.parse(salvo) : {};
      return new Map(Object.entries(dados).filter(([, codigo]) => porCodigo.has(String(codigo))));
    } catch (_erro) {
      return new Map();
    }
  }

  function chavePreferencia(dispositivo, unidadeInformada = '') {
    return `${normalizar(dispositivo)}|${chaveUnidade(unidadeInformada)}`;
  }

  function codigoPreferido(dispositivo, unidadeInformada = '') {
    const exato = preferenciasCorrespondencia.get(chavePreferencia(dispositivo, unidadeInformada));
    const semUnidade = preferenciasCorrespondencia.get(chavePreferencia(dispositivo));
    const codigo = exato || semUnidade;
    return codigo && porCodigo.has(codigo) ? codigo : '';
  }

  function lembrarCorrespondencia(dispositivo, unidadeInformada, codigo) {
    const entrada = normalizar(dispositivo);
    if (!entrada || entrada === 'NOVO DISPOSITIVO' || !porCodigo.has(String(codigo))) return;
    preferenciasCorrespondencia.set(chavePreferencia(dispositivo, unidadeInformada), String(codigo));
    try {
      window.localStorage?.setItem(CHAVE_PREFERENCIAS, JSON.stringify(Object.fromEntries(preferenciasCorrespondencia)));
    } catch (_erro) {
      // O prototipo continua funcionando mesmo quando o navegador bloqueia armazenamento local.
    }
  }

  function textoCelula(celula) {
    const valor = celula?.value;
    if (valor == null) return '';
    if (typeof valor === 'object') {
      if ('result' in valor && valor.result != null) return valor.result;
      if (Array.isArray(valor.richText)) return valor.richText.map((parte) => parte.text).join('');
      if ('text' in valor) return valor.text;
      if ('hyperlink' in valor) return valor.text || valor.hyperlink;
    }
    return valor;
  }

  function paraNumero(valor) {
    if (typeof valor === 'number') return Number.isFinite(valor) ? valor : NaN;
    const texto = String(valor ?? '').trim().replace(/\s/g, '');
    if (!texto) return NaN;
    if (texto.includes(',') && texto.includes('.')) return Number(texto.replace(/\./g, '').replace(',', '.'));
    if (texto.includes(',')) return Number(texto.replace(',', '.'));
    return Number(texto);
  }

  function decodificarXml(valor) {
    return String(valor ?? '')
      .replace(/&#x([0-9a-f]+);/gi, (_, codigo) => String.fromCodePoint(parseInt(codigo, 16)))
      .replace(/&#(\d+);/g, (_, codigo) => String.fromCodePoint(parseInt(codigo, 10)))
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&amp;/g, '&');
  }

  function atributoXml(tag, nome) {
    const nomeSeguro = nome.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const encontrado = tag.match(new RegExp(`(?:^|\\s)${nomeSeguro}="([^"]*)"`, 'i'));
    return encontrado ? decodificarXml(encontrado[1]) : '';
  }

  function indiceColunaExcel(referencia) {
    const letras = String(referencia || '').match(/^[A-Z]+/i)?.[0]?.toUpperCase() || '';
    let indice = 0;
    for (const letra of letras) indice = indice * 26 + letra.charCodeAt(0) - 64;
    return indice;
  }

  function caminhoInternoXlsx(destino) {
    const partes = (String(destino || '').startsWith('/') ? String(destino).slice(1) : `xl/${destino}`).split('/');
    const resolvidas = [];
    for (const parte of partes) {
      if (!parte || parte === '.') continue;
      if (parte === '..') resolvidas.pop();
      else resolvidas.push(parte);
    }
    return resolvidas.join('/');
  }

  function lerStringsCompartilhadas(xml) {
    if (!xml) return [];
    const strings = [];
    const itens = xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/gi);
    for (const item of itens) {
      let texto = '';
      for (const trecho of item[1].matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/gi)) texto += decodificarXml(trecho[1]);
      strings.push(texto);
    }
    return strings;
  }

  function valorCelulaXml(atributos, conteudo, stringsCompartilhadas) {
    const tipo = atributoXml(atributos, 't');
    if (tipo === 'inlineStr') {
      let texto = '';
      for (const trecho of conteudo.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/gi)) texto += decodificarXml(trecho[1]);
      return texto;
    }
    const bruto = conteudo.match(/<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/i)?.[1];
    if (bruto == null) return '';
    const valor = decodificarXml(bruto);
    if (tipo === 's') return stringsCompartilhadas[Number(valor)] ?? '';
    if (tipo === 'str' || tipo === 'e') return valor;
    if (tipo === 'b') return valor === '1';
    const numeroConvertido = Number(valor);
    return valor !== '' && Number.isFinite(numeroConvertido) ? numeroConvertido : valor;
  }

  function planilhaDeXml(nome, xml, stringsCompartilhadas, limiteLinha = Infinity) {
    const linhas = new Map();
    let maiorLinha = 0;
    let maiorColuna = 0;
    let linhaSequencial = 0;
    for (const correspondencia of xml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/gi)) {
      const numeroLinha = Number(atributoXml(correspondencia[1], 'r')) || linhaSequencial + 1;
      linhaSequencial = numeroLinha;
      if (numeroLinha > limiteLinha) break;
      const valores = new Map();
      let colunaSequencial = 0;
      for (const celula of correspondencia[2].matchAll(/<c\b([^>]*?)(?:\/\s*>|>([\s\S]*?)<\/c>)/gi)) {
        const referencia = atributoXml(celula[1], 'r');
        const coluna = indiceColunaExcel(referencia) || colunaSequencial + 1;
        colunaSequencial = coluna;
        const valor = valorCelulaXml(celula[1], celula[2] || '', stringsCompartilhadas);
        if (valor !== '') valores.set(coluna, valor);
        maiorColuna = Math.max(maiorColuna, coluna);
      }
      if (valores.size) {
        linhas.set(numeroLinha, valores);
        maiorLinha = Math.max(maiorLinha, numeroLinha);
      }
    }
    return {
      name: nome,
      rowCount: maiorLinha,
      columnCount: maiorColuna,
      getCell(linha, coluna) {
        return { value: linhas.get(linha)?.get(coluna) ?? null };
      },
    };
  }

  function extrairResumoPlanilha(planilha) {
    const vazio = {
      encontrado: false,
      aba: planilha?.name || '',
      titulo: '',
      itens: [],
      categorias: [],
      origem: 'resumo',
      avisos: [],
      semCoeficiente: [],
      totais: { extensao: 0, quantidade: 0, escavacao: 0, concreto15: 0, concreto20: 0, concreto22: 0, concreto25: 0, area: 0, aco: 0 },
      disponibilidade: { escavacao: 0, concreto15: 0, concreto20: 0, concreto22: 0, concreto25: 0, area: 0, aco: 0 },
    };
    if (!planilha) return vazio;

    const resumo = {
      ...vazio,
      encontrado: true,
      totais: { ...vazio.totais },
      disponibilidade: { ...vazio.disponibilidade },
    };
    let categoriaAtual = 'Resumo geral';
    let cabecalhoQuantidade = 'QUANTIDADE';
    const categorias = new Set();
    const limite = Number(planilha.rowCount || 0);

    for (let linha = 1; linha <= limite; linha += 1) {
      const nome = String(textoCelula(planilha.getCell(linha, 2)) || '').trim();
      if (!nome) continue;
      const nomeNormalizado = normalizar(nome);
      const textos = [3, 4, 5, 6, 7].map((coluna) => textoCelula(planilha.getCell(linha, coluna)));
      const numeros = textos.map(paraNumero);
      const possuiNumero = numeros.some(Number.isFinite);

      if (!resumo.titulo && nomeNormalizado.includes('RESUMO') && nomeNormalizado.includes('DRENAGEM')) {
        resumo.titulo = nome;
        continue;
      }
      if (nomeNormalizado.includes('DISPOSITIVO') && (nomeNormalizado.includes('SERVICO') || nomeNormalizado.includes('PROJETO'))) {
        cabecalhoQuantidade = String(textos[0] || 'QUANTIDADE').trim();
        continue;
      }
      if (['TOTAL', 'TOTAIS'].includes(nomeNormalizado) || nomeNormalizado.startsWith('SUBTOTAL')) continue;
      if (!possuiNumero) {
        categoriaAtual = nome;
        categorias.add(categoriaAtual);
        continue;
      }

      const quantidade = numeros[0];
      if (!Number.isFinite(quantidade) || quantidade <= 0) continue;
      const unidadePrincipal = normalizar(cabecalhoQuantidade).includes('EXTENSAO') ? 'm' : 'un';
      const item = {
        linha,
        categoria: categoriaAtual,
        dispositivo: nome,
        quantidade,
        unidadePrincipal,
        rotuloQuantidade: cabecalhoQuantidade,
        escavacao: Number.isFinite(numeros[1]) ? numeros[1] : null,
        concreto20: Number.isFinite(numeros[2]) ? numeros[2] : null,
        concreto25: Number.isFinite(numeros[3]) ? numeros[3] : null,
        area: Number.isFinite(numeros[4]) ? numeros[4] : null,
      };
      resumo.itens.push(item);
      categorias.add(categoriaAtual);
      if (unidadePrincipal === 'm') resumo.totais.extensao += quantidade;
      else resumo.totais.quantidade += quantidade;
      for (const chave of ['escavacao', 'concreto20', 'concreto25', 'area']) {
        if (item[chave] != null) {
          resumo.totais[chave] += item[chave];
          resumo.disponibilidade[chave] += 1;
        }
      }
    }
    resumo.categorias = [...categorias];
    resumo.encontrado = resumo.itens.length > 0;
    return resumo;
  }

  function ehAbaNotaServico(planilha) {
    if (!planilha) return false;
    const nomeAba = normalizar(planilha.name);
    const temaDrenagem = ['DRENAGEM', 'LINEAR', 'REDE', 'CAIXA', 'ENTRADA', 'DESCIDA', 'DISSIPADOR', 'BUEIRO', 'VALETA', 'TSS']
      .some((termo) => nomeAba.includes(termo));
    for (let linha = 1; linha <= Math.min(20, Number(planilha.rowCount || 0)); linha += 1) {
      for (let coluna = 1; coluna <= Math.min(12, Number(planilha.columnCount || 0)); coluna += 1) {
        const texto = normalizar(textoCelula(planilha.getCell(linha, coluna)));
        const tituloNota = texto.includes('NOTA DE SERVICO') || texto.includes('NOTAS DE SERVICO');
        if (tituloNota && (texto.includes('DRENAGEM') || temaDrenagem)) return true;
      }
    }
    return false;
  }

  function categoriaAbaNota(nomeAba) {
    const nome = normalizar(nomeAba);
    if (nome.includes('LINEARES') || nome.includes('TRANSPOSICOES')) return 'Meio-fio e sarjetas';
    if (nome.includes('VPCC') || nome.includes('VALETA')) return 'Valetas de prote\u00e7\u00e3o';
    if (nome.includes('BUEIRO')) return 'Bueiros';
    if (nome.includes('REDES')) return 'Drenagem subterr\u00e2nea';
    if (nome.includes('ENTRADA')) return 'Des\u00e1gues de \u00e1guas pluviais';
    if (nome.includes('CAIXA') || nome.includes('CHAMINE') || nome.includes('POCO DE VISITA')) return 'Caixas e estruturas';
    return 'Outros servi\u00e7os';
  }

  function pareceDispositivoNota(valor) {
    const marcador = normalizar(valor);
    if (!marcador || marcador === '-' || ['TOTAL', 'TOTAIS', 'TIPO', 'SERVICO'].includes(marcador)) return false;
    if (!/[A-Z]/.test(marcador)) return false;
    return /\d/.test(marcador) || ['STC', 'BSTC', 'BDTC', 'BTTC'].includes(marcador);
  }

  function adicionarMedicaoNota(mapa, dispositivo, quantidade, unidadePrincipal, planilha, linha, categoria) {
    const nomeOriginal = String(dispositivo || '').trim();
    const valor = paraNumero(quantidade);
    const marcador = normalizar(nomeOriginal);
    if (!nomeOriginal || !pareceDispositivoNota(nomeOriginal) || !Number.isFinite(valor) || valor <= 0 || ['TOTAL', 'TOTAIS'].includes(marcador) || nomeOriginal === '-') return;
    const nome = canonicalizarDispositivoNota(nomeOriginal);
    const chave = `${normalizar(nome)}|${unidadePrincipal}`;
    const atual = mapa.get(chave) || {
      linha,
      categoria,
      dispositivo: nome,
      dispositivoOriginal: nomeOriginal,
      quantidade: 0,
      unidadePrincipal,
      rotuloQuantidade: unidadePrincipal === 'm' ? 'EXTENS\u00c3O' : 'QUANTIDADE',
      abasOrigem: new Set(),
      quantidadesPorCategoria: new Map(),
    };
    atual.quantidade += valor;
    atual.abasOrigem.add(planilha.name);
    atual.quantidadesPorCategoria.set(categoria, (atual.quantidadesPorCategoria.get(categoria) || 0) + valor);
    if (atual.quantidadesPorCategoria.size > 1) atual.categoria = 'Categorias diversas';
    mapa.set(chave, atual);
  }

  function extrairLinearesNota(planilha, mapa, categoria) {
    const pares = [];
    for (let linha = 1; linha <= Math.min(10, Number(planilha.rowCount || 0)); linha += 1) {
      for (let coluna = 2; coluna <= Math.min(20, Number(planilha.columnCount || 0)); coluna += 1) {
        if (normalizar(textoCelula(planilha.getCell(linha, coluna))) !== 'TIPO') continue;
        const anterior = normalizar(textoCelula(planilha.getCell(linha, coluna - 1)));
        if (anterior.includes('EXTENSAO')) pares.push({ linhaCabecalho: linha, colunaTipo: coluna, colunaExtensao: coluna - 1 });
      }
    }
    if (!pares.length) {
      pares.push({ linhaCabecalho: 4, colunaTipo: 6, colunaExtensao: 5 }, { linhaCabecalho: 4, colunaTipo: 14, colunaExtensao: 13 });
    }
    const fim = Number(planilha.rowCount || 0);
    for (const par of pares) {
      let vazias = 0;
      for (let linha = par.linhaCabecalho + 1; linha <= fim; linha += 1) {
        const dispositivo = textoCelula(planilha.getCell(linha, par.colunaTipo));
        const extensao = textoCelula(planilha.getCell(linha, par.colunaExtensao));
        if (!String(dispositivo || '').trim() && !Number.isFinite(paraNumero(extensao))) {
          vazias += 1;
          if (vazias >= 40) break;
          continue;
        }
        vazias = 0;
        adicionarMedicaoNota(mapa, dispositivo, extensao, 'm', planilha, linha, categoria);
      }
    }
  }

  function extrairRedeNota(planilha, mapa, categoria) {
    const fim = Number(planilha.rowCount || 0);
    let vazias = 0;
    for (let linha = 1; linha <= fim; linha += 1) {
      const dispositivo = textoCelula(planilha.getCell(linha, 6));
      const extensao = textoCelula(planilha.getCell(linha, 11));
      if (!String(dispositivo || '').trim() && !Number.isFinite(paraNumero(extensao))) {
        vazias += 1;
        if (vazias >= 40 && linha > 20) break;
        continue;
      }
      vazias = 0;
      adicionarMedicaoNota(mapa, dispositivo, extensao, 'm', planilha, linha, categoria);
    }
  }

  function extrairEstruturasNota(planilha, mapa, categoria) {
    const fim = Number(planilha.rowCount || 0);
    let encontrou = false;
    let vazias = 0;
    for (let linha = 1; linha <= fim; linha += 1) {
      const dispositivo = String(textoCelula(planilha.getCell(linha, 3)) || '').trim();
      const marcador = normalizar(dispositivo);
      if (!dispositivo) {
        if (encontrou) vazias += 1;
        if (vazias >= 40) break;
        continue;
      }
      if (marcador.includes('PROJETO TIPO') || marcador.includes('NOTAS DE SERVICO') || marcador === 'REAL CAFE') continue;
      if (/^(RAMO|TRECHO|INTERSECAO)\b/.test(marcador)) continue;
      encontrou = true;
      vazias = 0;
      adicionarMedicaoNota(mapa, dispositivo, 1, 'un', planilha, linha, categoria);
    }
  }

  function extrairCaixasNota(planilha, mapa, categoria) {
    let cabecalho = null;
    for (let linha = 1; linha <= Math.min(10, Number(planilha.rowCount || 0)) && !cabecalho; linha += 1) {
      for (let coluna = 1; coluna <= Math.min(20, Number(planilha.columnCount || 0)); coluna += 1) {
        if (normalizar(textoCelula(planilha.getCell(linha, coluna))).includes('PROJETO TIPO')) {
          cabecalho = { linha, coluna };
          break;
        }
      }
    }
    if (!cabecalho) {
      extrairEstruturasNota(planilha, mapa, categoria);
      return;
    }
    let vazias = 0;
    for (let linha = cabecalho.linha + 1; linha <= Number(planilha.rowCount || 0); linha += 1) {
      const dispositivo = textoCelula(planilha.getCell(linha, cabecalho.coluna));
      if (!String(dispositivo || '').trim()) {
        vazias += 1;
        if (vazias >= 40) break;
        continue;
      }
      vazias = 0;
      adicionarMedicaoNota(mapa, dispositivo, 1, 'un', planilha, linha, categoria);
    }
  }

  function extrairEntradasNota(planilha, mapa, categoria) {
    let linhaCabecalho = 0;
    const inicios = [];
    for (let linha = 1; linha <= Math.min(10, Number(planilha.rowCount || 0)); linha += 1) {
      for (let coluna = 1; coluna <= Math.min(24, Number(planilha.columnCount || 0)); coluna += 1) {
        if (normalizar(textoCelula(planilha.getCell(linha, coluna))).includes('SAIDA ENTRADA')) {
          if (!linhaCabecalho) linhaCabecalho = linha;
          if (linhaCabecalho === linha) inicios.push(coluna);
        }
      }
      if (inicios.length) break;
    }
    if (!inicios.length) {
      extrairEstruturasNota(planilha, mapa, categoria);
      return;
    }
    const limiteColunas = Number(planilha.columnCount || 0);
    const blocos = inicios.map((inicio, indice) => {
      const fim = (inicios[indice + 1] || (limiteColunas + 1)) - 1;
      let colunaDissipador = 0;
      let colunaExtensao = 0;
      for (let coluna = inicio + 1; coluna <= fim; coluna += 1) {
        const superior = normalizar(textoCelula(planilha.getCell(linhaCabecalho, coluna)));
        const inferior = normalizar(textoCelula(planilha.getCell(linhaCabecalho + 1, coluna)));
        if (superior.includes('DISSIPADOR')) colunaDissipador = coluna;
        if (inferior.includes('EXT')) colunaExtensao = coluna;
      }
      return {
        colunaEntrada: inicio,
        colunaDescida: inicio + 1,
        colunaExtensao,
        colunaDissipador,
      };
    });
    for (let linha = linhaCabecalho + 2; linha <= Number(planilha.rowCount || 0); linha += 1) {
      for (const bloco of blocos) {
        adicionarMedicaoNota(mapa, textoCelula(planilha.getCell(linha, bloco.colunaEntrada)), 1, 'un', planilha, linha, categoria);
        if (bloco.colunaExtensao) {
          adicionarMedicaoNota(
            mapa,
            textoCelula(planilha.getCell(linha, bloco.colunaDescida)),
            textoCelula(planilha.getCell(linha, bloco.colunaExtensao)),
            'm',
            planilha,
            linha,
            categoria,
          );
        }
        if (bloco.colunaDissipador) {
          adicionarMedicaoNota(mapa, textoCelula(planilha.getCell(linha, bloco.colunaDissipador)), 1, 'un', planilha, linha, categoria);
        }
      }
    }
  }

  function servicoPrevistoNota(valor) {
    const marcador = normalizar(valor);
    return ['IMPLANTAR', 'DEMOLIR', 'RELOCAR', 'SUBSTITUIR'].some((acao) => marcador.includes(acao));
  }

  function extrairBueirosNota(planilha, mapa, categoria) {
    const greide = normalizar(planilha.name).includes('GREIDE');
    const colunas = greide
      ? { corpo: 6, servicoCorpo: 5, extensao: 11, montante: 12, servicoMontante: 13, jusante: 14, servicoJusante: 15 }
      : { corpo: 5, servicoCorpo: 6, extensao: 10, montante: 11, servicoMontante: 12, jusante: 13, servicoJusante: 14 };
    for (let linha = 1; linha <= Number(planilha.rowCount || 0); linha += 1) {
      if (servicoPrevistoNota(textoCelula(planilha.getCell(linha, colunas.servicoCorpo)))) {
        adicionarMedicaoNota(
          mapa,
          textoCelula(planilha.getCell(linha, colunas.corpo)),
          textoCelula(planilha.getCell(linha, colunas.extensao)),
          'm',
          planilha,
          linha,
          categoria,
        );
      }
      if (servicoPrevistoNota(textoCelula(planilha.getCell(linha, colunas.servicoMontante)))) {
        adicionarMedicaoNota(mapa, textoCelula(planilha.getCell(linha, colunas.montante)), 1, 'un', planilha, linha, categoria);
      }
      if (servicoPrevistoNota(textoCelula(planilha.getCell(linha, colunas.servicoJusante)))) {
        adicionarMedicaoNota(mapa, textoCelula(planilha.getCell(linha, colunas.jusante)), 1, 'un', planilha, linha, categoria);
      }
    }
  }

  function aplicarConsumosIpr(item) {
    const referencia = buscarConsumoIpr(item.dispositivo);
    const vazio = {
      escavacao: null, concreto15: null, concreto20: null, concreto22: null, concreto25: null,
      area: null, aco: null, apiloamento: null, alvenariaBlocos: null, argamassa: null,
      concretoMagro: null, grama: null, guiaMadeira: null, tampaFerro: null,
    };
    if (!referencia || referencia.unidade !== item.unidadePrincipal) return { ...item, ...vazio, consumoIpr: null };
    const quantidade = Number(item.quantidade || 0);
    const total = (chave) => Number.isFinite(Number(referencia.consumos?.[chave])) ? Number(referencia.consumos[chave]) * quantidade : null;
    return {
      ...item,
      escavacao: total('escavacao'),
      concreto15: total('concreto15'),
      concreto20: total('concreto20'),
      concreto22: total('concreto22'),
      concreto25: total('concreto25'),
      area: total('forma'),
      aco: total('acoCa50'),
      apiloamento: total('apiloamento'),
      alvenariaBlocos: total('alvenariaBlocos'),
      argamassa: total('argamassa'),
      concretoMagro: total('concretoMagro'),
      grama: total('grama'),
      guiaMadeira: total('guiaMadeira'),
      tampaFerro: total('tampaFerro'),
      consumoIpr: {
        codigo: referencia.codigo,
        unidade: referencia.unidade,
        coeficientes: { ...referencia.consumos },
        fonte: referencia.fonte,
        pagina: referencia.pagina,
      },
    };
  }

  function extrairNotasServico(planilhas) {
    const reconhecidas = (planilhas || []).filter(ehAbaNotaServico);
    const mapa = new Map();
    for (const planilha of reconhecidas) {
      const nome = normalizar(planilha.name);
      const categoria = categoriaAbaNota(planilha.name);
      if (nome.includes('BUEIRO')) extrairBueirosNota(planilha, mapa, categoria);
      else if (nome.includes('REDES')) extrairRedeNota(planilha, mapa, categoria);
      else if (nome.includes('ENTRADA')) extrairEntradasNota(planilha, mapa, categoria);
      else if (nome.includes('CAIXA') || nome.includes('CHAMINE')) extrairCaixasNota(planilha, mapa, categoria);
      else extrairLinearesNota(planilha, mapa, categoria);
    }
    const itens = [...mapa.values()].map((item) => aplicarConsumosIpr({ ...item, abasOrigem: [...item.abasOrigem] }));
    const chavesFisicas = ['escavacao', 'concreto15', 'concreto20', 'concreto22', 'concreto25', 'area', 'aco'];
    const totais = { extensao: 0, quantidade: 0, escavacao: 0, concreto15: 0, concreto20: 0, concreto22: 0, concreto25: 0, area: 0, aco: 0 };
    const disponibilidade = Object.fromEntries(chavesFisicas.map((chave) => [chave, 0]));
    for (const item of itens) {
      if (item.unidadePrincipal === 'm') totais.extensao += Number(item.quantidade || 0);
      else totais.quantidade += Number(item.quantidade || 0);
      for (const chave of chavesFisicas) {
        if (item[chave] != null) {
          totais[chave] += Number(item[chave] || 0);
          disponibilidade[chave] += 1;
        }
      }
    }
    const avisos = [];
    const vpcgEmVpcc = itens.find((item) => normalizar(item.dispositivo).startsWith('VPCG') && item.abasOrigem.some((aba) => normalizar(aba).includes('VPCC')));
    if (vpcgEmVpcc) avisos.push(`A aba \u201c${vpcgEmVpcc.abasOrigem.find((aba) => normalizar(aba).includes('VPCC'))}\u201d cont\u00e9m o c\u00f3digo ${vpcgEmVpcc.dispositivo}. O HID X manteve o c\u00f3digo VPCG do corpo da nota e aplicou o consumo da valeta gramada, sem substitu\u00ed-lo por VPCC.`);
    const semCoeficiente = itens.filter((item) => !item.consumoIpr).map((item) => item.dispositivo);
    return {
      encontrado: itens.length > 0,
      aba: reconhecidas.map((planilha) => planilha.name).join(' \u00b7 '),
      titulo: 'Resumo autom\u00e1tico das Notas de Servi\u00e7o',
      origem: 'notas',
      itens,
      categorias: [...new Set(itens.map((item) => item.categoria))],
      totais,
      disponibilidade,
      avisos,
      semCoeficiente,
      abasReconhecidas: reconhecidas.map((planilha) => planilha.name),
      coberturaIpr: { encontrados: itens.length - semCoeficiente.length, total: itens.length },
    };
  }

  function categoriaDispositivoFallback(dispositivo) {
    const nome = normalizar(dispositivo);
    if (/\b(MFC|STC|TSS|CANALETA)\b/.test(nome)) return 'Meio-fio e sarjetas';
    if (/\bVPCG\b/.test(nome)) return 'Valetas de prote\u00e7\u00e3o';
    if (/\bEDA\b/.test(nome)) return 'Des\u00e1gues de \u00e1guas pluviais';
    if (/\b(CLP|PVI|CCS|BLSG|BLS|CPV)\b/.test(nome) || nome.includes('CHAMINE')) return 'Caixas e estruturas';
    if (/\bPEAD\b/.test(nome)) return 'Drenagem subterr\u00e2nea';
    return 'Outros servi\u00e7os';
  }

  function associarResumoAosItens(itens, resumo) {
    if (!resumo?.itens?.length) {
      itens.forEach((item) => { item.resumoCategoria = categoriaDispositivoFallback(item.dispositivo); });
      return;
    }
    const usados = new Set();
    for (const item of itens) {
      let indice = resumo.itens.findIndex((registro, posicao) => !usados.has(posicao)
        && registro.linha === item.linha
        && normalizar(registro.dispositivo) === normalizar(item.dispositivo));
      if (indice < 0) indice = resumo.itens.findIndex((registro, posicao) => !usados.has(posicao)
        && normalizar(registro.dispositivo) === normalizar(item.dispositivo));
      if (indice >= 0) {
        usados.add(indice);
        const registro = resumo.itens[indice];
        item.resumoCategoria = registro.categoria;
        item.resumoLinha = registro.linha;
        item.resumoUnidade = registro.unidadePrincipal;
      } else {
        item.resumoCategoria = categoriaDispositivoFallback(item.dispositivo);
      }
    }
  }

  function prioridadeNomeAba(nome) {
    const normalizado = normalizar(nome);
    if (normalizado === 'RESUMO' || normalizado.startsWith('RESUMO ')) return 500;
    if (normalizado.includes('DISPOSITIVO')) return 400;
    if (normalizado.includes('ENTRADA')) return 350;
    if (normalizado.includes('ORCAMENTO')) return 300;
    if (normalizado.includes('LISTA') || normalizado.includes('ITENS')) return 180;
    return 0;
  }

  async function carregarWorkbookSeletivo(arquivo) {
    if (!window.JSZip) throw new Error('N\u00e3o foi poss\u00edvel carregar o leitor otimizado de Excel.');
    const zip = await JSZip.loadAsync(await arquivo.arrayBuffer());
    const arquivoWorkbook = zip.file('xl/workbook.xml');
    const arquivoRelacoes = zip.file('xl/_rels/workbook.xml.rels');
    if (!arquivoWorkbook || !arquivoRelacoes) throw new Error('O arquivo n\u00e3o parece ser um Excel .xlsx v\u00e1lido.');

    const [xmlWorkbook, xmlRelacoes, xmlStrings] = await Promise.all([
      arquivoWorkbook.async('string'),
      arquivoRelacoes.async('string'),
      zip.file('xl/sharedStrings.xml')?.async('string') || Promise.resolve(''),
    ]);
    const stringsCompartilhadas = lerStringsCompartilhadas(xmlStrings);
    const relacoes = new Map();
    for (const relacao of xmlRelacoes.matchAll(/<Relationship\b([^>]*)\/?\s*>/gi)) {
      const id = atributoXml(relacao[1], 'Id');
      const destino = atributoXml(relacao[1], 'Target');
      if (id && destino) relacoes.set(id, caminhoInternoXlsx(destino));
    }

    const trechoAbas = xmlWorkbook.match(/<sheets\b[^>]*>([\s\S]*?)<\/sheets>/i)?.[1] || '';
    const abas = [];
    for (const aba of trechoAbas.matchAll(/<sheet\b([^>]*)\/?\s*>/gi)) {
      const nome = atributoXml(aba[1], 'name');
      const relacao = atributoXml(aba[1], 'r:id');
      const caminho = relacoes.get(relacao);
      if (nome && caminho && zip.file(caminho)) {
        const entrada = zip.file(caminho);
        abas.push({
          nome,
          caminho,
          prioridade: prioridadeNomeAba(nome),
          tamanho: Number(entrada?._data?.uncompressedSize || 0),
        });
      }
    }
    if (!abas.length) throw new Error('N\u00e3o encontrei abas leg\u00edveis neste arquivo Excel.');
    abas.sort((a, b) => b.prioridade - a.prioridade || a.tamanho - b.tamanho);

    const xmlPorCaminho = new Map();
    const carregarXml = async (aba) => {
      if (!xmlPorCaminho.has(aba.caminho)) xmlPorCaminho.set(aba.caminho, await zip.file(aba.caminho).async('string'));
      return xmlPorCaminho.get(aba.caminho);
    };
    const notasPlanilhas = [];
    for (const aba of abas) {
      const nome = normalizar(aba.nome);
      if (nome === 'RESUMO' || nome.startsWith('RESUMO ')) continue;
      const nomeProvavel = /(LINEARES|VPCC|VALETA|REDES|CAIXAS|CHAMINE|POCO DE VISITA|TRANSPOSICOES|ENTRADA)/.test(nome);
      if (aba.tamanho > 18 * 1024 * 1024 && !nomeProvavel) continue;
      const xml = await carregarXml(aba);
      const previa = planilhaDeXml(aba.nome, xml, stringsCompartilhadas, 12);
      if (ehAbaNotaServico(previa)) notasPlanilhas.push(planilhaDeXml(aba.nome, xml, stringsCompartilhadas));
    }

    let melhor = null;
    let analisadas = 0;
    for (const aba of abas) {
      if (aba.tamanho > 18 * 1024 * 1024 && aba.prioridade === 0) continue;
      if (analisadas >= 36 && aba.prioridade === 0) continue;
      const xml = await carregarXml(aba);
      const previa = planilhaDeXml(aba.nome, xml, stringsCompartilhadas, 140);
      analisadas += 1;
      const cabecalho = localizarCabecalho({ worksheets: [previa] });
      if (!cabecalho) continue;
      const pontos = Number(cabecalho.pontos || 0) + aba.prioridade + Math.min(cabecalho.validas || 0, 15) * 5;
      if (!melhor || pontos > melhor.pontos) melhor = { aba, xml, pontos };
      if (aba.prioridade >= 300 && cabecalho.modo === 'cabecalho') break;
    }
    if (!melhor && !notasPlanilhas.length) throw new Error('N\u00e3o encontrei colunas de dispositivo/servi\u00e7o e quantidade nem abas de Notas de Servi\u00e7o nas abas analisadas.');

    const planilha = melhor ? planilhaDeXml(melhor.aba.nome, melhor.xml, stringsCompartilhadas) : null;
    const abaResumo = abas.find((aba) => normalizar(aba.nome) === 'RESUMO' || normalizar(aba.nome).startsWith('RESUMO '));
    const xmlResumo = abaResumo
      ? melhor && abaResumo.caminho === melhor.aba.caminho ? melhor.xml : await carregarXml(abaResumo)
      : '';
    const resumoPlanilha = abaResumo && xmlResumo
      ? planilhaDeXml(abaResumo.nome, xmlResumo, stringsCompartilhadas)
      : null;
    return { worksheets: planilha ? [planilha] : notasPlanilhas, notasPlanilhas, resumoPlanilha, nomesAbas: abas.map((aba) => aba.nome) };
  }

  function truncarCentavos(valor) {
    return Math.trunc((Number(valor) + Number.EPSILON) * 100) / 100;
  }

  function escapeHtml(valor) {
    return String(valor ?? '').replace(/[&<>"']/g, (caractere) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
    }[caractere]));
  }

  function valorSemBdi(item) {
    return item.selecionado ? Number(item.selecionado.preco_sem_bdi) : 0;
  }

  function valorComBdi(item) {
    return valorSemBdi(item) * (1 + Number(item.bdi || 0) / 100);
  }

  function valorTotal(item) {
    return item.selecionado ? truncarCentavos(Number(item.quantidade || 0) * valorComBdi(item)) : 0;
  }

  function radicalToken(token) {
    const valor = String(token || '');
    if (valor.length > 5 && valor.endsWith('ES')) return valor.slice(0, -2);
    if (valor.length > 4 && valor.endsWith('S')) return valor.slice(0, -1);
    return valor;
  }

  function expandirTokenCompacto(token) {
    const correspondencia = String(token || '').match(/^([A-Z]{2,6})(\d{1,5})([A-Z]?)$/);
    if (!correspondencia) return [token];
    return [correspondencia[1], correspondencia[2], correspondencia[3]].filter(Boolean);
  }

  function tokensExpandidos(valor) {
    return normalizar(valor).split(' ').filter(Boolean).flatMap(expandirTokenCompacto)
      .filter((token) => !['X', 'VEZES', 'POR'].includes(token));
  }

  function tokenizarPesquisa(valor) {
    const tokens = tokensExpandidos(valor);
    return tokens.filter((token, indice) => {
      if (token.length > 1 && !STOPWORDS.has(token)) return true;
      return /^[A-C]$/.test(token) && /^\d+$/.test(tokens[indice - 1] || '');
    });
  }

  function extrairIdentificadorDispositivo(valor) {
    const tokens = tokensExpandidos(valor);
    for (let indice = 0; indice < tokens.length - 1; indice += 1) {
      if (!/^[A-Z]{2,6}$/.test(tokens[indice])) continue;
      const partes = [tokens[indice]];
      let cursor = indice + 1;
      if (['D', 'DN', 'DIAMETRO'].includes(tokens[cursor])) cursor += 1;
      if (!/^\d{1,5}$/.test(tokens[cursor] || '')) continue;
      while (cursor < tokens.length && partes.length < 5) {
        const token = tokens[cursor];
        if (/^\d{1,5}$/.test(token) || (partes.length > 1 && /^[A-C]$/.test(token))) {
          partes.push(token);
          cursor += 1;
          continue;
        }
        break;
      }
      const partesCodigo = partes.slice(1);
      const partesCanonicas = partesCodigo.map((parte) => (/^\d+$/.test(parte) ? String(Number(parte)) : parte));
      return {
        sigla: partes[0],
        partes: partesCodigo,
        partesCanonicas,
        chave: partes.join('|'),
        chaveCanonica: [partes[0], ...partesCanonicas].join('|'),
      };
    }
    return null;
  }

  function chavesIdentificador(identificador) {
    if (!identificador) return [];
    return [...new Set([identificador.chave, identificador.chaveCanonica].filter(Boolean))];
  }

  function chavesCompactasIdentificador(identificador) {
    if (!identificador) return [];
    const original = `${identificador.sigla}${identificador.partes.join('')}`;
    const canonica = `${identificador.sigla}${identificador.partesCanonicas.join('')}`;
    return [...new Set([original, canonica].filter(Boolean))];
  }

  function nomeCorrelacaoDispositivo(valor) {
    const identificador = extrairIdentificadorDispositivo(valor);
    return identificador ? CORRELACOES_DISPOSITIVOS.get(identificador.sigla) || '' : '';
  }

  function consultaComCorrelacao(valor) {
    const nomeTecnico = nomeCorrelacaoDispositivo(valor);
    const original = normalizar(valor);
    const adicionais = [];
    for (const token of tokensExpandidos(original)) {
      for (const equivalente of TERMOS_EQUIVALENTES.get(token) || []) {
        if (!original.split(' ').includes(equivalente)) adicionais.push(equivalente);
      }
    }
    if (nomeTecnico && !original.includes(normalizar(nomeTecnico))) adicionais.unshift(nomeTecnico);
    return adicionais.length ? `${adicionais.join(' ')} ${valor}` : valor;
  }

  function adicionarAoIndice(indice, chave, servico) {
    if (!chave) return;
    if (!indice.has(chave)) indice.set(chave, []);
    indice.get(chave).push(servico);
  }

  function adicionarTodos(conjunto, lista) {
    for (const item of lista || []) conjunto.add(item);
  }

  function criarIndiceCatalogo(servicos) {
    const indice = {
      token: new Map(),
      radical: new Map(),
      prefixo: new Map(),
      unidade: new Map(),
      sigla: new Map(),
      identificador: new Map(),
      compacto: new Map(),
    };
    for (const servico of servicos) {
      adicionarAoIndice(indice.unidade, chaveUnidade(servico.unidade), servico);
      adicionarAoIndice(indice.sigla, servico.identificadorDispositivo?.sigla, servico);
      for (const chave of chavesIdentificador(servico.identificadorDispositivo)) adicionarAoIndice(indice.identificador, chave, servico);
      for (const chave of chavesCompactasIdentificador(servico.identificadorDispositivo)) adicionarAoIndice(indice.compacto, chave, servico);
      for (const token of new Set(servico.tokensPesquisa)) {
        adicionarAoIndice(indice.token, token, servico);
        adicionarAoIndice(indice.radical, radicalToken(token), servico);
        if (token.length >= 3 && !/^\d+$/.test(token)) adicionarAoIndice(indice.prefixo, token.slice(0, 3), servico);
      }
    }
    return indice;
  }

  function candidatosPorIdentificador(valor, unidadeInformada = '') {
    const encontrados = new Set();
    const identificador = extrairIdentificadorDispositivo(valor);
    for (const chave of chavesIdentificador(identificador)) adicionarTodos(encontrados, indiceCatalogo.identificador.get(chave));

    const tokens = normalizar(valor).split(' ').filter(Boolean);
    for (let inicio = 0; inicio < tokens.length; inicio += 1) {
      if (!/^[A-Z]{2,6}(?:\d.*)?$/.test(tokens[inicio])) continue;
      let compacta = '';
      let melhor = null;
      for (let fim = inicio; fim < Math.min(tokens.length, inicio + 8); fim += 1) {
        if (['X', 'VEZES', 'POR'].includes(tokens[fim])) continue;
        compacta += tokens[fim].replace(/(?<=\d)X(?=\d)/g, '');
        const lista = indiceCatalogo.compacto.get(compacta);
        if (!lista?.length) continue;
        const assinaturas = new Set(lista.map((servico) => servico.identificadorDispositivo?.chaveCanonica).filter(Boolean));
        if (assinaturas.size === 1) melhor = lista;
      }
      adicionarTodos(encontrados, melhor);
    }

    const unidade = chaveUnidade(unidadeInformada);
    const candidatos = [...encontrados];
    return unidade ? candidatos.filter((servico) => chaveUnidade(servico.unidade) === unidade) : candidatos;
  }

  function candidatosPorPrefixoIdentificador(valor, unidadeInformada = '') {
    const identificador = extrairIdentificadorDispositivo(valor);
    if (!identificador?.partesCanonicas.length) return [];
    const candidatos = (indiceCatalogo.sigla.get(identificador.sigla) || []).filter((servico) => {
      const candidato = servico.identificadorDispositivo;
      if (!candidato || candidato.sigla !== identificador.sigla) return false;
      if (candidato.partesCanonicas.length <= identificador.partesCanonicas.length) return false;
      return identificador.partesCanonicas.every((parte, indice) => candidato.partesCanonicas[indice] === parte);
    });
    return filtrarPorUnidade(candidatos, unidadeInformada);
  }

  function candidatosBocasBueiro(valor, unidadeInformada = '') {
    const texto = normalizar(valor);
    const identificador = extrairIdentificadorDispositivo(valor);
    if (!identificador || !['BSTC', 'BDTC', 'BTTC'].includes(identificador.sigla)) return [];
    if (!texto.includes('ALA') && !texto.includes('BOCA')) return [];
    const dimensao = `${identificador.sigla} D ${identificador.partes.join(' ')}`;
    const candidatos = catalogo.filter((servico) => {
      const descricao = servico.descricaoNormalizada;
      return descricao.includes(`ADAPTAVEL EM ${identificador.sigla}`)
        && descricao.includes(dimensao);
    });
    return filtrarPorUnidade(candidatos, unidadeInformada);
  }

  function candidatosIndexados(tokens, unidadeInformada = '') {
    const encontrados = new Set();
    for (const token of tokens) {
      adicionarTodos(encontrados, indiceCatalogo.token.get(token));
      adicionarTodos(encontrados, indiceCatalogo.radical.get(radicalToken(token)));
      if (token.length >= 4 && !/^\d+$/.test(token)) adicionarTodos(encontrados, indiceCatalogo.prefixo.get(token.slice(0, 3)));
    }
    let base = encontrados.size ? [...encontrados] : catalogo;
    const unidade = chaveUnidade(unidadeInformada);
    if (unidade) {
      const compativeis = base.filter((servico) => chaveUnidade(servico.unidade) === unidade);
      if (compativeis.length) base = compativeis;
      else base = encontrados.size ? [] : (indiceCatalogo.unidade.get(unidade) || []);
    }
    return base;
  }

  function distanciaEdicao(a, b, limite = 2) {
    if (a === b) return 0;
    if (Math.abs(a.length - b.length) > limite) return limite + 1;
    let anterior = Array.from({ length: b.length + 1 }, (_, indice) => indice);
    for (let i = 1; i <= a.length; i += 1) {
      const atual = [i];
      let menorLinha = atual[0];
      for (let j = 1; j <= b.length; j += 1) {
        const custo = a[i - 1] === b[j - 1] ? 0 : 1;
        atual[j] = Math.min(atual[j - 1] + 1, anterior[j] + 1, anterior[j - 1] + custo);
        menorLinha = Math.min(menorLinha, atual[j]);
      }
      if (menorLinha > limite) return limite + 1;
      anterior = atual;
    }
    return anterior[b.length];
  }

  function similaridadeToken(token, servico) {
    if (servico.tokenSet.has(token)) return 1;
    if (/^\d+$/.test(token)) return 0;
    const radical = radicalToken(token);
    if (servico.radicalSet.has(radical)) return 0.92;
    let melhor = 0;
    for (const candidato of servico.tokensPesquisa) {
      if (candidato[0] !== token[0] || Math.abs(candidato.length - token.length) > 2) continue;
      if (token.length >= 4 && (candidato.startsWith(token) || token.startsWith(candidato))) melhor = Math.max(melhor, 0.82);
      if (token.length >= 4) {
        const distancia = distanciaEdicao(token, candidato, 2);
        if (distancia === 1) melhor = Math.max(melhor, 0.86);
        else if (distancia === 2 && Math.max(token.length, candidato.length) >= 6) melhor = Math.max(melhor, 0.68);
      }
    }
    return melhor;
  }

  function similaridadeBigramas(a, b) {
    const primeiro = String(a || '').replace(/\s/g, '');
    const segundo = String(b || '').replace(/\s/g, '');
    if (!primeiro || !segundo) return 0;
    if (primeiro === segundo) return 1;
    const bigramas = new Map();
    for (let i = 0; i < primeiro.length - 1; i += 1) {
      const parte = primeiro.slice(i, i + 2);
      bigramas.set(parte, (bigramas.get(parte) || 0) + 1);
    }
    let comuns = 0;
    for (let i = 0; i < segundo.length - 1; i += 1) {
      const parte = segundo.slice(i, i + 2);
      const disponiveis = bigramas.get(parte) || 0;
      if (disponiveis > 0) {
        comuns += 1;
        bigramas.set(parte, disponiveis - 1);
      }
    }
    return (2 * comuns) / Math.max(1, primeiro.length + segundo.length - 2);
  }

  function pontuarServicoCatalogo(busca, tokens, numerosConsulta, servico) {
    let correspondencias = 0;
    let exatas = 0;
    for (const token of tokens) {
      const similaridade = similaridadeToken(token, servico);
      correspondencias += similaridade;
      if (similaridade === 1) exatas += 1;
    }
    const cobertura = correspondencias / tokens.length;
    const exatidao = exatas / tokens.length;
    const frase = servico.descricaoNormalizada.includes(busca) ? 1
      : busca.includes(servico.descricaoNormalizada) ? 0.9 : 0;
    const caracteres = similaridadeBigramas(busca, servico.descricaoNormalizada);
    const numerosCorretos = numerosConsulta.every((numeroConsulta) => servico.numerosPesquisa.has(numeroConsulta));
    const bonusNumeros = numerosConsulta.length ? (numerosCorretos ? 0.1 : -0.45) : 0;
    const bonusInicio = tokens[0] && similaridadeToken(tokens[0], servico) >= 0.9 ? 0.04 : 0;
    return Math.max(0, Math.min(1,
      cobertura * 0.55 + exatidao * 0.13 + caracteres * 0.16 + frase * 0.12 + bonusNumeros + bonusInicio,
    ));
  }

  function classificarCatalogo(consulta, limite = 80, unidadeInformada = '') {
    const busca = normalizar(consultaComCorrelacao(consulta));
    if (!busca) return catalogo.slice(0, limite).map((servico) => ({ servico, pontuacao: 0 }));
    const codigoExato = porCodigo.get(busca.replace(/\s/g, ''));
    if (codigoExato) return [{ servico: codigoExato, pontuacao: 1 }];

    const tokens = tokenizarPesquisa(busca);
    const numerosConsulta = tokens.filter((token) => /^\d+$/.test(token));
    const catalogoCompativel = candidatosIndexados(tokens, unidadeInformada);
    const resultados = [];

    for (const servico of catalogoCompativel) {
      if (!tokens.length) continue;
      const pontuacao = pontuarServicoCatalogo(busca, tokens, numerosConsulta, servico);

      if (pontuacao >= 0.12) resultados.push({ servico, pontuacao });
    }

    resultados.sort((a, b) => b.pontuacao - a.pontuacao
      || a.servico.descricao.localeCompare(b.servico.descricao, 'pt-BR'));
    return resultados.slice(0, limite);
  }

  function buscarCatalogo(consulta, limite = 80, unidadeInformada = '') {
    return classificarCatalogo(consulta, limite, unidadeInformada).map((resultado) => resultado.servico);
  }

  function chaveUnidade(valor) {
    const unidade = normalizar(valor).replace(/\s/g, '');
    if (['UN', 'UND', 'UNID', 'UNIDADE', 'UNIDADES', 'PECA', 'PECAS'].includes(unidade)) return 'UN';
    if (['M', 'ML', 'METRO', 'METROS', 'METROLINEAR', 'METROSLINEARES'].includes(unidade)) return 'M';
    if (['M2', 'METROQUADRADO', 'METROSQUADRADOS'].includes(unidade)) return 'M2';
    if (['M3', 'METROCUBICO', 'METROSCUBICOS'].includes(unidade)) return 'M3';
    return unidade;
  }

  function tipoMedicao(unidade) {
    const chave = chaveUnidade(unidade);
    if (chave === 'M') return 'Metro';
    if (chave === 'UN') return 'Quantidade';
    if (chave === 'M2') return '\u00c1rea';
    if (chave === 'M3') return 'Volume';
    if (['KG', 'T'].includes(chave)) return 'Peso';
    if (['H', 'MES'].includes(chave)) return 'Tempo';
    return chave ? 'Outra unidade SICRO' : 'A detectar';
  }

  function filtrarPorUnidade(servicos, unidadeInformada) {
    const chave = chaveUnidade(unidadeInformada);
    if (!chave) return servicos;
    return servicos.filter((servico) => chaveUnidade(servico.unidade) === chave);
  }

  function unidadeDoItem(item) {
    return item.selecionado?.unidade || item.unidadeInformada || '';
  }

  function assinaturaDispositivo(valor) {
    return extrairIdentificadorDispositivo(valor);
  }

  function pertenceAoMesmoDispositivo(servico, assinatura) {
    if (!assinatura) return false;
    return servico.identificadorDispositivo?.chaveCanonica === assinatura.chaveCanonica;
  }

  function classificarFamiliaIdentificada(consulta, familia) {
    const busca = normalizar(consultaComCorrelacao(consulta));
    const tokens = tokenizarPesquisa(busca);
    const numerosConsulta = tokens.filter((token) => /^\d+$/.test(token));
    return familia.map((servico) => ({
      servico,
      pontuacao: tokens.length ? pontuarServicoCatalogo(busca, tokens, numerosConsulta, servico) : 0,
    })).sort((a, b) => b.pontuacao - a.pontuacao
      || a.servico.descricao.localeCompare(b.servico.descricao, 'pt-BR'));
  }

  function montarAlternativas(consulta, unidadeInformada, selecionado = null, limite = 50) {
    const consultaTexto = String(consulta || '').trim();
    const termo = consultaTexto && !porCodigo.has(consultaTexto)
      ? consultaTexto
      : selecionado?.descricao || consultaTexto;
    const classificados = classificarCatalogo(termo, limite, unidadeInformada);
    const assinatura = assinaturaDispositivo(selecionado?.descricao || termo);
    const enriquecidos = classificados.map((resultado) => ({
      ...resultado,
      mesmoDispositivo: pertenceAoMesmoDispositivo(resultado.servico, assinatura),
    })).sort((a, b) => Number(b.mesmoDispositivo) - Number(a.mesmoDispositivo) || b.pontuacao - a.pontuacao);
    if (!selecionado) return enriquecidos;
    const atual = enriquecidos.find((resultado) => resultado.servico.codigo === selecionado.codigo);
    return [
      { servico: selecionado, pontuacao: atual?.pontuacao ?? 1, selecionado: true, mesmoDispositivo: atual?.mesmoDispositivo || Boolean(assinatura) },
      ...enriquecidos.filter((resultado) => resultado.servico.codigo !== selecionado.codigo),
    ].slice(0, limite);
  }

  function resolverEntrada(dispositivo, codigoInformado, unidadeInformada = '') {
    const codigo = String(codigoInformado || '').trim();
    if (codigo && porCodigo.has(codigo)) {
      const selecionado = porCodigo.get(codigo);
      const opcoesPontuadas = montarAlternativas(dispositivo, unidadeInformada, selecionado);
      return { selecionado, candidatos: opcoesPontuadas.map((resultado) => resultado.servico), opcoesPontuadas, metodo: 'C\u00f3digo exato', confianca: 1 };
    }
    if (porCodigo.has(String(dispositivo || '').trim())) {
      const servico = porCodigo.get(String(dispositivo).trim());
      const opcoesPontuadas = montarAlternativas(servico.descricao, unidadeInformada, servico);
      return { selecionado: servico, candidatos: opcoesPontuadas.map((resultado) => resultado.servico), opcoesPontuadas, metodo: 'C\u00f3digo exato', confianca: 1 };
    }

    const preferido = codigoPreferido(dispositivo, unidadeInformada);
    if (preferido) {
      const selecionado = porCodigo.get(preferido);
      const opcoesPontuadas = montarAlternativas(dispositivo, unidadeInformada, selecionado);
      return {
        selecionado,
        candidatos: opcoesPontuadas.map((resultado) => resultado.servico),
        opcoesPontuadas,
        metodo: 'Correspond\u00eancia aprendida',
        confianca: 1,
      };
    }

    const chaveDispositivo = normalizar(dispositivo).replace(/\s/g, '');
    if (CODIGOS_EXCLUIDOS_IPR.has(chaveDispositivo)) {
      return {
        selecionado: null,
        candidatos: [],
        opcoesPontuadas: [],
        metodo: 'C\u00f3digo exclu\u00eddo da Publica\u00e7\u00e3o IPR 736 \u2014 definir solu\u00e7\u00e3o substituta no projeto',
        confianca: 0,
      };
    }
    const equivalenteLegado = CODIGOS_LEGADOS_IPR.get(chaveDispositivo);
    if (equivalenteLegado) {
      const resolucaoAtualizada = resolverEntrada(equivalenteLegado, '', unidadeInformada);
      return {
        ...resolucaoAtualizada,
        metodo: `C\u00f3digo IPR legado ${String(dispositivo).trim()} \u2192 ${equivalenteLegado} \u2014 ${resolucaoAtualizada.metodo}`,
        confianca: Math.min(0.72, Number(resolucaoAtualizada.confianca || 0)),
      };
    }

    const descricaoNormalizada = normalizar(dispositivo);
    const exatos = filtrarPorUnidade(
      catalogo.filter((servico) => normalizar(servico.descricao) === descricaoNormalizada),
      unidadeInformada,
    );
    if (exatos.length) {
      const opcoesPontuadas = montarAlternativas(dispositivo, unidadeInformada, exatos[0]);
      return { selecionado: exatos[0], candidatos: opcoesPontuadas.map((resultado) => resultado.servico), opcoesPontuadas, metodo: 'Descri\u00e7\u00e3o exata', confianca: 1 };
    }

    const familiaExataSemFiltro = candidatosPorIdentificador(dispositivo);
    const familiaExata = candidatosPorIdentificador(dispositivo, unidadeInformada);
    const familiaPrefixo = candidatosPorPrefixoIdentificador(dispositivo, unidadeInformada);
    const familiaBueiro = candidatosBocasBueiro(dispositivo, unidadeInformada);
    const familiaIdentificada = familiaExata.length ? familiaExata : familiaPrefixo.length ? familiaPrefixo : familiaBueiro;
    const familiaSemFiltro = familiaIdentificada.length
      ? familiaIdentificada
      : familiaExataSemFiltro.length ? familiaExataSemFiltro : candidatosPorPrefixoIdentificador(dispositivo);
    if (familiaSemFiltro.length && !familiaIdentificada.length && chaveUnidade(unidadeInformada)) {
      const opcoesPontuadas = classificarFamiliaIdentificada(dispositivo, familiaSemFiltro);
      return {
        selecionado: null,
        candidatos: opcoesPontuadas.map((resultado) => resultado.servico),
        opcoesPontuadas,
        metodo: `Unidade incompat\u00edvel: esperado ${[...new Set(familiaSemFiltro.map((servico) => servico.unidade))].join('/')}`,
        confianca: 0,
      };
    }
    if (familiaIdentificada.length) {
      const classificadosFamilia = classificarFamiliaIdentificada(dispositivo, familiaIdentificada);
      const melhorFamilia = classificadosFamilia[0];
      const segundoFamilia = classificadosFamilia[1];
      const selecionado = melhorFamilia.servico;
      const margem = Math.max(0, melhorFamilia.pontuacao - Number(segundoFamilia?.pontuacao || 0));
      const varianteDiscriminada = familiaIdentificada.length === 1 || (melhorFamilia.pontuacao >= 0.46 && margem >= 0.025);
      const confianca = familiaIdentificada.length === 1
        ? 1
        : varianteDiscriminada
          ? Math.min(0.98, 0.78 + Math.min(0.2, margem) + Math.max(0, melhorFamilia.pontuacao - 0.55) * 0.12)
          : 0.68;
      const opcoesPontuadas = montarAlternativas(dispositivo, unidadeInformada, selecionado);
      const nomeTecnico = CORRELACOES_DISPOSITIVOS.get(selecionado.identificadorDispositivo?.sigla) || '';
      return {
        selecionado,
        candidatos: opcoesPontuadas.map((resultado) => resultado.servico),
        opcoesPontuadas,
        metodo: varianteDiscriminada
          ? nomeTecnico ? `Correla\u00e7\u00e3o SICRO: ${nomeTecnico}` : 'Dispositivo SICRO exato'
          : 'Fam\u00edlia SICRO exata \u2014 revisar material e execu\u00e7\u00e3o',
        confianca,
      };
    }

    const classificados = classificarCatalogo(dispositivo, 80, unidadeInformada);
    const melhor = classificados[0];
    const segundo = classificados[1];
    const margem = melhor ? Math.max(0, melhor.pontuacao - Number(segundo?.pontuacao || 0)) : 0;
    const tokensEntrada = tokenizarPesquisa(dispositivo);
    const possuiDimensao = tokensEntrada.some((token) => /^\d+$/.test(token));
    const margemMinima = possuiDimensao ? 0.025 : 0.045;
    const palavrasEntrada = tokensEntrada.filter((token) => !/^\d+$/.test(token));
    const mesmaFamiliaNoTopo = Boolean(melhor?.servico.identificadorDispositivo?.chaveCanonica
      && melhor.servico.identificadorDispositivo.chaveCanonica === segundo?.servico.identificadorDispositivo?.chaveCanonica);
    const familiaDescritivaClara = Boolean(mesmaFamiliaNoTopo
      && palavrasEntrada.length >= 2
      && melhor.pontuacao >= 0.65);
    const identificadorEntrada = extrairIdentificadorDispositivo(dispositivo);
    const codigoConciso = Boolean(identificadorEntrada && tokensExpandidos(dispositivo).length <= 3);
    const siglaCompativel = !codigoConciso || melhor?.servico.identificadorDispositivo?.sigla === identificadorEntrada.sigla;
    const confiancaCalibrada = melhor
      ? Math.max(0, Math.min(1, melhor.pontuacao * 0.9 + Math.min(margem, 0.2) * 0.5))
      : 0;
    const selecionarAutomaticamente = Boolean(melhor
      && siglaCompativel
      && tokensEntrada.length >= 2
      && melhor.pontuacao >= 0.55
      && (margem >= margemMinima || familiaDescritivaClara));
    const opcoesPontuadas = montarAlternativas(dispositivo, unidadeInformada, melhor?.servico || null);
    return {
      selecionado: selecionarAutomaticamente ? melhor.servico : null,
      candidatos: opcoesPontuadas.map((resultado) => resultado.servico),
      opcoesPontuadas,
      metodo: selecionarAutomaticamente
        ? familiaDescritivaClara && margem < margemMinima
          ? 'Fam\u00edlia SICRO prov\u00e1vel \u2014 revisar material e execu\u00e7\u00e3o'
          : 'Correspond\u00eancia autom\u00e1tica'
        : melhor ? 'Sugest\u00f5es para revis\u00e3o' : 'N\u00e3o encontrado',
      confianca: familiaDescritivaClara && margem < margemMinima ? Math.min(0.68, confiancaCalibrada) : confiancaCalibrada,
    };
  }

  function criarItem({ dispositivo, quantidade, codigoInformado = '', unidadeInformada = '', linha = null }) {
    const resolucao = resolverEntrada(dispositivo, codigoInformado, unidadeInformada);
    return {
      id: estado.proximoId++,
      linha,
      dispositivo: String(dispositivo || '').trim(),
      codigoInformado: String(codigoInformado || '').trim(),
      unidadeInformada: String(unidadeInformada || '').trim(),
      quantidade: Number(quantidade),
      bdi: Number(document.getElementById('orcBdi')?.value || 0),
      candidatos: resolucao.candidatos,
      opcoesPontuadas: resolucao.opcoesPontuadas || [],
      selecionado: resolucao.selecionado,
      metodoResolucao: resolucao.metodo,
      confianca: resolucao.confianca,
    };
  }

  function pontuarCabecalho(valor, aliases) {
    if (!valor) return 0;
    let melhor = 0;
    for (const alias of aliases) {
      if (valor === alias) melhor = Math.max(melhor, 100);
      else if (valor.startsWith(`${alias} `) || valor.endsWith(` ${alias}`)) melhor = Math.max(melhor, 82);
      else if (alias.length >= 4 && valor.includes(alias)) melhor = Math.max(melhor, 64);
    }
    return melhor;
  }

  function melhorColuna(valores, aliases, proibidas = []) {
    let melhor = { indice: -1, pontos: 0 };
    valores.forEach((valor, indice) => {
      if (proibidas.includes(indice)) return;
      const pontos = pontuarCabecalho(valor, aliases);
      if (pontos > melhor.pontos) melhor = { indice, pontos };
    });
    return melhor;
  }

  function contarLinhasCompativeis(planilha, linhaInicial, colunaDispositivo, colunaQuantidade) {
    let validas = 0;
    const fim = Math.min(planilha.rowCount || 0, linhaInicial + 35);
    for (let linha = linhaInicial; linha <= fim; linha += 1) {
      const dispositivo = String(textoCelula(planilha.getCell(linha, colunaDispositivo)) || '').trim();
      const quantidade = paraNumero(textoCelula(planilha.getCell(linha, colunaQuantidade)));
      if (dispositivo && Number.isFinite(quantidade) && quantidade > 0) validas += 1;
    }
    return validas;
  }

  function inferirColunasSemCabecalho(workbook) {
    let melhor = null;
    for (const planilha of workbook.worksheets) {
      const totalColunas = Math.min(planilha.columnCount || 0, 16);
      const totalLinhas = Math.min(planilha.rowCount || 0, 80);
      if (totalColunas < 2 || totalLinhas < 2) continue;
      for (let inicio = 1; inicio <= Math.min(20, totalLinhas); inicio += 1) {
        for (let colunaTexto = 1; colunaTexto <= totalColunas; colunaTexto += 1) {
          for (let colunaNumero = 1; colunaNumero <= totalColunas; colunaNumero += 1) {
            if (colunaTexto === colunaNumero) continue;
            let validas = 0;
            const fim = Math.min(totalLinhas, inicio + 24);
            for (let linha = inicio; linha <= fim; linha += 1) {
              const texto = String(textoCelula(planilha.getCell(linha, colunaTexto)) || '').trim();
              const quantidade = paraNumero(textoCelula(planilha.getCell(linha, colunaNumero)));
              if (texto.length >= 3 && !Number.isFinite(paraNumero(texto)) && Number.isFinite(quantidade) && quantidade > 0) validas += 1;
            }
            if (validas >= 2 && (!melhor || validas > melhor.validas)) {
              melhor = {
                planilha,
                linha: inicio - 1,
                linhaDadosInicial: inicio,
                colunaDispositivo: colunaTexto,
                colunaQuantidade: colunaNumero,
                colunaCodigo: null,
                colunaUnidade: null,
                nomesOriginais: { dispositivo: '(inferida)', quantidade: '(inferida)', codigo: '', unidade: '' },
                modo: 'inferido',
                validas,
              };
            }
          }
        }
      }
    }
    return melhor;
  }

  function localizarCabecalho(workbook) {
    const aliasesDispositivo = [
      'DISPOSITIVO', 'DISPOSITIVOS', 'DISPOITIVO', 'DISPOITIVOS', 'SERVICO', 'SERVICOS', 'DESCRICAO', 'DESCRICAO DO ITEM',
      'DESCRICAO DO SERVICO', 'NOME DO DISPOSITIVO', 'TIPO DE DISPOSITIVO', 'ELEMENTO', 'ITEM DE SERVICO',
    ];
    const aliasesQuantidade = [
      'QUANTIDADE', 'QUANT', 'QTD', 'QTDE', 'QTE', 'QUANTITATIVO', 'QUANTIDADE ESTIMADA',
      'METRAGEM', 'COMPRIMENTO', 'EXTENSAO',
    ];
    const aliasesCodigo = ['CODIGO SICRO', 'CODIGO DO SERVICO', 'CODIGO', 'COD', 'ITEM SICRO'];
    const aliasesUnidade = ['UNIDADE', 'UND', 'UNID', 'UN', 'U M', 'UNIDADE DE MEDIDA', 'MEDIDA'];
    const candidatos = [];

    for (const planilha of workbook.worksheets) {
      const limite = Math.min(planilha.rowCount || 0, 100);
      for (let linha = 1; linha <= limite; linha += 1) {
        const valores = [];
        const originais = [];
        const totalColunas = Math.min(Math.max(planilha.columnCount || 0, 2), 60);
        for (let coluna = 1; coluna <= totalColunas; coluna += 1) {
          const original = textoCelula(planilha.getCell(linha, coluna));
          originais.push(String(original ?? '').trim());
          valores.push(normalizar(original));
        }
        const dispositivo = melhorColuna(valores, aliasesDispositivo);
        const quantidade = melhorColuna(valores, aliasesQuantidade, [dispositivo.indice]);
        const codigo = melhorColuna(valores, aliasesCodigo, [dispositivo.indice, quantidade.indice]);
        const unidade = melhorColuna(valores, aliasesUnidade, [dispositivo.indice, quantidade.indice, codigo.indice]);
        if (dispositivo.indice >= 0 && quantidade.indice >= 0 && dispositivo.pontos >= 64 && quantidade.pontos >= 64) {
          const colunaDispositivo = dispositivo.indice + 1;
          const colunaQuantidade = quantidade.indice + 1;
          const validas = contarLinhasCompativeis(planilha, linha + 1, colunaDispositivo, colunaQuantidade);
          const nomePlanilha = normalizar(planilha.name);
          const bonusPlanilha = nomePlanilha.includes('DISPOSITIVO') ? 100
            : nomePlanilha.includes('ENTRADA') ? 80
              : nomePlanilha.includes('ORCAMENTO') ? 60 : 0;
          candidatos.push({
            planilha,
            linha,
            linhaDadosInicial: linha + 1,
            colunaDispositivo,
            colunaQuantidade,
            colunaCodigo: codigo.pontos >= 64 ? codigo.indice + 1 : null,
            colunaUnidade: unidade.pontos >= 64 ? unidade.indice + 1 : null,
            nomesOriginais: {
              dispositivo: originais[dispositivo.indice],
              quantidade: originais[quantidade.indice],
              codigo: codigo.pontos >= 64 ? originais[codigo.indice] : '',
              unidade: unidade.pontos >= 64 ? originais[unidade.indice] : '',
            },
            modo: 'cabecalho',
            pontos: dispositivo.pontos + quantidade.pontos + codigo.pontos + unidade.pontos + Math.min(validas, 15) * 5 + bonusPlanilha,
            validas,
          });
        }
      }
    }
    candidatos.sort((a, b) => b.pontos - a.pontos || b.validas - a.validas);
    return candidatos[0] || inferirColunasSemCabecalho(workbook);
  }

  async function importarArquivo(arquivo, opcoes = {}) {
    if (!arquivo) return;
    if (estado.importando) {
      definirStatus('Aguarde a importa\u00e7\u00e3o atual terminar antes de selecionar outra planilha.');
      return;
    }
    if (!window.ExcelJS || !window.JSZip) {
      definirStatus('N\u00e3o foi poss\u00edvel carregar o leitor de Excel.', 'error');
      atualizarProgressoImportacao(0, 'Leitor de Excel indispon\u00edvel', 'erro', true);
      return;
    }

    estado.importando = true;
    atualizarProgressoImportacao(0, `Preparando ${arquivo.name}`, 'processando', true);
    definirStatus(`Lendo as Notas de Servi\u00e7o e montando o or\u00e7amento de ${arquivo.name}\u2026`);
    try {
      await cederInterface();
      atualizarProgressoImportacao(8, 'Lendo o arquivo selecionado');
      await cederInterface();
      atualizarProgressoImportacao(16, 'Abrindo a estrutura XLSX');
      const workbook = await carregarWorkbookSeletivo(arquivo);
      atualizarProgressoImportacao(38, 'Indexando abas e extraindo dados');
      await cederInterface();
      const resumoNotas = extrairNotasServico(workbook.notasPlanilhas);
      const cabecalho = resumoNotas.encontrado ? null : localizarCabecalho(workbook);
      if (!resumoNotas.encontrado && !cabecalho) throw new Error('N\u00e3o encontrei abas de Notas de Servi\u00e7o nem colunas Dispositivo/Servi\u00e7o e Quantidade/Qtd. nas primeiras linhas do arquivo.');
      const registros = [];
      let linhasInvalidas = 0;
      if (resumoNotas.encontrado) {
        for (const registro of resumoNotas.itens) {
          registros.push({
            dispositivo: registro.dispositivo,
            unidadeInformada: registro.unidadePrincipal,
            quantidade: registro.quantidade,
            linha: registro.linha,
            resumoCategoria: registro.categoria,
            abasOrigem: registro.abasOrigem,
            quantidadesPorCategoria: registro.quantidadesPorCategoria,
          });
        }
      } else {
        let vaziasSeguidas = 0;
        const fim = cabecalho.planilha.rowCount;
        for (let linha = cabecalho.linhaDadosInicial; linha <= fim; linha += 1) {
          const dispositivo = textoCelula(cabecalho.planilha.getCell(linha, cabecalho.colunaDispositivo));
          const codigo = cabecalho.colunaCodigo
            ? textoCelula(cabecalho.planilha.getCell(linha, cabecalho.colunaCodigo))
            : '';
          const unidadeInformada = cabecalho.colunaUnidade
            ? textoCelula(cabecalho.planilha.getCell(linha, cabecalho.colunaUnidade))
            : '';
          const quantidade = paraNumero(textoCelula(cabecalho.planilha.getCell(linha, cabecalho.colunaQuantidade)));
          const termo = String(codigo || dispositivo || '').trim();
          if (!termo && !Number.isFinite(quantidade)) {
            vaziasSeguidas += 1;
            if (vaziasSeguidas >= 30) break;
            continue;
          }
          vaziasSeguidas = 0;
          const marcador = normalizar(dispositivo);
          if (marcador === 'TOTAL' || marcador === 'TOTAIS' || marcador.startsWith('SUBTOTAL')) continue;
          if (!termo || !Number.isFinite(quantidade) || quantidade <= 0) {
            linhasInvalidas += 1;
            continue;
          }
          registros.push({
            dispositivo: String(dispositivo || codigo).trim(),
            codigoInformado: codigo,
            unidadeInformada,
            quantidade,
            linha,
          });
        }
      }

      if (!registros.length) throw new Error('A planilha foi reconhecida, mas n\u00e3o cont\u00e9m linhas v\u00e1lidas com dispositivo e quantidade positiva.');
      atualizarProgressoImportacao(50, `${registros.length} itens extra\u00eddos; iniciando correspond\u00eancia SICRO`);
      await cederInterface();
      const itens = [];
      for (let indice = 0; indice < registros.length; indice += 1) {
        const registro = registros[indice];
        const item = criarItem(registro);
        item.resumoCategoria = registro.resumoCategoria;
        item.abasOrigem = registro.abasOrigem;
        item.quantidadesPorCategoria = registro.quantidadesPorCategoria;
        itens.push(item);
        const processados = indice + 1;
        if (processados === registros.length || processados % 8 === 0) {
          const percentual = 50 + Math.round(processados / registros.length * 36);
          atualizarProgressoImportacao(percentual, `Associando servi\u00e7os SICRO (${processados}/${registros.length})`);
          await cederInterface();
        }
      }
      const resumoImportado = resumoNotas.encontrado ? resumoNotas : extrairResumoPlanilha(workbook.resumoPlanilha);
      associarResumoAosItens(itens, resumoImportado);
      estado.itens = itens;
      estado.resumo = resumoImportado.encontrado ? resumoImportado : null;
      estado.aba = 'orcamento';
      estado.checklistAberto = true;
      estado.arquivoOrigem = arquivo.name;
      estado.deteccao = {
        aba: resumoNotas.encontrado ? resumoNotas.abasReconhecidas.join(' \u00b7 ') : cabecalho.planilha.name,
        linhaCabecalho: cabecalho?.modo === 'cabecalho' ? cabecalho.linha : null,
        modo: resumoNotas.encontrado ? 'notas-servico' : cabecalho.modo,
        colunaDispositivo: resumoNotas.encontrado ? 'Tipo / Projeto Tipo / Obra' : cabecalho.nomesOriginais.dispositivo,
        colunaQuantidade: resumoNotas.encontrado ? 'Extens\u00e3o / ocorr\u00eancias' : cabecalho.nomesOriginais.quantidade,
        colunaCodigo: resumoNotas.encontrado ? 'C\u00f3digo do dispositivo' : cabecalho.nomesOriginais.codigo,
        colunaUnidade: resumoNotas.encontrado ? 'Detectada pela aba' : cabecalho.nomesOriginais.unidade,
        validas: itens.length,
        ignoradas: linhasInvalidas,
      };
      atualizarProgressoImportacao(92, 'Renderizando or\u00e7amento e dashboard');
      await cederInterface();
      renderizarTudo();

      const pendentes = itens.filter((item) => !item.selecionado).length;
      const aproximados = itens.filter((item) => item.metodoResolucao === 'Correspond\u00eancia autom\u00e1tica').length;
      const complemento = linhasInvalidas ? ` ${linhasInvalidas} linha(s) incompleta(s) foram ignoradas.` : '';
      const reconhecimento = resumoNotas.encontrado
        ? `${resumoNotas.abasReconhecidas.length} abas de Notas de Servi\u00e7o reconhecidas automaticamente`
        : cabecalho.modo === 'cabecalho'
          ? `Colunas \u201c${cabecalho.nomesOriginais.dispositivo}\u201d e \u201c${cabecalho.nomesOriginais.quantidade}\u201d reconhecidas`
          : 'Colunas de dispositivo e quantidade inferidas automaticamente';
      const reconhecimentoUnidade = resumoNotas.encontrado
        ? ' Extens\u00f5es e estruturas foram agregadas diretamente dos lan\u00e7amentos das notas.'
        : cabecalho.nomesOriginais.unidade
          ? ` A coluna \u201c${cabecalho.nomesOriginais.unidade}\u201d foi usada para conferir metro ou quantidade.`
          : ' A unidade foi detectada automaticamente pelo servi\u00e7o SICRO.';
      const metros = itens.filter((item) => tipoMedicao(unidadeDoItem(item)) === 'Metro').length;
      const quantidades = itens.filter((item) => tipoMedicao(unidadeDoItem(item)) === 'Quantidade').length;
      const outrasUnidades = itens.filter((item) => !['Metro', 'Quantidade', 'A detectar'].includes(tipoMedicao(unidadeDoItem(item)))).length;
      const resumoUnidades = metros || quantidades || outrasUnidades
        ? ` Classifica\u00e7\u00e3o autom\u00e1tica: ${metros} em metro, ${quantidades} por quantidade${outrasUnidades > 0 ? ` e ${outrasUnidades} em outras unidades SICRO` : ''}.`
        : '';
      const resumoCorrespondencia = aproximados
        ? ` ${aproximados} servi\u00e7o(s) foram associados automaticamente por nome aproximado.`
        : '';
      const resumoPainel = estado.resumo?.origem === 'notas'
        ? ` O Dashboard calculou os consumos IPR 736 para ${estado.resumo.coberturaIpr.encontrados}/${estado.resumo.coberturaIpr.total} dispositivos; ${estado.resumo.semCoeficiente.length} ficaram explicitamente sem coeficiente t\u00e9cnico.`
        : estado.resumo
          ? ` A aba \u201c${estado.resumo.aba}\u201d foi usada como compatibilidade no Dashboard.`
          : ' O Dashboard usar\u00e1 os dados dispon\u00edveis no or\u00e7amento.';
      const avisoTecnico = estado.resumo?.avisos?.length ? ` Aten\u00e7\u00e3o: ${estado.resumo.avisos.join(' ')}` : '';
      definirStatus(`${reconhecimento}.${reconhecimentoUnidade}${resumoUnidades}${resumoCorrespondencia}${resumoPainel}${avisoTecnico} ${itens.length} item(ns) foram convertidos para o padr\u00e3o HID X. ${pendentes ? `${pendentes} n\u00e3o tiveram correspond\u00eancia SICRO suficiente e podem ser ajustados pelo bot\u00e3o Buscar.` : 'Todos os c\u00f3digos e unidades SICRO foram identificados; o checklist detalhado foi aberto abaixo.'}${complemento}`, pendentes ? '' : 'ok');
      atualizarProgressoImportacao(100, 'Importa\u00e7\u00e3o conclu\u00edda', 'concluido');
    } catch (erro) {
      console.error(erro);
      definirStatus(erro.message || 'N\u00e3o foi poss\u00edvel ler o arquivo.', 'error');
      atualizarProgressoImportacao(estado.progressoImportacao.percentual, `Erro: ${erro.message || 'n\u00e3o foi poss\u00edvel ler o arquivo'}`, 'erro');
    } finally {
      estado.importando = false;
      for (const entrada of [document.getElementById('orcArquivo'), document.getElementById('dashboardArquivo')].filter(Boolean)) entrada.value = '';
    }
  }

  function definirStatus(mensagem, tipo = '') {
    for (const status of [document.getElementById('orcStatus'), document.getElementById('dashboardStatus')].filter(Boolean)) {
      status.textContent = mensagem;
      status.className = `orc-status${status.id === 'dashboardStatus' ? ' dash-function-status' : ''} show${tipo ? ` ${tipo}` : ''}`;
    }
  }

  function atualizarEtapas() {
    const total = estado.itens.length;
    const resolvidos = estado.itens.filter((item) => item.selecionado).length;
    const pendentes = total - resolvidos;
    const etapa1 = document.getElementById('orcStep1');
    const etapa2 = document.getElementById('orcStep2');
    const etapa3 = document.getElementById('orcStep3');
    etapa1.dataset.state = total ? 'done' : 'active';
    etapa2.dataset.state = total && pendentes ? 'active' : total ? 'done' : '';
    etapa3.dataset.state = total && !pendentes ? 'active' : '';
  }

  function renderizarResumo() {
    const resolvidos = estado.itens.filter((item) => item.selecionado).length;
    const totalSem = estado.itens.reduce((soma, item) => soma + Number(item.quantidade || 0) * valorSemBdi(item), 0);
    const totalCom = estado.itens.reduce((soma, item) => soma + valorTotal(item), 0);
    document.getElementById('orcResolvidos').textContent = `${resolvidos} / ${estado.itens.length}`;
    document.getElementById('orcTotalSem').textContent = moeda.format(totalSem);
    document.getElementById('orcTotalCom').textContent = moeda.format(totalCom);
  }

  function formatarValorCurto(valor) {
    const numeroValor = Number(valor || 0);
    if (numeroValor >= 1_000_000) return `R$ ${(numeroValor / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`;
    if (numeroValor >= 1_000) return `R$ ${(numeroValor / 1_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`;
    return `R$ ${numeroValor.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`;
  }

  function rotuloGrafico(item) {
    const entrada = String(item?.dispositivo || item?.selecionado?.codigo || 'Item').trim();
    if (entrada.length <= 12) return entrada;
    const identificador = extrairIdentificadorDispositivo(entrada);
    if (identificador) return identificador.partes.length ? `${identificador.sigla} ${identificador.partes.join('-')}` : identificador.sigla;
    return `${entrada.slice(0, 11).trim()}\u2026`;
  }

  function dadosPareto() {
    const ordenados = estado.itens
      .filter((item) => item.selecionado && valorTotal(item) > 0)
      .slice()
      .sort((a, b) => valorTotal(b) - valorTotal(a));
    const total = ordenados.reduce((soma, item) => soma + valorTotal(item), 0);
    const resumo = {
      A: { itens: 0, valor: 0 },
      B: { itens: 0, valor: 0 },
      C: { itens: 0, valor: 0 },
    };
    if (!ordenados.length || total <= 0) return { grupos: [], total: 0, concentracaoTop3: 0, resumo };

    let acumulado = 0;
    const grupos = ordenados.map((item, indice) => {
      const valor = valorTotal(item);
      const participacao = valor / total;
      const acumuladoAnterior = acumulado;
      acumulado = Math.min(1, acumulado + participacao);
      const classe = acumuladoAnterior < 0.8 ? 'A' : acumuladoAnterior < 0.95 ? 'B' : 'C';
      resumo[classe].itens += 1;
      resumo[classe].valor += valor;
      return {
        item,
        posicao: indice + 1,
        rotulo: rotuloGrafico(item),
        descricao: item.selecionado.descricao,
        codigo: item.selecionado.codigo,
        valor,
        participacao,
        acumulado,
        classe,
      };
    });
    const concentracaoTop3 = ordenados.slice(0, 3).reduce((soma, item) => soma + valorTotal(item), 0) / total;
    return { grupos, total, concentracaoTop3, resumo };
  }

  function renderizarPareto() {
    const container = document.getElementById('orcParetoChart');
    const titulo = document.getElementById('orcParetoTitulo');
    const botao = document.getElementById('orcParetoAbrir');
    const legenda = document.getElementById('orcParetoLegenda');
    if (!container || !titulo || !botao || !legenda) return;
    const { grupos, total, concentracaoTop3, resumo } = dadosPareto();
    botao.disabled = !grupos.length;
    if (!grupos.length) {
      titulo.textContent = 'Curva ABC do or\u00e7amento';
      container.setAttribute('aria-label', 'Gr\u00e1fico aguardando itens do or\u00e7amento');
      legenda.innerHTML = '<span class="orc-pareto-key a">Classe A \u00b7 principal</span><span class="orc-pareto-key b">Classe B \u00b7 intermedi\u00e1ria</span><span class="orc-pareto-key c">Classe C \u00b7 menor impacto</span><span class="orc-pareto-key line">% acumulado</span>';
      container.innerHTML = `<div class="orc-pareto-empty"><div>
        <svg viewBox="0 0 420 130" aria-hidden="true">
          <path d="M35 104H400M35 70H400M35 36H400" stroke="#dbe8f4" stroke-width="1" stroke-dasharray="4 5"/>
          <rect x="60" y="46" width="34" height="58" rx="5" fill="#D34B4B" opacity=".28"/><rect x="118" y="60" width="34" height="44" rx="5" fill="#D34B4B" opacity=".22"/><rect x="176" y="72" width="34" height="32" rx="5" fill="#D69A24" opacity=".24"/><rect x="234" y="81" width="34" height="23" rx="5" fill="#3C8C64" opacity=".32"/>
          <path d="M77 54L135 36L193 26L251 20" fill="none" stroke="#123F6D" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <span>Importe a planilha para gerar a mesma Curva ABC da tabela.</span>
      </div></div>`;
      return;
    }

    titulo.textContent = `Curva ABC \u00b7 ${grupos.length} itens \u00b7 Top 3 = ${Math.round(concentracaoTop3 * 100)}%`;
    container.setAttribute('aria-label', `Curva ABC com ${grupos.length} itens ordenados por custo. Os tr\u00eas itens mais caros representam ${Math.round(concentracaoTop3 * 100)} por cento do or\u00e7amento.`);
    legenda.innerHTML = ['A', 'B', 'C'].map((classe) => {
      const dados = resumo[classe];
      const participacao = total ? dados.valor / total : 0;
      return `<span class="orc-pareto-key ${classe.toLowerCase()}"><strong>Classe ${classe}</strong> \u00b7 ${dados.itens} item(ns) \u00b7 ${percentual.format(participacao)}</span>`;
    }).join('') + '<span class="orc-pareto-key line">% acumulado \u00b7 limites 80% e 95%</span>';

    const largura = Math.max(680, 110 + grupos.length * 34);
    const altura = 250;
    const esquerda = 58;
    const direita = 48;
    const topo = 24;
    const base = 184;
    const alturaPlotagem = base - topo;
    const larguraPlotagem = largura - esquerda - direita;
    const passo = larguraPlotagem / grupos.length;
    const larguraBarra = Math.min(26, passo * 0.66);
    const maior = Math.max(...grupos.map((grupo) => grupo.valor), 1);
    const yOitenta = topo + alturaPlotagem * 0.2;
    const yNoventaCinco = topo + alturaPlotagem * 0.05;
    const cores = { A: '#D34B4B', B: '#D69A24', C: '#3C8C64' };
    const fundos = { A: '#D34B4B', B: '#D69A24', C: '#3C8C64' };
    const faixas = ['A', 'B', 'C'].map((classe) => {
      const indices = grupos.map((grupo, indice) => (grupo.classe === classe ? indice : -1)).filter((indice) => indice >= 0);
      if (!indices.length) return '';
      const primeiro = indices[0];
      const ultimo = indices[indices.length - 1];
      const x = esquerda + primeiro * passo;
      const larguraFaixa = (ultimo - primeiro + 1) * passo;
      return `<g><rect x="${x.toFixed(1)}" y="${topo}" width="${larguraFaixa.toFixed(1)}" height="${alturaPlotagem}" rx="5" fill="${fundos[classe]}" opacity=".055"/><text x="${(x + larguraFaixa / 2).toFixed(1)}" y="${topo + 11}" text-anchor="middle" fill="${cores[classe]}" font-size="8" font-weight="900">CLASSE ${classe}</text></g>`;
    }).join('');
    const pontos = [];
    const barras = grupos.map((grupo, indice) => {
      const x = esquerda + indice * passo + (passo - larguraBarra) / 2;
      const alturaBarra = Math.max(2, (grupo.valor / maior) * alturaPlotagem);
      const y = base - alturaBarra;
      const pontoX = x + larguraBarra / 2;
      const pontoY = topo + (1 - grupo.acumulado) * alturaPlotagem;
      pontos.push({ x: pontoX, y: pontoY, percentual: grupo.acumulado });
      return `<g>
        <title>${escapeHtml(`${grupo.posicao}. ${grupo.codigo} \u00b7 ${grupo.descricao}: ${moeda.format(grupo.valor)} \u00b7 ${percentual.format(grupo.participacao)} do total \u00b7 ${percentual.format(grupo.acumulado)} acumulado \u00b7 Classe ${grupo.classe}`)}</title>
        <rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${larguraBarra.toFixed(1)}" height="${alturaBarra.toFixed(1)}" rx="4" fill="${cores[grupo.classe]}"/>
        <text x="${pontoX.toFixed(1)}" y="${base + 13}" text-anchor="middle" fill="#395873" font-size="8" font-weight="900">${grupo.posicao}</text>
        <text x="${pontoX.toFixed(1)}" y="${base + 25}" text-anchor="middle" fill="#6b8196" font-size="7.5">${escapeHtml(grupo.rotulo.length > 8 ? `${grupo.rotulo.slice(0, 7)}\u2026` : grupo.rotulo)}</text>
      </g>`;
    }).join('');
    const caminho = pontos.map((ponto, indice) => `${indice ? 'L' : 'M'}${ponto.x.toFixed(1)} ${ponto.y.toFixed(1)}`).join(' ');
    const marcadores = pontos.map((ponto, indice) => `<g><circle cx="${ponto.x.toFixed(1)}" cy="${ponto.y.toFixed(1)}" r="${indice < 3 ? '3.8' : '3'}" fill="#fff" stroke="#0e9f6e" stroke-width="2"><title>Item ${indice + 1}: ${percentual.format(ponto.percentual)} acumulado</title></circle></g>`).join('');

    container.innerHTML = `<svg viewBox="0 0 ${largura} ${altura}" style="width:${largura}px" aria-hidden="true">
      ${faixas}
      <path d="M${esquerda} ${topo}H${largura - direita}M${esquerda} ${(topo + alturaPlotagem / 2).toFixed(1)}H${largura - direita}M${esquerda} ${base}H${largura - direita}" stroke="#dce8f3" stroke-width="1" stroke-dasharray="4 5"/>
      <path d="M${esquerda} ${yOitenta.toFixed(1)}H${largura - direita}" stroke="#62ad92" stroke-width="1.2" stroke-dasharray="5 5"/>
      <path d="M${esquerda} ${yNoventaCinco.toFixed(1)}H${largura - direita}" stroke="#8bc7b1" stroke-width="1.2" stroke-dasharray="3 5"/>
      <text x="${esquerda - 6}" y="${topo + 3}" text-anchor="end" fill="#6c8298" font-size="8">${escapeHtml(formatarValorCurto(maior))}</text>
      <text x="${esquerda - 6}" y="${base + 3}" text-anchor="end" fill="#6c8298" font-size="8">R$ 0</text>
      <text x="${largura - direita + 6}" y="${topo + 3}" fill="#188763" font-size="8">100%</text>
      <text x="${largura - direita + 6}" y="${yNoventaCinco + 3}" fill="#188763" font-size="8" font-weight="800">95%</text>
      <text x="${largura - direita + 6}" y="${yOitenta + 3}" fill="#188763" font-size="8" font-weight="800">80%</text>
      ${barras}
      <path d="${caminho}" fill="none" stroke="#0e9f6e" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
      ${marcadores}
      <text x="${esquerda}" y="${altura - 10}" fill="#6b8196" font-size="8">Itens na mesma ordem da tabela Curva ABC \u00b7 passe o mouse para ver c\u00f3digo, valor e percentuais</text>
    </svg>`;
  }

  function detalheCorrespondencia(item) {
    if (!item.selecionado) return '';
    const confianca = Math.max(0, Math.min(1, Number(item.confianca ?? 1)));
    const classe = confianca >= 0.72 ? 'high' : confianca >= 0.48 ? 'medium' : 'low';
    return `<small class="orc-match ${classe}">${escapeHtml(item.metodoResolucao || 'Correspond\u00eancia autom\u00e1tica')} \u00b7 ${Math.round(confianca * 100)}%</small>`;
  }

  function statusChecklistItem(item) {
    if (!item.selecionado) return { chave: 'missing', rotulo: 'N\u00e3o encontrado' };
    const precisaRevisao = Number(item.confianca || 0) < 0.72 || normalizar(item.metodoResolucao).includes('REVISAR');
    if (precisaRevisao) return { chave: 'review', rotulo: 'Revisar sugest\u00e3o' };
    return { chave: 'found', rotulo: 'Encontrado' };
  }

  function resumirChecklist(itens = estado.itens) {
    const resumo = { total: itens.length, encontrados: 0, revisar: 0, naoEncontrados: 0, exatos: 0, aproximados: 0 };
    for (const item of itens) {
      const status = statusChecklistItem(item);
      if (item.selecionado) resumo.encontrados += 1;
      if (status.chave === 'review') resumo.revisar += 1;
      if (status.chave === 'missing') resumo.naoEncontrados += 1;
      if (item.metodoResolucao === 'Correspond\u00eancia autom\u00e1tica') resumo.aproximados += 1;
      else if (item.selecionado) resumo.exatos += 1;
    }
    return resumo;
  }

  function renderizarChecklist() {
    const painel = document.getElementById('orcChecklist');
    const botao = document.getElementById('orcChecklistBtn');
    if (!painel || !botao) return;
    const resumo = resumirChecklist();
    botao.disabled = !resumo.total;
    botao.textContent = resumo.total ? `${estado.checklistAberto ? 'Ocultar' : 'Ver'} checklist (${resumo.encontrados}/${resumo.total})` : 'Checklist da importa\u00e7\u00e3o';
    painel.hidden = !resumo.total || !estado.checklistAberto;
    if (painel.hidden) return;
    const titulo = resumo.naoEncontrados
      ? `${resumo.naoEncontrados} item(ns) ainda n\u00e3o foram encontrados`
      : resumo.revisar
        ? `Todos encontrados; ${resumo.revisar} sugest\u00e3o(\u00f5es) merecem revis\u00e3o`
        : 'Todos os itens foram encontrados';
    painel.innerHTML = `
      <div class="orc-check-head"><div><strong>${titulo}</strong><small>Clique em \u201cVer op\u00e7\u00f5es\u201d para comparar outros c\u00f3digos e formas de execu\u00e7\u00e3o do mesmo dispositivo.</small></div></div>
      <div class="orc-check-summary">
        <div class="orc-check-metric"><small>Itens lidos</small><b>${resumo.total}</b></div>
        <div class="orc-check-metric"><small>Encontrados</small><b>${resumo.encontrados}</b></div>
        <div class="orc-check-metric"><small>Revisar</small><b>${resumo.revisar}</b></div>
        <div class="orc-check-metric"><small>N\u00e3o encontrados</small><b>${resumo.naoEncontrados}</b></div>
      </div>
      <div class="orc-check-list">${estado.itens.map((item, indice) => {
        const status = statusChecklistItem(item);
        const servico = item.selecionado;
        const detalhe = servico
          ? `${servico.codigo} \u00b7 ${servico.descricao} \u00b7 ${item.metodoResolucao} (${Math.round(Number(item.confianca || 0) * 100)}%)`
          : 'Nenhum servi\u00e7o SICRO associado automaticamente';
        return `<div class="orc-check-row ${status.chave}">
          <span class="orc-check-icon">${status.chave === 'missing' ? '!' : status.chave === 'review' ? '?' : '\u2713'}</span>
          <span class="orc-check-copy"><strong>${indice + 1}. ${escapeHtml(item.dispositivo)}</strong><small>${escapeHtml(detalhe)}</small></span>
          <span class="orc-check-status">${status.rotulo}</span>
          <button class="orc-choice${servico ? '' : ' warn'}" type="button" data-check-id="${item.id}">Ver op\u00e7\u00f5es</button>
        </div>`;
      }).join('')}</div>`;
  }

  function renderizarOrcamento() {
    const tabela = document.getElementById('orcTabela');
    const vazio = document.getElementById('orcVazio');
    if (!estado.itens.length) {
      tabela.hidden = true;
      vazio.hidden = false;
      return;
    }

    vazio.hidden = true;
    tabela.hidden = false;
    tabela.innerHTML = `
      <thead><tr>
        <th>Item</th><th>Entrada</th><th>C\u00f3digo</th><th>Servi\u00e7o SICRO</th><th>Und.</th><th>Medi\u00e7\u00e3o</th>
        <th>Quant.</th><th>Unit. sem BDI</th><th>BDI</th><th>Unit. com BDI</th><th>Total</th><th></th>
      </tr></thead>
      <tbody>${estado.itens.map((item, indice) => {
        const servico = item.selecionado;
        const candidatos = item.candidatos?.length || 0;
        return `<tr data-id="${item.id}">
          <td class="center">${indice + 1}</td>
          <td class="desc">${escapeHtml(item.dispositivo)}</td>
          <td class="center">${servico ? `<code>${escapeHtml(servico.codigo)}</code>` : '\u2014'}</td>
          <td class="desc">${servico ? `<button class="orc-service-link" data-acao="escolher" type="button" title="Clique para comparar outros c\u00f3digos deste dispositivo">${escapeHtml(servico.descricao)}${detalheCorrespondencia(item)}</button>` : '<span style="color:#a46400">Servi\u00e7o n\u00e3o encontrado automaticamente</span>'}</td>
          <td class="center">${servico ? escapeHtml(servico.unidade) : '\u2014'}</td>
          <td class="center">${escapeHtml(tipoMedicao(unidadeDoItem(item)))}</td>
          <td class="num"><input data-campo="quantidade" type="number" min="0" step="any" value="${item.quantidade}"></td>
          <td class="num">${servico ? moeda.format(valorSemBdi(item)) : '\u2014'}</td>
          <td class="num"><input data-campo="bdi" type="number" min="0" step="0.01" value="${item.bdi}">%</td>
          <td class="num">${servico ? moeda.format(valorComBdi(item)) : '\u2014'}</td>
          <td class="num"><strong>${servico ? moeda.format(valorTotal(item)) : '\u2014'}</strong></td>
          <td><button class="orc-choice${servico ? '' : ' warn'}" data-acao="escolher" type="button">${servico ? `Ver op\u00e7\u00f5es (${candidatos})` : candidatos ? `Escolher (${candidatos})` : 'Buscar'}</button><button class="orc-choice" data-acao="remover" type="button" style="margin-left:5px;background:#fff0f1;color:#b42f38">\u00d7</button></td>
        </tr>`;
      }).join('')}</tbody>`;
  }

  function renderizarAbc() {
    const tabela = document.getElementById('orcTabela');
    const vazio = document.getElementById('orcVazio');
    const { grupos } = dadosPareto();
    if (!grupos.length) {
      tabela.hidden = true;
      vazio.hidden = false;
      vazio.innerHTML = '<div><strong>Curva ABC aguardando c\u00f3digos</strong>Confirme pelo menos um servi\u00e7o SICRO para visualizar a ordena\u00e7\u00e3o.</div>';
      return;
    }
    vazio.hidden = true;
    tabela.hidden = false;
    tabela.innerHTML = `
      <thead><tr><th>Posi\u00e7\u00e3o</th><th>Classe</th><th>C\u00f3digo</th><th>Servi\u00e7o SICRO</th><th>Und.</th><th>Quant.</th><th>Unit. com BDI</th><th>Total</th><th>%</th><th>% acumulado</th></tr></thead>
      <tbody>${grupos.map((grupo) => {
        const item = grupo.item;
        return `<tr><td class="center">${grupo.posicao}</td><td class="center"><span class="orc-abc-badge ${grupo.classe.toLowerCase()}">${grupo.classe}</span></td><td class="center"><code>${escapeHtml(item.selecionado.codigo)}</code></td><td class="desc">${escapeHtml(item.selecionado.descricao)}</td><td class="center">${escapeHtml(item.selecionado.unidade)}</td><td class="num">${numero.format(item.quantidade)}</td><td class="num">${moeda.format(valorComBdi(item))}</td><td class="num"><strong>${moeda.format(grupo.valor)}</strong></td><td class="num">${percentual.format(grupo.participacao)}</td><td class="num">${percentual.format(grupo.acumulado)}</td></tr>`;
      }).join('')}</tbody>`;
  }

  function vazioGraficoDashboard(titulo, mensagem) {
    return `<div class="orc-dash-chart-empty"><span aria-hidden="true">\u25a5</span><strong>${escapeHtml(titulo)}</strong><small>${escapeHtml(mensagem)}</small></div>`;
  }

  function barrasConcretoDashboard(dados, formatador) {
    if (!dados.length) return vazioGraficoDashboard('Sem volumes de concreto', 'Nenhum dispositivo importado possui coeficiente exato de concreto IPR 736.');
    const maior = Math.max(...dados.flatMap((item) => [Number(item.concreto20 || 0), Number(item.concreto25 || 0)]), 1);
    return `<div class="orc-dash-compare" role="img" aria-label="Volumes de concreto por dispositivo, separados por resist\u00eancia">
      <div class="orc-dash-compare-legend"><span class="c20">Concreto \u2265 20 MPa</span><span class="c25">Concreto \u2265 25 MPa</span></div>
      ${dados.map((item) => `<div class="orc-dash-compare-row">
        <span class="orc-dash-compare-label">${escapeHtml(item.rotulo)}</span>
        <span class="orc-dash-compare-bars">
          <span class="orc-dash-compare-line"><i class="c20" style="width:${Math.max(0, Math.min(100, item.concreto20 / maior * 100)).toFixed(2)}%"></i><b>${escapeHtml(formatador(item.concreto20))}</b></span>
          <span class="orc-dash-compare-line"><i class="c25" style="width:${Math.max(0, Math.min(100, item.concreto25 / maior * 100)).toFixed(2)}%"></i><b>${escapeHtml(formatador(item.concreto25))}</b></span>
        </span>
      </div>`).join('')}
    </div>`;
  }

  function rotuloCurtoDashboard(rotulo, limite = 9) {
    const texto = String(rotulo || '').trim();
    return texto.length > limite ? `${texto.slice(0, Math.max(1, limite - 1))}\u2026` : texto;
  }

  function selecionarAmostraDashboard(dados, limite, obterValor) {
    const itens = dados.slice().sort((a, b) => obterValor(b) - obterValor(a));
    if (!Number.isFinite(limite) || limite <= 0 || itens.length <= limite) {
      return { amostra: itens, cobertura: 1, limitada: false };
    }
    const valorCorte = obterValor(itens[limite - 1]);
    let quantidade = limite;
    while (quantidade < itens.length && obterValor(itens[quantidade]) === valorCorte) quantidade += 1;
    const amostra = itens.slice(0, quantidade);
    const total = itens.reduce((soma, item) => soma + Math.max(0, obterValor(item)), 0);
    const totalAmostra = amostra.reduce((soma, item) => soma + Math.max(0, obterValor(item)), 0);
    return { amostra, cobertura: total > 0 ? totalAmostra / total : 0, limitada: amostra.length < itens.length };
  }

  function notaCoberturaDashboard(amostra, total, cobertura, contexto) {
    const valor = Math.max(0, Math.min(1, Number(cobertura || 0))) * 100;
    return `Top ${amostra} de ${total} \u00b7 ${valor.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}% ${contexto}`;
  }

  function colunasDashboard(dados, formatador, classe = 'extension', limite = 10, compacto = false, contextoCobertura = 'do total') {
    if (!dados.length) return vazioGraficoDashboard('Sem dados para este gr\u00e1fico', 'Os valores aparecer\u00e3o ap\u00f3s a importa\u00e7\u00e3o e a confirma\u00e7\u00e3o dos servi\u00e7os.');
    const valorItem = (item) => {
      const valor = Number(item?.valor || 0);
      return Number.isFinite(valor) ? Math.max(0, valor) : 0;
    };
    const selecao = selecionarAmostraDashboard(dados, limite, valorItem);
    const { amostra } = selecao;
    const maior = amostra.reduce((maximo, item) => Math.max(maximo, valorItem(item)), 0);
    const metade = maior / 2;
    return `<div class="orc-column-chart ${compacto ? 'compact' : ''}" role="img" aria-label="Gr\u00e1fico de colunas com ${amostra.length} itens">
      <div class="orc-column-axis" aria-hidden="true"><span>${escapeHtml(formatador(maior))}</span><span>${escapeHtml(formatador(metade))}</span><span>${escapeHtml(formatador(0))}</span></div>
      <div class="orc-column-grid" aria-hidden="true"></div>
      <div class="orc-column-plot">${amostra.map((item) => {
        const valor = valorItem(item);
        const proporcao = maior > 0 ? Math.max(0, Math.min(100, valor / maior * 100)) : 0;
        const valorFormatado = formatador(valor);
        return `<div class="orc-column-item" title="${escapeHtml(`${item.rotulo}: ${valorFormatado}`)}">
          <b>${escapeHtml(valorFormatado)}</b>
          <span class="orc-column-bar-space"><i class="${classe}" style="height:${proporcao.toFixed(2)}%"></i></span>
          <small>${escapeHtml(rotuloCurtoDashboard(item.rotulo, compacto ? 7 : 9))}</small>
        </div>`;
      }).join('')}</div>
      ${selecao.limitada ? `<div class="orc-column-note">${notaCoberturaDashboard(amostra.length, dados.length, selecao.cobertura, contextoCobertura)}</div>` : ''}
    </div>`;
  }

  function colunasConcretoDashboard(dados, formatador, limite = 10) {
    if (!dados.length) return vazioGraficoDashboard('Sem volumes de concreto', 'Nenhum dispositivo importado possui coeficiente de concreto IPR 736.');
    const series = [
      { chave: 'concreto15', rotulo: '\u2265 15 MPa', classe: 'c15' },
      { chave: 'concreto20', rotulo: '\u2265 20 MPa', classe: 'c20' },
      { chave: 'concreto22', rotulo: '\u2265 22 MPa', classe: 'c22' },
      { chave: 'concreto25', rotulo: '\u2265 25 MPa', classe: 'c25' },
    ].filter((serie) => dados.some((item) => Number(item?.[serie.chave] || 0) > 0));
    const valorSerie = (valor) => {
      const numeroValor = Number(valor || 0);
      return Number.isFinite(numeroValor) ? Math.max(0, numeroValor) : 0;
    };
    const totalItem = (item) => series.reduce((soma, serie) => soma + valorSerie(item?.[serie.chave]), 0);
    const selecao = selecionarAmostraDashboard(dados, limite, totalItem);
    const { amostra } = selecao;
    const maior = amostra.reduce((maximo, item) => Math.max(maximo, ...series.map((serie) => valorSerie(item?.[serie.chave]))), 0);
    const metade = maior / 2;
    return `<div class="orc-column-chart grouped" role="img" aria-label="Gr\u00e1fico de colunas agrupadas dos volumes de concreto por resist\u00eancia">
      <div class="orc-column-series">${series.map((serie) => `<span class="${serie.classe}">${serie.rotulo}</span>`).join('')}</div>
      <div class="orc-column-axis" aria-hidden="true"><span>${escapeHtml(formatador(maior))}</span><span>${escapeHtml(formatador(metade))}</span><span>${escapeHtml(formatador(0))}</span></div>
      <div class="orc-column-grid" aria-hidden="true"></div>
      <div class="orc-column-plot">${amostra.map((item) => `<div class="orc-column-item" title="${escapeHtml(`${item.rotulo}: ${series.map((serie) => `${serie.rotulo} ${formatador(item?.[serie.chave])}`).join('; ')}`)}">
        <b>${escapeHtml(formatador(totalItem(item)))}</b>
        <span class="orc-column-bar-space orc-column-group">
          ${series.map((serie) => `<i class="${serie.classe}" style="height:${(maior > 0 ? Math.max(0, Math.min(100, valorSerie(item?.[serie.chave]) / maior * 100)) : 0).toFixed(2)}%"></i>`).join('')}
        </span>
        <small>${escapeHtml(rotuloCurtoDashboard(item.rotulo, 8))}</small>
      </div>`).join('')}</div>
      ${selecao.limitada ? `<div class="orc-column-note">${notaCoberturaDashboard(amostra.length, dados.length, selecao.cobertura, 'do volume')}</div>` : ''}
    </div>`;
  }

  function barrasAbcDashboard(grupos, formatador) {
    if (!grupos.length) return vazioGraficoDashboard('Curva ABC sem pre\u00e7os', 'Confirme os servi\u00e7os SICRO para calcular a participa\u00e7\u00e3o financeira.');
    const maior = Math.max(...grupos.map((grupo) => Number(grupo.valor || 0)), 1);
    return `<div class="orc-dash-abc-cost" role="img" aria-label="Curva ABC de pre\u00e7os com ${grupos.length} servi\u00e7os">
      ${grupos.map((grupo) => {
        const largura = Math.max(0, Math.min(100, Number(grupo.valor || 0) / maior * 100));
        const rotulo = grupo.item?.dispositivo || grupo.rotulo;
        return `<div class="orc-dash-abc-cost-row">
          <span class="orc-dash-abc-class ${grupo.classe.toLowerCase()}">${grupo.classe}</span>
          <span class="orc-dash-abc-cost-label">${grupo.posicao}. ${escapeHtml(rotulo)}</span>
          <span class="orc-dash-abc-cost-track"><i class="${grupo.classe.toLowerCase()}" style="width:${largura.toFixed(2)}%"></i></span>
          <strong>${escapeHtml(formatador(grupo.valor))}</strong>
          <small>${percentual.format(grupo.acumulado)} acum.</small>
        </div>`;
      }).join('')}
    </div>`;
  }

  function graficoLinhaAbcDashboard(grupos) {
    if (!grupos.length) return vazioGraficoDashboard('Curva ABC sem pre\u00e7os', 'Confirme os servi\u00e7os SICRO para calcular a curva acumulada.');
    const largura = 520;
    const altura = 190;
    const margem = { esquerda: 64, direita: 39, topo: 15, base: 29 };
    const faixaX = largura - margem.esquerda - margem.direita;
    const faixaY = altura - margem.topo - margem.base;
    const passo = faixaX / grupos.length;
    const larguraBarra = Math.max(3, Math.min(20, passo * 0.64));
    const maiorCusto = grupos.reduce((maximo, grupo) => Math.max(maximo, Number(grupo.valor || 0)), 0);
    const x = (indice) => margem.esquerda + indice * passo + passo / 2;
    const yCusto = (valor) => margem.topo + (1 - (maiorCusto > 0 ? Math.max(0, Number(valor || 0)) / maiorCusto : 0)) * faixaY;
    const yPercentual = (valor) => margem.topo + (1 - Math.max(0, Math.min(1, Number(valor || 0)))) * faixaY;
    const acumulados = grupos.map((grupo, indice) => (indice === grupos.length - 1 ? 1 : Math.max(0, Math.min(1, Number(grupo.acumulado || 0)))));
    const pontosAcumulados = acumulados.map((valor, indice) => `${x(indice).toFixed(1)},${yPercentual(valor).toFixed(1)}`).join(' ');
    const indicesRotulo = [...new Set([0, Math.floor((grupos.length - 1) / 2), grupos.length - 1])];
    const cores = { A: '#D34B4B', B: '#D69A24', C: '#3C8C64' };
    return `<div class="orc-ref-line-chart" role="img" aria-label="Pareto combinado com custos em reais e percentual acumulado">
      <svg viewBox="0 0 ${largura} ${altura}" aria-hidden="true">
        ${[0, 0.5, 1].map((fracao) => `<line x1="${margem.esquerda}" y1="${yCusto(maiorCusto * fracao)}" x2="${largura - margem.direita}" y2="${yCusto(maiorCusto * fracao)}" class="grid cost-grid"></line><text x="${margem.esquerda - 7}" y="${yCusto(maiorCusto * fracao) + 3}" text-anchor="end" class="axis-left">${escapeHtml(formatarValorCurto(maiorCusto * fracao))}</text>`).join('')}
        ${[0.8, 0.95].map((valor) => `<line x1="${margem.esquerda}" y1="${yPercentual(valor)}" x2="${largura - margem.direita}" y2="${yPercentual(valor)}" class="grid pareto-target target-${Math.round(valor * 100)}"></line><text x="${largura - margem.direita + 5}" y="${yPercentual(valor) + 3}" class="axis-right target-label">${Math.round(valor * 100)}%</text>`).join('')}
        <text x="${largura - margem.direita + 5}" y="${margem.topo + 3}" class="axis-right">100%</text><text x="${largura - margem.direita + 5}" y="${altura - margem.base + 3}" class="axis-right">0%</text>
        ${grupos.map((grupo, indice) => {
          const y = yCusto(grupo.valor);
          const alturaBarra = Math.max(0, altura - margem.base - y);
          return `<rect x="${(x(indice) - larguraBarra / 2).toFixed(1)}" y="${y.toFixed(1)}" width="${larguraBarra.toFixed(1)}" height="${alturaBarra.toFixed(1)}" rx="2" fill="${cores[grupo.classe] || cores.C}" class="pareto-bar class-${grupo.classe.toLowerCase()}"><title>${escapeHtml(`${grupo.posicao}. ${grupo.rotulo}: ${moeda.format(grupo.valor)} \u00b7 Classe ${grupo.classe}`)}</title></rect>`;
        }).join('')}
        <polyline points="${pontosAcumulados}" class="cumulative-line"></polyline>
        ${acumulados.map((valor, indice) => `<circle cx="${x(indice)}" cy="${yPercentual(valor)}" r="2.2" class="cumulative-point"${indice === acumulados.length - 1 ? ' data-acumulado="100%"' : ''}></circle>`).join('')}
        ${indicesRotulo.map((indice) => `<text x="${x(indice)}" y="${altura - 8}" text-anchor="middle">${indice + 1}</text>`).join('')}
      </svg>
      <div class="orc-ref-line-legend"><span class="cost-a">Custo A</span><span class="cost-b">Custo B</span><span class="cost-c">Custo C</span><span class="cumulative">% acumulado</span></div>
    </div>`;
  }

  function celulaCalorDashboard(valor, maximo, formatador, tom = 'blue') {
    if (valor == null) return '<span class="orc-dash-na">\u2014</span>';
    const numeroValor = Number(valor || 0);
    const proporcao = maximo > 0 ? Math.max(0, Math.min(100, numeroValor / maximo * 100)) : 0;
    return `<span class="orc-ref-heat ${tom}" style="--heat:${proporcao.toFixed(2)}%"><b>${escapeHtml(formatador(numeroValor))}</b></span>`;
  }

  function dadosDashboard() {
    const resumoPlanilha = estado.resumo?.encontrado ? estado.resumo : null;
    const confirmados = estado.itens.filter((item) => item.selecionado);
    const totalSem = estado.itens.reduce((soma, item) => soma + Number(item.quantidade || 0) * valorSemBdi(item), 0);
    const totalCom = estado.itens.reduce((soma, item) => soma + valorTotal(item), 0);
    const custosPorDispositivo = estado.itens.reduce((mapa, item) => {
      const chave = normalizar(item.dispositivo);
      const atual = mapa.get(chave) || { custo: 0, encontrado: false };
      atual.custo += valorTotal(item);
      atual.encontrado = atual.encontrado || Boolean(item.selecionado);
      mapa.set(chave, atual);
      return mapa;
    }, new Map());
    const linhasResumo = resumoPlanilha
      ? resumoPlanilha.itens.map((item) => {
        const orcamento = custosPorDispositivo.get(normalizar(item.dispositivo));
        return { ...item, custo: Number(orcamento?.custo || 0), custoEncontrado: Boolean(orcamento?.encontrado) };
      })
      : estado.itens.map((item) => ({
        categoria: item.resumoCategoria || categoriaDispositivoFallback(item.dispositivo),
        dispositivo: item.dispositivo,
        quantidade: Number(item.quantidade || 0),
        unidadePrincipal: tipoMedicao(unidadeDoItem(item)) === 'Metro' ? 'm' : 'un',
        escavacao: null,
        concreto15: null,
        concreto20: null,
        concreto22: null,
        concreto25: null,
        area: null,
        aco: null,
        consumoIpr: null,
        custo: valorTotal(item),
        custoEncontrado: Boolean(item.selecionado),
      }));
    const extensoes = linhasResumo.filter((item) => item.unidadePrincipal === 'm' && item.quantidade > 0)
      .map((item) => ({ rotulo: item.dispositivo, valor: item.quantidade })).sort((a, b) => b.valor - a.valor);
    const estruturas = linhasResumo.filter((item) => item.unidadePrincipal === 'un' && item.quantidade > 0)
      .map((item) => ({ rotulo: item.dispositivo, valor: item.quantidade })).sort((a, b) => b.valor - a.valor);
    const escavacoes = linhasResumo.filter((item) => item.escavacao != null)
      .map((item) => ({ rotulo: item.dispositivo, valor: Number(item.escavacao || 0) })).sort((a, b) => b.valor - a.valor);
    const concretos = linhasResumo.filter((item) => ['concreto15', 'concreto20', 'concreto22', 'concreto25'].some((chave) => item[chave] != null))
      .map((item) => ({
        rotulo: item.dispositivo,
        concreto15: Number(item.concreto15 || 0),
        concreto20: Number(item.concreto20 || 0),
        concreto22: Number(item.concreto22 || 0),
        concreto25: Number(item.concreto25 || 0),
      }))
      .sort((a, b) => (b.concreto15 + b.concreto20 + b.concreto22 + b.concreto25) - (a.concreto15 + a.concreto20 + a.concreto22 + a.concreto25));
    const areas = linhasResumo.filter((item) => item.area != null)
      .map((item) => ({ rotulo: item.dispositivo, valor: Number(item.area || 0) })).sort((a, b) => b.valor - a.valor);
    const acos = linhasResumo.filter((item) => item.aco != null)
      .map((item) => ({ rotulo: item.dispositivo, valor: Number(item.aco || 0) })).sort((a, b) => b.valor - a.valor);
    const custosPorCategoria = [...estado.itens.reduce((mapa, item) => {
      const distribuicao = item.quantidadesPorCategoria instanceof Map
        ? [...item.quantidadesPorCategoria.entries()].filter(([, quantidade]) => Number(quantidade) > 0)
        : [];
      const quantidadeDistribuida = distribuicao.reduce((soma, [, quantidade]) => soma + Number(quantidade), 0);
      if (distribuicao.length && quantidadeDistribuida > 0) {
        for (const [categoria, quantidade] of distribuicao) {
          const parcela = valorTotal(item) * Number(quantidade) / quantidadeDistribuida;
          mapa.set(categoria, (mapa.get(categoria) || 0) + parcela);
        }
      } else {
        const chave = item.resumoCategoria || categoriaDispositivoFallback(item.dispositivo);
        mapa.set(chave, (mapa.get(chave) || 0) + valorTotal(item));
      }
      return mapa;
    }, new Map()).entries()].map(([rotulo, valor]) => ({ rotulo, valor })).sort((a, b) => b.valor - a.valor);
    const extensaoTotal = resumoPlanilha
      ? Number(resumoPlanilha.totais.extensao || 0)
      : extensoes.reduce((soma, item) => soma + item.valor, 0);
    const estruturasTotal = resumoPlanilha
      ? Number(resumoPlanilha.totais.quantidade || 0)
      : estruturas.reduce((soma, item) => soma + item.valor, 0);
    return {
      resumoPlanilha,
      confirmados,
      totalSem,
      totalCom,
      impactoBdi: Math.max(0, totalCom - totalSem),
      linhasResumo,
      extensoes,
      estruturas,
      escavacoes,
      concretos,
      areas,
      acos,
      custosPorCategoria,
      metricas: {
        extensao: { valor: extensaoTotal, disponivel: extensoes.length > 0, unidade: 'm' },
        quantidade: { valor: estruturasTotal, disponivel: estruturas.length > 0, unidade: 'un' },
        escavacao: { valor: Number(resumoPlanilha?.totais.escavacao || 0), disponivel: Number(resumoPlanilha?.disponibilidade.escavacao || 0) > 0, unidade: 'm\u00b3' },
        concreto15: { valor: Number(resumoPlanilha?.totais.concreto15 || 0), disponivel: Number(resumoPlanilha?.disponibilidade.concreto15 || 0) > 0, unidade: 'm\u00b3' },
        concreto20: { valor: Number(resumoPlanilha?.totais.concreto20 || 0), disponivel: Number(resumoPlanilha?.disponibilidade.concreto20 || 0) > 0, unidade: 'm\u00b3' },
        concreto22: { valor: Number(resumoPlanilha?.totais.concreto22 || 0), disponivel: Number(resumoPlanilha?.disponibilidade.concreto22 || 0) > 0, unidade: 'm\u00b3' },
        concreto25: { valor: Number(resumoPlanilha?.totais.concreto25 || 0), disponivel: Number(resumoPlanilha?.disponibilidade.concreto25 || 0) > 0, unidade: 'm\u00b3' },
        area: { valor: Number(resumoPlanilha?.totais.area || 0), disponivel: Number(resumoPlanilha?.disponibilidade.area || 0) > 0, unidade: 'm\u00b2' },
        aco: { valor: Number(resumoPlanilha?.totais.aco || 0), disponivel: Number(resumoPlanilha?.disponibilidade.aco || 0) > 0, unidade: 'kg' },
      },
    };
  }

  function renderizarDashboard() {
    const painel = document.getElementById('orcDashboard');
    if (!painel) return;
    if (!estado.itens.length) {
      painel.innerHTML = `<div class="orc-dash-empty"><div>
        <span class="orc-dash-empty-mark" aria-hidden="true">\u25a5</span>
        <strong>Dashboard aguardando a Nota de Servi\u00e7o</strong>
        <span>Arraste a planilha para o HID X ler diretamente as Notas de Servi\u00e7o, calcular os consumos IPR 736 e montar or\u00e7amento, BDI e Curva ABC.</span>
      </div></div>`;
      return;
    }

    const dados = dadosDashboard();
    const { grupos, resumo: abcResumo } = dadosPareto();
    const participacoes = ['A', 'B', 'C'].map((classe) => ({
      classe,
      valor: Number(abcResumo[classe]?.valor || 0),
      itens: Number(abcResumo[classe]?.itens || 0),
      percentual: dados.totalCom > 0 ? Number(abcResumo[classe]?.valor || 0) / dados.totalCom : 0,
    }));
    let acumulado = 0;
    const cores = { A: '#D34B4B', B: '#D69A24', C: '#3C8C64' };
    const gradiente = participacoes.map((item) => {
      const inicio = acumulado;
      acumulado += item.percentual * 100;
      return `${cores[item.classe]} ${inicio.toFixed(2)}% ${acumulado.toFixed(2)}%`;
    }).join(', ');
    const formatarNumero = (valor, unidade) => `${Number(valor || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}${unidade ? ` ${unidade}` : ''}`;
    const kpiReferencia = (icone, titulo, metrica, nota, tom) => metrica.disponivel
      ? `<article class="orc-ref-kpi ${tom}"><span class="orc-ref-kpi-icon">${icone}</span><div><small>${titulo}</small><strong>${formatarNumero(metrica.valor, metrica.unidade)}</strong><em>${nota}</em></div></article>`
      : `<article class="orc-ref-kpi missing ${tom}"><span class="orc-ref-kpi-icon">${icone}</span><div><small>${titulo}</small><strong>Sem dado</strong><em>Sem coeficiente t\u00e9cnico exato</em></div></article>`;
    const concretoTotal = {
      valor: dados.metricas.concreto15.valor + dados.metricas.concreto20.valor + dados.metricas.concreto22.valor + dados.metricas.concreto25.valor,
      disponivel: dados.metricas.concreto15.disponivel || dados.metricas.concreto20.disponivel || dados.metricas.concreto22.disponivel || dados.metricas.concreto25.disponivel,
      unidade: 'm\u00b3',
    };
    const camposPendentes = [
      !dados.metricas.escavacao.disponivel ? 'escava\u00e7\u00e3o' : '',
      !concretoTotal.disponivel ? 'concreto' : '',
      !dados.metricas.area.disponivel ? '\u00e1rea de f\u00f4rma' : '',
    ].filter(Boolean);
    const avisoCamposPendentes = camposPendentes.length
      ? `${camposPendentes.join(', ')} ${camposPendentes.length === 1 ? 'n\u00e3o possui' : 'n\u00e3o possuem'} coeficiente exato para todos os dispositivos desta nota.`
      : 'Todos os campos f\u00edsicos previstos foram calculados com coeficientes IPR 736.';
    const abcPorDispositivo = new Map(grupos.map((grupo) => [normalizar(grupo.item?.dispositivo), grupo]));
    const maximos = {
      medicao: dados.linhasResumo.reduce((maximo, item) => Math.max(maximo, Number(item.quantidade || 0)), 0),
      escavacao: dados.linhasResumo.reduce((maximo, item) => Math.max(maximo, Number(item.escavacao || 0)), 0),
      concreto20: dados.linhasResumo.reduce((maximo, item) => Math.max(maximo, Number(item.concreto20 || 0)), 0),
      concreto15: dados.linhasResumo.reduce((maximo, item) => Math.max(maximo, Number(item.concreto15 || 0)), 0),
      concreto22: dados.linhasResumo.reduce((maximo, item) => Math.max(maximo, Number(item.concreto22 || 0)), 0),
      concreto25: dados.linhasResumo.reduce((maximo, item) => Math.max(maximo, Number(item.concreto25 || 0)), 0),
      area: dados.linhasResumo.reduce((maximo, item) => Math.max(maximo, Number(item.area || 0)), 0),
      aco: dados.linhasResumo.reduce((maximo, item) => Math.max(maximo, Number(item.aco || 0)), 0),
      custo: dados.linhasResumo.reduce((maximo, item) => Math.max(maximo, Number(item.custo || 0)), 0),
    };

    painel.innerHTML = `
      <div class="orc-dash-head orc-ref-head">
        <div><h3 id="orcDashboardTitulo">Painel geral da drenagem</h3><p>Quantitativos extra\u00eddos das Notas de Servi\u00e7o, consumos dos dispositivos IPR 736 e an\u00e1lise financeira do Or\u00e7amento SICRO.</p></div>
        <span class="orc-dash-source">${escapeHtml(estado.arquivoOrigem || 'Entrada manual')}</span>
      </div>

      <div class="orc-ref-kpis">
        <article class="orc-ref-kpi finance"><span class="orc-ref-kpi-icon">R$</span><div><small>Total com BDI</small><strong>${moeda.format(dados.totalCom)}</strong><em>${dados.confirmados.length}/${estado.itens.length} servi\u00e7os confirmados</em></div></article>
        <article class="orc-ref-kpi budget"><span class="orc-ref-kpi-icon">%</span><div><small>Total sem BDI</small><strong>${moeda.format(dados.totalSem)}</strong><em>BDI acrescenta ${moeda.format(dados.impactoBdi)}</em></div></article>
        <article class="orc-ref-kpi linear"><span class="orc-ref-kpi-icon">\u2194</span><div><small>Extens\u00e3o total</small><strong>${formatarNumero(dados.metricas.extensao.valor, 'm')}</strong><em>${dados.extensoes.length} dispositivos lineares</em></div></article>
        <article class="orc-ref-kpi quantity"><span class="orc-ref-kpi-icon">#</span><div><small>Estruturas</small><strong>${formatarNumero(dados.metricas.quantidade.valor, 'un')}</strong><em>${dados.estruturas.length} tipos de estrutura</em></div></article>
        ${kpiReferencia('V', 'Escava\u00e7\u00e3o', dados.metricas.escavacao, 'Coeficientes IPR 736 associados', 'excavation')}
        ${kpiReferencia('C', 'Concreto total', concretoTotal, 'Resist\u00eancias \u2265 15, \u2265 20, \u2265 22 e \u2265 25 MPa', 'concrete')}
      </div>
      ${dados.resumoPlanilha?.origem === 'notas' ? `<div class="orc-dash-notice"><strong>Leitura autom\u00e1tica:</strong> ${dados.resumoPlanilha.abasReconhecidas.length} abas de Notas de Servi\u00e7o \u00b7 ${dados.resumoPlanilha.coberturaIpr.encontrados}/${dados.resumoPlanilha.coberturaIpr.total} dispositivos com consumo IPR 736.${dados.resumoPlanilha.semCoeficiente.length ? ` Sem coeficiente exato: ${escapeHtml(dados.resumoPlanilha.semCoeficiente.join(', '))}.` : ''}</div>${dados.resumoPlanilha.avisos.map((aviso) => `<div class="orc-dash-notice warning">${escapeHtml(aviso)}</div>`).join('')}` : dados.resumoPlanilha ? '<div class="orc-dash-notice">Arquivo legado: a aba RESUMO foi usada como fonte de compatibilidade.</div>' : '<div class="orc-dash-notice">Os quantitativos abaixo foram calculados a partir dos itens dispon\u00edveis no Or\u00e7amento.</div>'}

      <div class="orc-ref-chart-strip">
        <article class="orc-ref-chart-panel quantity">
          <header><strong>Quantidades e extens\u00f5es</strong><small>Principais dispositivos f\u00edsicos</small></header>
          <div class="orc-ref-subtitle"><span>Lineares</span><b>${formatarNumero(dados.metricas.extensao.valor, 'm')}</b></div>
          ${colunasDashboard(dados.extensoes, (valor) => formatarNumero(valor, 'm'), 'extension', 6, true, 'da extens\u00e3o')}
          <div class="orc-ref-subtitle structures"><span>Estruturas</span><b>${formatarNumero(dados.metricas.quantidade.valor, 'un')}</b></div>
          ${colunasDashboard(dados.estruturas, (valor) => formatarNumero(valor, 'un'), 'structures', 6, true, 'da quantidade')}
        </article>
        <article class="orc-ref-chart-panel excavation">
          <header><strong>Volume de escava\u00e7\u00e3o</strong><small>m\u00b3 por dispositivo \u00b7 ${dados.escavacoes.length}/${dados.linhasResumo.length} calculados</small></header>
          ${dados.escavacoes.length ? colunasDashboard(dados.escavacoes, (valor) => formatarNumero(valor, 'm\u00b3'), 'excavation', 10, false, 'do volume') : vazioGraficoDashboard('Sem dados de escava\u00e7\u00e3o', 'Nenhum c\u00f3digo importado possui coeficiente exato de escava\u00e7\u00e3o no banco IPR 736.')}
        </article>
        <article class="orc-ref-chart-panel concrete">
          <header><strong>Volume de concreto</strong><small>Separado por resist\u00eancia \u00b7 ${dados.concretos.length}/${dados.linhasResumo.length} calculados</small></header>
          ${colunasConcretoDashboard(dados.concretos, (valor) => formatarNumero(valor, 'm\u00b3'), 10)}
        </article>
        <article class="orc-ref-chart-panel steel">
          <header><strong>Consumo de a\u00e7o CA-50</strong><small>kg por dispositivo \u00b7 ${dados.acos.length}/${dados.linhasResumo.length} calculados</small></header>
          ${dados.acos.length ? colunasDashboard(dados.acos, (valor) => formatarNumero(valor, 'kg'), 'steel', 10, false, 'do peso') : vazioGraficoDashboard('Sem consumo de a\u00e7o', 'Nenhum c\u00f3digo importado possui coeficiente exato de a\u00e7o no banco IPR 736.')}
        </article>
        <article class="orc-ref-chart-panel abc-line">
          <header><strong>Curva ABC do or\u00e7amento</strong><small>Custos com BDI e percentual acumulado</small></header>
          ${graficoLinhaAbcDashboard(grupos)}
        </article>
        <article class="orc-ref-chart-panel abc-donut">
          <header><strong>Composi\u00e7\u00e3o financeira</strong><small>Classes A, B e C</small></header>
          <div class="orc-dash-abc">
            <div class="orc-dash-donut" style="background:conic-gradient(${gradiente || '#e9f1f7 0 100%'})"><div class="orc-dash-donut-center"><strong>${formatarValorCurto(dados.totalCom)}</strong><small>total com BDI</small></div></div>
            <div class="orc-dash-legend">${participacoes.map((item) => `<div class="orc-dash-legend-row"><span class="orc-dash-legend-dot" style="background:${cores[item.classe]}"></span><span>Classe ${item.classe} \u00b7 ${item.itens}<small>${formatarValorCurto(item.valor)}</small></span><b>${percentual.format(item.percentual)}</b></div>`).join('')}</div>
          </div>
        </article>
      </div>

      <section class="orc-ref-matrix" aria-labelledby="orcRefMatrixTitle">
        <div class="orc-ref-matrix-head"><div><strong id="orcRefMatrixTitle">Matriz consolidada dos dispositivos</strong><small>Comprimento das faixas representa a participa\u00e7\u00e3o relativa dentro de cada coluna</small></div><span>${dados.linhasResumo.length} itens \u00b7 ${moeda.format(dados.totalCom)}</span></div>
        <div class="orc-ref-matrix-scroll"><table>
          <thead><tr><th>ABC</th><th>Grupo</th><th>Dispositivo</th><th>Medi\u00e7\u00e3o</th><th>Escava\u00e7\u00e3o</th><th>Concreto \u2265 15</th><th>Concreto \u2265 20</th><th>Concreto \u2265 22</th><th>Concreto \u2265 25</th><th>F\u00f4rma</th><th>A\u00e7o CA-50</th><th>Custo com BDI</th></tr></thead>
          <tbody>${dados.linhasResumo.map((item) => {
            const grupoAbc = abcPorDispositivo.get(normalizar(item.dispositivo));
            return `<tr>
              <td><span class="orc-ref-class ${grupoAbc?.classe?.toLowerCase() || 'none'}">${grupoAbc?.classe || '\u2014'}</span></td>
              <td class="group">${escapeHtml(item.categoria)}</td><td class="device"><strong>${escapeHtml(item.dispositivo)}</strong></td>
              <td>${celulaCalorDashboard(item.quantidade, maximos.medicao, (valor) => formatarNumero(valor, item.unidadePrincipal), item.unidadePrincipal === 'm' ? 'extension' : 'structures')}</td>
              <td>${celulaCalorDashboard(item.escavacao, maximos.escavacao, (valor) => formatarNumero(valor, 'm\u00b3'), 'excavation')}</td>
              <td>${celulaCalorDashboard(item.concreto15, maximos.concreto15, (valor) => formatarNumero(valor, 'm\u00b3'), 'c15')}</td>
              <td>${celulaCalorDashboard(item.concreto20, maximos.concreto20, (valor) => formatarNumero(valor, 'm\u00b3'), 'c20')}</td>
              <td>${celulaCalorDashboard(item.concreto22, maximos.concreto22, (valor) => formatarNumero(valor, 'm\u00b3'), 'c22')}</td>
              <td>${celulaCalorDashboard(item.concreto25, maximos.concreto25, (valor) => formatarNumero(valor, 'm\u00b3'), 'c25')}</td>
              <td>${celulaCalorDashboard(item.area, maximos.area, (valor) => formatarNumero(valor, 'm\u00b2'), 'area')}</td>
              <td>${celulaCalorDashboard(item.aco, maximos.aco, (valor) => formatarNumero(valor, 'kg'), 'steel')}</td>
              <td>${item.custoEncontrado ? celulaCalorDashboard(item.custo, maximos.custo, (valor) => moeda.format(valor), 'cost') : '<span class="orc-dash-na">N\u00e3o localizado</span>'}</td>
            </tr>`;
          }).join('')}</tbody>
        </table></div>
      </section>

      <div class="orc-ref-bottom">
        <article class="orc-ref-bottom-panel">
          <header><strong>Custo com BDI por grupo da Nota de Servi\u00e7o</strong><small>Distribui\u00e7\u00e3o dos pre\u00e7os confirmados</small></header>
          ${colunasDashboard(dados.custosPorCategoria, (valor) => formatarValorCurto(valor), 'cost', 8, false, 'do custo')}
        </article>
        <article class="orc-ref-bottom-panel legend">
          <header><strong>Legenda do painel</strong><small>Cores usadas nos indicadores e na matriz</small></header>
          <div class="orc-ref-legend-grid">
            <span class="linear"><i></i>Extens\u00e3o</span><span class="quantity"><i></i>Quantidade</span><span class="excavation"><i></i>Escava\u00e7\u00e3o</span>
            <span class="c15"><i></i>Concreto \u2265 15</span><span class="c20"><i></i>Concreto \u2265 20</span><span class="c22"><i></i>Concreto \u2265 22</span><span class="c25"><i></i>Concreto \u2265 25</span><span class="area"><i></i>\u00c1rea de f\u00f4rma</span><span class="steel"><i></i>A\u00e7o CA-50</span><span class="cost"><i></i>Custos com BDI</span>
            <span class="abc-a"><i></i>Classe A</span><span class="abc-b"><i></i>Classe B</span><span class="abc-c"><i></i>Classe C</span>
          </div>
          ${dados.areas.length ? `<div class="orc-ref-area-summary"><strong>\u00c1rea total:</strong> ${formatarNumero(dados.metricas.area.valor, 'm\u00b2')}</div>` : `<div class="orc-ref-area-summary missing">${escapeHtml(avisoCamposPendentes)}</div>`}
        </article>
      </div>`;
  }

  function renderizarTudo() {
    const temItens = estado.itens.length > 0;
    const pendentes = estado.itens.filter((item) => !item.selecionado).length;
    document.getElementById('orcTabOrcamento').setAttribute('aria-selected', estado.aba === 'orcamento' ? 'true' : 'false');
    document.getElementById('orcTabAbc').setAttribute('aria-selected', estado.aba === 'abc' ? 'true' : 'false');
    document.getElementById('orcTabelaWrap').hidden = false;
    if (estado.aba === 'abc') renderizarAbc();
    else renderizarOrcamento();
    renderizarDashboard();
    renderizarResumo();
    renderizarPareto();
    renderizarChecklist();
    atualizarEtapas();
    document.getElementById('orcLimpar').disabled = !temItens;
    document.getElementById('orcPadronizado').disabled = !temItens;
    document.getElementById('orcExportar').disabled = !temItens || pendentes > 0;
    const dashboardExportar = document.getElementById('dashboardExportar');
    if (dashboardExportar) dashboardExportar.disabled = !temItens || pendentes > 0;
    const dashboardRetirar = document.getElementById('dashboardRetirar');
    if (dashboardRetirar) dashboardRetirar.disabled = !temItens;
    document.getElementById('orcRodape').textContent = !temItens
      ? 'Aguardando dados de entrada.'
      : pendentes
        ? `${pendentes} item(ns) aguardando confirma\u00e7\u00e3o de c\u00f3digo.`
        : resumirChecklist().revisar
          ? `${estado.itens.length} item(ns) encontrados; ${resumirChecklist().revisar} sugest\u00e3o(\u00f5es) marcadas para revis\u00e3o.`
          : `${temItens ? estado.itens.length : 0} item(ns) prontos para exporta\u00e7\u00e3o.`;
  }

  function renderizarOpcoes(consulta) {
    const item = estado.itens.find((registro) => registro.id === estado.modalItemId);
    if (!item) return;
    const consultaTexto = String(consulta ?? '').trim();
    const opcoes = consulta === undefined || !consultaTexto
      ? (item.opcoesPontuadas?.length
        ? item.opcoesPontuadas
        : montarAlternativas(item.dispositivo, item.unidadeInformada, item.selecionado))
      : classificarCatalogo(consultaTexto, 80, item.unidadeInformada);
    const container = document.getElementById('orcOpcoes');
    if (!opcoes.length) {
      container.innerHTML = '<div class="orc-empty" style="min-height:180px"><div><strong>Nenhum c\u00f3digo encontrado</strong>Tente termos mais gerais, como \u201cmeio-fio\u201d, \u201ctubo PEAD\u201d ou \u201ccaixa coletora\u201d.</div></div>';
      return;
    }
    container.innerHTML = opcoes.map((resultado, indice) => {
      const servico = resultado.servico || resultado;
      const pontuacao = Math.max(0, Math.min(1, Number(resultado.pontuacao || 0)));
      const selecionado = item.selecionado?.codigo === servico.codigo;
      const revisar = !selecionado && pontuacao > 0 && pontuacao < 0.72;
      return `
      <button type="button" class="orc-option" data-codigo="${escapeHtml(servico.codigo)}">
        <code>${escapeHtml(servico.codigo)}</code>
        <span>
          <span class="orc-option-flags">
            ${selecionado ? '<span class="orc-option-flag selected">Selecionado</span>' : indice === 0 ? '<span class="orc-option-flag">Melhor correspond\u00eancia</span>' : ''}
            ${resultado.mesmoDispositivo && !selecionado ? '<span class="orc-option-flag selected">Mesmo dispositivo</span>' : ''}
            ${pontuacao ? `<span class="orc-option-flag${revisar ? ' review' : ''}">${Math.round(pontuacao * 100)}% compat\u00edvel</span>` : ''}
          </span>
          <strong>${escapeHtml(servico.descricao)}</strong><small>Unidade: ${escapeHtml(servico.unidade)} \u00b7 Medi\u00e7\u00e3o: ${escapeHtml(tipoMedicao(servico.unidade))} \u00b7 SICRO/ES</small>
        </span>
        <span class="orc-price"><b>${moeda.format(servico.preco_sem_bdi)}</b><span>sem BDI</span></span>
      </button>`;
    }).join('');
  }

  function abrirEscolha(itemId) {
    const item = estado.itens.find((registro) => registro.id === itemId);
    if (!item) return;
    estado.modalItemId = itemId;
    const correlacao = nomeCorrelacaoDispositivo(item.dispositivo);
    document.getElementById('orcModalTexto').textContent = item.dispositivo === 'Novo dispositivo'
      ? 'Pesquise o dispositivo e escolha a composi\u00e7\u00e3o SICRO adequada.'
      : correlacao
        ? `Correla\u00e7\u00e3o aplicada: \u201c${item.dispositivo}\u201d = ${correlacao}. Compare as formas de execu\u00e7\u00e3o, unidade e pre\u00e7o antes de escolher.`
        : `Entrada: \u201c${item.dispositivo}\u201d. A lista re\u00fane os c\u00f3digos mais pr\u00f3ximos; compare descri\u00e7\u00e3o, forma de execu\u00e7\u00e3o, unidade e pre\u00e7o antes de escolher.`;
    const busca = document.getElementById('orcBuscaCodigo');
    busca.value = item.dispositivo === 'Novo dispositivo' ? '' : item.dispositivo;
    renderizarOpcoes(undefined);
    document.getElementById('orcModal').hidden = false;
    window.setTimeout(() => busca.focus(), 30);
  }

  function fecharEscolha() {
    document.getElementById('orcModal').hidden = true;
    estado.modalItemId = null;
  }

  function resolverProximo() {
    const proximo = estado.itens.find((item) => !item.selecionado);
    if (proximo) abrirEscolha(proximo.id);
  }

  function selecionarServico(codigo) {
    const item = estado.itens.find((registro) => registro.id === estado.modalItemId);
    const servico = porCodigo.get(String(codigo));
    if (!item || !servico) return;
    item.selecionado = servico;
    item.metodoResolucao = 'Escolha manual';
    item.confianca = 1;
    if (item.dispositivo === 'Novo dispositivo') item.dispositivo = servico.descricao;
    lembrarCorrespondencia(item.dispositivo, item.unidadeInformada, servico.codigo);
    item.opcoesPontuadas = montarAlternativas(item.dispositivo, item.unidadeInformada, servico);
    item.candidatos = item.opcoesPontuadas.map((resultado) => resultado.servico);
    fecharEscolha();
    renderizarTudo();
    const faltantes = estado.itens.filter((registro) => !registro.selecionado).length;
    definirStatus(faltantes
      ? `C\u00f3digo ${servico.codigo} confirmado como ${tipoMedicao(servico.unidade)} (${servico.unidade}). Restam ${faltantes} escolha(s).`
      : 'Todos os c\u00f3digos e unidades foram confirmados. O Excel j\u00e1 pode ser exportado.', faltantes ? '' : 'ok');
    if (faltantes) window.setTimeout(resolverProximo, 180);
  }

  function adicionarManualmente() {
    const item = criarItem({ dispositivo: 'Novo dispositivo', quantidade: 1 });
    item.selecionado = null;
    item.candidatos = [];
    item.opcoesPontuadas = [];
    estado.itens.push(item);
    estado.aba = 'orcamento';
    estado.checklistAberto = true;
    renderizarTudo();
    abrirEscolha(item.id);
  }

  function aplicarBdiPadrao() {
    const bdi = Math.max(0, paraNumero(document.getElementById('orcBdi').value) || 0);
    for (const item of estado.itens) item.bdi = bdi;
    renderizarTudo();
  }

  function limpar() {
    estado.itens = [];
    estado.aba = 'orcamento';
    estado.resumo = null;
    estado.arquivoOrigem = '';
    estado.deteccao = null;
    estado.checklistAberto = false;
    for (const entrada of [document.getElementById('orcArquivo'), document.getElementById('dashboardArquivo')].filter(Boolean)) entrada.value = '';
    document.getElementById('orcDrop')?.classList.remove('is-drag');
    document.getElementById('dashboardDrop')?.classList.remove('is-drag');
    fecharEscolha();
    renderizarTudo();
    document.getElementById('orcVazio').innerHTML = '<div><strong>Seu or\u00e7amento aparecer\u00e1 aqui</strong>Importe um Excel ou adicione um dispositivo manualmente.</div>';
    definirStatus('Planilha retirada e dados apagados. Arraste outra planilha para iniciar uma nova contabiliza\u00e7\u00e3o.', 'ok');
  }

  const azul = '1677FF';
  const azulEscuro = '0D4F91';
  const azulClaro = 'DCEAF7';
  const borda = 'AFC5D9';
  const branco = 'FFFFFF';

  function bordasExcel() {
    return {
      top: { style: 'thin', color: { argb: borda } },
      left: { style: 'thin', color: { argb: borda } },
      bottom: { style: 'thin', color: { argb: borda } },
      right: { style: 'thin', color: { argb: borda } },
    };
  }

  function estilizarCabecalho(linha) {
    linha.height = 34;
    linha.eachCell((celula) => {
      celula.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: azulEscuro } };
      celula.font = { bold: true, color: { argb: branco }, size: 9 };
      celula.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      celula.border = bordasExcel();
    });
  }

  function estilizarTitulo(planilha, ultimaColuna, titulo) {
    planilha.mergeCells(1, 1, 1, ultimaColuna);
    const celula = planilha.getCell(1, 1);
    celula.value = titulo;
    celula.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: azulEscuro } };
    celula.font = { bold: true, color: { argb: branco }, size: 15 };
    celula.alignment = { horizontal: 'center', vertical: 'middle' };
    planilha.getRow(1).height = 28;
  }

  function inserirMetadado(planilha, linha, rotulo, valor, ultimaColuna) {
    planilha.mergeCells(linha, 2, linha, ultimaColuna);
    planilha.getCell(linha, 1).value = rotulo;
    planilha.getCell(linha, 1).font = { bold: true, color: { argb: azulEscuro } };
    planilha.getCell(linha, 2).value = valor || '';
    planilha.getRow(linha).eachCell((celula) => {
      celula.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F4F8FC' } };
      celula.border = bordasExcel();
      celula.alignment = { vertical: 'middle' };
    });
  }

  async function baixarWorkbook(workbook, nomeArquivo) {
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = nomeArquivo;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  async function baixarModelo() {
    try {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'HID X \u2014 Daniel Machado';
      const planilha = workbook.addWorksheet('Dispositivos');
      planilha.columns = [
        { header: 'C\u00d3DIGO SICRO (opcional)', key: 'codigo', width: 24 },
        { header: 'SERVI\u00c7OS', key: 'dispositivo', width: 62 },
        { header: 'UND. (opcional)', key: 'unidade', width: 18 },
        { header: 'QUANT.', key: 'quantidade', width: 16 },
      ];
      planilha.addRows([
        { dispositivo: 'Meio-fio de concreto MFC 03', unidade: '', quantidade: 100 },
        { dispositivo: 'Caixa coletora de sarjeta CCS 200-60 A', unidade: '', quantidade: 4 },
      ]);
      estilizarCabecalho(planilha.getRow(1));
      planilha.getColumn(1).numFmt = '@';
      planilha.getColumn(4).numFmt = '#,##0.000';
      planilha.views = [{ state: 'frozen', ySplit: 1 }];
      planilha.autoFilter = 'A1:D3';

      const instrucoes = workbook.addWorksheet('Como preencher');
      instrucoes.columns = [{ width: 24 }, { width: 86 }];
      instrucoes.addRows([
        ['Campo', 'Orienta\u00e7\u00e3o'],
        ['SERVI\u00c7OS', 'Informe o nome t\u00e9cnico e as caracter\u00edsticas do dispositivo. Quanto mais detalhes (tipo, dimens\u00e3o, material e execu\u00e7\u00e3o), melhor a busca.'],
        ['QUANT.', 'Informe apenas um n\u00famero positivo. O HID X interpretar\u00e1 o valor conforme a unidade do servi\u00e7o SICRO.'],
        ['UND. (opcional)', 'Pode ficar vazia. O HID X detecta automaticamente \u201cm\u201d como Metro e \u201cun/und.\u201d como Quantidade pelo c\u00f3digo SICRO escolhido.'],
        ['C\u00d3DIGO SICRO (opcional)', 'Se o c\u00f3digo j\u00e1 estiver preenchido, ele ser\u00e1 usado diretamente. Caso contr\u00e1rio, o HID X escolher\u00e1 automaticamente o servi\u00e7o mais pr\u00f3ximo pelo nome.'],
        ['Revis\u00e3o', 'A correspond\u00eancia e a confian\u00e7a aparecem no or\u00e7amento. Use o bot\u00e3o Alterar somente quando quiser trocar a escolha autom\u00e1tica.'],
      ]);
      estilizarCabecalho(instrucoes.getRow(1));
      instrucoes.getColumn(2).alignment = { wrapText: true, vertical: 'top' };
      instrucoes.getRows(2, 5).forEach((linha) => { linha.height = 38; });
      await baixarWorkbook(workbook, 'MODELO_ENTRADA_ORCAMENTO_HID_X.xlsx');
      definirStatus('Modelo de entrada gerado. Preencha SERVI\u00c7OS e QUANT.; a unidade ser\u00e1 detectada automaticamente.', 'ok');
    } catch (erro) {
      console.error(erro);
      definirStatus('N\u00e3o foi poss\u00edvel gerar o modelo de entrada.', 'error');
    }
  }

  async function baixarPadronizado() {
    if (!estado.itens.length) return;
    try {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'HID X \u2014 Daniel Machado';
      workbook.lastModifiedBy = 'HID X \u2014 Padroniza\u00e7\u00e3o de entrada';
      workbook.created = new Date();

      const planilha = workbook.addWorksheet('Dispositivos');
      planilha.columns = [
        { header: 'Dispositivo', key: 'dispositivo', width: 68 },
        { header: 'Quantidade', key: 'quantidade', width: 16 },
        { header: 'Unidade detectada', key: 'unidade', width: 20 },
        { header: 'Tipo de medi\u00e7\u00e3o', key: 'tipoMedicao', width: 20 },
        { header: 'C\u00f3digo SICRO', key: 'codigo', width: 18 },
        { header: 'Descri\u00e7\u00e3o SICRO confirmada', key: 'descricao', width: 78 },
        { header: 'M\u00e9todo de associa\u00e7\u00e3o', key: 'metodo', width: 28 },
        { header: 'Confian\u00e7a', key: 'confianca', width: 14 },
        { header: 'Status', key: 'status', width: 30 },
      ];
      planilha.addRows(estado.itens.map((item) => ({
        dispositivo: item.dispositivo,
        quantidade: item.quantidade,
        unidade: unidadeDoItem(item),
        tipoMedicao: tipoMedicao(unidadeDoItem(item)),
        codigo: item.selecionado?.codigo || item.codigoInformado || '',
        descricao: item.selecionado?.descricao || '',
        metodo: item.metodoResolucao || 'N\u00e3o encontrado',
        confianca: Number(item.confianca || 0),
        status: item.selecionado
          ? item.metodoResolucao === 'Correspond\u00eancia autom\u00e1tica' ? 'Servi\u00e7o aproximado \u2014 revisar se necess\u00e1rio' : 'C\u00f3digo e unidade confirmados'
          : 'Revisar manualmente no HID X',
      })));
      estilizarCabecalho(planilha.getRow(1));
      planilha.getColumn(2).numFmt = '#,##0.000';
      planilha.getColumn(5).numFmt = '@';
      planilha.getColumn(8).numFmt = '0%';
      planilha.views = [{ state: 'frozen', ySplit: 1 }];
      planilha.autoFilter = `A1:I${planilha.rowCount}`;
      planilha.eachRow((linha, numeroLinha) => {
        if (numeroLinha === 1) return;
        linha.height = 28;
        linha.eachCell((celula) => {
          celula.border = bordasExcel();
          celula.alignment = { vertical: 'middle', wrapText: true };
        });
        const status = String(linha.getCell(9).value || '');
        const confirmado = status === 'C\u00f3digo e unidade confirmados';
        const pendente = status === 'Revisar manualmente no HID X';
        linha.getCell(9).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: confirmado ? 'E8F8F2' : pendente ? 'FFF0F1' : 'FFF5DF' } };
        linha.getCell(9).font = { bold: true, color: { argb: confirmado ? '087951' : pendente ? 'B42F38' : '9C5B00' } };
      });

      const resumoChecklist = resumirChecklist();
      const checklist = workbook.addWorksheet('Checklist');
      checklist.columns = [
        { header: 'Item', key: 'item', width: 9 },
        { header: 'Dispositivo informado', key: 'dispositivo', width: 62 },
        { header: 'Encontrado?', key: 'encontrado', width: 16 },
        { header: 'Situa\u00e7\u00e3o', key: 'situacao', width: 22 },
        { header: 'C\u00f3digo escolhido', key: 'codigo', width: 19 },
        { header: 'Descri\u00e7\u00e3o SICRO escolhida', key: 'descricao', width: 76 },
        { header: 'Unidade', key: 'unidade', width: 13 },
        { header: 'M\u00e9todo', key: 'metodo', width: 27 },
        { header: 'Confian\u00e7a', key: 'confianca', width: 14 },
        { header: 'Op\u00e7\u00f5es relacionadas', key: 'alternativas', width: 21 },
      ];
      checklist.addRows(estado.itens.map((item, indice) => {
        const status = statusChecklistItem(item);
        return {
          item: indice + 1,
          dispositivo: item.dispositivo,
          encontrado: item.selecionado ? 'SIM' : 'N\u00c3O',
          situacao: status.rotulo,
          codigo: item.selecionado?.codigo || '',
          descricao: item.selecionado?.descricao || '',
          unidade: unidadeDoItem(item),
          metodo: item.metodoResolucao || 'N\u00e3o encontrado',
          confianca: Number(item.confianca || 0),
          alternativas: item.opcoesPontuadas?.length || item.candidatos?.length || 0,
        };
      }));
      estilizarCabecalho(checklist.getRow(1));
      checklist.getColumn(5).numFmt = '@';
      checklist.getColumn(9).numFmt = '0%';
      checklist.views = [{ state: 'frozen', ySplit: 1 }];
      checklist.autoFilter = `A1:J${checklist.rowCount}`;
      checklist.eachRow((linha, numeroLinha) => {
        if (numeroLinha === 1) return;
        linha.height = 28;
        linha.eachCell((celula) => {
          celula.border = bordasExcel();
          celula.alignment = { vertical: 'middle', wrapText: true };
        });
        const situacao = String(linha.getCell(4).value || '');
        const cor = situacao === 'Encontrado' ? '087951' : situacao === 'Revisar sugest\u00e3o' ? '9C5B00' : 'B42F38';
        const fundo = situacao === 'Encontrado' ? 'E8F8F2' : situacao === 'Revisar sugest\u00e3o' ? 'FFF5DF' : 'FFF0F1';
        linha.getCell(4).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fundo } };
        linha.getCell(4).font = { bold: true, color: { argb: cor } };
      });

      const relatorio = workbook.addWorksheet('Relat\u00f3rio da convers\u00e3o');
      relatorio.columns = [{ width: 31 }, { width: 84 }];
      relatorio.addRows([
        ['INFORMA\u00c7\u00c3O', 'VALOR'],
        ['Arquivo recebido', estado.arquivoOrigem || 'Entrada manual'],
        ['Aba reconhecida', estado.deteccao?.aba || 'Entrada manual'],
        ['M\u00e9todo de reconhecimento', estado.deteccao?.modo === 'cabecalho' ? 'Cabe\u00e7alhos identificados automaticamente' : estado.deteccao?.modo === 'inferido' ? 'Tipos de dados inferidos automaticamente' : 'Entrada manual'],
        ['Coluna de dispositivo', estado.deteccao?.colunaDispositivo || 'Dispositivo'],
        ['Coluna de quantidade', estado.deteccao?.colunaQuantidade || 'Quantidade'],
        ['Coluna de c\u00f3digo', estado.deteccao?.colunaCodigo || 'N\u00e3o encontrada / opcional'],
        ['Coluna de unidade', estado.deteccao?.colunaUnidade || 'N\u00e3o encontrada \u2014 detectada pelo SICRO'],
        ['Linhas convertidas', estado.itens.length],
        ['Linhas ignoradas', estado.deteccao?.ignoradas || 0],
        ['Itens encontrados', resumoChecklist.encontrados],
        ['Itens para revisar', resumoChecklist.revisar],
        ['Itens n\u00e3o encontrados', resumoChecklist.naoEncontrados],
        ['Associa\u00e7\u00f5es por nome aproximado', estado.itens.filter((item) => item.metodoResolucao === 'Correspond\u00eancia autom\u00e1tica').length],
        ['Regra de aproxima\u00e7\u00e3o', 'Usa \u00edndice por palavras, radicais, prefixos, abrevia\u00e7\u00f5es, pequenas diferen\u00e7as de escrita, n\u00fameros/dimens\u00f5es e unidade SICRO; escolhe automaticamente o resultado com maior pontua\u00e7\u00e3o.'],
        ['Padr\u00e3o resultante', 'Dispositivo + Quantidade + Unidade detectada + Tipo de medi\u00e7\u00e3o + C\u00f3digo SICRO + Confian\u00e7a. Este arquivo pode ser importado novamente no HID X.'],
      ]);
      estilizarCabecalho(relatorio.getRow(1));
      relatorio.getColumn(2).alignment = { vertical: 'top', wrapText: true };
      relatorio.eachRow((linha, numeroLinha) => {
        if (numeroLinha > 1) linha.height = 25;
        linha.eachCell((celula) => { celula.border = bordasExcel(); });
      });

      const origem = (estado.arquivoOrigem || 'ENTRADA').replace(/\.[^.]+$/, '');
      const nomeSeguro = normalizar(origem).replace(/\s+/g, '_').slice(0, 55) || 'ENTRADA';
      await baixarWorkbook(workbook, `${nomeSeguro}_PADRAO_HID_X.xlsx`);
      definirStatus('Excel padronizado gerado. Ele pode ser revisado, arquivado ou importado novamente no HID X.', 'ok');
    } catch (erro) {
      console.error(erro);
      definirStatus(erro.message || 'N\u00e3o foi poss\u00edvel gerar o Excel padronizado.', 'error');
    }
  }

  async function exportarOrcamento() {
    const pendentes = estado.itens.filter((item) => !item.selecionado);
    if (!estado.itens.length || pendentes.length) return;
    definirStatus('Montando o or\u00e7amento, a Curva ABC e o cat\u00e1logo SICRO\u2026');
    document.getElementById('orcExportar').disabled = true;

    try {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'HID X \u2014 Daniel Machado';
      workbook.lastModifiedBy = 'HID X \u2014 Or\u00e7amentos SICRO';
      workbook.created = new Date();
      workbook.calcProperties.fullCalcOnLoad = true;

      const planilha = workbook.addWorksheet('Or\u00e7amento', { properties: { defaultRowHeight: 18 } });
      estilizarTitulo(planilha, 10, 'PLANILHA OR\u00c7AMENT\u00c1RIA \u2014 HID X');
      inserirMetadado(planilha, 2, 'OBJETO:', document.getElementById('orcObjeto').value, 10);
      inserirMetadado(planilha, 3, 'LOCAL:', document.getElementById('orcLocal').value, 10);
      inserirMetadado(planilha, 4, 'EXTENS\u00c3O:', document.getElementById('orcExtensao').value, 10);
      inserirMetadado(planilha, 5, 'DATA-BASE:', document.getElementById('orcDataBase').value, 10);
      planilha.mergeCells('A6:J6');
      planilha.getCell('A6').value = `SICRO \u00b7 ${BASE.estado || 'Esp\u00edrito Santo'} \u00b7 pre\u00e7os sem BDI obtidos do subtotal das composi\u00e7\u00f5es`;
      planilha.getCell('A6').alignment = { horizontal: 'center' };
      planilha.getCell('A6').font = { italic: true, color: { argb: '55718B' }, size: 9 };
      planilha.getCell('A6').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'EDF5FC' } };

      const cabecalho = ['ITEM', 'C\u00d3DIGO', '\u00d3RG\u00c3O', 'SERVI\u00c7OS', 'UND.', 'QUANT.', 'PRE\u00c7O UNIT\u00c1RIO SEM BDI', 'BDI', 'PRE\u00c7O UNIT\u00c1RIO COM BDI', 'PRE\u00c7O TOTAL COM BDI'];
      planilha.getRow(8).values = cabecalho;
      estilizarCabecalho(planilha.getRow(8));

      const linhasOrigem = new Map();
      estado.itens.forEach((item, indice) => {
        const linhaNumero = 9 + indice;
        const precoSem = valorSemBdi(item);
        const precoCom = valorComBdi(item);
        const total = valorTotal(item);
        linhasOrigem.set(item.id, linhaNumero);
        const linha = planilha.getRow(linhaNumero);
        linha.values = [indice + 1, item.selecionado.codigo, 'SICRO', item.selecionado.descricao, item.selecionado.unidade, item.quantidade, precoSem, item.bdi / 100];
        linha.getCell(9).value = { formula: `G${linhaNumero}*(1+H${linhaNumero})`, result: precoCom };
        linha.getCell(10).value = { formula: `TRUNC(F${linhaNumero}*I${linhaNumero},2)`, result: total };
        linha.eachCell((celula) => {
          celula.border = bordasExcel();
          celula.alignment = { vertical: 'middle', wrapText: true };
        });
        linha.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
        linha.getCell(2).alignment = { horizontal: 'center', vertical: 'middle' };
        linha.getCell(3).alignment = { horizontal: 'center', vertical: 'middle' };
        linha.getCell(5).alignment = { horizontal: 'center', vertical: 'middle' };
        linha.getCell(6).numFmt = '#,##0.000';
        linha.getCell(7).numFmt = 'R$ #,##0.00';
        linha.getCell(8).numFmt = '0.00%';
        linha.getCell(9).numFmt = 'R$ #,##0.00';
        linha.getCell(10).numFmt = 'R$ #,##0.00';
      });

      const primeiraLinha = 9;
      const ultimaLinha = primeiraLinha + estado.itens.length - 1;
      const linhaTotal = ultimaLinha + 1;
      planilha.mergeCells(linhaTotal, 1, linhaTotal, 9);
      planilha.getCell(linhaTotal, 1).value = 'TOTAL DO OR\u00c7AMENTO';
      planilha.getCell(linhaTotal, 10).value = { formula: `SUM(J${primeiraLinha}:J${ultimaLinha})`, result: estado.itens.reduce((soma, item) => soma + valorTotal(item), 0) };
      planilha.getRow(linhaTotal).eachCell((celula) => {
        celula.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: azulClaro } };
        celula.font = { bold: true, color: { argb: azulEscuro } };
        celula.border = bordasExcel();
        celula.alignment = { horizontal: 'right', vertical: 'middle' };
      });
      planilha.getCell(linhaTotal, 10).numFmt = 'R$ #,##0.00';
      planilha.columns = [
        { width: 8 }, { width: 14 }, { width: 11 }, { width: 68 }, { width: 10 },
        { width: 13 }, { width: 18 }, { width: 10 }, { width: 18 }, { width: 19 },
      ];
      planilha.views = [{ state: 'frozen', ySplit: 8 }];
      planilha.autoFilter = { from: 'A8', to: `J${ultimaLinha}` };
      planilha.pageSetup = { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.25, right: 0.25, top: 0.45, bottom: 0.45, header: 0.2, footer: 0.2 } };

      const abc = workbook.addWorksheet('Curva ABC', { properties: { defaultRowHeight: 18 } });
      estilizarTitulo(abc, 11, 'CURVA ABC \u2014 OR\u00c7AMENTO SICRO');
      inserirMetadado(abc, 2, 'OBJETO:', document.getElementById('orcObjeto').value, 11);
      inserirMetadado(abc, 3, 'LOCAL:', document.getElementById('orcLocal').value, 11);
      inserirMetadado(abc, 4, 'DATA-BASE:', document.getElementById('orcDataBase').value, 11);
      inserirMetadado(abc, 5, 'EXTENS\u00c3O:', document.getElementById('orcExtensao').value, 11);
      abc.getRow(8).values = ['POSI\u00c7\u00c3O', 'ITEM', 'FONTE', 'C\u00d3DIGO', 'SERVI\u00c7O', 'UNIDADE', 'PRE\u00c7O UNIT. COM BDI', 'QUANT.', 'TOTAL', '%', '% ACUMULADO'];
      estilizarCabecalho(abc.getRow(8));
      const ordenados = [...estado.itens].sort((a, b) => valorTotal(b) - valorTotal(a));
      const totalGeral = ordenados.reduce((soma, item) => soma + valorTotal(item), 0);
      let acumulado = 0;
      ordenados.forEach((item, indice) => {
        const linhaNumero = 9 + indice;
        const origem = linhasOrigem.get(item.id);
        const participacao = totalGeral ? valorTotal(item) / totalGeral : 0;
        acumulado += participacao;
        const linha = abc.getRow(linhaNumero);
        linha.values = [indice + 1, estado.itens.indexOf(item) + 1, 'SICRO', item.selecionado.codigo, item.selecionado.descricao, item.selecionado.unidade];
        linha.getCell(7).value = { formula: `'Or\u00e7amento'!I${origem}`, result: valorComBdi(item) };
        linha.getCell(8).value = { formula: `'Or\u00e7amento'!F${origem}`, result: item.quantidade };
        linha.getCell(9).value = { formula: `'Or\u00e7amento'!J${origem}`, result: valorTotal(item) };
        linha.getCell(10).value = { formula: `I${linhaNumero}/$I$${9 + ordenados.length}`, result: participacao };
        linha.getCell(11).value = { formula: `SUM($J$9:J${linhaNumero})`, result: acumulado };
        linha.eachCell((celula) => { celula.border = bordasExcel(); celula.alignment = { vertical: 'middle', wrapText: true }; });
        [1, 2, 3, 4, 6].forEach((coluna) => { linha.getCell(coluna).alignment = { horizontal: 'center', vertical: 'middle' }; });
        linha.getCell(7).numFmt = 'R$ #,##0.00';
        linha.getCell(8).numFmt = '#,##0.000';
        linha.getCell(9).numFmt = 'R$ #,##0.00';
        linha.getCell(10).numFmt = '0.00%';
        linha.getCell(11).numFmt = '0.00%';
      });
      const abcTotal = 9 + ordenados.length;
      abc.mergeCells(abcTotal, 1, abcTotal, 8);
      abc.getCell(abcTotal, 1).value = 'TOTAL';
      abc.getCell(abcTotal, 9).value = { formula: `SUM(I9:I${abcTotal - 1})`, result: totalGeral };
      abc.getCell(abcTotal, 10).value = { formula: `SUM(J9:J${abcTotal - 1})`, result: 1 };
      abc.getCell(abcTotal, 11).value = { formula: `MAX(K9:K${abcTotal - 1})`, result: 1 };
      abc.getRow(abcTotal).eachCell((celula) => {
        celula.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: azulClaro } };
        celula.font = { bold: true, color: { argb: azulEscuro } };
        celula.border = bordasExcel();
        celula.alignment = { horizontal: 'right', vertical: 'middle' };
      });
      abc.getCell(abcTotal, 9).numFmt = 'R$ #,##0.00';
      abc.getCell(abcTotal, 10).numFmt = '0.00%';
      abc.getCell(abcTotal, 11).numFmt = '0.00%';
      abc.columns = [{ width: 10 }, { width: 9 }, { width: 11 }, { width: 14 }, { width: 68 }, { width: 11 }, { width: 18 }, { width: 13 }, { width: 18 }, { width: 11 }, { width: 15 }];
      abc.views = [{ state: 'frozen', ySplit: 8 }];
      abc.autoFilter = { from: 'A8', to: `K${abcTotal - 1}` };
      abc.pageSetup = { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 };

      const entrada = workbook.addWorksheet('Entrada');
      entrada.columns = [
        { header: 'Linha de origem', key: 'linha', width: 16 },
        { header: 'Dispositivo informado', key: 'dispositivo', width: 64 },
        { header: 'Quantidade', key: 'quantidade', width: 15 },
        { header: 'Unidade informada', key: 'unidadeInformada', width: 19 },
        { header: 'Unidade detectada', key: 'unidadeDetectada', width: 19 },
        { header: 'Tipo de medi\u00e7\u00e3o', key: 'tipoMedicao', width: 19 },
        { header: 'C\u00f3digo SICRO escolhido', key: 'codigo', width: 22 },
        { header: 'Descri\u00e7\u00e3o SICRO escolhida', key: 'descricao', width: 78 },
        { header: 'M\u00e9todo de associa\u00e7\u00e3o', key: 'metodo', width: 28 },
        { header: 'Confian\u00e7a', key: 'confianca', width: 14 },
      ];
      entrada.addRows(estado.itens.map((item) => ({
        linha: item.linha || '',
        dispositivo: item.dispositivo,
        quantidade: item.quantidade,
        unidadeInformada: item.unidadeInformada || '',
        unidadeDetectada: unidadeDoItem(item),
        tipoMedicao: tipoMedicao(unidadeDoItem(item)),
        codigo: item.selecionado.codigo,
        descricao: item.selecionado.descricao,
        metodo: item.metodoResolucao || '',
        confianca: Number(item.confianca || 0),
      })));
      estilizarCabecalho(entrada.getRow(1));
      entrada.getColumn(3).numFmt = '#,##0.000';
      entrada.getColumn(10).numFmt = '0%';
      entrada.views = [{ state: 'frozen', ySplit: 1 }];
      entrada.autoFilter = `A1:J${entrada.rowCount}`;

      const base = workbook.addWorksheet('Cat\u00e1logo SICRO');
      base.columns = [
        { header: 'C\u00f3digo', key: 'codigo', width: 15 },
        { header: 'Descri\u00e7\u00e3o', key: 'descricao', width: 92 },
        { header: 'Unidade', key: 'unidade', width: 12 },
        { header: 'Pre\u00e7o sem BDI', key: 'preco_sem_bdi', width: 18 },
      ];
      base.addRows(catalogo.map((servico) => ({ codigo: servico.codigo, descricao: servico.descricao, unidade: servico.unidade, preco_sem_bdi: servico.preco_sem_bdi })));
      estilizarCabecalho(base.getRow(1));
      base.getColumn(4).numFmt = 'R$ #,##0.0000';
      base.views = [{ state: 'frozen', ySplit: 1 }];
      base.autoFilter = `A1:D${base.rowCount}`;

      const objeto = normalizar(document.getElementById('orcObjeto').value).replace(/\s+/g, '_').slice(0, 42) || 'ORCAMENTO';
      await baixarWorkbook(workbook, `HID_X_${objeto}.xlsx`);
      definirStatus('Planilha gerada com Or\u00e7amento, Curva ABC, rastreabilidade da entrada e cat\u00e1logo SICRO.', 'ok');
    } catch (erro) {
      console.error(erro);
      definirStatus(erro.message || 'N\u00e3o foi poss\u00edvel exportar o or\u00e7amento.', 'error');
    } finally {
      renderizarTudo();
    }
  }

  function vincularEventos() {
    const arquivo = document.getElementById('orcArquivo');
    const drop = document.getElementById('orcDrop');
    const dashboardArquivo = document.getElementById('dashboardArquivo');
    const dashboardDrop = document.getElementById('dashboardDrop');
    arquivo.addEventListener('change', () => importarArquivo(arquivo.files?.[0]));
    drop.addEventListener('dragover', (evento) => { evento.preventDefault(); drop.classList.add('is-drag'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('is-drag'));
    drop.addEventListener('drop', (evento) => {
      evento.preventDefault();
      drop.classList.remove('is-drag');
      importarArquivo(evento.dataTransfer?.files?.[0]);
    });
    dashboardArquivo.addEventListener('change', () => importarArquivo(dashboardArquivo.files?.[0]));
    dashboardDrop.addEventListener('dragover', (evento) => { evento.preventDefault(); dashboardDrop.classList.add('is-drag'); });
    dashboardDrop.addEventListener('dragleave', () => dashboardDrop.classList.remove('is-drag'));
    dashboardDrop.addEventListener('drop', (evento) => {
      evento.preventDefault();
      dashboardDrop.classList.remove('is-drag');
      importarArquivo(evento.dataTransfer?.files?.[0]);
    });
    document.getElementById('orcModelo').addEventListener('click', baixarModelo);
    document.getElementById('orcPadronizado').addEventListener('click', baixarPadronizado);
    document.getElementById('orcChecklistBtn').addEventListener('click', () => {
      estado.checklistAberto = !estado.checklistAberto;
      renderizarTudo();
    });
    document.getElementById('orcAdicionar').addEventListener('click', adicionarManualmente);
    document.getElementById('orcLimpar').addEventListener('click', () => limpar());
    document.getElementById('dashboardRetirar')?.addEventListener('click', () => limpar());
    document.getElementById('orcExportar').addEventListener('click', exportarOrcamento);
    document.getElementById('orcBdi').addEventListener('change', aplicarBdiPadrao);
    document.getElementById('orcTabOrcamento').addEventListener('click', () => { estado.aba = 'orcamento'; renderizarTudo(); });
    document.getElementById('orcTabAbc').addEventListener('click', () => { estado.aba = 'abc'; renderizarTudo(); });
    document.getElementById('orcParetoAbrir').addEventListener('click', () => {
      if (!estado.itens.some((item) => item.selecionado)) return;
      estado.aba = 'abc';
      renderizarTudo();
      document.getElementById('orcTabelaWrap').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    document.getElementById('orcTabela').addEventListener('click', (evento) => {
      const botao = evento.target.closest('[data-acao]');
      const linha = evento.target.closest('tr[data-id]');
      if (!botao || !linha) return;
      const id = Number(linha.dataset.id);
      if (botao.dataset.acao === 'escolher') abrirEscolha(id);
      if (botao.dataset.acao === 'remover') {
        estado.itens = estado.itens.filter((item) => item.id !== id);
        renderizarTudo();
      }
    });
    document.getElementById('orcTabela').addEventListener('change', (evento) => {
      const input = evento.target.closest('input[data-campo]');
      const linha = evento.target.closest('tr[data-id]');
      if (!input || !linha) return;
      const item = estado.itens.find((registro) => registro.id === Number(linha.dataset.id));
      if (!item) return;
      const valor = Math.max(0, paraNumero(input.value) || 0);
      item[input.dataset.campo] = valor;
      renderizarTudo();
    });
    document.getElementById('orcChecklist').addEventListener('click', (evento) => {
      const botao = evento.target.closest('[data-check-id]');
      if (botao) abrirEscolha(Number(botao.dataset.checkId));
    });
    document.getElementById('orcModalFechar').addEventListener('click', fecharEscolha);
    document.getElementById('orcModal').addEventListener('click', (evento) => { if (evento.target.id === 'orcModal') fecharEscolha(); });
    document.getElementById('orcBuscaCodigo').addEventListener('input', (evento) => renderizarOpcoes(evento.target.value));
    document.getElementById('orcOpcoes').addEventListener('click', (evento) => {
      const opcao = evento.target.closest('[data-codigo]');
      if (opcao) selecionarServico(opcao.dataset.codigo);
    });
    document.addEventListener('keydown', (evento) => {
      if (evento.key === 'Escape' && !document.getElementById('orcModal').hidden) fecharEscolha();
    });
  }

  window.orcamentoIniciar = function () {
    if (!estado.inicializado) {
      estado.inicializado = true;
      vincularEventos();
      document.getElementById('orcBase').textContent = `${catalogo.length.toLocaleString('pt-BR')} servi\u00e7os indexados \u00b7 ${BASE.estado || 'Esp\u00edrito Santo'} \u00b7 abr/2026`;
      renderizarTudo();
    }
  };

  window.HIDXOrcamento = {
    normalizar,
    buscarCatalogo,
    classificarCatalogo,
    resolverEntrada,
    chaveUnidade,
    tipoMedicao,
    resumirChecklist,
    dadosPareto,
    renderizarPareto,
    extrairResumoPlanilha,
    extrairNotasServico,
    buscarConsumoIpr,
    aplicarConsumosIpr,
    dadosDashboard,
    renderizarDashboard,
    localizarCabecalho,
    carregarWorkbookSeletivo,
    normalizarAtualizacaoProgresso,
    atualizarProgressoImportacao,
    get estado() { return estado; },
  };
})();
