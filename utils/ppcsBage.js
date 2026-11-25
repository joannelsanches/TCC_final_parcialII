const fonte = (id, obrigatorio, cargaMinima = 0, preRequisito = '') => ({
  exigeConvenio: false,
  permiteEstagioObrigatorio: obrigatorio,
  permiteEstagioNaoObrigatorio: true,
  cargaHorariaObrigatoriaMinima: cargaMinima,
  preRequisitoObrigatorio: preRequisito,
  fontePpc: `https://intranet.ifsul.edu.br/catalogo/download/projeto/${id}`,
  dataConferenciaPpc: new Date('2026-10-12')
});
const regras = new Map([
  ['Técnico em Informática', fonte(489, false)],
  ['Informática Integrado', fonte(489, false)],
  ['Técnico em Meio Ambiente', fonte(769, false)],
  ['Meio Ambiente Integrado Anual', fonte(769, false)],
  ['Análise e Desenvolvimento de Sistemas', fonte(898, false)],
  ['Tecnologia em Análise e Desenvolvimento de Sistemas', fonte(898, false)],
  ['Tecnologia em Alimentos', fonte(865, false)],
  [
    'Técnico em Agropecuária',
    fonte(337, true, 150, 'Conclusão de todas as disciplinas do 2º ano.')
  ],
  [
    'Agropecuária Integrado Anual',
    fonte(337, true, 150, 'Conclusão de todas as disciplinas do 2º ano.')
  ],
  [
    'Engenharia Agronômica',
    fonte(897, true, 360, 'Conclusão de pelo menos 80% dos créditos obrigatórios.')
  ]
]);
export const regrasPpcConferido = (nome) => regras.get(nome) || null;
