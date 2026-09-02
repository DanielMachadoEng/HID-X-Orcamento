'use strict';

const fs = require('node:fs');
const path = require('node:path');

const raiz = path.resolve(__dirname, '..');
const fonte = path.join(raiz, 'assets', 'orcamento-prototype.src.js');
const runtime = path.join(raiz, 'assets', 'orcamento-prototype.js');

function converterParaAscii(conteudo) {
  return conteudo.replace(/[^\x00-\x7F]/g, (caractere) => {
    const codigo = caractere.charCodeAt(0).toString(16).padStart(4, '0');
    return `\\u${codigo}`;
  });
}

const gerado = converterParaAscii(fs.readFileSync(fonte, 'utf8'));
const atual = fs.existsSync(runtime) ? fs.readFileSync(runtime, 'utf8') : '';
const somenteVerificar = process.argv.includes('--check');

if (somenteVerificar) {
  if (atual !== gerado) {
    console.error('Runtime desatualizado. Execute: pnpm sync:runtime');
    process.exitCode = 1;
  } else {
    console.log('OK: runtime sincronizado com o fonte');
  }
} else if (atual === gerado) {
  console.log('Runtime já está sincronizado com o fonte');
} else {
  fs.writeFileSync(runtime, gerado, 'utf8');
  console.log('Runtime atualizado a partir de assets/orcamento-prototype.src.js');
}
