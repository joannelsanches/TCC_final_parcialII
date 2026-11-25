import {
  caminhoPertenceAPasta,
  metadadosUpload,
  removerArquivoSeguro,
  servirArquivo
} from '../utils/arquivos.js';
import { documentosEncerramento, validarRegrasTermo } from '../utils/regrasTermo.js';
import { pertenceABage } from '../utils/campus.js';
import { buscarConvenioVigente, exigeConvenio } from '../services/convenios.js';
import mongoose from '../config/conexao.js';
import { inicioDoDiaInstitucional } from '../utils/datas.js';
import Termo from '../models/TermoCompromisso.js';
import Candidatura from '../models/Candidatura.js';
import Estudante from '../models/Estudante.js';
import Empresa from '../models/Empresa.js';
import { empresaLogada, estudanteLogado } from '../utils/perfis.js';
import { mensagem, voltarComErro } from '../utils/mensagens.js';
import { validarCPF } from '../utils/validacoes.js';
import {
  assinaturasTceCompletas,
  estudanteMenorNaData,
  papeisObrigatoriosTce
} from '../utils/assinaturas.js';
import {
  criarNotificacao,
  criarNotificacoes,
  notificarAdministradores
} from '../services/notificacoes.js';
import { registrarHistoricoStatus } from '../utils/processoEstagio.js';
import {
  DOCUMENTOS_OBRIGATORIOS_INICIAIS,
  TIPOS_DOCUMENTO_TERMO,
  documentosObrigatoriosAprovados,
  statusDocumento
} from '../utils/documentosTermo.js';

function dadosInstitucionaisDoEnv() {
  return {
    nome: String(
      process.env.INSTITUICAO_NOME ||
        'Instituto Federal de Educação, Ciência e Tecnologia Sul-rio-grandense'
    ).trim(),
    campus: 'IFSul — Campus Bagé',
    cnpj: String(process.env.INSTITUICAO_CNPJ || '').trim(),
    representante: String(process.env.INSTITUICAO_REPRESENTANTE || '').trim()
  };
}

export function completarDadosInstitucionais(termo) {
  const atuais = termo.instituicaoEnsino || {};
  const configurados = dadosInstitucionaisDoEnv();
  termo.instituicaoEnsino = {
    nome: String(atuais.nome || '').trim() || configurados.nome,
    campus: String(atuais.campus || '').trim() || configurados.campus,
    cnpj: String(atuais.cnpj || '').trim() || configurados.cnpj,
    representante: String(atuais.representante || '').trim() || configurados.representante
  };
  return termo;
}

function assinaturasDoFormulario(body) {
  const dados = [
    [
      'ESTUDANTE',
      body.assinaturaEstudanteNome,
      body.assinaturaEstudanteFuncao || 'Estudante',
      body.assinaturaEstudanteData
    ],
    [
      'RESPONSAVEL_LEGAL',
      body.assinaturaResponsavelNome,
      body.assinaturaResponsavelFuncao || 'Responsável legal',
      body.assinaturaResponsavelData
    ],
    [
      'EMPRESA',
      body.assinaturaEmpresaNome,
      body.assinaturaEmpresaFuncao,
      body.assinaturaEmpresaData
    ],
    [
      'INSTITUICAO',
      body.assinaturaInstituicaoNome,
      body.assinaturaInstituicaoFuncao,
      body.assinaturaInstituicaoData
    ]
  ];
  return dados
    .filter(([, nome]) => String(nome || '').trim())
    .map(([papel, nome, funcao, dataAssinatura]) => ({
      papel,
      nome,
      funcao,
      dataAssinatura: dataAssinatura || undefined
    }));
}

function validarTermoParaEnvio(termo) {
  const tipos = new Set(
    (termo.documentos || [])
      .filter((documento) => documento.caminho)
      .map((documento) => documento.tipo)
  );
  const faltantes = DOCUMENTOS_OBRIGATORIOS_INICIAIS.filter((tipo) => !tipos.has(tipo));
  if (faltantes.length)
    return `Envie os documentos obrigatórios: ${faltantes.map((tipo) => tipo.replaceAll('_', ' ')).join(', ')}.`;
  if (!termo.tceAssinado?.caminho) return 'Envie o PDF real do TCE assinado.';
  if (!assinaturasTceCompletas(termo))
    return `Registre os signatários obrigatórios: ${papeisObrigatoriosTce(termo).join(', ')}.`;
  if (!termo.professorOrientador?.nome || !termo.professorOrientador?.email)
    return 'Informe o professor orientador.';
  if (
    !termo.supervisorEmpresa?.nome ||
    (!termo.supervisorEmpresa?.formacao && !termo.supervisorEmpresa?.experiencia)
  )
    return 'Os dados do supervisor estão incompletos.';
  if (!termo.seguro?.seguradora || !termo.seguro?.numeroApolice || !termo.seguro?.responsavel)
    return 'Informe os dados completos do seguro.';
  if (!termo.seguro?.vigenciaInicio || !termo.seguro?.vigenciaFim)
    return 'Informe a vigência completa do seguro.';
  const variaveisInstitucionais = {
    nome: 'INSTITUICAO_NOME',
    campus: 'INSTITUICAO_CAMPUS',
    cnpj: 'INSTITUICAO_CNPJ',
    representante: 'INSTITUICAO_REPRESENTANTE'
  };
  const ausentes = Object.entries(variaveisInstitucionais)
    .filter(([campo]) => !String(termo.instituicaoEnsino?.[campo] || '').trim())
    .map(([, variavel]) => variavel);
  if (ausentes.length)
    return `Configure ${ausentes.join(', ')} no .env e reinicie o servidor antes de enviar para análise.`;
  if (
    !termo.periodo?.inicio ||
    !termo.periodo?.fim ||
    !termo.jornada?.cargaDiaria ||
    !termo.jornada?.cargaSemanal
  )
    return 'Período ou jornada do estágio incompletos.';
  return '';
}

async function termoPermitido(req, id) {
  const termo = await Termo.findById(id).populate('estudante empresa');
  if (!termo) return null;
  if (req.session.usuario.tipo === 'ADMIN') return termo;
  if (
    req.session.usuario.tipo === 'ESTUDANTE' &&
    String(termo.estudante.usuario) === req.session.usuario.id
  )
    return termo;
  if (
    req.session.usuario.tipo === 'EMPRESA' &&
    String(termo.empresa.usuario) === req.session.usuario.id
  )
    return termo;
  return false;
}

async function notificarParticipantes(termo, titulo, texto, tipoEvento) {
  const [estudante, empresa] = await Promise.all([
    Estudante.findById(termo.estudante).select('usuario'),
    Empresa.findById(termo.empresa).select('usuario')
  ]);
  await criarNotificacoes([estudante?.usuario, empresa?.usuario].filter(Boolean), {
    titulo,
    mensagem: texto,
    link: '/termos',
    tipoEvento,
    referencia: termo._id,
    chaveUnica: `${tipoEvento}:${termo._id}:${termo.historicoStatus?.length || 0}`
  });
}

async function carregarPaginaTermos(req) {
  let filtro = {};
  let view = 'admin/termos';
  if (req.session.usuario.tipo === 'ESTUDANTE') {
    const estudante = await estudanteLogado(req);
    filtro.estudante = estudante._id;
    view = 'estudante/termos';
  }
  if (req.session.usuario.tipo === 'EMPRESA') {
    const empresa = await empresaLogada(req);
    filtro.empresa = empresa._id;
    view = 'empresa/termos';
  }
  const termos = await Termo.find(filtro)
    .populate({ path: 'candidatura', populate: 'vaga' })
    .populate({ path: 'estudante', populate: ['usuario', 'curso'] })
    .populate('empresa curso')
    .sort('-dataSolicitacao');
  let selecionadas = [];
  if (req.session.usuario.tipo === 'ESTUDANTE') {
    const estudante = await estudanteLogado(req);
    const usadas = termos.map((termo) => termo.candidatura?._id).filter(Boolean);
    selecionadas = await Candidatura.find({
      estudante: estudante._id,
      status: 'SELECIONADO',
      _id: { $nin: usadas }
    }).populate({ path: 'vaga', populate: 'empresa' });
  }
  return { view, termos, selecionadas };
}

async function renderizarPaginaTermos(req, res, { erros = {}, valores = {}, status = 200 } = {}) {
  const pagina = await carregarPaginaTermos(req);
  return res.status(status).render(pagina.view, {
    ...pagina,
    documentosMinimos: DOCUMENTOS_OBRIGATORIOS_INICIAIS,
    erros,
    valores
  });
}

export default class TermoController {
  static async listar(req, res) {
    return renderizarPaginaTermos(req, res);
  }

  static async solicitar(req, res) {
    try {
      const estudante = await Estudante.findOne({ usuario: req.session.usuario.id }).populate(
        'curso'
      );
      if (!estudante?.matriculaRegular || !pertenceABage(estudante.campus))
        return renderizarPaginaTermos(req, res, {
          erros: { geral: 'A matrícula precisa estar regular para solicitar o termo.' },
          valores: req.body,
          status: 422
        });
      if (!estudante.dataNascimento)
        return renderizarPaginaTermos(req, res, {
          erros: { geral: 'Informe sua data de nascimento no perfil antes de solicitar o termo.' },
          valores: req.body,
          status: 422
        });
      const candidatura = await Candidatura.findOne({
        _id: req.body.candidatura,
        estudante: estudante._id,
        status: 'SELECIONADO'
      }).populate({ path: 'vaga', populate: 'empresa' });
      if (!candidatura)
        return renderizarPaginaTermos(req, res, {
          erros: { candidatura: 'A candidatura precisa estar selecionada.' },
          valores: req.body,
          status: 422
        });
      const vaga = candidatura.vaga;
      if (
        vaga.modalidadeEstagio === 'OBRIGATORIO' &&
        Number(estudante.semestre || 0) <
          Number(estudante.curso.regrasEstagio?.periodoMinimoObrigatorio || 1)
      )
        return renderizarPaginaTermos(req, res, {
          erros: {
            candidatura:
              'Você ainda não atingiu o período mínimo configurado para estágio obrigatório.'
          },
          valores: req.body,
          status: 422
        });
      const convenio = await buscarConvenioVigente(vaga.empresa._id);
      if (exigeConvenio([estudante.curso], vaga.empresa) && !convenio)
        return renderizarPaginaTermos(req, res, {
          erros: {
            candidatura:
              'O convênio assinado da empresa não está vigente ou precisa de regularização.'
          },
          valores: req.body,
          status: 422
        });
      const professor = {
        nome: req.body.orientadorNome,
        cargo: req.body.orientadorCargo,
        formacao: req.body.orientadorFormacao,
        email: req.body.orientadorEmail,
        telefone: req.body.orientadorTelefone
      };
      const erros = {};
      if (!professor.nome) erros.orientadorNome = 'Informe o nome do professor orientador.';
      if (!professor.email || !/^\S+@\S+\.\S+$/.test(professor.email))
        erros.orientadorEmail = 'Informe um e-mail válido do professor orientador.';
      for (const campo of [
        'seguroResponsavel',
        'seguradora',
        'numeroApolice',
        'seguroVigenciaInicio',
        'seguroVigenciaFim'
      ]) {
        if (!req.body[campo]) erros[campo] = 'Campo obrigatório.';
      }
      if (
        req.body.seguroVigenciaInicio &&
        req.body.seguroVigenciaFim &&
        new Date(req.body.seguroVigenciaFim) < new Date(req.body.seguroVigenciaInicio)
      )
        erros.seguroVigenciaFim = 'A vigência final deve ser posterior à inicial.';
      if (estudanteMenorNaData(estudante.dataNascimento)) {
        if (!req.body.representanteLegalNome)
          erros.representanteLegalNome = 'Informe o responsável legal.';
        if (!validarCPF(req.body.representanteLegalCpf))
          erros.representanteLegalCpf = 'Informe um CPF válido do responsável legal.';
      }
      if (Object.keys(erros).length)
        return renderizarPaginaTermos(req, res, { erros, valores: req.body, status: 422 });
      const termo = new Termo({
        candidatura: candidatura._id,
        estudante: estudante._id,
        empresa: vaga.empresa._id,
        convenio: convenio?._id,
        curso: estudante.curso._id,
        matricula: estudante.matricula,
        estudanteDataNascimento: estudante.dataNascimento,
        concedente: {
          razaoSocial: vaga.empresa.razaoSocial,
          cnpj: vaga.empresa.cnpj,
          representante: vaga.empresa.responsavel?.nome,
          cargoRepresentante: vaga.empresa.responsavel?.cargo
        },
        instituicaoEnsino: dadosInstitucionaisDoEnv(),
        representanteLegal: {
          nome: req.body.representanteLegalNome,
          cpf: req.body.representanteLegalCpf
        },
        professorOrientador: professor,
        supervisorEmpresa: vaga.supervisor,
        modalidade: vaga.modalidadeEstagio,
        planoAtividades: vaga.atividades || req.body.planoAtividades,
        periodo: { inicio: vaga.periodoInicio, fim: vaga.periodoFim },
        jornada: {
          cargaDiaria: vaga.cargaHorariaDiaria,
          cargaSemanal: vaga.cargaHorariaSemanal || vaga.cargaHoraria,
          diasSemana: vaga.diasSemana,
          horarioInicio: vaga.horarioInicio,
          horarioFim: vaga.horarioFim,
          intervalo: vaga.intervalo,
          reducaoEmAvaliacoes: vaga.reducaoJornadaAvaliacoes !== false
        },
        bolsa: vaga.bolsa,
        auxilioTransporte: vaga.auxilioTransporte,
        outrosBeneficios: vaga.outrosBeneficios,
        seguro: {
          responsavel: req.body.seguroResponsavel,
          seguradora: req.body.seguradora,
          numeroApolice: req.body.numeroApolice,
          coberturaMorteAcidental: Number(req.body.coberturaMorteAcidental),
          coberturaInvalidez: Number(req.body.coberturaInvalidez),
          vigenciaInicio: req.body.seguroVigenciaInicio,
          vigenciaFim: req.body.seguroVigenciaFim
        },
        status: 'RASCUNHO',
        historicoStatus: [
          {
            status: 'RASCUNHO',
            data: new Date(),
            alteradoPor: req.session.usuario.id,
            observacao: 'Rascunho criado.'
          }
        ]
      });
      const regra = validarRegrasTermo(termo, {
        curso: estudante.curso,
        estudante,
        empresa: vaga.empresa
      });
      if (regra)
        return renderizarPaginaTermos(req, res, {
          erros: { geral: regra },
          valores: req.body,
          status: 422
        });
      await mongoose.connection.transaction(async (session) => {
        if (exigeConvenio([estudante.curso], vaga.empresa)) {
          const Convenio = (await import('../models/Convenio.js')).default;
          const vigente = await Convenio.findOneAndUpdate(
            { _id: convenio._id, status: 'ATIVO', arquivado: { $ne: true }, __v: convenio.__v },
            { $inc: { __v: 1 } },
            { session }
          );
          if (!vigente) throw new Error('O convênio foi retirado de uso ou alterado.');
        }
        await termo.save({ session });
      });
      const empresa = await Empresa.findById(termo.empresa).select('usuario');
      if (empresa?.usuario) {
        await criarNotificacao({
          destinatario: empresa.usuario,
          titulo: 'Termo em preparação',
          mensagem: 'Um estudante selecionado iniciou o rascunho do termo de compromisso.',
          link: '/termos',
          tipoEvento: 'TERMO_RASCUNHO',
          referencia: termo._id,
          chaveUnica: `TERMO_RASCUNHO:${termo._id}`,
          enviarPorEmail: true
        });
      }
      mensagem(
        req,
        'sucesso',
        'Rascunho criado. Envie o TCE assinado e complete o checklist documental.'
      );
      return res.redirect('/termos');
    } catch (erro) {
      return renderizarPaginaTermos(req, res, {
        erros: {
          geral:
            erro.code === 11000
              ? 'Já existe um termo para esta candidatura.'
              : 'Não foi possível criar o termo.'
        },
        valores: req.body,
        status: erro.code === 11000 ? 422 : 500
      });
    }
  }

  static async corrigirRascunho(req, res) {
    const estudante = await estudanteLogado(req);
    const termo = await Termo.findOne({
      _id: req.params.id,
      estudante: estudante._id,
      status: { $in: ['RASCUNHO', 'AGUARDANDO_ASSINATURAS', 'REPROVADO'] }
    }).populate('curso empresa');
    if (!termo) return res.status(404).render('erro/404');
    const anterior = {
      seguro: termo.seguro.toObject(),
      professorOrientador: termo.professorOrientador.toObject()
    };
    termo.seguro = {
      responsavel: req.body.seguroResponsavel,
      seguradora: req.body.seguradora,
      numeroApolice: req.body.numeroApolice,
      coberturaMorteAcidental: req.body.coberturaMorteAcidental,
      coberturaInvalidez: req.body.coberturaInvalidez,
      vigenciaInicio: req.body.seguroVigenciaInicio,
      vigenciaFim: req.body.seguroVigenciaFim
    };
    termo.professorOrientador.nome = req.body.orientadorNome;
    termo.professorOrientador.email = req.body.orientadorEmail;
    const erro = validarRegrasTermo(termo, { estudante });
    if (
      erro ||
      !termo.professorOrientador.nome ||
      !/^\S+@\S+\.\S+$/.test(termo.professorOrientador.email || '')
    )
      return voltarComErro(req, res, erro || 'Informe orientador e e-mail válidos.', '/termos');
    if (
      JSON.stringify(anterior) !==
      JSON.stringify({
        seguro: termo.seguro.toObject(),
        professorOrientador: termo.professorOrientador.toObject()
      })
    ) {
      if (termo.tceAssinado?.caminho)
        termo.documentos.push({
          ...termo.tceAssinado.toObject(),
          tipo: 'OUTRO',
          nome: 'TCE anterior à correção',
          status: 'ENVIADO'
        });
      termo.tceAssinado = undefined;
      termo.assinaturas = [];
      termo.documentos.forEach((d) => {
        if (['TCE', 'APOLICE_SEGURO'].includes(d.tipo)) {
          d.tipo = 'OUTRO';
          d.nome = 'Versão anterior: ' + (d.nome || 'documento');
        }
      });
      termo.status = 'RASCUNHO';
      registrarHistoricoStatus(
        termo,
        'RASCUNHO',
        req.session.usuario.id,
        'Seguro/orientador corrigidos. Nova assinatura e apólice necessárias; documentos anteriores preservados.'
      );
      await termo.save();
    }
    mensagem(
      req,
      'sucesso',
      'Rascunho corrigido. Confira e envie os novos documentos e assinaturas.'
    );
    return res.redirect('/termos');
  }

  static async registrarAditivo(req, res) {
    const termo = await Termo.findOne({
      _id: req.params.id,
      status: 'APROVADO',
      situacaoEstagio: { $in: ['NAO_INICIADO', 'EM_ANDAMENTO'] }
    }).populate('curso estudante empresa');
    const arquivo = req.files?.aditivo?.[0],
      autorizacao = req.files?.autorizacao?.[0],
      apolice = req.files?.apolice?.[0];
    const falhar = async (texto) => {
      for (const f of [arquivo, autorizacao, apolice])
        if (f) await removerArquivoSeguro(f.path, 'documentos');
      return voltarComErro(req, res, texto, '/termos');
    };
    if (!termo || !arquivo)
      return falhar('Selecione um termo aprovado e o PDF do aditivo assinado.');
    const assinaturas = assinaturasDoFormulario(req.body);
    const papeis = papeisObrigatoriosTce(termo);
    const dataEfeito = new Date(req.body.dataEfeito);
    if (
      !Number.isFinite(dataEfeito.getTime()) ||
      dataEfeito.getTime() !== inicioDoDiaInstitucional().getTime() ||
      dataEfeito > new Date(req.body.periodoFim)
    )
      return falhar('Registre o aditivo no dia de início dos efeitos, sem retroagir.');
    if (
      papeis.some(
        (papel) =>
          !assinaturas.some(
            (a) =>
              a.papel === papel &&
              a.nome &&
              a.funcao &&
              Number.isFinite(new Date(a.dataAssinatura).getTime()) &&
              new Date(a.dataAssinatura) <= new Date() &&
              new Date(a.dataAssinatura) < dataEfeito
          )
      )
    )
      return falhar('Registre todas as assinaturas do aditivo antes do início de seus efeitos.');
    if (
      [
        'compatibilidadeCursoPpc',
        'jornadaHorarioEscolar',
        'recessoPrevisto',
        'frequenciaRendimento'
      ].some((c) => req.body[c] !== 'on') ||
      !String(req.body.justificativa || '').trim()
    )
      return falhar('Confirme as conferências acadêmicas e informe a justificativa do aditivo.');
    const dadosAnteriores = {
      periodo: termo.periodo.toObject(),
      jornada: termo.jornada.toObject(),
      bolsa: termo.bolsa,
      auxilioTransporte: termo.auxilioTransporte,
      seguro: termo.seguro.toObject(),
      planoAtividades: termo.planoAtividades
    };
    const proposto = termo.toObject();
    proposto.periodo.fim = new Date(req.body.periodoFim);
    proposto.jornada.cargaDiaria = Number(req.body.cargaDiaria);
    proposto.jornada.cargaSemanal = Number(req.body.cargaSemanal);
    proposto.jornada.horarioInicio = req.body.horarioInicio;
    proposto.jornada.horarioFim = req.body.horarioFim;
    proposto.bolsa = Number(req.body.bolsa);
    proposto.auxilioTransporte = Number(req.body.auxilioTransporte);
    proposto.seguro.vigenciaFim = new Date(req.body.seguroVigenciaFim);
    if (
      proposto.seguro.vigenciaFim.getTime() !== new Date(termo.seguro.vigenciaFim).getTime() &&
      !apolice
    )
      return falhar('Anexe a apólice atualizada para alterar a cobertura do seguro.');
    proposto.planoAtividades = String(req.body.planoAtividades || '').trim();
    proposto.validacoesInstitucionais.periodoSemAulas = req.body.periodoSemAulas === 'on';
    if (autorizacao)
      proposto.excecaoInstitucional = {
        autorizacao: metadadosUpload(autorizacao),
        autorizadoPor: req.session.usuario.id,
        dataAutorizacao: new Date(),
        prorrogacaoAutorizada: req.body.prorrogacaoAutorizada === 'on',
        necessidadesEspecificas: req.body.necessidadesEspecificas === 'on'
      };
    const erro = validarRegrasTermo(proposto, {
      conferenciaFinal: true,
      validarDatasAssinaturas: false
    });
    if (
      erro ||
      !proposto.planoAtividades ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(proposto.jornada.horarioInicio || '') ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(proposto.jornada.horarioFim || '') ||
      proposto.jornada.horarioFim <= proposto.jornada.horarioInicio
    )
      return falhar(erro || 'Confira atividades e horários do aditivo.');
    const documento = { ...metadadosUpload(arquivo), enviadoPor: req.session.usuario.id };
    const dadosNovos = {
      periodo: proposto.periodo,
      jornada: proposto.jornada,
      bolsa: proposto.bolsa,
      auxilioTransporte: proposto.auxilioTransporte,
      seguro: proposto.seguro,
      planoAtividades: proposto.planoAtividades
    };
    termo.aditivos.push({
      dadosAnteriores,
      dadosNovos: { ...dadosNovos, dataEfeito },
      documento,
      assinaturas,
      registradoPor: req.session.usuario.id,
      justificativa: req.body.justificativa
    });
    Object.assign(termo, dadosNovos);
    termo.excecaoInstitucional = proposto.excecaoInstitucional;
    termo.validacoesInstitucionais.periodoSemAulas =
      proposto.validacoesInstitucionais.periodoSemAulas;
    termo.documentos.push({
      ...documento,
      tipo: 'TERMO_ADITIVO',
      nome: 'Aditivo assinado',
      status: 'APROVADO',
      validado: true,
      analisadoPor: req.session.usuario.id,
      dataAnalise: new Date()
    });
    if (apolice)
      termo.documentos.push({
        ...metadadosUpload(apolice),
        tipo: 'APOLICE_SEGURO',
        nome: 'Apólice após aditivo',
        status: 'APROVADO',
        validado: true,
        analisadoPor: req.session.usuario.id,
        dataAnalise: new Date()
      });
    registrarHistoricoStatus(
      termo,
      'ADITIVO_REGISTRADO',
      req.session.usuario.id,
      req.body.justificativa
    );
    try {
      await termo.save();
    } catch (e) {
      await falhar(
        'O termo mudou durante a operação ou os dados são inválidos. Atualize a página.'
      );
      return;
    }
    await notificarParticipantes(
      termo,
      'Aditivo registrado',
      'A alteração do estágio foi formalizada. Confira a nova vigência e condições.',
      'TERMO_ADITIVO'
    );
    mensagem(
      req,
      'sucesso',
      'Aditivo registrado. O TCE original e as condições anteriores foram preservados.'
    );
    return res.redirect('/termos');
  }

  static async enviarDocumento(req, res) {
    const estudante = await estudanteLogado(req);
    const termo = await Termo.findOne({
      _id: req.params.id,
      estudante: estudante._id,
      status: { $in: ['RASCUNHO', 'AGUARDANDO_ASSINATURAS', 'REPROVADO', 'APROVADO'] },
      situacaoEstagio: { $in: ['NAO_INICIADO', 'EM_ANDAMENTO'] }
    });
    if (!termo || !req.file) {
      if (req.file) await removerArquivoSeguro(req.file.path, 'documentos');
      return voltarComErro(req, res, 'Termo ou PDF inválido.', '/termos');
    }
    if (!TIPOS_DOCUMENTO_TERMO.includes(req.body.tipoDocumento)) {
      await removerArquivoSeguro(req.file.path, 'documentos');
      return voltarComErro(req, res, 'Tipo de documento inválido.', '/termos');
    }
    const acompanhamento = [
      'RELATORIO_FINAL',
      'RELATORIO_ENCERRAMENTO',
      'FICHA_AVALIACAO',
      'RELATORIO',
      'TERMO_ADITIVO',
      'TERMO_REALIZACAO',
      'TERMO_RESCISAO',
      'OUTRO'
    ];
    if (termo.status === 'APROVADO' && !acompanhamento.includes(req.body.tipoDocumento)) {
      await removerArquivoSeguro(req.file.path, 'documentos');
      return voltarComErro(
        req,
        res,
        'Após a aprovação, envie somente documentos de acompanhamento ou encerramento.',
        '/termos'
      );
    }
    const anterior = [...termo.documentos]
      .reverse()
      .find(
        (documento) => documento.tipo === req.body.tipoDocumento && documento.status === 'REJEITADO'
      );
    const caminhoAnterior = anterior?.caminho;
    if (anterior) {
      Object.assign(anterior, {
        nome: req.body.nomeDocumento || anterior.nome,
        ...metadadosUpload(req.file),
        status: 'ENVIADO',
        dataEnvio: new Date(),
        dataAnalise: undefined,
        analisadoPor: undefined,
        motivoRejeicao: '',
        validado: false
      });
    } else {
      termo.documentos.push({
        tipo: req.body.tipoDocumento,
        nome: req.body.nomeDocumento || 'Documento do estágio',
        ...metadadosUpload(req.file),
        status: 'ENVIADO',
        dataEnvio: new Date(),
        validado: false
      });
    }
    if (termo.status === 'REPROVADO')
      termo.status = termo.tceAssinado?.caminho ? 'AGUARDANDO_ASSINATURAS' : 'RASCUNHO';
    await termo.save();
    if (caminhoAnterior) await removerArquivoSeguro(caminhoAnterior, 'documentos');
    mensagem(
      req,
      'sucesso',
      anterior ? 'Documento rejeitado substituído.' : 'Documento enviado para o checklist.'
    );
    return res.redirect('/termos');
  }

  static async enviarTceAssinado(req, res) {
    const estudante = await estudanteLogado(req);
    const termo = await Termo.findOne({
      _id: req.params.id,
      estudante: estudante._id,
      status: { $in: ['RASCUNHO', 'AGUARDANDO_ASSINATURAS', 'REPROVADO'] }
    });
    if (!termo || !req.file) {
      if (req.file) await removerArquivoSeguro(req.file.path, 'documentos');
      return voltarComErro(req, res, 'Selecione o PDF assinado do TCE.', '/termos');
    }
    const anterior = termo.tceAssinado?.caminho;
    termo.tceAssinado = metadadosUpload(req.file);
    termo.assinaturas = assinaturasDoFormulario(req.body);
    termo.status = 'AGUARDANDO_ASSINATURAS';
    termo.regularizacaoAssinaturasPendente = !assinaturasTceCompletas(termo);
    termo.justificativa = '';
    registrarHistoricoStatus(
      termo,
      'AGUARDANDO_ASSINATURAS',
      req.session.usuario.id,
      'TCE assinado anexado e signatários registrados.'
    );
    await termo.save();
    if (anterior) await removerArquivoSeguro(anterior, 'documentos');
    const empresa = await Empresa.findById(termo.empresa).select('usuario');
    if (empresa?.usuario) {
      await criarNotificacao({
        destinatario: empresa.usuario,
        titulo: 'Termo aguardando assinaturas',
        mensagem: termo.regularizacaoAssinaturasPendente
          ? 'O TCE foi anexado, mas ainda faltam signatários obrigatórios.'
          : 'O TCE assinado e os signatários foram registrados e aguardam o envio para análise.',
        link: '/termos',
        tipoEvento: 'TERMO_AGUARDANDO_ASSINATURAS',
        referencia: termo._id,
        chaveUnica: `TERMO_AGUARDANDO_ASSINATURAS:${termo._id}:${termo.historicoStatus.length}`
      });
    }
    mensagem(
      req,
      'sucesso',
      termo.regularizacaoAssinaturasPendente
        ? 'TCE salvo. Ainda faltam signatários obrigatórios.'
        : 'TCE assinado e signatários registrados.'
    );
    return res.redirect('/termos');
  }

  static async enviarAnalise(req, res) {
    const estudante = await estudanteLogado(req);
    const termo = await Termo.findOne({
      _id: req.params.id,
      estudante: estudante._id,
      status: { $in: ['RASCUNHO', 'AGUARDANDO_ASSINATURAS', 'REPROVADO'] }
    });
    if (!termo) return res.status(404).render('erro/404');
    completarDadosInstitucionais(termo);
    const estudanteAtual = await Estudante.findById(termo.estudante).populate('curso');
    const empresaAtual = await Empresa.findById(termo.empresa);
    const regra = validarRegrasTermo(termo, {
      estudante: estudanteAtual,
      curso: estudanteAtual.curso,
      empresa: empresaAtual,
      conferirAntecedencia: true
    });
    if (regra) return voltarComErro(req, res, regra, '/termos');
    const erro = validarTermoParaEnvio(termo);
    if (erro) return voltarComErro(req, res, erro, '/termos');
    termo.status = 'PENDENTE';
    termo.justificativa = '';
    termo.dataEnvioAnalise = new Date();
    termo.regularizacaoAssinaturasPendente = false;
    termo.documentos.forEach((documento) => {
      if (documento.status === 'ENVIADO') documento.status = 'EM_ANALISE';
    });
    registrarHistoricoStatus(
      termo,
      'PENDENTE',
      req.session.usuario.id,
      'Enviado para análise institucional.'
    );
    await termo.save();
    await notificarAdministradores({
      titulo: 'Termo aguardando análise',
      mensagem: 'Um TCE e seu checklist foram enviados para análise.',
      link: '/termos',
      tipoEvento: 'TERMO_PENDENTE',
      referencia: termo._id,
      chaveUnica: `TERMO_PENDENTE:${termo._id}:${termo.historicoStatus.length}`
    });
    mensagem(req, 'sucesso', 'Termo e checklist enviados para análise institucional.');
    return res.redirect('/termos');
  }

  static async documento(req, res) {
    const termo = await Termo.findOne({ 'documentos._id': req.params.documentoId }).populate(
      'estudante empresa'
    );
    if (!termo) return res.status(404).render('erro/404');
    const permitido = await termoPermitido(req, termo._id);
    if (!permitido) return res.status(403).render('erro/403');
    const documento = termo.documentos.id(req.params.documentoId);
    if (!documento || !caminhoPertenceAPasta(documento.caminho, 'documentos'))
      return res.status(403).render('erro/403');
    return servirArquivo(res, documento, 'documentos');
  }

  static async tceAssinado(req, res) {
    const termo = await termoPermitido(req, req.params.id);
    if (termo === false) return res.status(403).render('erro/403');
    if (!termo) return res.status(404).render('erro/404');
    if (
      !termo.tceAssinado?.caminho ||
      !caminhoPertenceAPasta(termo.tceAssinado.caminho, 'documentos')
    )
      return res.status(404).render('erro/404');
    return servirArquivo(res, termo.tceAssinado, 'documentos');
  }

  static async validarDocumento(req, res) {
    const termo = await Termo.findById(req.params.id);
    const documento = termo?.documentos.id(req.params.documentoId);
    if (!termo || !documento) return res.status(404).render('erro/404');
    if (!['PENDENTE', 'APROVADO'].includes(termo.status))
      return voltarComErro(req, res, 'O documento não está em uma etapa de análise.', '/termos');
    const aprovar = req.body.decisao === 'aprovar';
    const motivo = String(req.body.motivoRejeicao || '').trim();
    if (!aprovar && !motivo)
      return voltarComErro(req, res, 'Informe o motivo da rejeição do documento.', '/termos');
    documento.status = aprovar ? 'APROVADO' : 'REJEITADO';
    documento.validado = aprovar;
    documento.dataAnalise = new Date();
    documento.analisadoPor = req.session.usuario.id;
    documento.motivoRejeicao = aprovar ? '' : motivo;
    if (aprovar && documento.tipo === 'RELATORIO') {
      const proximo = new Date();
      proximo.setMonth(proximo.getMonth() + Number(termo.periodicidadeRelatoriosMeses || 6));
      termo.proximoRelatorio = proximo > new Date(termo.periodo.fim) ? termo.periodo.fim : proximo;
    }
    await termo.save();
    if (!aprovar)
      await notificarParticipantes(
        termo,
        'Documento rejeitado',
        `O documento “${documento.nome || documento.tipo}” precisa ser substituído. Motivo: ${motivo}`,
        'DOCUMENTO_REJEITADO'
      );
    mensagem(req, 'sucesso', `Documento ${aprovar ? 'aprovado' : 'rejeitado'}.`);
    return res.redirect('/termos');
  }

  static async analisar(req, res) {
    const termo = await Termo.findOne({ _id: req.params.id, status: 'PENDENTE' }).populate(
      'estudante candidatura empresa curso'
    );
    if (!termo) return voltarComErro(req, res, 'O termo não está aguardando análise.', '/termos');
    completarDadosInstitucionais(termo);
    const aprovar = req.body.decisao === 'aprovar';
    if (!aprovar && !String(req.body.justificativa || '').trim())
      return voltarComErro(req, res, 'Informe a justificativa.', '/termos');
    if (aprovar) {
      const erro = validarTermoParaEnvio(termo);
      if (erro) return voltarComErro(req, res, erro, '/termos');
      if (!documentosObrigatoriosAprovados(termo))
        return voltarComErro(
          req,
          res,
          'Aprove individualmente todos os documentos obrigatórios antes do termo.',
          '/termos'
        );
      const confirmacoes = [
        'compatibilidadeCursoPpc',
        'jornadaHorarioEscolar',
        'supervisorApto',
        'instalacoesAvaliadas',
        'recessoPrevisto',
        'calendarioConferido',
        'frequenciaRendimento',
        'restricoesMenor',
        'requisitosAcademicosPpc'
      ];
      termo.validacoesInstitucionais.periodoSemAulas = req.body.periodoSemAulas === 'on';
      const regra = validarRegrasTermo(termo, { conferenciaFinal: true });
      if (regra) return voltarComErro(req, res, regra, '/termos');
      if (confirmacoes.some((campo) => req.body[campo] !== 'on'))
        return voltarComErro(req, res, 'Confirme todas as validações institucionais.', '/termos');
      if (!termo.estudante.matriculaRegular)
        return voltarComErro(req, res, 'A matrícula do estudante não está validada.', '/termos');
      const outros = await Termo.find({
        _id: { $ne: termo._id },
        estudante: termo.estudante._id,
        status: 'APROVADO',
        situacaoEstagio: { $in: ['NAO_INICIADO', 'EM_ANDAMENTO'] },
        'periodo.inicio': { $lte: termo.periodo.fim },
        'periodo.fim': { $gte: termo.periodo.inicio }
      });
      if (
        outros.some((outro) => outro.modalidade === termo.modalidade) ||
        (outros.length &&
          (Number(termo.jornada.cargaDiaria) +
            outros.reduce((s, outro) => s + Number(outro.jornada.cargaDiaria), 0) >
            6 ||
            Number(termo.jornada.cargaSemanal) +
              outros.reduce((s, outro) => s + Number(outro.jornada.cargaSemanal), 0) >
              30))
      )
        return voltarComErro(
          req,
          res,
          'Estágios concomitantes exigem modalidades diferentes e jornada total até 6h/dia e 30h/semana (art. 10).',
          '/termos'
        );
      if (termo.empresa.statusCadastro !== 'APROVADO')
        return voltarComErro(req, res, 'O cadastro da empresa não está aprovado.', '/termos');
      const convenioVigente = await buscarConvenioVigente(termo.empresa._id);
      if (exigeConvenio(termo.curso ? [termo.curso] : [], termo.empresa) && !convenioVigente)
        return voltarComErro(req, res, 'O convênio assinado não está vigente.', '/termos');
      if (
        Number(termo.jornada.cargaDiaria) >
          Number(termo.curso?.regrasEstagio?.cargaHorariaDiariaMaxima || 6) ||
        Number(termo.jornada.cargaSemanal) >
          Number(termo.curso?.regrasEstagio?.cargaHorariaSemanalMaxima || 30)
      )
        return voltarComErro(req, res, 'A jornada ultrapassa a regra do curso.', '/termos');
      if (
        termo.modalidade === 'NAO_OBRIGATORIO' &&
        (Number(termo.bolsa) <= 0 || Number(termo.auxilioTransporte) <= 0)
      )
        return voltarComErro(
          req,
          res,
          'Estágio não obrigatório exige bolsa e auxílio-transporte.',
          '/termos'
        );
      if (Number(termo.supervisorEmpresa?.quantidadeEstagiariosAtuais || 0) >= 10)
        return voltarComErro(
          req,
          res,
          'O supervisor já alcançou o limite de 10 estagiários.',
          '/termos'
        );
      if (
        new Date(termo.seguro.vigenciaInicio) > new Date(termo.periodo.inicio) ||
        new Date(termo.seguro.vigenciaFim) < new Date(termo.periodo.fim)
      )
        return voltarComErro(
          req,
          res,
          'O seguro deve cobrir todo o período do estágio.',
          '/termos'
        );
      termo.validacoesInstitucionais = {
        calendarioConferido: true,
        frequenciaRendimento: true,
        restricoesMenor: true,
        periodoSemAulas: req.body.periodoSemAulas === 'on',
        recessoPrevisto: true,
        cadastroEmpresaAprovado: true,
        convenioVigente:
          Boolean(convenioVigente) ||
          !exigeConvenio(termo.curso ? [termo.curso] : [], termo.empresa),
        matriculaRegular: true,
        requisitosAcademicosPpc: true,
        compatibilidadeCursoPpc: true,
        jornadaHorarioEscolar: true,
        supervisorApto: true,
        instalacoesAvaliadas: true,
        documentosCompletos: true
      };
    }
    termo.status = aprovar ? 'APROVADO' : 'REPROVADO';
    termo.justificativa = aprovar ? '' : req.body.justificativa.trim();
    termo.dataAnalise = new Date();
    termo.dataAprovacao = aprovar ? new Date() : undefined;
    registrarHistoricoStatus(termo, termo.status, req.session.usuario.id, termo.justificativa);
    await termo.save();
    await notificarParticipantes(
      termo,
      'Termo de compromisso analisado',
      `Seu termo foi ${aprovar ? 'aprovado' : 'reprovado'}.`,
      aprovar ? 'TERMO_APROVADO' : 'TERMO_REPROVADO'
    );
    mensagem(req, 'sucesso', 'Análise do termo registrada.');
    return res.redirect('/termos');
  }

  static async iniciar(req, res) {
    const termo = await Termo.findOne({
      _id: req.params.id,
      status: 'APROVADO',
      situacaoEstagio: 'NAO_INICIADO'
    }).populate('estudante candidatura');
    if (!termo)
      return voltarComErro(
        req,
        res,
        'O termo ainda não está aprovado ou o estágio já iniciou.',
        '/termos'
      );
    if (
      !termo.tceAssinado?.caminho ||
      !assinaturasTceCompletas(termo) ||
      !documentosObrigatoriosAprovados(termo)
    )
      return voltarComErro(
        req,
        res,
        'O TCE assinado, os signatários e os documentos obrigatórios precisam estar validados.',
        '/termos'
      );
    if (new Date(termo.periodo.fim) < new Date())
      return voltarComErro(
        req,
        res,
        'A vigência prevista já encerrou. Formalize um aditivo antes de iniciar.',
        '/termos'
      );
    if (new Date(termo.periodo.inicio) > new Date())
      return voltarComErro(
        req,
        res,
        'O estágio não pode iniciar antes do período previsto.',
        '/termos'
      );
    termo.situacaoEstagio = 'EM_ANDAMENTO';
    termo.dataInicioEfetivo = new Date();
    registrarHistoricoStatus(
      termo,
      'ESTAGIO_EM_ANDAMENTO',
      req.session.usuario.id,
      'Início registrado após aprovação documental.'
    );
    const proximo = new Date(termo.dataInicioEfetivo);
    proximo.setMonth(proximo.getMonth() + Number(termo.periodicidadeRelatoriosMeses || 6));
    termo.proximoRelatorio = proximo > new Date(termo.periodo.fim) ? termo.periodo.fim : proximo;
    await termo.save();
    const existe = termo.estudante.historicoEstagios.some(
      (item) => String(item.vaga) === String(termo.candidatura.vaga)
    );
    if (!existe) {
      termo.estudante.historicoEstagios.push({
        vaga: termo.candidatura.vaga,
        empresa: termo.empresa,
        dataInicio: termo.dataInicioEfetivo
      });
      await termo.estudante.save();
    }
    mensagem(req, 'sucesso', 'Início do estágio registrado.');
    return res.redirect('/termos');
  }

  static async encerrar(req, res) {
    const termo = await Termo.findOne({
      _id: req.params.id,
      status: 'APROVADO',
      situacaoEstagio: 'EM_ANDAMENTO'
    }).populate('estudante candidatura curso');
    if (!termo) return voltarComErro(req, res, 'O estágio não está em andamento.', '/termos');
    const tiposAprovados = new Set(
      termo.documentos
        .filter((documento) => statusDocumento(documento) === 'APROVADO')
        .map((documento) => documento.tipo)
    );
    const necessarios = documentosEncerramento(termo);
    if (necessarios.some((tipo) => !tiposAprovados.has(tipo)))
      return voltarComErro(
        req,
        res,
        'Aprove os documentos de encerramento: ' + necessarios.join(', ') + '.',
        '/termos'
      );
    const horas = Number(req.body.cargaHorariaCumprida);
    const minimo = Number(termo.curso?.regrasEstagio?.cargaHorariaObrigatoriaMinima || 0);
    if (termo.modalidade === 'OBRIGATORIO' && (!Number.isFinite(horas) || horas < minimo))
      return voltarComErro(
        req,
        res,
        `Informe a carga cumprida; o PPC exige ao menos ${minimo} horas.`,
        '/termos'
      );
    termo.cargaHorariaCumprida = Number.isFinite(horas) ? horas : undefined;
    termo.situacaoEstagio = 'ENCERRADO';
    termo.dataEncerramento = new Date();
    registrarHistoricoStatus(
      termo,
      'ESTAGIO_ENCERRADO',
      req.session.usuario.id,
      'Encerramento registrado.'
    );
    await termo.save();
    const historico = termo.estudante.historicoEstagios.find(
      (item) => String(item.vaga) === String(termo.candidatura.vaga)
    );
    if (historico) {
      historico.dataFim = termo.dataEncerramento;
      await termo.estudante.save();
    }
    mensagem(req, 'sucesso', 'Encerramento do estágio registrado.');
    return res.redirect('/termos');
  }

  static async rescindir(req, res) {
    const termo = await Termo.findOne({
      _id: req.params.id,
      status: 'APROVADO',
      situacaoEstagio: 'EM_ANDAMENTO'
    }).populate('estudante candidatura');
    if (!termo) return voltarComErro(req, res, 'O estágio não está em andamento.', '/termos');
    if (!String(req.body.justificativa || '').trim())
      return voltarComErro(req, res, 'Informe o motivo da rescisão.', '/termos');
    if (
      documentosEncerramento(termo, true).some(
        (tipo) =>
          !termo.documentos.some(
            (documento) => documento.tipo === tipo && statusDocumento(documento) === 'APROVADO'
          )
      )
    )
      return voltarComErro(
        req,
        res,
        'Aprove o termo de rescisão e o relatório de encerramento antes de registrar a rescisão.',
        '/termos'
      );
    termo.situacaoEstagio = 'RESCINDIDO';
    termo.justificativa = req.body.justificativa.trim();
    termo.dataEncerramento = new Date();
    registrarHistoricoStatus(
      termo,
      'ESTAGIO_RESCINDIDO',
      req.session.usuario.id,
      termo.justificativa
    );
    await termo.save();
    const historico = termo.estudante.historicoEstagios.find(
      (item) => String(item.vaga) === String(termo.candidatura.vaga)
    );
    if (historico) {
      historico.dataFim = termo.dataEncerramento;
      await termo.estudante.save();
    }
    mensagem(req, 'sucesso', 'Rescisão do estágio registrada.');
    return res.redirect('/termos');
  }
}
