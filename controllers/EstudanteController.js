import { resolve } from 'node:path';
import mongoose from '../config/conexao.js';

import {
  caminhoPertenceAPasta,
  metadadosUpload,
  removerArquivoSeguro,
  servirArquivo
} from '../utils/arquivos.js';
import Estudante from '../models/Estudante.js';
import Vaga from '../models/Vaga.js';
import Candidatura from '../models/Candidatura.js';
import Termo from '../models/TermoCompromisso.js';
import Curso from '../models/Curso.js';
import { campusBageId, validarCampusInformado } from '../utils/campus.js';
import { filtroVagasPublicas } from '../services/vagas.js';
import { estudanteLogado } from '../utils/perfis.js';
import { mensagem, voltarComErro } from '../utils/mensagens.js';
import { enderecoVazio, errosEndereco, normalizarEndereco } from '../utils/endereco.js';
import { calcularPerfilEstudante } from '../utils/perfilCompleto.js';
import { inicioDoDiaInstitucional } from '../utils/datas.js';

async function renderizarPerfil(req, res, { erros = {}, valores = {}, status = 200 } = {}) {
  const [estudante, cursos] = await Promise.all([
    Estudante.findOne({ usuario: req.session.usuario.id }).populate('usuario curso campus'),
    Curso.find({ ativo: true, campus: campusBageId() }).sort('nome')
  ]);
  return res.status(status).render('estudante/perfil', {
    estudante,
    cursos,
    conclusaoPerfil: calcularPerfilEstudante(estudante, estudante.usuario),
    erros,
    valores
  });
}

export default class EstudanteController {
  static async painel(req, res) {
    const estudante = await Estudante.findOne({ usuario: req.session.usuario.id }).populate(
      'usuario curso campus'
    );
    if (!estudante) return res.status(404).render('erro/404');
    const [candidaturas, termos, vagas] = await Promise.all([
      Candidatura.countDocuments({ estudante: estudante._id }),
      Termo.countDocuments({
        estudante: estudante._id,
        status: { $in: ['RASCUNHO', 'AGUARDANDO_ASSINATURAS', 'PENDENTE'] }
      }),
      Vaga.find({ ...filtroVagasPublicas(), cursosCompativeis: estudante.curso._id })
        .populate('empresa areaAtuacao')
        .sort('-dataPublicacao')
        .limit(8)
    ]);
    res.render('estudante/painel', {
      estudante,
      candidaturas,
      termos,
      vagas,
      conclusaoPerfil: calcularPerfilEstudante(estudante, estudante.usuario)
    });
  }

  static async perfil(req, res) {
    return renderizarPerfil(req, res);
  }

  static async atualizarPerfil(req, res) {
    const estudante = await estudanteLogado(req);
    if (!estudante) return res.status(404).render('erro/404');
    const fotoAnterior = estudante.fotoPerfil?.caminho;
    try {
      const endereco = normalizarEndereco(req.body, 'endereco');
      const erros = errosEndereco(endereco, 'endereco', false);
      if (!req.body.curso) erros.curso = 'Selecione o curso.';
      try {
        validarCampusInformado(req.body.campus);
      } catch (erro) {
        erros.campus = erro.message;
      }
      if (
        req.body.semestre &&
        (!Number.isInteger(Number(req.body.semestre)) ||
          Number(req.body.semestre) < 1 ||
          Number(req.body.semestre) > 20)
      )
        erros.semestre = 'Informe um período entre 1 e 20.';
      const cursoAtivo = mongoose.isObjectIdOrHexString(req.body.curso)
        ? await Curso.exists({ _id: req.body.curso, ativo: true, campus: campusBageId() })
        : null;
      if (req.body.curso && !cursoAtivo) erros.curso = 'Selecione um curso ativo do Campus Bagé.';
      if (Object.keys(erros).length) {
        if (req.file) await removerArquivoSeguro(req.file.path, 'estudantes');
        return renderizarPerfil(req, res, { erros, valores: req.body, status: 422 });
      }
      if (String(estudante.curso) !== String(req.body.curso)) estudante.matriculaRegular = false;
      estudante.curso = req.body.curso;
      estudante.campus = campusBageId();
      estudante.semestre = req.body.semestre || undefined;
      estudante.turno = req.body.turno || undefined;
      estudante.disponibilidade = req.body.disponibilidade;
      estudante.competencias = String(req.body.competencias || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
      estudante.dataInicioCurso = req.body.dataInicioCurso || undefined;
      estudante.previsaoConclusaoCurso = req.body.previsaoConclusaoCurso || undefined;
      estudante.disciplinasEmCurso =
        req.body.disciplinasEmCurso === '' ? undefined : Number(req.body.disciplinasEmCurso);
      estudante.dataNascimento = req.body.dataNascimento || undefined;
      estudante.telefone = req.body.telefone;
      if (!enderecoVazio(endereco)) estudante.endereco = endereco;
      if (req.file) estudante.fotoPerfil = metadadosUpload(req.file);
      await estudante.save();
      if (req.file && fotoAnterior) await removerArquivoSeguro(fotoAnterior, 'estudantes');
      mensagem(req, 'sucesso', 'Perfil acadêmico atualizado.');
      res.redirect('/estudante/perfil');
    } catch (erro) {
      if (req.file) await removerArquivoSeguro(req.file.path, 'estudantes');
      return renderizarPerfil(req, res, {
        erros: { geral: 'Não foi possível atualizar o perfil.' },
        valores: req.body,
        status: 422
      });
    }
  }

  static async removerFoto(req, res) {
    const estudante = await estudanteLogado(req);
    if (!estudante) return res.status(404).render('erro/404');
    const caminho = estudante.fotoPerfil?.caminho;
    estudante.fotoPerfil = undefined;
    await estudante.save();
    if (caminho) await removerArquivoSeguro(caminho, 'estudantes');
    mensagem(req, 'sucesso', 'Foto de perfil removida.');
    res.redirect('/estudante/perfil');
  }

  static async enviarCurriculo(req, res) {
    if (!req.file)
      return voltarComErro(req, res, 'Selecione um currículo em PDF.', '/estudante/perfil');
    const estudante = await estudanteLogado(req);
    const anterior = estudante.curriculo?.caminho;
    try {
      estudante.curriculo = metadadosUpload(req.file);
      await estudante.save();
      if (anterior) await removerArquivoSeguro(anterior, 'curriculos');
      mensagem(req, 'sucesso', 'Currículo atualizado com segurança.');
      res.redirect('/estudante/perfil');
    } catch (erro) {
      await removerArquivoSeguro(req.file.path, 'curriculos');
      voltarComErro(req, res, 'Não foi possível atualizar o currículo.', '/estudante/perfil');
    }
  }

  static async curriculoProtegido(req, res) {
    const estudante = await Estudante.findById(req.params.id);
    if (!estudante?.curriculo?.caminho) return res.status(404).render('erro/404');
    let permitido =
      req.session.usuario.tipo === 'ADMIN' || String(estudante.usuario) === req.session.usuario.id;
    if (!permitido && req.session.usuario.tipo === 'EMPRESA') {
      const empresa = await (
        await import('../models/Empresa.js')
      ).default.findOne({ usuario: req.session.usuario.id });
      const vagas = await Vaga.find({ empresa: empresa._id }).distinct('_id');
      permitido = Boolean(
        await Candidatura.exists({ estudante: estudante._id, vaga: { $in: vagas } })
      );
    }
    if (!permitido) return res.status(403).render('erro/403');
    if (!caminhoPertenceAPasta(estudante.curriculo.caminho, 'curriculos'))
      return res.status(403).render('erro/403');
    servirArquivo(res, estudante.curriculo, 'curriculos');
  }

  static async candidaturas(req, res) {
    const estudante = await estudanteLogado(req);
    const candidaturas = await Candidatura.find({ estudante: estudante._id })
      .populate({ path: 'vaga', populate: [{ path: 'empresa' }, { path: 'areaAtuacao' }] })
      .sort('-dataCandidatura');
    const termos = await Termo.find({ candidatura: { $in: candidaturas.map((item) => item._id) } });
    const termosPorCandidatura = Object.fromEntries(
      termos.map((termo) => [String(termo.candidatura), termo])
    );
    res.render('estudante/candidaturas', { candidaturas, termosPorCandidatura });
  }

  static async historico(req, res) {
    const estudante = await Estudante.findOne({ usuario: req.session.usuario.id }).populate(
      'historicoEstagios.vaga historicoEstagios.empresa'
    );
    res.render('estudante/historico', { historico: estudante.historicoEstagios });
  }
}
