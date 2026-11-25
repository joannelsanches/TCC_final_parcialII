export function podeGerenciarExclusoes(usuario) {
  return (
    usuario?.tipo === 'ADMIN' &&
    ['ADMINISTRADOR', 'SETOR_ESTAGIOS'].includes(usuario.funcaoAdministrativa || 'ADMINISTRADOR')
  );
}

export function gerenciarExclusoes(req, res, next) {
  if (!podeGerenciarExclusoes(req.session.usuario)) return res.status(403).render('erro/403');
  return next();
}
