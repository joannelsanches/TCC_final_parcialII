import Usuario from '../models/Usuario.js';

export function dadosDaSessao(usuario) {
  return {
    id: String(usuario._id),
    nome: usuario.nome,
    tipo: usuario.tipo,
    funcaoAdministrativa: usuario.funcaoAdministrativa
  };
}

export function destinoDoUsuario(usuario) {
  return { ESTUDANTE: '/estudante', EMPRESA: '/empresa', ADMIN: '/admin' }[usuario.tipo] || '/';
}

export async function iniciarSessao(req, usuario) {
  await new Promise((resolve, reject) =>
    req.session.regenerate((erro) => (erro ? reject(erro) : resolve()))
  );
  req.session.usuario = dadosDaSessao(usuario);
  await new Promise((resolve, reject) =>
    req.session.save((erro) => (erro ? reject(erro) : resolve()))
  );
}

export async function carregarUsuario(req, res, next) {
  try {
    req.usuario = null;
    if (req.session.usuario) {
      const usuario = await Usuario.findById(req.session.usuario.id);
      if (usuario?.ativo) {
        req.usuario = usuario;
        req.session.usuario = dadosDaSessao(usuario);
      } else {
        await new Promise((resolve, reject) =>
          req.session.regenerate((erro) => (erro ? reject(erro) : resolve()))
        );
        req.session.mensagem = {
          tipo: 'aviso',
          texto: 'Sua sessão foi encerrada. Entre novamente ou procure o setor de estágios.'
        };
      }
    }
    next();
  } catch (erro) {
    next(erro);
  }
}
