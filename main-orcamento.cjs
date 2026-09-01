const { app, BrowserWindow, Menu, dialog, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const APP_TITLE = 'HID X — Orçamento e Dashboard';
const APP_VERSION = '1.1.2';
const APP_FILE = 'HID X ORCAMENTO PROTOTIPO.html';
const EM_TESTE = process.env.HIDX_SMOKE_TEST === '1';
const ARQUIVO_TESTE = process.env.HIDX_SMOKE_RESULT || '';
const PLANILHA_TESTE = process.env.HIDX_SMOKE_XLSX || '';

let janelaPrincipal;

function abrirImportacao() {
  janelaPrincipal?.webContents.executeJavaScript(
    "document.getElementById('dashboardArquivo')?.click()",
    true,
  );
}

function criarJanela() {
  janelaPrincipal = new BrowserWindow({
    width: 1500,
    height: 940,
    minWidth: 1080,
    minHeight: 720,
    title: APP_TITLE,
    backgroundColor: '#eef5fb',
    icon: path.join(__dirname, 'assets', 'hid-x-logo.ico'),
    autoHideMenuBar: false,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  janelaPrincipal.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  janelaPrincipal.webContents.on('will-navigate', (evento, url) => {
    if (!url.startsWith('file:')) evento.preventDefault();
  });
  janelaPrincipal.once('ready-to-show', () => {
    if (!EM_TESTE) janelaPrincipal?.show();
  });
  if (EM_TESTE) {
    janelaPrincipal.webContents.once('did-finish-load', async () => {
      try {
        const resultado = await janelaPrincipal.webContents.executeJavaScript(`({
          titulo: document.title,
          dashboardVisivel: document.getElementById('dashboardApp')?.hidden === false,
          orcamentoCarregado: Boolean(window.HIDXOrcamento),
          catalogoCarregado: Number(window.SICRO_CATALOGO?.servicos?.length || 0),
          consumosCarregados: Number(window.IPR736_CONSUMOS?.dispositivos?.length || 0),
          modulosVisiveis: [...document.querySelectorAll('.modulo-link')].map((item) => item.dataset.id),
          disciplinasVisiveis: [...document.querySelectorAll('.grupo-nav')].map((item) => item.dataset.disciplina)
        })`, true);
        if (PLANILHA_TESTE) {
          const conteudo = fs.readFileSync(PLANILHA_TESTE).toString('base64');
          const nome = path.basename(PLANILHA_TESTE);
          resultado.trocaPlanilha = await janelaPrincipal.webContents.executeJavaScript(`(async () => {
            const bruto = atob(${JSON.stringify(conteudo)});
            const bytes = Uint8Array.from(bruto, (caractere) => caractere.charCodeAt(0));
            const importar = async () => {
              const arquivo = new File([bytes], ${JSON.stringify(nome)}, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
              const transferencia = new DataTransfer();
              transferencia.items.add(arquivo);
              const entrada = document.getElementById('dashboardArquivo');
              Object.defineProperty(entrada, 'files', { value: transferencia.files, configurable: true });
              entrada.dispatchEvent(new Event('change', { bubbles: true }));
              const limite = Date.now() + 30000;
              while (!window.HIDXOrcamento?.estado?.itens?.length && Date.now() < limite) {
                await new Promise((resolver) => setTimeout(resolver, 100));
              }
              const estado = window.HIDXOrcamento?.estado;
              const painel = window.HIDXOrcamento?.dadosDashboard?.();
              return {
                itens: Number(estado?.itens?.length || 0),
                resumoAutomatico: estado?.resumo?.origem === 'notas',
                abasReconhecidas: Number(estado?.resumo?.abasReconhecidas?.length || 0),
                coberturaIpr: estado?.resumo?.coberturaIpr || null,
                extensao: Number(painel?.metricas?.extensao?.valor || 0),
                estruturas: Number(painel?.metricas?.quantidade?.valor || 0)
              };
            };
            const primeiraImportacao = await importar();
            document.getElementById('dashboardRetirar').click();
            await new Promise((resolver) => setTimeout(resolver, 100));
            const retirada = {
              itens: Number(window.HIDXOrcamento?.estado?.itens?.length || 0),
              resumoVazio: window.HIDXOrcamento?.estado?.resumo == null,
              origemVazia: !window.HIDXOrcamento?.estado?.arquivoOrigem,
              botaoDesabilitado: document.getElementById('dashboardRetirar')?.disabled === true,
              status: document.getElementById('dashboardStatus')?.textContent || ''
            };
            const segundaImportacao = await importar();
            return { primeiraImportacao, retirada, segundaImportacao };
          })()`, true);
        }
        if (ARQUIVO_TESTE) fs.writeFileSync(ARQUIVO_TESTE, JSON.stringify(resultado), 'utf8');
        console.log(`HIDX_SMOKE_OK ${JSON.stringify(resultado)}`);
        app.quit();
      } catch (erro) {
        if (ARQUIVO_TESTE) fs.writeFileSync(ARQUIVO_TESTE, JSON.stringify({ erro: String(erro?.stack || erro) }), 'utf8');
        console.error('HIDX_SMOKE_FAIL', erro);
        app.exit(1);
      }
    });
  }
  janelaPrincipal.loadFile(path.join(__dirname, APP_FILE), {
    query: { modulo: 'dashboard', desktop: 'orcamento', versao: APP_VERSION },
  });
}

function criarMenu() {
  const modelo = [
    {
      label: 'Arquivo',
      submenu: [
        { label: 'Importar Nota de Serviço…', accelerator: 'Ctrl+O', click: abrirImportacao },
        { label: 'Recarregar aplicativo', accelerator: 'Ctrl+R', click: () => janelaPrincipal?.reload() },
        { type: 'separator' },
        { role: 'quit', label: 'Sair' },
      ],
    },
    {
      label: 'Visualizar',
      submenu: [
        { role: 'resetZoom', label: 'Restaurar zoom' },
        { role: 'zoomIn', label: 'Aumentar zoom' },
        { role: 'zoomOut', label: 'Diminuir zoom' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Tela cheia' },
      ],
    },
    {
      label: 'Ajuda',
      submenu: [
        {
          label: 'Sobre o HID X',
          click: () => dialog.showMessageBox(janelaPrincipal, {
            type: 'info',
            title: APP_TITLE,
            message: APP_TITLE,
            detail: `Importação automática de Notas de Serviço, Orçamento SICRO, consumos IPR 736, Dashboard e Curva ABC.\n\nVersão ${APP_VERSION}`,
          }),
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(modelo));
}

app.setAppUserModelId('com.danielmachado.hidx.orcamento');
app.whenReady().then(() => {
  criarMenu();
  criarJanela();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) criarJanela();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
