import Convenio from '../models/Convenio.js';
import { assinaturasConvenioCompletas } from '../utils/assinaturas.js';
import { inicioDoDiaInstitucional } from '../utils/datas.js';

export const STATUS_CONVENIO = [
  'RASCUNHO',
  'AGUARDANDO_ASSINATURAS',
  'PENDENTE',
  'ATIVO',
  'REPROVADO',
  'INATIVO',
  'VENCIDO',
  'ARQUIVADO'
];

export const STATUS_CONVENIO_EM_ANDAMENTO = [
  'RASCUNHO',
  'AGUARDANDO_ASSINATURAS',
  'PENDENTE',
  'REPROVADO'
];

const rotulosStatus = {
  RASCUNHO: 'Rascunho',
  AGUARDANDO_ASSINATURAS: 'Aguardando assinatura da empresa',
  PENDENTE: 'Aguardando validação do administrador',
  ATIVO: 'Ativo',
  REPROVADO: 'Reprovado — correção necessária',
  INATIVO: 'Inativo',
  VENCIDO: 'Vencido',
  ARQUIVADO: 'Arquivado — histórico preservado'
};

const transicoesConvenio = {
  RASCUNHO: ['RASCUNHO', 'AGUARDANDO_ASSINATURAS'],
  AGUARDANDO_ASSINATURAS: ['AGUARDANDO_ASSINATURAS', 'PENDENTE'],
  PENDENTE: ['PENDENTE', 'AGUARDANDO_ASSINATURAS', 'ATIVO', 'REPROVADO'],
  ATIVO: ['ATIVO', 'INATIVO'],
  REPROVADO: ['REPROVADO', 'AGUARDANDO_ASSINATURAS', 'PENDENTE'],
  INATIVO: ['INATIVO'],
  VENCIDO: ['VENCIDO']
};

export function rotuloStatusConvenio(status) {
  return rotulosStatus[status] || String(status || '').replaceAll('_', ' ');
}

export function transicaoConvenioPermitida(atual, proximo) {
  return Boolean(transicoesConvenio[atual]?.includes(proximo));
}

export function filtroGrupoConvenios(grupo = 'andamento', referencia = new Date()) {
  const hoje = inicioDoDiaInstitucional(referencia);
  if (grupo === 'ativos') {
    return {
      status: 'ATIVO',
      arquivado: { $ne: true },
      dataInicial: { $lte: hoje },
      dataFinal: { $gte: hoje },
      regularizacaoPendente: { $ne: true },
      'pdfAssinado.caminho': { $exists: true, $ne: '' }
    };
  }
  if (grupo === 'inativos') return { status: { $in: ['INATIVO', 'VENCIDO', 'ARQUIVADO'] } };
  if (grupo === 'todos') return {};
  return {
    $or: [
      { status: { $in: STATUS_CONVENIO_EM_ANDAMENTO } },
      { status: 'ATIVO', regularizacaoPendente: true }
    ]
  };
}

export function convenioPodeAguardarAssinatura(convenio) {
  if (convenio?.arquivado) return 'Convênio arquivado não pode voltar a uso.';
  if (!convenio?.documentoParaAssinatura?.caminho) {
    return 'Anexe o documento preparado para assinatura.';
  }
  if (!convenio.numero || !convenio.dataInicial || !convenio.dataFinal) {
    return 'Informe o número e o período de vigência antes do envio para assinatura.';
  }
  if (new Date(convenio.dataFinal) <= new Date(convenio.dataInicial)) {
    return 'A vigência do convênio é inválida.';
  }
  return '';
}

export function convenioPodeSerAtivado(convenio) {
  if (convenio?.arquivado) return 'Convênio arquivado não pode ser ativado.';
  if (!convenio?.pdfAssinado?.caminho) return 'Anexe o PDF assinado do convênio.';
  if (!assinaturasConvenioCompletas(convenio))
    return 'Registre as assinaturas da empresa e da instituição.';
  if (
    !convenio.dataInicial ||
    !convenio.dataFinal ||
    new Date(convenio.dataFinal) <= new Date(convenio.dataInicial)
  )
    return 'A vigência do convênio é inválida.';
  return '';
}

export function alteracaoExigeNovaValidacao(original, dados, arquivos = {}) {
  if (original?.status !== 'ATIVO') return false;
  const id = (valor) => String(valor?._id || valor || '');
  const data = (valor) =>
    valor
      ? Number.isFinite(new Date(valor).getTime())
        ? new Date(valor).toISOString().slice(0, 10)
        : 'invalida'
      : '';
  const assinaturas = (lista = []) =>
    [...lista]
      .map((item) =>
        [item.papel, item.nome, item.funcao, item.entidade, data(item.dataAssinatura)].join('|')
      )
      .sort()
      .join('::');
  return (
    id(original.empresa) !== id(dados.empresa) ||
    String(original.numero || '').trim() !== String(dados.numero || '').trim() ||
    data(original.dataInicial) !== data(dados.dataInicial) ||
    data(original.dataFinal) !== data(dados.dataFinal) ||
    assinaturas(original.assinaturas) !== assinaturas(dados.assinaturas) ||
    Boolean(arquivos.documentoParaAssinatura || arquivos.pdfAssinado)
  );
}

export function motivoBloqueioExclusaoConvenio(convenio, quantidadeTermos = 0) {
  if (!convenio) return 'Convênio não encontrado.';
  if (
    convenio.pdfAssinado?.caminho ||
    convenio.revisoes?.some((item) => item.dados?.pdfAssinado?.caminho)
  )
    return 'Documentos assinados são preservados. O convênio será arquivado.';
  if (convenio.status === 'ATIVO')
    return 'Convênios ativos não podem ser excluídos. Inative o convênio primeiro.';
  if (['INATIVO', 'VENCIDO'].includes(convenio.status)) {
    return 'Este convênio integra o histórico institucional e não pode ser excluído. Mantenha-o inativo.';
  }
  if (quantidadeTermos > 0) {
    return `Este convênio coincide com ${quantidadeTermos} processo(s) de estágio e precisa ser preservado no histórico. Inative-o em vez de excluir.`;
  }
  return '';
}

export async function buscarConvenioVigente(empresaId, referencia = new Date()) {
  const hoje = inicioDoDiaInstitucional(referencia);
  const convenios = await Convenio.find({
    empresa: empresaId,
    status: 'ATIVO',
    arquivado: { $ne: true },
    dataInicial: { $lte: hoje },
    dataFinal: { $gte: hoje },
    regularizacaoPendente: { $ne: true },
    'pdfAssinado.caminho': { $exists: true, $ne: '' }
  }).sort('-dataFinal');
  return convenios.find(assinaturasConvenioCompletas) || null;
}

export async function existeConvenioVigente(empresaId, referencia = new Date()) {
  return Boolean(await buscarConvenioVigente(empresaId, referencia));
}

export function registrarRevisaoConvenio(convenio, usuarioId, motivo) {
  const dados = convenio.toObject ? convenio.toObject() : { ...convenio };
  delete dados.revisoes;
  delete dados.historicoStatus;
  convenio.revisoes ||= [];
  convenio.revisoes.push({ data: new Date(), alteradoPor: usuarioId, motivo, dados });
}

export function filtroTermosVinculados(convenio) {
  const legado = { empresa: convenio.empresa?._id || convenio.empresa, convenio: null };
  if (convenio.dataInicial && convenio.dataFinal)
    legado.$or = [
      {
        'periodo.inicio': { $lte: convenio.dataFinal },
        'periodo.fim': { $gte: convenio.dataInicial }
      },
      { 'periodo.inicio': { $exists: false } },
      { 'periodo.fim': { $exists: false } }
    ];
  return { $or: [{ convenio: convenio._id }, legado] };
}

export const exigeConvenio = (cursos = [], empresa = {}) =>
  empresa.tipoConcedente === 'AGENTE_INTEGRACAO' ||
  cursos.some((curso) => curso.regrasEstagio?.exigeConvenio === true);
