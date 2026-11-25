import { resolve } from 'node:path';

import {
  arquivoSeguroExiste,
  metadadosUpload,
  removerArquivoSeguro,
  servirArquivo
} from '../utils/arquivos.js';
import Convenio from '../models/Convenio.js';
import Empresa from '../models/Empresa.js';
import Termo from '../models/TermoCompromisso.js';
import { empresaLogada } from '../utils/perfis.js';
import { registrarHistoricoStatus } from '../utils/processoEstagio.js';
import { assinaturasConvenioCompletas } from '../utils/assinaturas.js';
import {
  STATUS_CONVENIO,
  alteracaoExigeNovaValidacao,
  convenioPodeAguardarAssinatura,
  convenioPodeSerAtivado,
  filtroGrupoConvenios,
  filtroTermosVinculados,
  motivoBloqueioExclusaoConvenio,
  registrarRevisaoConvenio,
  rotuloStatusConvenio,
  transicaoConvenioPermitida
} from '../services/convenios.js';
import { criarNotificacao, notificarAdministradores } from '../services/notificacoes.js';
import { mensagem, voltarComErro } from '../utils/mensagens.js';
import { inicioDoDiaInstitucional } from '../utils/datas.js';

const GRUPOS = ['andamento', 'ativos', 'inativos', 'todos'];

function arquivoDoCampo(req, campo) {
  return req.files?.[campo]?.[0] || (req.file?.fieldname === campo ? req.file : null);
}

function arquivosRecebidos(req) {
  return {
    documentoParaAssinatura: arquivoDoCampo(req, 'documentoParaAssinatura'),
    pdfAssinado: arquivoDoCampo(req, 'pdfAssinado')
  };
}

async function removerUploads(arquivos) {
  for (const arquivo of Object.values(arquivos || {})) {
    if (arquivo?.path) await removerArquivoSeguro(arquivo.path, 'documentos');
  }
}

function documentoPreparado(arquivo, usuarioId) {
  if (!arquivo) return undefined;
  return { ...metadadosUpload(arquivo), enviadoPor: usuarioId };
}

function documentoAssinado(arquivo, usuarioId, body = {}) {
  if (!arquivo) return undefined;
  const agora = new Date();
  return {
    ...metadadosUpload(arquivo),
    dataRecebimento: agora,
    enviadoPor: usuarioId,
    nomeSignatario: String(body.signatarioEmpresaNome || '').trim(),
    funcaoSignatario: String(body.signatarioEmpresaFuncao || '').trim(),
    dataAssinatura: body.signatarioEmpresaData || undefined,
    observacoes: String(body.observacoesDocumentoAssinado || '').trim()
  };
}

function assinaturasDoFormulario(body) {
  const assinaturas = [];
  if (String(body.signatarioEmpresaNome || '').trim()) {
    assinaturas.push({
      nome: String(body.signatarioEmpresaNome).trim(),
      funcao: String(body.signatarioEmpresaFuncao || '').trim(),
      entidade: String(body.signatarioEmpresaEntidade || '').trim(),
      papel: 'EMPRESA',
      dataAssinatura: body.signatarioEmpresaData || undefined
    });
  }
  if (String(body.signatarioInstituicaoNome || '').trim()) {
    assinaturas.push({
      nome: String(body.signatarioInstituicaoNome).trim(),
      funcao: String(body.signatarioInstituicaoFuncao || '').trim(),
      entidade: String(
        body.signatarioInstituicaoEntidade || process.env.INSTITUICAO_NOME || ''
      ).trim(),
      papel: 'INSTITUICAO',
      dataAssinatura: body.signatarioInstituicaoData || undefined
    });
  }
  return assinaturas;
}

function assinaturaEmpresaValida(convenio) {
  return (convenio.assinaturas || []).some(
    (assinatura) =>
      assinatura.papel === 'EMPRESA' &&
      assinatura.nome &&
      assinatura.funcao &&
      assinatura.dataAssinatura
  );
}

function datasValidas(inicio, fim) {
  if (!inicio || !fim) return false;
  const dataInicial = new Date(inicio);
  const dataFinal = new Date(fim);
  return (
    !Number.isNaN(dataInicial.valueOf()) &&
    !Number.isNaN(dataFinal.valueOf()) &&
    dataFinal > dataInicial
  );
}

async function errosBasicos(body, status, idIgnorado = null) {
  const erros = {};
  if (
    !body.empresa ||
    !/^[a-f0-9]{24}$/i.test(body.empresa) ||
    !(await Empresa.exists({ _id: body.empresa }))
  )
    erros.empresa = 'Selecione uma empresa cadastrada.';
  if (body.numero && !/^[\p{L}\p{N}./_-]{1,100}$/u.test(String(body.numero).trim()))
    erros.numero = 'Use até 100 letras, números, ponto, barra, hífen ou sublinhado.';
  for (const campo of [
    'dataInicial',
    'dataFinal',
    'signatarioEmpresaData',
    'signatarioInstituicaoData'
  ]) {
    if (body[campo] && !/^\d{4}-\d{2}-\d{2}$/.test(body[campo]))
      erros[campo] = 'Informe uma data válida.';
    if (
      body[campo] &&
      (Number.isNaN(new Date(body[campo]).getTime()) ||
        new Date(body[campo]).toISOString().slice(0, 10) !== body[campo])
    )
      erros[campo] = 'Informe uma data válida.';
  }
  if (status !== 'RASCUNHO' && !String(body.numero || '').trim())
    erros.numero = 'Informe o número do convênio.';
  if (status !== 'RASCUNHO' && !body.dataInicial) erros.dataInicial = 'Informe a data inicial.';
  if (status !== 'RASCUNHO' && !body.dataFinal) erros.dataFinal = 'Informe a data final.';
  if (body.dataInicial && body.dataFinal && !datasValidas(body.dataInicial, body.dataFinal)) {
    erros.dataFinal = 'A data final deve ser posterior à data inicial.';
  }
  if (body.numero) {
    const filtro = { numero: String(body.numero).trim() };
    if (idIgnorado) filtro._id = { $ne: idIgnorado };
    if (await Convenio.exists(filtro)) erros.numero = 'O número do convênio já está cadastrado.';
  }
  return erros;
}

function grupoSelecionado(valor) {
  return GRUPOS.includes(valor) ? valor : 'andamento';
}

async function contagensConvenios(filtroBase = {}) {
  const agora = new Date();
  const combinar = (filtro) => ({ ...filtroBase, ...filtro });
  const [andamento, ativos, inativos, todos] = await Promise.all([
    Convenio.countDocuments(combinar(filtroGrupoConvenios('andamento', agora))),
    Convenio.countDocuments(combinar(filtroGrupoConvenios('ativos', agora))),
    Convenio.countDocuments(combinar(filtroGrupoConvenios('inativos', agora))),
    Convenio.countDocuments(filtroBase)
  ]);
  return { andamento, ativos, inativos, todos };
}

async function renderizarListaAdmin(req, res, { erros = {}, valores = {}, status = 200 } = {}) {
  const grupo = grupoSelecionado(req.query.grupo);
  const [convenios, empresas, contagens] = await Promise.all([
    Convenio.find(filtroGrupoConvenios(grupo))
      .populate('empresa aprovadoPor ultimaAlteracaoPor')
      .sort('-createdAt'),
    Empresa.find().sort('nomeFantasia'),
    contagensConvenios()
  ]);
  return res.status(status).render('admin/convenios', {
    convenios,
    empresas,
    grupo,
    contagens,
    rotuloStatusConvenio,
    erros,
    valores
  });
}

async function carregarConvenioAdmin(id) {
  return Convenio.findById(id)
    .populate(
      'empresa aprovadoPor enviadoParaAssinaturaPor documentoAssinadoEnviadoPor ultimaAlteracaoPor'
    )
    .populate(
      'documentoParaAssinatura.enviadoPor pdfAssinado.enviadoPor historicoStatus.alteradoPor'
    );
}

async function notificarEmpresa(convenio, { titulo, texto, tipoEvento, chave }) {
  const empresa = await Empresa.findById(convenio.empresa?._id || convenio.empresa).select(
    'usuario'
  );
  if (!empresa?.usuario) return;
  await criarNotificacao({
    destinatario: empresa.usuario,
    titulo,
    mensagem: texto,
    link: `/empresa/convenios/${convenio._id}`,
    tipoEvento,
    referencia: convenio._id,
    chaveUnica: chave
  });
}

async function avisarEnvioParaAssinatura(convenio) {
  return notificarEmpresa(convenio, {
    titulo: 'Convênio aguardando sua assinatura',
    texto: `O documento do convênio ${convenio.numero || ''} está disponível para download e assinatura.`,
    tipoEvento: 'CONVENIO_ENVIADO_ASSINATURA',
    chave: `CONVENIO_ENVIADO_ASSINATURA:${convenio._id}:${convenio.historicoStatus.length}`
  });
}

async function notificarSemInterromper(acao) {
  try {
    await acao();
  } catch (erro) {
    console.error(`Falha ao criar aviso de convênio: ${erro.message}`);
  }
}

function statusDaAcao(acao) {
  if (acao === 'aguardar_assinaturas') return 'AGUARDANDO_ASSINATURAS';
  if (acao === 'enviar') return 'PENDENTE';
  return 'RASCUNHO';
}

function validarEtapa(convenio, status) {
  if (status === 'AGUARDANDO_ASSINATURAS') return convenioPodeAguardarAssinatura(convenio);
  if (status === 'PENDENTE') {
    if (!convenio.pdfAssinado?.caminho) return 'Anexe o documento assinado devolvido pela empresa.';
    if (!assinaturaEmpresaValida(convenio))
      return 'Registre o nome, a função e a data de assinatura do signatário da empresa.';
  }
  if (status === 'ATIVO') return convenioPodeSerAtivado(convenio);
  return '';
}

async function convenioDaEmpresa(req, id) {
  const empresa = await empresaLogada(req);
  if (!empresa) return { empresa: null, convenio: null };
  const convenio = await Convenio.findOne({ _id: id, empresa: empresa._id })
    .populate(
      'empresa aprovadoPor enviadoParaAssinaturaPor documentoAssinadoEnviadoPor ultimaAlteracaoPor'
    )
    .populate(
      'documentoParaAssinatura.enviadoPor pdfAssinado.enviadoPor historicoStatus.alteradoPor'
    );
  return { empresa, convenio };
}

async function renderizarDetalhesEmpresa(
  req,
  res,
  convenio,
  { erros = {}, valores = {}, status = 200 } = {}
) {
  return res.status(status).render('empresa/convenio-detalhes', {
    convenio,
    rotuloStatusConvenio,
    erros,
    valores
  });
}

async function downloadPermitido(req, id, campo, revisaoId = null) {
  const convenio = await Convenio.findById(id).populate('empresa');
  if (!convenio) return { status: 404 };
  let permitido = req.session.usuario.tipo === 'ADMIN';
  if (req.session.usuario.tipo === 'EMPRESA') {
    const empresa = await empresaLogada(req);
    permitido = String(empresa?._id) === String(convenio.empresa?._id);
  }
  if (!permitido) return { status: 403 };
  const revisao = revisaoId ? convenio.revisoes.id(revisaoId) : null;
  if (
    revisao &&
    req.session.usuario.tipo !== 'ADMIN' &&
    String(revisao.dados?.empresa?._id || revisao.dados?.empresa) !== String(convenio.empresa?._id)
  )
    return { status: 403 };
  const arquivo = revisaoId ? revisao?.dados?.[campo] : convenio[campo];
  if (!arquivo?.caminho || !(await arquivoSeguroExiste(arquivo.caminho, 'documentos')))
    return { status: 404 };
  return { status: 200, arquivo };
}

export default class ConvenioController {
  static async listar(req, res) {
    return renderizarListaAdmin(req, res);
  }

  static async salvar(req, res) {
    const arquivos = arquivosRecebidos(req);
    const status = statusDaAcao(req.body.acao);
    try {
      const erros = await errosBasicos(req.body, status);
      const convenio = new Convenio({
        empresa: req.body.empresa,
        numero: String(req.body.numero || '').trim() || undefined,
        dataInicial: req.body.dataInicial || undefined,
        dataFinal: req.body.dataFinal || undefined,
        status,
        justificativa: String(req.body.justificativa || '').trim(),
        documentoParaAssinatura: documentoPreparado(
          arquivos.documentoParaAssinatura,
          req.session.usuario.id
        ),
        pdfAssinado: documentoAssinado(arquivos.pdfAssinado, req.session.usuario.id, req.body),
        assinaturas: assinaturasDoFormulario(req.body),
        dataEnvioAssinatura: status === 'AGUARDANDO_ASSINATURAS' ? new Date() : undefined,
        enviadoParaAssinaturaPor:
          status === 'AGUARDANDO_ASSINATURAS' ? req.session.usuario.id : undefined,
        dataRecebimentoDocumentoAssinado: arquivos.pdfAssinado ? new Date() : undefined,
        documentoAssinadoEnviadoPor: arquivos.pdfAssinado ? req.session.usuario.id : undefined,
        dataEnvioAnalise: status === 'PENDENTE' ? new Date() : undefined,
        ultimaAlteracaoPor: req.session.usuario.id,
        historicoStatus: [
          {
            status,
            data: new Date(),
            alteradoPor: req.session.usuario.id,
            observacao:
              status === 'RASCUNHO' ? 'Rascunho do convênio criado.' : 'Convênio registrado.'
          }
        ]
      });
      const erroEtapa = validarEtapa(convenio, status);
      if (erroEtapa) {
        const campo = /preparado/i.test(erroEtapa)
          ? 'documentoParaAssinatura'
          : /documento assinado/i.test(erroEtapa)
            ? 'pdfAssinado'
            : /signatário/i.test(erroEtapa)
              ? 'assinaturas'
              : 'geral';
        erros[campo] = erroEtapa;
      }
      if (Object.keys(erros).length) {
        await removerUploads(arquivos);
        return renderizarListaAdmin(req, res, { erros, valores: req.body, status: 422 });
      }
      await convenio.save();
      if (status === 'AGUARDANDO_ASSINATURAS') {
        await notificarSemInterromper(() => avisarEnvioParaAssinatura(convenio));
      }
      mensagem(
        req,
        'sucesso',
        status === 'RASCUNHO' ? 'Rascunho do convênio salvo.' : 'Convênio registrado.'
      );
      return res.redirect(`/admin/convenios/${convenio._id}`);
    } catch (erro) {
      await removerUploads(arquivos);
      const texto =
        erro.code === 11000
          ? 'O número do convênio já está cadastrado.'
          : 'Não foi possível registrar o convênio.';
      return renderizarListaAdmin(req, res, {
        erros: { [erro.code === 11000 ? 'numero' : 'geral']: texto },
        valores: req.body,
        status: erro.code === 11000 ? 422 : 500
      });
    }
  }

  static async detalhesAdmin(req, res) {
    const convenio = await carregarConvenioAdmin(req.params.id);
    if (!convenio) return res.status(404).render('erro/404');
    return res.render('admin/convenio-detalhes', { convenio, rotuloStatusConvenio });
  }

  static async atualizarDocumento(req, res) {
    const convenio = await Convenio.findById(req.params.id);
    if (!convenio || !req.file) {
      if (req.file) await removerArquivoSeguro(req.file.path, 'documentos');
      return voltarComErro(
        req,
        res,
        'Selecione um PDF válido.',
        `/admin/convenios/${req.params.id}`
      );
    }
    const anterior = convenio.pdfAssinado?.caminho;
    try {
      registrarRevisaoConvenio(
        convenio,
        req.session.usuario.id,
        'Substituição administrativa do PDF assinado.'
      );
      if (convenio.status === 'ATIVO') {
        convenio.status = 'PENDENTE';
        convenio.dataAprovacao = undefined;
        convenio.aprovadoPor = undefined;
      }
      convenio.pdfAssinado = documentoAssinado(req.file, req.session.usuario.id, req.body);
      const assinaturas = assinaturasDoFormulario(req.body);
      if (assinaturas.length) convenio.assinaturas = assinaturas;
      convenio.dataRecebimentoDocumentoAssinado = new Date();
      convenio.documentoAssinadoEnviadoPor = req.session.usuario.id;
      convenio.regularizacaoPendente = !assinaturasConvenioCompletas(convenio);
      convenio.ultimaAlteracaoPor = req.session.usuario.id;
      registrarHistoricoStatus(
        convenio,
        convenio.status,
        req.session.usuario.id,
        'Documento assinado atualizado pelo administrador.'
      );
      await convenio.save();

      mensagem(req, 'sucesso', 'Documento assinado e signatários atualizados.');
      return res.redirect(`/admin/convenios/${convenio._id}`);
    } catch (erro) {
      await removerArquivoSeguro(req.file.path, 'documentos');
      return voltarComErro(
        req,
        res,
        'Não foi possível atualizar o documento assinado.',
        `/admin/convenios/${convenio._id}`
      );
    }
  }

  static async editarForm(req, res) {
    const [convenio, empresas] = await Promise.all([
      carregarConvenioAdmin(req.params.id),
      Empresa.find().sort('nomeFantasia')
    ]);
    if (!convenio) return res.status(404).render('erro/404');
    if (convenio.arquivado) return res.redirect(`/admin/convenios/${convenio._id}`);
    return res.render('admin/convenio-editar', {
      convenio,
      empresas,
      rotuloStatusConvenio,
      erros: {},
      valores: {}
    });
  }

  static async editar(req, res) {
    const arquivos = arquivosRecebidos(req);
    const convenio = await Convenio.findById(req.params.id);
    if (!convenio) {
      await removerUploads(arquivos);
      return res.status(404).render('erro/404');
    }
    const documentosAnteriores = {
      documentoParaAssinatura: convenio.documentoParaAssinatura?.caminho,
      pdfAssinado: convenio.pdfAssinado?.caminho
    };
    const estadoAnterior = {
      status: convenio.status,
      documentoParaAssinatura: convenio.documentoParaAssinatura,
      pdfAssinado: convenio.pdfAssinado
    };
    const empresas = await Empresa.find().sort('nomeFantasia');
    let alteracoesPersistidas = false;
    const renderizarErro = async (erros, status = 422, limparUploads = true) => {
      if (limparUploads) await removerUploads(arquivos);
      return res.status(status).render('admin/convenio-editar', {
        convenio,
        empresas,
        rotuloStatusConvenio,
        erros,
        valores: req.body
      });
    };
    try {
      const statusInformado = String(req.body.status || convenio.status);
      let statusDesejado = STATUS_CONVENIO.includes(statusInformado)
        ? statusInformado
        : convenio.status;
      const assinaturas = assinaturasDoFormulario(req.body);
      const dados = {
        empresa: req.body.empresa,
        numero: String(req.body.numero || '').trim() || undefined,
        dataInicial: req.body.dataInicial || undefined,
        dataFinal: req.body.dataFinal || undefined,
        assinaturas: assinaturas
      };
      const erros = await errosBasicos(req.body, statusDesejado, convenio._id);
      const novaValidacao = alteracaoExigeNovaValidacao(convenio, dados, arquivos);
      const mudouEmpresa = String(convenio.empresa) !== String(dados.empresa);
      const mudouContrato =
        mudouEmpresa ||
        convenio.numero !== dados.numero ||
        String(convenio.dataInicial?.toISOString().slice(0, 10) || '') !==
          String(dados.dataInicial || '') ||
        String(convenio.dataFinal?.toISOString().slice(0, 10) || '') !==
          String(dados.dataFinal || '') ||
        Boolean(arquivos.documentoParaAssinatura);
      if (
        mudouEmpresa &&
        (convenio.pdfAssinado?.caminho ||
          convenio.revisoes?.some((r) => r.dados?.pdfAssinado?.caminho) ||
          (await Termo.exists(filtroTermosVinculados(convenio))))
      )
        erros.empresa =
          'Um convênio com documento assinado ou processo vinculado não pode mudar de empresa. Crie um novo convênio.';
      if (
        mudouEmpresa &&
        convenio.documentoParaAssinatura?.caminho &&
        !arquivos.documentoParaAssinatura
      )
        erros.documentoParaAssinatura = 'Envie o documento preparado com os dados da nova empresa.';
      if (mudouContrato && convenio.pdfAssinado?.caminho && !arquivos.documentoParaAssinatura)
        erros.documentoParaAssinatura =
          'Envie o documento atualizado para uma nova rodada de assinaturas.';
      if (mudouContrato && arquivos.pdfAssinado)
        erros.pdfAssinado =
          'Salve primeiro os dados e o documento preparado; envie o novo PDF assinado na próxima etapa.';
      if (!STATUS_CONVENIO.includes(statusInformado))
        erros.status = 'Selecione uma situação válida.';
      if (!novaValidacao && !transicaoConvenioPermitida(convenio.status, statusDesejado)) {
        erros.status = 'Essa mudança de situação não é permitida nesta etapa.';
      }
      if (novaValidacao || (mudouContrato && convenio.pdfAssinado?.caminho))
        statusDesejado = 'AGUARDANDO_ASSINATURAS';

      const documentoPreparadoAtual = arquivos.documentoParaAssinatura
        ? documentoPreparado(arquivos.documentoParaAssinatura, req.session.usuario.id)
        : convenio.documentoParaAssinatura;
      const documentoAssinadoAtual = mudouContrato
        ? undefined
        : arquivos.pdfAssinado
          ? documentoAssinado(arquivos.pdfAssinado, req.session.usuario.id, req.body)
          : convenio.pdfAssinado;
      const provisoria = {
        ...dados,
        assinaturas: mudouContrato ? [] : dados.assinaturas,
        status: statusDesejado,
        documentoParaAssinatura: documentoPreparadoAtual,
        pdfAssinado: documentoAssinadoAtual
      };
      const erroEtapa = validarEtapa(provisoria, statusDesejado);
      if (erroEtapa) {
        const campo = /preparado/i.test(erroEtapa)
          ? 'documentoParaAssinatura'
          : /documento assinado|PDF/i.test(erroEtapa)
            ? 'pdfAssinado'
            : /assinatura|signatário/i.test(erroEtapa)
              ? 'assinaturas'
              : 'geral';
        erros[campo] = erroEtapa;
      }
      if (Object.keys(erros).length) return renderizarErro(erros);

      const statusAnterior = convenio.status;
      registrarRevisaoConvenio(
        convenio,
        req.session.usuario.id,
        String(req.body.observacaoHistorico || 'Edição administrativa.')
      );
      convenio.empresa = dados.empresa;
      convenio.numero = dados.numero;
      convenio.dataInicial = dados.dataInicial;
      convenio.dataFinal = dados.dataFinal;
      convenio.assinaturas = mudouContrato ? [] : assinaturas;
      convenio.justificativa = String(req.body.justificativa || '').trim();
      convenio.documentoParaAssinatura = documentoPreparadoAtual;
      convenio.pdfAssinado = documentoAssinadoAtual;
      convenio.status = statusDesejado;
      convenio.ultimaAlteracaoPor = req.session.usuario.id;
      if (statusDesejado === 'AGUARDANDO_ASSINATURAS') {
        convenio.dataEnvioAssinatura = new Date();
        convenio.enviadoParaAssinaturaPor = req.session.usuario.id;
      }
      if (arquivos.pdfAssinado) {
        convenio.dataRecebimentoDocumentoAssinado = new Date();
        convenio.documentoAssinadoEnviadoPor = req.session.usuario.id;
      }
      if (statusDesejado === 'PENDENTE') convenio.dataEnvioAnalise = new Date();
      if (statusDesejado === 'ATIVO') {
        convenio.dataAprovacao = new Date();
        convenio.aprovadoPor = req.session.usuario.id;
        convenio.regularizacaoPendente = false;
      } else if (
        novaValidacao ||
        ['REPROVADO', 'AGUARDANDO_ASSINATURAS'].includes(statusDesejado)
      ) {
        convenio.dataAprovacao = undefined;
        convenio.aprovadoPor = undefined;
        convenio.regularizacaoPendente =
          !assinaturasConvenioCompletas(provisoria) || !provisoria.pdfAssinado?.caminho;
      }
      const observacao = novaValidacao
        ? 'Dados relevantes de convênio ativo foram alterados; nova validação obrigatória.'
        : String(req.body.observacaoHistorico || '').trim() ||
          'Dados do convênio editados pelo administrador.';
      registrarHistoricoStatus(convenio, statusDesejado, req.session.usuario.id, observacao);
      await convenio.save();
      alteracoesPersistidas = true;

      if (
        statusDesejado === 'AGUARDANDO_ASSINATURAS' &&
        (statusAnterior !== statusDesejado || arquivos.documentoParaAssinatura)
      ) {
        await notificarSemInterromper(() => avisarEnvioParaAssinatura(convenio));
      }
      if (
        ['ATIVO', 'REPROVADO', 'INATIVO'].includes(statusDesejado) &&
        statusAnterior !== statusDesejado
      ) {
        await notificarSemInterromper(() =>
          notificarEmpresa(convenio, {
            titulo: `Convênio ${rotuloStatusConvenio(statusDesejado).toLowerCase()}`,
            texto: `O convênio ${convenio.numero || ''} foi atualizado para ${rotuloStatusConvenio(statusDesejado).toLowerCase()}.`,
            tipoEvento: `CONVENIO_${statusDesejado}`,
            chave: `CONVENIO_${statusDesejado}:${convenio._id}:${convenio.historicoStatus.length}`
          })
        );
      }
      if (statusDesejado === 'ATIVO')
        await Empresa.findByIdAndUpdate(convenio.empresa, { statusCadastro: 'APROVADO' });
      mensagem(
        req,
        'sucesso',
        novaValidacao
          ? 'Convênio atualizado. A aprovação anterior foi retirada; confira a nova etapa de análise ou assinatura.'
          : 'Convênio atualizado.'
      );
      return res.redirect(`/admin/convenios/${convenio._id}`);
    } catch (erro) {
      if (!alteracoesPersistidas) {
        convenio.status = estadoAnterior.status;
        convenio.documentoParaAssinatura = estadoAnterior.documentoParaAssinatura;
        convenio.pdfAssinado = estadoAnterior.pdfAssinado;
      }
      return renderizarErro(
        {
          geral:
            erro.code === 11000
              ? 'O número do convênio já está cadastrado.'
              : 'Não foi possível atualizar o convênio.'
        },
        erro.code === 11000 ? 422 : 500,
        !alteracoesPersistidas
      );
    }
  }

  static async enviarAssinatura(req, res) {
    const convenio = await Convenio.findById(req.params.id);
    if (!convenio) return res.status(404).render('erro/404');
    const erro = convenioPodeAguardarAssinatura(convenio);
    if (erro) return voltarComErro(req, res, erro, `/admin/convenios/${convenio._id}`);
    if (['ATIVO', 'INATIVO', 'VENCIDO'].includes(convenio.status)) {
      return voltarComErro(
        req,
        res,
        'Este convênio não pode ser enviado para assinatura no estado atual.',
        `/admin/convenios/${convenio._id}`
      );
    }
    convenio.status = 'AGUARDANDO_ASSINATURAS';
    convenio.dataEnvioAssinatura = new Date();
    convenio.enviadoParaAssinaturaPor = req.session.usuario.id;
    convenio.ultimaAlteracaoPor = req.session.usuario.id;
    convenio.justificativa = '';
    registrarHistoricoStatus(
      convenio,
      convenio.status,
      req.session.usuario.id,
      'Documento enviado à empresa para assinatura.'
    );
    await convenio.save();
    await notificarSemInterromper(() => avisarEnvioParaAssinatura(convenio));
    mensagem(req, 'sucesso', 'Documento enviado para assinatura. A empresa foi notificada.');
    return res.redirect(`/admin/convenios/${convenio._id}`);
  }

  static async enviarAnalise(req, res) {
    const convenio = await Convenio.findOne({
      _id: req.params.id,
      status: { $in: ['RASCUNHO', 'AGUARDANDO_ASSINATURAS', 'REPROVADO', 'PENDENTE'] }
    });
    if (!convenio)
      return voltarComErro(
        req,
        res,
        'O convênio não pode ser enviado nesta etapa.',
        '/admin/convenios'
      );
    const erro = validarEtapa(convenio, 'PENDENTE');
    if (erro) return voltarComErro(req, res, erro, `/admin/convenios/${convenio._id}`);
    convenio.status = 'PENDENTE';
    convenio.dataEnvioAnalise = new Date();
    convenio.justificativa = '';
    convenio.ultimaAlteracaoPor = req.session.usuario.id;
    convenio.regularizacaoPendente = !assinaturasConvenioCompletas(convenio);
    registrarHistoricoStatus(
      convenio,
      'PENDENTE',
      req.session.usuario.id,
      'Enviado para análise administrativa.'
    );
    await convenio.save();
    mensagem(req, 'sucesso', 'Convênio enviado para análise.');
    return res.redirect(`/admin/convenios/${convenio._id}`);
  }

  static async status(req, res) {
    const convenio = await Convenio.findById(req.params.id);
    if (!convenio) return res.status(404).render('erro/404');
    const novoStatus = String(req.body.status || '');
    if (
      novoStatus === convenio.status ||
      !transicaoConvenioPermitida(convenio.status, novoStatus)
    ) {
      return voltarComErro(
        req,
        res,
        'Essa mudança de status não é permitida.',
        `/admin/convenios/${convenio._id}`
      );
    }
    if (novoStatus === 'ATIVO') {
      const erro = convenioPodeSerAtivado(convenio);
      if (erro) return voltarComErro(req, res, erro, `/admin/convenios/${convenio._id}`);
      if (new Date(convenio.dataFinal) < inicioDoDiaInstitucional())
        return voltarComErro(
          req,
          res,
          'Não é possível ativar um convênio vencido.',
          `/admin/convenios/${convenio._id}`
        );
      convenio.dataAprovacao = new Date();
      convenio.aprovadoPor = req.session.usuario.id;
      convenio.regularizacaoPendente = false;
    }
    if (novoStatus === 'REPROVADO' && !String(req.body.justificativa || '').trim()) {
      return voltarComErro(
        req,
        res,
        'Informe a justificativa da reprovação.',
        `/admin/convenios/${convenio._id}`
      );
    }
    convenio.status = novoStatus;
    convenio.justificativa = novoStatus === 'REPROVADO' ? req.body.justificativa.trim() : '';
    convenio.ultimaAlteracaoPor = req.session.usuario.id;
    registrarHistoricoStatus(convenio, novoStatus, req.session.usuario.id, convenio.justificativa);
    await convenio.save();
    if (novoStatus === 'ATIVO')
      await Empresa.findByIdAndUpdate(convenio.empresa, { statusCadastro: 'APROVADO' });
    await notificarSemInterromper(() =>
      notificarEmpresa(convenio, {
        titulo: `Convênio ${rotuloStatusConvenio(novoStatus).toLowerCase()}`,
        texto: `O convênio ${convenio.numero || ''} passou para ${rotuloStatusConvenio(novoStatus).toLowerCase()}.`,
        tipoEvento: `CONVENIO_${novoStatus}`,
        chave: `CONVENIO_${novoStatus}:${convenio._id}:${convenio.historicoStatus.length}`
      })
    );
    mensagem(req, 'sucesso', 'Situação do convênio atualizada.');
    return res.redirect(`/admin/convenios/${convenio._id}`);
  }

  static async excluir(req, res) {
    const convenio = await Convenio.findById(req.params.id);
    if (!convenio) return res.status(404).render('erro/404');
    const quantidadeTermos = await Termo.countDocuments(filtroTermosVinculados(convenio));
    const bloqueio = motivoBloqueioExclusaoConvenio(convenio, quantidadeTermos);
    if (bloqueio) {
      if (convenio.arquivado)
        return voltarComErro(
          req,
          res,
          'O convênio já está arquivado.',
          '/admin/convenios?grupo=inativos'
        );
      registrarRevisaoConvenio(
        convenio,
        req.session.usuario.id,
        'Arquivamento para preservação do histórico.'
      );
      convenio.arquivado = true;
      convenio.status = 'ARQUIVADO';
      convenio.dataArquivamento = new Date();
      convenio.arquivadoPor = req.session.usuario.id;
      registrarHistoricoStatus(convenio, 'ARQUIVADO', req.session.usuario.id, bloqueio);
      await convenio.save();
      await notificarSemInterromper(() =>
        notificarEmpresa(convenio, {
          titulo: 'Convênio arquivado',
          texto:
            'O convênio foi retirado de uso. Os processos anteriores e documentos permanecem no histórico.',
          tipoEvento: 'CONVENIO_ARQUIVADO',
          chave: 'CONVENIO_ARQUIVADO:' + convenio._id
        })
      );
      mensagem(
        req,
        'sucesso',
        'Convênio arquivado. Ele não habilita novas operações; documentos e processos anteriores foram preservados.'
      );
      return res.redirect('/admin/convenios?grupo=inativos');
    }
    const caminhos = [
      ...new Set(
        [
          convenio.documentoParaAssinatura?.caminho,
          convenio.pdfAssinado?.caminho,
          ...(convenio.revisoes || []).flatMap((revisao) => [
            revisao.dados?.documentoParaAssinatura?.caminho,
            revisao.dados?.pdfAssinado?.caminho
          ])
        ].filter(Boolean)
      )
    ];
    const resultado = await Convenio.deleteOne({
      _id: convenio._id,
      status: convenio.status,
      __v: convenio.__v
    });
    if (!resultado.deletedCount)
      return voltarComErro(
        req,
        res,
        'O convênio foi alterado por outro usuário. Atualize a página e tente novamente.',
        '/admin/convenios'
      );
    for (const caminho of caminhos) await removerArquivoSeguro(caminho, 'documentos');
    mensagem(req, 'sucesso', 'Convênio excluído e arquivos associados removidos com segurança.');
    return res.redirect('/admin/convenios');
  }

  static async listarEmpresa(req, res) {
    const empresa = await empresaLogada(req);
    if (!empresa) return res.status(404).render('erro/404');
    const grupo = grupoSelecionado(req.query.grupo);
    const base = { empresa: empresa._id };
    const [convenios, contagens] = await Promise.all([
      Convenio.find({ ...base, ...filtroGrupoConvenios(grupo) }).sort('-createdAt'),
      contagensConvenios(base)
    ]);
    return res.render('empresa/convenios', {
      empresa,
      convenios,
      grupo,
      contagens,
      rotuloStatusConvenio
    });
  }

  static async detalhesEmpresa(req, res) {
    const { convenio } = await convenioDaEmpresa(req, req.params.id);
    if (!convenio) return res.status(404).render('erro/404');
    return renderizarDetalhesEmpresa(req, res, convenio);
  }

  static async enviarDocumentoAssinado(req, res) {
    const arquivo = req.file;
    const { empresa, convenio } = await convenioDaEmpresa(req, req.params.id);
    if (!convenio) {
      if (arquivo) await removerArquivoSeguro(arquivo.path, 'documentos');
      return res.status(404).render('erro/404');
    }
    const erros = {};
    if (!arquivo) erros.pdfAssinado = 'Selecione o PDF assinado.';
    if (!String(req.body.signatarioEmpresaNome || '').trim())
      erros.signatarioEmpresaNome = 'Informe o nome do signatário.';
    if (!String(req.body.signatarioEmpresaFuncao || '').trim())
      erros.signatarioEmpresaFuncao = 'Informe a função do signatário.';
    if (!req.body.signatarioEmpresaData)
      erros.signatarioEmpresaData = 'Informe a data da assinatura.';
    if (req.body.signatarioEmpresaData && new Date(req.body.signatarioEmpresaData) > new Date()) {
      erros.signatarioEmpresaData = 'A data da assinatura não pode estar no futuro.';
    }
    if (!['AGUARDANDO_ASSINATURAS', 'PENDENTE', 'REPROVADO'].includes(convenio.status)) {
      erros.geral = 'O documento não pode ser enviado no estado atual do convênio.';
    }
    if (!convenio.documentoParaAssinatura?.caminho) {
      erros.geral =
        'O administrador ainda não disponibilizou o documento preparado para assinatura.';
    }
    if (Object.keys(erros).length) {
      if (arquivo) await removerArquivoSeguro(arquivo.path, 'documentos');
      return renderizarDetalhesEmpresa(req, res, convenio, {
        erros,
        valores: req.body,
        status: 422
      });
    }

    const anterior = convenio.pdfAssinado?.caminho;
    const substituido = Boolean(anterior);
    const estadoAnterior = {
      status: convenio.status,
      pdfAssinado: convenio.pdfAssinado,
      assinaturas: convenio.assinaturas,
      justificativa: convenio.justificativa
    };
    let documentoPersistido = false;
    try {
      registrarRevisaoConvenio(
        convenio,
        req.session.usuario.id,
        'Devolução do documento assinado.'
      );
      convenio.pdfAssinado = documentoAssinado(arquivo, req.session.usuario.id, req.body);
      convenio.dataRecebimentoDocumentoAssinado = new Date();
      convenio.documentoAssinadoEnviadoPor = req.session.usuario.id;
      convenio.dataEnvioAnalise = new Date();
      convenio.assinaturas = [
        ...(convenio.assinaturas || []).filter((assinatura) => assinatura.papel !== 'EMPRESA'),
        {
          papel: 'EMPRESA',
          nome: String(req.body.signatarioEmpresaNome).trim(),
          funcao: String(req.body.signatarioEmpresaFuncao).trim(),
          entidade: empresa.razaoSocial,
          dataAssinatura: req.body.signatarioEmpresaData
        }
      ];
      convenio.status = 'PENDENTE';
      convenio.justificativa = '';
      convenio.regularizacaoPendente = !assinaturasConvenioCompletas(convenio);
      convenio.ultimaAlteracaoPor = req.session.usuario.id;
      const evento = substituido
        ? 'CONVENIO_DOCUMENTO_ASSINADO_SUBSTITUIDO'
        : 'CONVENIO_DOCUMENTO_ASSINADO_ENVIADO';
      registrarHistoricoStatus(
        convenio,
        'PENDENTE',
        req.session.usuario.id,
        substituido
          ? 'Documento assinado substituído pela empresa.'
          : 'Documento assinado enviado pela empresa.'
      );
      await convenio.save();
      documentoPersistido = true;

      await notificarSemInterromper(() =>
        notificarAdministradores({
          titulo: substituido
            ? 'Documento de convênio substituído'
            : 'Documento de convênio devolvido',
          mensagem: `A empresa ${empresa.nomeFantasia} enviou o documento assinado do convênio ${convenio.numero || ''}.`,
          link: `/admin/convenios/${convenio._id}`,
          tipoEvento: evento,
          referencia: convenio._id,
          chaveUnica: `${evento}:${convenio._id}:${convenio.historicoStatus.length}`
        })
      );
      mensagem(
        req,
        'sucesso',
        'Documento assinado enviado. O convênio agora aguarda validação administrativa.'
      );
      return res.redirect(`/empresa/convenios/${convenio._id}`);
    } catch (erro) {
      if (!documentoPersistido) {
        await removerArquivoSeguro(arquivo.path, 'documentos');
        convenio.status = estadoAnterior.status;
        convenio.pdfAssinado = estadoAnterior.pdfAssinado;
        convenio.assinaturas = estadoAnterior.assinaturas;
        convenio.justificativa = estadoAnterior.justificativa;
      }
      return renderizarDetalhesEmpresa(req, res, convenio, {
        erros: { geral: 'Não foi possível salvar o documento assinado.' },
        valores: req.body,
        status: 500
      });
    }
  }

  static async documentoParaAssinatura(req, res) {
    const resultado = await downloadPermitido(req, req.params.id, 'documentoParaAssinatura');
    if (resultado.status === 403) return res.status(403).render('erro/403');
    if (resultado.status === 404) return res.status(404).render('erro/404');
    return servirArquivo(res, resultado.arquivo, 'documentos');
  }

  static async documentoRevisao(req, res) {
    const campo = { preparado: 'documentoParaAssinatura', assinado: 'pdfAssinado' }[
      req.params.tipo
    ];
    if (!campo || !/^[a-f0-9]{24}$/i.test(req.params.revisaoId))
      return res.status(404).render('erro/404');
    const resultado = await downloadPermitido(req, req.params.id, campo, req.params.revisaoId);
    if (resultado.status !== 200)
      return res.status(resultado.status).render(`erro/${resultado.status}`);
    return servirArquivo(res, resultado.arquivo, 'documentos');
  }

  static async pdfAssinado(req, res) {
    const resultado = await downloadPermitido(req, req.params.id, 'pdfAssinado');
    if (resultado.status === 403) return res.status(403).render('erro/403');
    if (resultado.status === 404) return res.status(404).render('erro/404');
    return servirArquivo(res, resultado.arquivo, 'documentos');
  }

  static async pdf(req, res) {
    return ConvenioController.pdfAssinado(req, res);
  }
}
