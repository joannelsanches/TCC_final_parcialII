export function preferenciasDoFormulario(body) {
  return { email: body.receberEmail === 'on' };
}

export function canalPermitido(usuario, canal = 'email', solicitado = true) {
  return (
    canal === 'email' &&
    Boolean(
      usuario?.ativo &&
      solicitado &&
      usuario.email &&
      usuario.preferenciasNotificacao?.email !== false
    )
  );
}
