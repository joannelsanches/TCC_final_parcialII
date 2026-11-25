import bcrypt from 'bcryptjs';

import AuthController from './AuthController.js';
import Usuario from '../models/Usuario.js';
import Curso from '../models/Curso.js';
import { campusBageId } from '../utils/campus.js';
import { mensagem } from '../utils/mensagens.js';
import { destinoDoUsuario, iniciarSessao } from '../services/autenticacao.js';
import {
  TIPOS_CADASTRO_GOOGLE,
  guardarRascunhoGoogle,
  valoresRascunhoGoogle
} from '../utils/cadastroGoogle.js';
import {
  conferirRetornoGoogle,
  criarClienteGoogle,
  DURACAO_AUTENTICACAO_GOOGLE_MS,
  googleConfigurado,
  prepararAutenticacaoGoogle,
  validarIdentidadeGoogle
} from '../services/googleAuth.js';

const salvarSessao = (req) =>
  new Promise((resolve, reject) =>
    req.session.save((erro) => (erro ? reject(erro) : resolve()))
  );

function identidadePendente(req) {
  const dados = req.session.cadastroGoogle;
  const idade = Date.now() - dados?.confirmadaEm;
  return dados &&
    Number.isFinite(idade) &&
    idade >= 0 &&
    idade < DURACAO_AUTENTICACAO_GOOGLE_MS
    ? dados
    : null;
}

export default class GoogleAuthController {
  static async entrar(req, res) {
    const tipoCadastro = req.query.tipo;
    if (tipoCadastro !== undefined && !TIPOS_CADASTRO_GOOGLE.includes(tipoCadastro)) {
      return res.status(400).render('auth/login', {
        erros: { geral: 'Escolha estudante ou empresa para criar sua conta.' },
        valores: {}
      });
    }
    if (!googleConfigurado() && (tipoCadastro || req.query.cadastro === '1')) {
      mensagem(
        req,
        'aviso',
        'O cadastro Google ainda não está configurado. Utilize o cadastro com e-mail e senha.'
      );
      return res.redirect(
        tipoCadastro ? '/cadastro/' + tipoCadastro.toLowerCase() : '/cadastro'
      );
    }
    if (!googleConfigurado())
      return res.status(503).render('auth/login', {
        erros: {
          geral:
            'O acesso com Google está indisponível no momento. Você pode entrar com e-mail e senha.'
        },
        valores: {}
      });
    try {
      const { url, transacao } = await prepararAutenticacaoGoogle({
        cliente: criarClienteGoogle(),
        intencao: tipoCadastro || req.query.cadastro === '1' ? 'CADASTRO' : 'LOGIN',
        tipoCadastro
      });
      req.session.oauthGoogle = transacao;
      await salvarSessao(req);
      return res.redirect(url);
    } catch {
      return res.status(503).render('auth/login', {
        erros: { geral: 'Não foi possível iniciar o acesso com Google. Tente novamente.' },
        valores: {}
      });
    }
  }

  static async vincular(req, res) {
    const usuario = await Usuario.findById(req.session.usuario.id).select('+senhaHash');
    if (!usuario?.ativo) return res.status(403).render('erro/403');
    if (usuario.google?.sub) {
      mensagem(req, 'aviso', 'Sua conta já possui um acesso Google vinculado.');
      return res.redirect('/conta/acesso');
    }
    if (
      !usuario.senhaHash ||
      !(await bcrypt.compare(String(req.body.senha || ''), usuario.senhaHash))
    ) {
      return res.status(422).render('auth/conta-acesso', {
        conta: usuario,
        erros: { geral: 'Confirme sua senha atual para vincular o Google.' },
        googleDisponivel: googleConfigurado()
      });
    }
    try {
      const { url, transacao } = await prepararAutenticacaoGoogle({
        intencao: 'VINCULAR',
        usuarioId: String(usuario._id),
        cliente: criarClienteGoogle()
      });
      req.session.oauthGoogle = transacao;
      await salvarSessao(req);
      return res.redirect(url);
    } catch {
      mensagem(
        req,
        'erro',
        'Não foi possível iniciar a vinculação com Google. Tente novamente.'
      );
      return res.redirect('/conta/acesso');
    }
  }

  static async callback(req, res) {
    const transacao = req.session.oauthGoogle;
    delete req.session.oauthGoogle;
    await salvarSessao(req);
    try {
      conferirRetornoGoogle(req.query, transacao);
      const identidade = await validarIdentidadeGoogle(req.query.code, transacao, {
        cliente: criarClienteGoogle()
      });
      if (transacao.intencao === 'VINCULAR') {
        if (!req.usuario?.ativo || String(req.usuario._id) !== transacao.usuarioId)
          throw new Error('Entre na sua conta novamente antes de vincular o Google.');
        if (req.usuario.email !== identidade.email)
          throw new Error('Escolha a conta Google com o mesmo e-mail do seu cadastro StartIF.');
        if (
          await Usuario.exists({ 'google.sub': identidade.sub, _id: { $ne: req.usuario._id } })
        )
          throw new Error('Essa conta Google já está vinculada a outro cadastro.');
        const alterado = await Usuario.updateOne(
          { _id: req.usuario._id, ativo: true, 'google.sub': { $exists: false } },
          { $set: { google: { ...identidade, vinculadoEm: new Date() } } },
          { runValidators: true }
        );
        if (!alterado.modifiedCount)
          throw new Error('A conta já foi vinculada. Atualize a página.');
        mensagem(
          req,
          'sucesso',
          'Google vinculado. Você também pode continuar entrando com sua senha.'
        );
        return res.redirect('/conta/acesso');
      }
      const usuario = await Usuario.findOne({ 'google.sub': identidade.sub });
      if (usuario) {
        if (!usuario.ativo)
          throw new Error('Esta conta está inativa. Procure o setor de estágios.');
        usuario.google.email = identidade.email;
        usuario.google.foto = identidade.foto;
        await usuario.save();
        await iniciarSessao(req, usuario);
        return res.redirect(destinoDoUsuario(usuario));
      }
      if (await Usuario.exists({ email: identidade.email }))
        throw new Error(
          'Já existe um cadastro com esse e-mail. Entre com sua senha e vincule o Google em Conta e acesso.'
        );
      req.session.cadastroGoogle = {
        ...identidade,
        tipoCadastro: transacao.tipoCadastro,
        confirmadaEm: Date.now()
      };
      await salvarSessao(req);
      return res.redirect(
        '/auth/google/completar' +
          (transacao.tipoCadastro ? '?tipo=' + transacao.tipoCadastro : '')
      );
    } catch (erro) {
      const mensagensPublicas = [
        'A tentativa',
        'O acesso',
        'O Google não autorizou',
        'Já existe',
        'Esta conta',
        'Entre na sua conta',
        'Escolha a conta Google',
        'Essa conta Google',
        'A conta já foi'
      ];
      const texto =
        erro.code === 11000
          ? 'Essa conta Google já possui um vínculo. Entre novamente para continuar.'
          : mensagensPublicas.some((inicio) => erro.message?.startsWith(inicio))
            ? erro.message
            : 'Não foi possível confirmar sua identidade com Google. Inicie o acesso novamente.';
      if (transacao?.intencao === 'VINCULAR' && req.session.usuario) {
        mensagem(req, 'erro', texto);
        return res.redirect('/conta/acesso');
      }
      if (transacao?.intencao === 'CADASTRO') {
        mensagem(req, 'erro', texto);
        return res.redirect(
          transacao.tipoCadastro
            ? '/cadastro/' + transacao.tipoCadastro.toLowerCase()
            : '/cadastro'
        );
      }
      return res.status(400).render('auth/login', { erros: { geral: texto }, valores: {} });
    }
  }

  static async completarForm(req, res) {
    const identidade = identidadePendente(req);
    if (!identidade) {
      delete req.session.cadastroGoogle;
      mensagem(req, 'aviso', 'Confirme sua conta Google novamente para concluir o cadastro.');
      return res.redirect('/login');
    }
    const tipo = req.query.tipo || identidade.tipoCadastro;
    if (req.query.tipo !== undefined && !TIPOS_CADASTRO_GOOGLE.includes(req.query.tipo)) {
      return res.status(422).render('auth/google-escolha', {
        erros: { geral: 'Escolha estudante ou empresa.' }
      });
    }
    if (!TIPOS_CADASTRO_GOOGLE.includes(tipo)) return res.render('auth/google-escolha');
    req.session.cadastroGoogle.tipoCadastro = tipo;
    await salvarSessao(req);
    const cursos = await Curso.find({ ativo: true, campus: campusBageId() }).sort('nome');
    return res.render(
      tipo === 'ESTUDANTE' ? 'auth/cadastro-estudante' : 'auth/cadastro-empresa',
      {
        cursos,
        googleCadastro: identidade,
        valores: {
          ...valoresRascunhoGoogle(req, identidade, tipo),
          nome: identidade.nome,
          email: identidade.email
        },
        erros: {}
      }
    );
  }

  static async completar(req, res) {
    const tipo = req.session.cadastroGoogle?.tipoCadastro || req.body.tipo;
    if (!TIPOS_CADASTRO_GOOGLE.includes(req.body.tipo) || req.body.tipo !== tipo) {
      return res.status(422).render('auth/google-escolha', {
        erros: { geral: 'Escolha estudante ou empresa e mantenha o perfil selecionado.' }
      });
    }
    guardarRascunhoGoogle(req, tipo);
    const identidade = identidadePendente(req);
    if (!identidade) {
      delete req.session.cadastroGoogle;
      mensagem(
        req,
        'aviso',
        'Seu acesso Google expirou. Confirme a identidade novamente; os dados preenchidos foram preservados por até uma hora.'
      );
      return res.redirect('/auth/google?tipo=' + tipo);
    }
    if (
      await Usuario.exists({
        $or: [{ email: identidade.email }, { 'google.sub': identidade.sub }]
      })
    )
      return res.status(409).render('auth/login', {
        erros: {
          geral:
            'Essa conta já possui cadastro. Entre novamente ou vincule o Google após entrar com sua senha.'
        },
        valores: { email: identidade.email }
      });
    req.googleCadastro = identidade;
    res.locals.googleCadastro = identidade;
    req.body.nome = identidade.nome;
    req.body.email = identidade.email;
    return req.body.tipo === 'ESTUDANTE'
      ? AuthController.cadastrarEstudante(req, res)
      : AuthController.cadastrarEmpresa(req, res);
  }

  static async conta(req, res) {
    return res.render('auth/conta-acesso', {
      conta: req.usuario,
      googleDisponivel: googleConfigurado()
    });
  }
}
