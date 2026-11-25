import { criarPdf, finalizarPdf } from '../utils/pdf.js';

export function linhasDoTexto(doc, valor, largura) {
  const palavras = String(valor || '—')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ');
  const linhas = [];
  let linha = '';
  for (const palavra of palavras) {
    if (doc.widthOfString(palavra) > largura) {
      if (linha) {
        linhas.push(linha);
        linha = '';
      }
      let trecho = '';
      for (const letra of palavra) {
        if (doc.widthOfString(trecho + letra) > largura && trecho) {
          linhas.push(trecho);
          trecho = '';
        }
        trecho += letra;
      }
      linha = trecho;
    } else if (doc.widthOfString(linha ? linha + ' ' + palavra : palavra) > largura && linha) {
      linhas.push(linha);
      linha = palavra;
    } else linha = linha ? linha + ' ' + palavra : palavra;
  }
  if (linha || !linhas.length) linhas.push(linha || '—');
  return linhas;
}

export async function gerarRelatorioPdf(registros, { filtros = [], geradoEm = new Date() } = {}) {
  const doc = criarPdf({
    layout: 'landscape',
    info: { Title: 'Relatório de candidaturas - StartIF', Author: 'StartIF - IFSul Campus Bagé' }
  });
  const largura = doc.page.width - 80;
  const colunas = [
    ['Estudante', 0.19],
    ['Curso', 0.19],
    ['Empresa', 0.15],
    ['Vaga', 0.22],
    ['Situação', 0.14],
    ['Data', 0.11]
  ].map(([titulo, proporcao]) => ({ titulo, largura: largura * proporcao }));
  const data = (valor) =>
    valor
      ? new Date(valor).toLocaleDateString('pt-BR', {
          timeZone: 'UTC'
        })
      : '—';
  let y;

  function cabecalho() {
    doc.fillColor('#487700').font('Negrito').fontSize(22).text('StartIF', 40, 30);
    doc.fillColor('#394b30').font('Regular').fontSize(9).text('IFSul — Campus Bagé', 40, 59);
    doc.font('Negrito').fontSize(15).text('Relatório de candidaturas', 40, 82);
    doc
      .font('Regular')
      .fontSize(8)
      .fillColor('#526049')
      .text(`Gerado em ${data(geradoEm)} · Total de registros: ${registros.length}`, 40, 105);
    const descricao = filtros.length
      ? filtros.join('  |  ')
      : 'Filtros: todos os cursos, empresas, situações e períodos.';
    doc.text(descricao, 40, 121, { width: largura, lineGap: 2 });
    y = Math.max(148, doc.y + 15);
    doc.roundedRect(40, y, largura, 26, 5).fill('#e5eed9');
    let x = 40;
    for (const coluna of colunas) {
      doc
        .font('Negrito')
        .fontSize(8)
        .fillColor('#294b13')
        .text(coluna.titulo, x + 6, y + 8, { lineBreak: false });
      x += coluna.largura;
    }
    y += 29;
    doc.font('Regular').fontSize(8);
  }

  cabecalho();
  if (!registros.length)
    doc
      .fillColor('#526049')
      .fontSize(11)
      .text('Nenhum registro encontrado para os filtros selecionados.', 46, y + 20, {
        width: largura - 12
      });
  for (let indice = 0; indice < registros.length; indice++) {
    const c = registros[indice];
    const valores = [
      c.estudante?.usuario?.nome || 'Estudante do histórico',
      c.estudante?.curso?.nome || 'Curso do histórico',
      c.vaga?.empresa?.nomeFantasia || 'Empresa do histórico',
      c.vaga?.titulo || 'Vaga do histórico',
      String(c.status || '').replaceAll('_', ' '),
      data(c.dataCandidatura)
    ];
    doc.font('Regular').fontSize(8);
    const celulas = valores.map((valor, i) => linhasDoTexto(doc, valor, colunas[i].largura - 12));
    const totalLinhas = Math.max(...celulas.map((l) => l.length));
    let inicio = 0;
    while (inicio < totalLinhas) {
      const cabem = Math.floor((doc.page.height - 55 - y - 14) / 12);
      if (cabem < 1) {
        doc.addPage();
        cabecalho();
        continue;
      }
      const quantidade = Math.min(cabem, totalLinhas - inicio);
      const altura = quantidade * 12 + 14;
      doc.rect(40, y, largura, altura).fill(indice % 2 ? '#f1f6eb' : '#ffffff');
      let x = 40;
      for (let coluna = 0; coluna < colunas.length; coluna++) {
        for (let linha = 0; linha < quantidade; linha++) {
          const texto =
            celulas[coluna][inicio + linha] ||
            (inicio > 0 && coluna === 0 && linha === 0 ? '(continuação)' : '');
          if (texto)
            doc.fillColor('#283324').text(texto, x + 6, y + 7 + linha * 12, { lineBreak: false });
        }
        x += colunas[coluna].largura;
      }
      y += altura;
      doc
        .strokeColor('#e0e8d9')
        .lineWidth(0.4)
        .moveTo(40, y)
        .lineTo(40 + largura, y)
        .stroke();
      inicio += quantidade;
      if (inicio < totalLinhas) {
        doc.addPage();
        cabecalho();
      }
    }
  }
  const paginas = doc.bufferedPageRange();
  for (let i = paginas.start; i < paginas.start + paginas.count; i++) {
    doc.switchToPage(i);
    doc
      .font('Regular')
      .fontSize(8)
      .fillColor('#526049')
      .text(`StartIF · Página ${i + 1} de ${paginas.count}`, 40, doc.page.height - 30, {
        lineBreak: false
      });
  }
  return finalizarPdf(doc);
}
