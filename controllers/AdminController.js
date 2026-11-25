import Usuario from '../models/Usuario.js';
import Estudante from '../models/Estudante.js';
import Empresa from '../models/Empresa.js';
import Vaga from '../models/Vaga.js';
import Candidatura from '../models/Candidatura.js';
import Convenio from '../models/Convenio.js';
import Termo from '../models/TermoCompromisso.js';
import Curso from '../models/Curso.js';
import { campusBageId, validarCampusInformado } from '../utils/campus.js';
import AreaAtuacao from '../models/AreaAtuacao.js';
import { mensagem, voltarComErro } from '../utils/mensagens.js';
import { escaparRegex, somenteNumeros } from '../utils/validacoes.js';
import { inicioDoDiaInstitucional } from '../utils/datas.js';
import mongoose from '../config/conexao.js';
import { gerarRelatorioPdf } from '../services/relatoriosPdf.js';

function lista(valor) {
  return Array.isArray(valor) ? valor.filter(Boolean) : [valor].filter(Boolean);
}

function dadosCurso(body) {
  return {
    nome: body.nome,
    nivel: body.nivel,
    campus: validarCampusInformado(body.campus),
    areasRelacionadas: lista(body.areasRelacionadas),
    regrasEstagio: {
      cargaHorariaObrigatoriaMinima: Number(body.cargaHorariaObrigatoriaMinima || 0),
      preRequisitoObrigatorio: String(body.preRequisitoObrigatorio || '').trim(),
      fontePpc: String(body.fontePpc || '').trim(),
      dataConferenciaPpc: body.dataConferenciaPpc || undefined,
      periodoMinimoObrigatorio: Number(body.periodoMinimoObrigatorio || 1),
      cargaHorariaDiariaMaxima: Number(body.cargaHorariaDiariaMaxima || 6),
      cargaHorariaSemanalMaxima: Number(body.cargaHorariaSemanalMaxima || 30),
      permiteJornada40h: body.permiteJornada40h === 'on',
      exigeConvenio: body.exigeConvenio === 'on',
      permiteEstagioObrigatorio: body.permiteEstagioObrigatorio === 'on',
      permiteEstagioNaoObrigatorio: body.permiteEstagioNaoObrigatorio === 'on'
    }
  };
}

const destinosCadastro = {
  area: '/admin/areas',
  curso: '/admin/cursos'
};

async function renderizarAreas(
  res,
  { erros = {}, valores = {}, edicao = null, status = 200 } = {}
) {
  const areas = await AreaAtuacao.find().sort('nome');
  return res.status(status).render('admin/areas', { areas, erros, valores, edicao });
}

async function renderizarCursos(
  res,
  { erros = {}, valores = {}, edicao = null, status = 200 } = {}
) {
  const [cursos, areas] = await Promise.all([
    Curso.find({ campus: campusBageId() }).populate('campus areasRelacionadas').sort('nome'),
    AreaAtuacao.find().sort('nome')
  ]);
  return res.status(status).render('admin/cursos', { cursos, areas, erros, valores, edicao });
}

async function validarCurso(body, cursoAtual = null) {
  const erros = {};
  const dados = dadosCurso(body);
  if (!String(dados.nome || '').trim()) erros.nome = 'Informe o nome do curso.';
  if (!['TÉCNICO', 'SUPERIOR', 'PÓS-GRADUAÇÃO'].includes(dados.nivel))
    erros.nivel = 'Selecione um nível válido.';
  if (!dados.areasRelacionadas.length)
    erros.areasRelacionadas = 'Selecione pelo menos uma área relacionada.';

  if (dados.areasRelacionadas.length) {
    const antigas = new Set(
      (cursoAtual?.areasRelacionadas || []).map((area) => String(area?._id || area))
    );
    const areas = await AreaAtuacao.find({ _id: { $in: dados.areasRelacionadas } }).select(
      '_id ativo'
    );
    const permitidas = areas.filter((area) => area.ativo || antigas.has(String(area._id)));
    if (permitidas.length !== dados.areasRelacionadas.length)
      erros.areasRelacionadas = 'Selecione somente áreas ativas ou já vinculadas ao curso.';
  }

  const regras = dados.regrasEstagio;
  if (regras.fontePpc && !/^https:\/\/[^/]*ifsul\.edu\.br\//.test(regras.fontePpc))
    erros.fontePpc = 'Informe um endereço institucional HTTPS do PPC.';
  if (regras.permiteJornada40h && (!regras.fontePpc || !regras.dataConferenciaPpc))
    erros.fontePpc = 'Registre o PPC conferido antes de permitir 40 horas.';
  if (
    !Number.isInteger(regras.periodoMinimoObrigatorio) ||
    regras.periodoMinimoObrigatorio < 1 ||
    regras.periodoMinimoObrigatorio > 20
  )
    erros.periodoMinimoObrigatorio = 'Informe um período entre 1 e 20.';
  if (
    !Number.isFinite(regras.cargaHorariaDiariaMaxima) ||
    regras.cargaHorariaDiariaMaxima < 1 ||
    regras.cargaHorariaDiariaMaxima > 8
  )
    erros.cargaHorariaDiariaMaxima = 'Informe uma carga diária entre 1 e 8 horas.';
  if (
    !Number.isFinite(regras.cargaHorariaSemanalMaxima) ||
    regras.cargaHorariaSemanalMaxima < 1 ||
    regras.cargaHorariaSemanalMaxima > 40
  )
    erros.cargaHorariaSemanalMaxima = 'Informe uma carga semanal entre 1 e 40 horas.';
  if (regras.cargaHorariaSemanalMaxima > regras.cargaHorariaDiariaMaxima * 6)
    erros.cargaHorariaSemanalMaxima = 'A carga semanal é incompatível com o limite diário.';
  return { erros, dados };
}

export default class AdminController {
  static async painel(req, res) {
    const [estudantes, empresas, conveniadas, vagasAbertas, vagasPendentes, emEstagio] =
      await Promise.all([
        Estudante.countDocuments(),
        Empresa.countDocuments(),
        Convenio.distinct('empresa', {
          arquivado: { $ne: true },
          status: 'ATIVO',
          dataFinal: { $gte: inicioDoDiaInstitucional() },
          regularizacaoPendente: { $ne: true },
          'pdfAssinado.caminho': { $exists: true, $ne: '' }
        }),
        Vaga.countDocuments({ arquivada: { $ne: true }, status: 'ABERTA' }),
        Vaga.countDocuments({ status: 'PENDENTE_VALIDACAO' }),
        Termo.countDocuments({ status: 'APROVADO', situacaoEstagio: 'EM_ANDAMENTO' })
      ]);
    res.render('admin/painel', {
      metricas: {
        estudantes,
        empresas,
        conveniadas: conveniadas.length,
        vagasAbertas,
        vagasPendentes,
        emEstagio
      }
    });
  }

  static async usuarios(req, res) {
    const tipo = ['ESTUDANTE', 'EMPRESA', 'ADMIN'].includes(req.query.tipo) ? req.query.tipo : '';
    const busca = String(req.query.q || '').trim();
    const pagina = Math.max(1, Number.parseInt(req.query.pagina, 10) || 1);
    const porPagina = 20;
    const filtro = tipo ? { tipo } : {};
    if (busca) {
      const regex = new RegExp(escaparRegex(busca), 'i');
      const numeros = somenteNumeros(busca);
      const [estudantesEncontrados, empresasEncontradas] = await Promise.all([
        Estudante.find({
          $or: [
            { matricula: regex },
            ...(numeros ? [{ cpf: { $regex: escaparRegex(numeros) } }] : [])
          ]
        }).distinct('usuario'),
        Empresa.find({
          $or: [
            { razaoSocial: regex },
            { nomeFantasia: regex },
            ...(numeros ? [{ cnpj: { $regex: escaparRegex(numeros) } }] : [])
          ]
        }).distinct('usuario')
      ]);
      filtro.$or = [
        { nome: regex },
        { email: regex },
        { _id: { $in: [...estudantesEncontrados, ...empresasEncontradas] } }
      ];
    }
    const total = await Usuario.countDocuments(filtro);
    const totalPaginas = Math.max(1, Math.ceil(total / porPagina));
    const paginaAtual = Math.min(pagina, totalPaginas);
    const usuarios = await Usuario.find(filtro)
      .sort('-dataCriacao')
      .skip((paginaAtual - 1) * porPagina)
      .limit(porPagina);
    const idsUsuarios = usuarios.map((usuario) => usuario._id);
    const [estudantes, empresas] = await Promise.all([
      Estudante.find({ usuario: { $in: idsUsuarios } }).select(
        'usuario cpf matricula matriculaRegular fotoPerfil'
      ),
      Empresa.find({ usuario: { $in: idsUsuarios } }).select(
        'usuario cnpj razaoSocial nomeFantasia logo'
      )
    ]);
    const perfisEstudante = Object.fromEntries(
      estudantes.map((estudante) => [String(estudante.usuario), estudante])
    );
    const perfisEmpresa = Object.fromEntries(
      empresas.map((empresa) => [String(empresa.usuario), empresa])
    );
    res.render('admin/usuarios', {
      usuarios,
      tipo,
      busca,
      perfisEstudante,
      perfisEmpresa,
      paginacao: { pagina: paginaAtual, totalPaginas, total, porPagina }
    });
  }
  static async alternarUsuario(req, res) {
    const usuario = await Usuario.findById(req.params.id);
    if (!usuario) return res.status(404).render('erro/404');
    if (String(usuario._id) === req.session.usuario.id)
      return voltarComErro(
        req,
        res,
        'Você não pode desativar sua própria conta.',
        '/admin/usuarios'
      );
    usuario.ativo = !usuario.ativo;
    await usuario.save();
    mensagem(req, 'sucesso', 'Situação do usuário atualizada.');
    res.redirect('/admin/usuarios');
  }
  static async alternarMatricula(req, res) {
    const estudante = await Estudante.findOne({ usuario: req.params.id });
    if (!estudante) return res.status(404).render('erro/404');
    estudante.matriculaRegular = !estudante.matriculaRegular;
    await estudante.save();
    mensagem(req, 'sucesso', 'Situação da matrícula atualizada.');
    res.redirect('/admin/usuarios?tipo=ESTUDANTE');
  }

  static async empresas(req, res) {
    const empresas = await Empresa.find().populate('usuario').sort('nomeFantasia');
    const convenios = await Convenio.find({ empresa: { $in: empresas.map((e) => e._id) } }).sort(
      '-dataFinal'
    );
    const ultimoConvenio = Object.fromEntries(convenios.map((c) => [String(c.empresa), c]));
    res.render('admin/empresas', { empresas, ultimoConvenio });
  }
  static async statusEmpresa(req, res) {
    const permitidos = ['PENDENTE', 'APROVADO', 'REPROVADO'];
    if (!permitidos.includes(req.body.status))
      return voltarComErro(req, res, 'Situação inválida.', '/admin/empresas');
    const tipoConcedente = req.body.tipoConcedente || 'EMPRESA';
    if (!['EMPRESA', 'IFSUL', 'AGENTE_INTEGRACAO'].includes(tipoConcedente))
      return voltarComErro(req, res, 'Tipo de concedente inválido.', '/admin/empresas');
    await Empresa.findByIdAndUpdate(
      req.params.id,
      { statusCadastro: req.body.status, tipoConcedente, dataValidacaoCadastro: new Date() },
      { runValidators: true }
    );
    mensagem(req, 'sucesso', 'Cadastro da empresa atualizado.');
    res.redirect('/admin/empresas');
  }

  static async cadastros(req, res) {
    const [areas, cursos] = await Promise.all([
      AreaAtuacao.countDocuments(),
      Curso.countDocuments({ campus: campusBageId() })
    ]);
    return res.render('admin/cadastros-index', { contagens: { areas, cursos } });
  }

  static async areas(req, res) {
    return renderizarAreas(res);
  }

  static async criarArea(req, res) {
    const erros = {};
    if (!String(req.body.nome || '').trim()) erros.nome = 'Informe o nome da área.';
    if (Object.keys(erros).length)
      return renderizarAreas(res, { erros, valores: req.body, status: 422 });
    try {
      await AreaAtuacao.create({ nome: req.body.nome, ativo: req.body.ativo === 'on' });
      mensagem(req, 'sucesso', 'Área cadastrada.');
      return res.redirect('/admin/areas');
    } catch (erro) {
      return renderizarAreas(res, {
        erros: {
          [erro.code === 11000 ? 'nome' : 'geral']:
            erro.code === 11000
              ? 'Esta área já está cadastrada.'
              : 'Não foi possível cadastrar a área.'
        },
        valores: req.body,
        status: 422
      });
    }
  }

  static async editarAreaForm(req, res) {
    const edicao = await AreaAtuacao.findById(req.params.id);
    if (!edicao) return res.status(404).render('erro/404');
    return renderizarAreas(res, { edicao });
  }

  static async atualizarArea(req, res) {
    const edicao = await AreaAtuacao.findById(req.params.id);
    if (!edicao) return res.status(404).render('erro/404');
    if (!String(req.body.nome || '').trim()) {
      return renderizarAreas(res, {
        erros: { nome: 'Informe o nome da área.' },
        valores: req.body,
        edicao,
        status: 422
      });
    }
    try {
      edicao.nome = req.body.nome;
      edicao.ativo = req.body.ativo === 'on';
      await edicao.save();
      mensagem(req, 'sucesso', 'Área atualizada.');
      return res.redirect('/admin/areas');
    } catch (erro) {
      return renderizarAreas(res, {
        erros: {
          [erro.code === 11000 ? 'nome' : 'geral']:
            erro.code === 11000
              ? 'Esta área já está cadastrada.'
              : 'Não foi possível atualizar a área.'
        },
        valores: req.body,
        edicao,
        status: 422
      });
    }
  }

  static async cursos(req, res) {
    return renderizarCursos(res);
  }

  static async criarCurso(req, res) {
    try {
      const { erros, dados } = await validarCurso(req.body);
      if (Object.keys(erros).length)
        return renderizarCursos(res, { erros, valores: req.body, status: 422 });
      await Curso.create({ ...dados, ativo: req.body.ativo === 'on' });
      mensagem(req, 'sucesso', 'Curso cadastrado.');
      return res.redirect('/admin/cursos');
    } catch (erro) {
      return renderizarCursos(res, {
        erros: {
          [erro.code === 11000 ? 'nome' : 'geral']:
            erro.code === 11000
              ? 'Já existe este curso no campus selecionado.'
              : 'Não foi possível cadastrar o curso.'
        },
        valores: req.body,
        status: 422
      });
    }
  }

  static async editarCursoForm(req, res) {
    const edicao = await Curso.findOne({ _id: req.params.id, campus: campusBageId() }).populate(
      'campus areasRelacionadas'
    );
    if (!edicao) return res.status(404).render('erro/404');
    return renderizarCursos(res, { edicao });
  }

  static async atualizarCurso(req, res) {
    const edicao = await Curso.findOne({ _id: req.params.id, campus: campusBageId() }).populate(
      'campus areasRelacionadas'
    );
    if (!edicao) return res.status(404).render('erro/404');
    try {
      const { erros, dados } = await validarCurso(req.body, edicao);
      if (Object.keys(erros).length)
        return renderizarCursos(res, { erros, valores: req.body, edicao, status: 422 });
      dados.migracaoPendente = false;
      Object.assign(edicao, dados, { ativo: req.body.ativo === 'on' });
      await edicao.save();
      mensagem(req, 'sucesso', 'Curso atualizado.');
      return res.redirect('/admin/cursos');
    } catch (erro) {
      return renderizarCursos(res, {
        erros: {
          [erro.code === 11000 ? 'nome' : 'geral']:
            erro.code === 11000
              ? 'Já existe este curso no campus selecionado.'
              : 'Não foi possível atualizar o curso.'
        },
        valores: req.body,
        edicao,
        status: 422
      });
    }
  }

  static async alternarCadastro(req, res) {
    const modelos = { curso: Curso, area: AreaAtuacao };
    const Model = modelos[req.params.tipo];
    if (!Model) return res.status(404).render('erro/404');
    const item = await Model.findOne({
      _id: req.params.id,
      ...(req.params.tipo === 'curso' ? { campus: campusBageId() } : {})
    });
    if (!item) return res.status(404).render('erro/404');
    item.ativo = !item.ativo;
    await item.save();
    mensagem(req, 'sucesso', 'Situação atualizada.');
    return res.redirect(destinosCadastro[req.params.tipo]);
  }

  static async excluirCadastro(req, res) {
    const { tipo, id } = req.params;
    const modelos = { curso: Curso, area: AreaAtuacao };
    const Model = modelos[tipo];
    if (!Model) return res.status(404).render('erro/404');
    const item = await Model.findOne({
      _id: id,
      ...(tipo === 'curso' ? { campus: campusBageId() } : {})
    });
    if (!item) return res.status(404).render('erro/404');
    let dependencias = [];
    if (tipo === 'curso') {
      const [estudantes, vagas, termos] = await Promise.all([
        Estudante.countDocuments({ curso: id }),
        Vaga.countDocuments({ cursosCompativeis: id }),
        Termo.countDocuments({ curso: id })
      ]);
      dependencias = [
        ['estudante(s)', estudantes],
        ['vaga(s)', vagas],
        ['termo(s)', termos]
      ];
    }
    if (tipo === 'area') {
      const [cursos, vagas] = await Promise.all([
        Curso.countDocuments({ areasRelacionadas: id }),
        Vaga.countDocuments({ areaAtuacao: id })
      ]);
      dependencias = [
        ['curso(s)', cursos],
        ['vaga(s)', vagas]
      ];
    }
    const emUso = dependencias.filter(([, quantidade]) => quantidade > 0);
    if (emUso.length) {
      const texto = emUso.map(([nome, quantidade]) => `${quantidade} ${nome}`).join(', ');
      return voltarComErro(
        req,
        res,
        `Não foi possível excluir: o registro está em uso por ${texto}. Desative-o se necessário.`,
        destinosCadastro[tipo]
      );
    }
    await Model.findByIdAndDelete(id);
    mensagem(req, 'sucesso', 'Registro excluído.');
    return res.redirect(destinosCadastro[tipo]);
  }

  static async relatorios(req, res) {
    const situacoes = [
      'EM_ANALISE',
      'ENTREVISTA',
      'AGUARDANDO_DOCUMENTOS',
      'SELECIONADO',
      'NAO_SELECIONADO',
      'CANCELADO'
    ];
    if (req.query.status && !situacoes.includes(req.query.status))
      return voltarComErro(
        req,
        res,
        'Selecione uma situação válida nos filtros.',
        '/admin/relatorios'
      );
    for (const campo of ['curso', 'empresa']) {
      if (req.query[campo] && !mongoose.isObjectIdOrHexString(req.query[campo]))
        return voltarComErro(
          req,
          res,
          'Selecione um filtro válido de curso ou empresa.',
          '/admin/relatorios'
        );
    }
    for (const campo of ['inicio', 'fim']) {
      if (
        req.query[campo] &&
        (!/^\d{4}-\d{2}-\d{2}$/.test(req.query[campo]) ||
          !Number.isFinite(new Date(req.query[campo]).getTime()) ||
          new Date(req.query[campo]).toISOString().slice(0, 10) !== req.query[campo])
      )
        return voltarComErro(req, res, 'Informe uma data válida nos filtros.', '/admin/relatorios');
    }
    if (req.query.inicio && req.query.fim && req.query.inicio > req.query.fim)
      return voltarComErro(
        req,
        res,
        'A data inicial deve ser anterior ou igual à final.',
        '/admin/relatorios'
      );
    const filtroVaga = {};
    if (req.query.empresa) filtroVaga.empresa = req.query.empresa;
    const vagas = req.query.empresa ? await Vaga.find(filtroVaga).distinct('_id') : null;
    const filtro = {};
    if (req.query.status) filtro.status = req.query.status;
    if (vagas) filtro.vaga = { $in: vagas };
    if (req.query.inicio || req.query.fim) filtro.dataCandidatura = {};
    if (req.query.inicio) filtro.dataCandidatura.$gte = new Date(req.query.inicio);
    if (req.query.fim)
      filtro.dataCandidatura.$lt = new Date(new Date(req.query.fim).getTime() + 86400000);
    let candidaturas = await Candidatura.find(filtro)
      .populate({ path: 'estudante', populate: ['usuario', 'curso'] })
      .populate({ path: 'vaga', populate: 'empresa' })
      .sort('-dataCandidatura');
    if (req.query.curso)
      candidaturas = candidaturas.filter(
        (c) => String(c.estudante?.curso?._id) === req.query.curso
      );
    const [cursos, empresas] = await Promise.all([
      Curso.find({ ativo: true, campus: campusBageId() }).sort('nome'),
      Empresa.find().sort('nomeFantasia')
    ]);
    if (req.query.formato === 'pdf') {
      const filtros = [
        req.query.curso
          ? 'Curso: ' +
            (cursos.find((c) => String(c._id) === req.query.curso)?.nome || 'selecionado')
          : '',
        req.query.empresa
          ? 'Empresa: ' +
            (empresas.find((e) => String(e._id) === req.query.empresa)?.nomeFantasia ||
              'selecionada')
          : '',
        req.query.status ? 'Situação: ' + String(req.query.status).replaceAll('_', ' ') : '',
        req.query.inicio ? 'De: ' + req.query.inicio.split('-').reverse().join('/') : '',
        req.query.fim ? 'Até: ' + req.query.fim.split('-').reverse().join('/') : ''
      ].filter(Boolean);
      const pdf = await gerarRelatorioPdf(candidaturas, { filtros });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename="relatorio-startif.pdf"');
      return res.send(pdf);
    }
    res.render('admin/relatorios', { candidaturas, cursos, empresas, filtros: req.query });
  }
}
