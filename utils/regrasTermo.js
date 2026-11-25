import { limiteJornada } from './regrasEstagio.js';
import { inicioDoDiaInstitucional } from './datas.js';

export function idadeNaData(nascimento, data) {
  const n = new Date(nascimento),
    d = new Date(data);
  if (!Number.isFinite(n.getTime()) || !Number.isFinite(d.getTime())) return null;
  return (
    d.getUTCFullYear() -
    n.getUTCFullYear() -
    (d.getUTCMonth() < n.getUTCMonth() ||
    (d.getUTCMonth() === n.getUTCMonth() && d.getUTCDate() < n.getUTCDate())
      ? 1
      : 0)
  );
}
const adicionarMeses = (data, meses) => {
  const d = new Date(data);
  d.setUTCMonth(d.getUTCMonth() + meses);
  return d;
};

export function diasUteisEntre(inicio, fim, feriados = []) {
  const data = new Date(new Date(inicio).toISOString().slice(0, 10) + 'T12:00:00Z');
  const final = new Date(new Date(fim).toISOString().slice(0, 10) + 'T12:00:00Z');
  let dias = 0;
  while (data < final) {
    data.setUTCDate(data.getUTCDate() + 1);
    if (![0, 6].includes(data.getUTCDay()) && !feriados.includes(data.toISOString().slice(0, 10)))
      dias++;
  }
  return dias;
}

export function validarRegrasTermo(
  termo,
  {
    curso = termo.curso,
    estudante = termo.estudante,
    empresa = termo.empresa,
    agora = new Date(),
    conferirAntecedencia = false,
    conferenciaFinal = false,
    validarDatasAssinaturas = true
  } = {}
) {
  const inicio = new Date(termo.periodo?.inicio),
    fim = new Date(termo.periodo?.fim);
  if (!Number.isFinite(inicio.getTime()) || !Number.isFinite(fim.getTime()) || fim <= inicio)
    return 'Informe uma vigência válida.';
  const nascimento = termo.estudanteDataNascimento || estudante?.dataNascimento;
  const assinatura =
    termo.assinaturas?.find((item) => item.papel === 'ESTUDANTE')?.dataAssinatura || agora;
  if (idadeNaData(nascimento, assinatura) === null || idadeNaData(nascimento, assinatura) < 16)
    return 'O estágio exige idade mínima de 16 anos na assinatura do TCE (art. 10).';
  if (
    validarDatasAssinaturas &&
    (termo.assinaturas || []).some(
      (item) =>
        !Number.isFinite(new Date(item.dataAssinatura).getTime()) ||
        new Date(item.dataAssinatura) > agora ||
        new Date(item.dataAssinatura) >= inicio
    )
  )
    return 'As assinaturas devem ter datas válidas, anteriores ao início do estágio e não futuras.';
  const { limiteDiario, limiteSemanal } = limiteJornada(curso ? [curso] : []);
  const diaria = Number(termo.jornada?.cargaDiaria),
    semanal = Number(termo.jornada?.cargaSemanal);
  if (
    !Number.isFinite(diaria) ||
    !Number.isFinite(semanal) ||
    diaria <= 0 ||
    semanal <= 0 ||
    diaria > limiteDiario ||
    semanal > limiteSemanal
  )
    return 'A jornada ultrapassa o limite permitido para o curso.';
  if (
    curso?.regrasEstagio?.[
      termo.modalidade === 'OBRIGATORIO'
        ? 'permiteEstagioObrigatorio'
        : 'permiteEstagioNaoObrigatorio'
    ] === false
  )
    return 'Esta modalidade de estágio não está prevista para o curso.';
  if (termo.jornada?.diasSemana?.length && semanal > diaria * termo.jornada.diasSemana.length)
    return 'A jornada semanal não cabe nos dias de estágio informados.';
  if (termo.jornada?.horarioInicio && termo.jornada?.horarioFim) {
    const minutos = (h) =>
      /^([01]\d|2[0-3]):[0-5]\d$/.test(h) ? Number(h.slice(0, 2)) * 60 + Number(h.slice(3)) : NaN;
    if (
      (minutos(termo.jornada.horarioFim) - minutos(termo.jornada.horarioInicio)) / 60 < diaria ||
      !Number.isFinite(minutos(termo.jornada.horarioInicio)) ||
      !Number.isFinite(minutos(termo.jornada.horarioFim))
    )
      return 'Os horários informados não comportam a jornada diária.';
  }
  if (
    (diaria > 6 || semanal > 30) &&
    (!curso?.regrasEstagio?.fontePpc ||
      (conferenciaFinal && !termo.validacoesInstitucionais?.periodoSemAulas))
  )
    return 'A jornada de 40 horas exige previsão no PPC e período sem aulas presenciais (art. 42).';
  if (termo.jornada?.reducaoEmAvaliacoes === false)
    return 'O TCE deve prever redução de jornada pelo menos à metade durante avaliações escolares (Lei 11.788/2008, art. 10, §2º).';
  if (
    (termo.excecaoInstitucional?.necessidadesEspecificas ||
      termo.excecaoInstitucional?.prorrogacaoAutorizada) &&
    (!termo.excecaoInstitucional?.autorizacao?.caminho ||
      !termo.excecaoInstitucional?.autorizadoPor)
  )
    return 'A exceção depende de autorização institucional documentada.';
  if (
    empresa?.tipoConcedente === 'IFSUL' &&
    termo.modalidade === 'NAO_OBRIGATORIO' &&
    (diaria > 4 || semanal > 20)
  )
    return 'Quando o IFSul é concedente de estágio não obrigatório, o limite é 4h/dia e 20h/semana (art. 87).';
  if (termo.seguro?.responsavel === 'ESTUDANTE')
    return 'O seguro deve ser assumido pela concedente ou pela instituição, nos casos permitidos.';
  if (termo.modalidade === 'NAO_OBRIGATORIO') {
    if (Number(termo.bolsa) <= 0 || Number(termo.auxilioTransporte) <= 0)
      return 'Estágio não obrigatório exige bolsa e auxílio-transporte.';
    if (termo.seguro?.responsavel !== 'CONCEDENTE')
      return 'No estágio não obrigatório, o seguro é responsabilidade da concedente (art. 25).';
    if (
      !estudante?.dataInicioCurso ||
      new Date(estudante.dataInicioCurso).getTime() + 30 * 86400000 > inicio.getTime()
    )
      return 'O estágio não obrigatório exige ao menos 30 dias de frequência desde o ingresso (art. 20).';
    if (!estudante?.previsaoConclusaoCurso || fim > new Date(estudante.previsaoConclusaoCurso))
      return 'A vigência não pode ultrapassar a previsão de conclusão do curso (art. 17).';
    if (!Number.isInteger(estudante?.disciplinasEmCurso) || estudante.disciplinasEmCurso < 1)
      return 'O estágio não obrigatório exige matrícula em pelo menos uma disciplina (art. 16).';
    if (fim > adicionarMeses(inicio, 24) && !termo.excecaoInstitucional?.necessidadesEspecificas)
      return 'A permanência na mesma concedente é limitada a dois anos, salvo exceção institucional (art. 21).';
  } else if (termo.modalidade === 'OBRIGATORIO') {
    const max = termo.excecaoInstitucional?.prorrogacaoAutorizada ? 18 : 12;
    if (fim > adicionarMeses(inicio, max) && !termo.excecaoInstitucional?.necessidadesEspecificas)
      return `Estágio obrigatório tem limite de ${max} meses; exceções precisam de autorização documentada (art. 28).`;
    if (termo.seguro?.responsavel === 'INSTITUICAO' && Number(termo.bolsa) > 0)
      return 'A cobertura institucional prevista no art. 32 aplica-se ao estágio obrigatório sem remuneração.';
  }
  if (
    Number(termo.seguro?.coberturaMorteAcidental) < 15000 ||
    Number(termo.seguro?.coberturaInvalidez) < 15000 ||
    !Number.isFinite(Number(termo.seguro?.coberturaMorteAcidental)) ||
    !Number.isFinite(Number(termo.seguro?.coberturaInvalidez))
  )
    return 'O seguro exige coberturas MAC e IPA de pelo menos R$ 15.000,00 cada (Portaria IFSul 19/2021).';
  if (
    !Number.isFinite(new Date(termo.seguro?.vigenciaInicio).getTime()) ||
    !Number.isFinite(new Date(termo.seguro?.vigenciaFim).getTime()) ||
    new Date(termo.seguro.vigenciaInicio) > inicio ||
    new Date(termo.seguro.vigenciaFim) < fim
  )
    return 'O seguro deve cobrir toda a vigência do estágio.';
  if (termo.periodicidadeRelatoriosMeses > 6 || termo.periodicidadeRelatoriosMeses < 1)
    return 'Relatórios devem ser previstos em intervalo máximo de seis meses.';
  if (conferirAntecedencia) {
    const feriados = String(process.env.FERIADOS_INSTITUCIONAIS || '')
      .split(',')
      .filter(Boolean);
    if (diasUteisEntre(inicioDoDiaInstitucional(agora), inicio, feriados) < 5)
      return 'Encaminhe o plano e TCE ao menos cinco dias úteis antes do início (art. 6).';
  }
  return '';
}

export function documentosEncerramento(termo, rescisao = false) {
  if (rescisao) return ['TERMO_RESCISAO', 'RELATORIO_ENCERRAMENTO'];
  return termo.modalidade === 'OBRIGATORIO'
    ? ['RELATORIO_FINAL', 'FICHA_AVALIACAO']
    : ['TERMO_REALIZACAO'];
}
