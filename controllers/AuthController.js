import bcrypt from 'bcryptjs';

import mongoose from '../config/conexao.js';
import Usuario from '../models/Usuario.js';
import Curso from '../models/Curso.js';
import { iniciarSessao, destinoDoUsuario } from '../services/autenticacao.js';
import { criarCadastro } from '../services/cadastros.js';
import { preferenciasDoFormulario } from '../utils/preferenciasNotificacao.js';
import { campusBageId, validarCampusInformado } from '../utils/campus.js';
import {
  emailInstitucionalValido,
  somenteNumeros,
  validarCNPJ,
  validarCPF
} from '../utils/validacoes.js';
import { errosEndereco, normalizarEndereco } from '../utils/endereco.js';
import { metadadosUpload, removerArquivoSeguro } from '../utils/arquivos.js';
import { mensagem } from '../utils/mensagens.js';

async function opcoesEstudante() {
  const cursos = await Curso.find({ ativo: true, campus: campusBageId() }).sort('nome');
  return { cursos };
}

function valoresSemSenha(body) {
  const { senha, confirmarSenha, ...valores } = body;
  return valores;
}

function temErros(erros) {
  return Object.keys(erros).length > 0;
}

async function concluirCadastroGoogle(req, res, usuario) {
  delete req.session.cadastroGoogle;
  delete req.session.rascunhoCadastroGoogle;
  try {
    await iniciarSessao(req, usuario);
    return res.redirect(destinoDoUsuario(usuario));
  } catch {
    mensagem(req, 'aviso', 'Cadastro concluído. Entre com Google para acessar sua conta.');
    return res.redirect('/login');
  }
}

export default class AuthController {
  static loginForm(req, res) {
    res.render('auth/login', { valores: {}, erros: {} });
  }

  static escolhaCadastro(req, res) {
    res.render('auth/escolha-cadastro');
  }

  static async cadastroEstudanteForm(req, res) {
    res.render('auth/cadastro-estudante', {
      ...(await opcoesEstudante()),
      valores: {},
      erros: {}
    });
  }

  static async cadastroEmpresaForm(req, res) {
    res.render('auth/cadastro-empresa', { valores: {}, erros: {} });
  }

  static async cadastrarEstudante(req, res) {
    try {
      const { nome, email, senha, confirmarSenha, cpf, matricula, curso } = req.body;
      const erros = {};
      let campus;
      try {
        campus = validarCampusInformado(req.body.campus);
      } catch (erro) {
        erros.campus = erro.message;
      }
      if (
        curso &&
        (!mongoose.isObjectIdOrHexString(curso) ||
          !(await Curso.exists({ _id: curso, campus: campusBageId(), ativo: true })))
      )
        erros.curso = 'Selecione um curso ativo do Campus Bagé.';
      for (const campo of ['nome', 'email', 'cpf', 'matricula', 'curso'])
        if (typeof req.body[campo] !== 'string' || !req.body[campo].trim())
          erros[campo] = 'Campo obrigatório.';
      if (!req.googleCadastro) {
        if (!senha) erros.senha = 'Informe uma senha.';
        else if (senha.length < 8) erros.senha = 'Use pelo menos 8 caracteres.';
        if (senha !== confirmarSenha) erros.confirmarSenha = 'As senhas não coincidem.';
      }
      if (email && !emailInstitucionalValido(email))
        erros.email = 'Use um e-mail institucional permitido.';
      if (cpf && !validarCPF(cpf)) erros.cpf = 'CPF inválido.';
      if (temErros(erros))
        return res.status(422).render('auth/cadastro-estudante', {
          ...(await opcoesEstudante()),
          erros,
          valores: valoresSemSenha(req.body)
        });
      let preferenciasNotificacao;
      try {
        preferenciasNotificacao = preferenciasDoFormulario({
          ...(req.body.preferenciasInformadas ? {} : { receberEmail: 'on' }),
          ...req.body
        });
      } catch (erro) {
        return res.status(422).render('auth/cadastro-estudante', {
          ...(await opcoesEstudante()),
          erros: { geral: erro.message },
          valores: valoresSemSenha(req.body)
        });
      }
      const usuario = await criarCadastro(
        {
          preferenciasNotificacao,
          nome,
          email,
          ...(req.googleCadastro
            ? {
                google: {
                  sub: req.googleCadastro.sub,
                  email,
                  foto: req.googleCadastro.foto,
                  vinculadoEm: new Date()
                }
              }
            : { senhaHash: await bcrypt.hash(senha, 12) }),
          tipo: 'ESTUDANTE'
        },
        {
          cpf: somenteNumeros(cpf),
          matricula,
          curso,
          campus
        }
      );
      if (req.googleCadastro) {
        return concluirCadastroGoogle(req, res, usuario);
      }
      mensagem(req, 'sucesso', 'Cadastro realizado. Agora você pode entrar.');
      return res.redirect('/login');
    } catch (erro) {
      const erros = {
        geral:
          erro.code === 11000
            ? 'E-mail, CPF ou matrícula já cadastrado.'
            : 'Não foi possível realizar o cadastro.'
      };
      return res.status(erro.code === 11000 ? 422 : 500).render('auth/cadastro-estudante', {
        ...(await opcoesEstudante()),
        erros,
        valores: valoresSemSenha(req.body)
      });
    }
  }

  static async cadastrarEmpresa(req, res) {
    const falhar = async (erros, status = 422) => {
      if (req.file) await removerArquivoSeguro(req.file.path, 'empresas');
      return res
        .status(status)
        .render('auth/cadastro-empresa', { erros, valores: valoresSemSenha(req.body) });
    };
    try {
      const {
        nome,
        email,
        senha,
        confirmarSenha,
        cnpj,
        razaoSocial,
        nomeFantasia,
        telefone,
        emailContato,
        responsavelNome,
        responsavelCargo
      } = req.body;
      try {
        validarCampusInformado(req.body.campus);
      } catch (erro) {
        return falhar({ campus: erro.message });
      }
      const endereco = normalizarEndereco(req.body, 'endereco');
      const erros = errosEndereco(endereco, 'endereco');
      for (const campo of [
        'nome',
        'email',
        'cnpj',
        'razaoSocial',
        'nomeFantasia',
        'telefone',
        'responsavelNome',
        'responsavelCargo'
      ])
        if (typeof req.body[campo] !== 'string' || !req.body[campo].trim())
          erros[campo] = 'Campo obrigatório.';
      if (!req.googleCadastro) {
        if (!senha) erros.senha = 'Informe uma senha.';
        else if (senha.length < 8) erros.senha = 'Use pelo menos 8 caracteres.';
        if (senha !== confirmarSenha) erros.confirmarSenha = 'As senhas não coincidem.';
      }
      if (cnpj && !validarCNPJ(cnpj)) erros.cnpj = 'CNPJ inválido.';
      if (temErros(erros)) return falhar(erros);
      let preferenciasNotificacao;
      try {
        preferenciasNotificacao = preferenciasDoFormulario({
          ...(req.body.preferenciasInformadas ? {} : { receberEmail: 'on' }),
          ...req.body
        });
      } catch (erro) {
        return falhar({ geral: erro.message });
      }
      const usuario = await criarCadastro(
        {
          preferenciasNotificacao,
          nome,
          email,
          ...(req.googleCadastro
            ? {
                google: {
                  sub: req.googleCadastro.sub,
                  email,
                  foto: req.googleCadastro.foto,
                  vinculadoEm: new Date()
                }
              }
            : { senhaHash: await bcrypt.hash(senha, 12) }),
          tipo: 'EMPRESA'
        },
        {
          cnpj: somenteNumeros(cnpj),
          razaoSocial,
          nomeFantasia,
          endereco,
          telefone,
          emailContato: emailContato || email,
          responsavel: { nome: responsavelNome, cargo: responsavelCargo },
          descricao: req.body.descricao,
          logo: metadadosUpload(req.file)
        }
      );
      if (req.googleCadastro) {
        return concluirCadastroGoogle(req, res, usuario);
      }
      mensagem(req, 'sucesso', 'Empresa cadastrada. A instituição analisará seu cadastro.');
      return res.redirect('/login');
    } catch (erro) {
      return falhar(
        {
          geral:
            erro.code === 11000
              ? 'E-mail ou CNPJ já cadastrado.'
              : erro.status === 422
                ? erro.message
                : 'Não foi possível cadastrar a empresa.'
        },
        erro.code === 11000 || erro.status === 422 ? 422 : 500
      );
    }
  }

  static async entrar(req, res) {
    try {
      const email = String(req.body.email || '')
        .trim()
        .toLowerCase();
      const usuario = await Usuario.findOne({ email }).select('+senhaHash');
      if (!email)
        return res
          .status(422)
          .render('auth/login', { erros: { email: 'Informe o e-mail.' }, valores: { email } });
      if (!req.body.senha)
        return res
          .status(422)
          .render('auth/login', { erros: { senha: 'Informe a senha.' }, valores: { email } });
      if (
        !usuario?.senhaHash ||
        !(await bcrypt.compare(req.body.senha || '', usuario.senhaHash))
      )
        return res.status(422).render('auth/login', {
          erros: { geral: 'E-mail ou senha inválidos.' },
          valores: { email }
        });
      if (!usuario.ativo)
        return res.status(403).render('auth/login', {
          erros: { geral: 'Esta conta está inativa. Procure o setor de estágios.' },
          valores: { email }
        });
      await iniciarSessao(req, usuario);
      return res.redirect(destinoDoUsuario(usuario));
    } catch (erro) {
      return res.status(500).render('auth/login', {
        erros: { geral: 'Não foi possível entrar.' },
        valores: { email: String(req.body.email || '') }
      });
    }
  }

  static sair(req, res) {
    req.session.destroy(() => res.redirect('/'));
  }
}
