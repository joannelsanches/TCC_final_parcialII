function possuiAssinatura(assinaturas, papel) {
  return assinaturas.some(
    (assinatura) => assinatura.papel === papel && assinatura.nome && assinatura.dataAssinatura
  );
}

export function assinaturasConvenioCompletas(convenio) {
  const assinaturas = convenio?.assinaturas || [];
  return ['EMPRESA', 'INSTITUICAO'].every((papel) =>
    assinaturas.some(
      (assinatura) =>
        assinatura.papel === papel &&
        assinatura.nome &&
        assinatura.funcao &&
        assinatura.dataAssinatura
    )
  );
}

export function estudanteMenorNaData(dataNascimento, referencia = new Date()) {
  if (!dataNascimento) return false;
  const nascimento = new Date(dataNascimento);
  const data = new Date(referencia);
  let idade = data.getUTCFullYear() - nascimento.getUTCFullYear();
  const antesAniversario =
    data.getUTCMonth() < nascimento.getUTCMonth() ||
    (data.getUTCMonth() === nascimento.getUTCMonth() &&
      data.getUTCDate() < nascimento.getUTCDate());
  if (antesAniversario) idade -= 1;
  return idade < 18;
}

export function papeisObrigatoriosTce(termo) {
  const papeis = ['ESTUDANTE', 'EMPRESA', 'INSTITUICAO'];
  const dataAssinatura = termo?.assinaturas?.find(
    (item) => item.papel === 'ESTUDANTE'
  )?.dataAssinatura;
  if (
    estudanteMenorNaData(
      termo?.estudanteDataNascimento,
      dataAssinatura || termo?.dataSolicitacao || new Date()
    )
  ) {
    papeis.push('RESPONSAVEL_LEGAL');
  }
  return papeis;
}

export function assinaturasTceCompletas(termo) {
  const assinaturas = termo?.assinaturas || [];
  return papeisObrigatoriosTce(termo).every((papel) => possuiAssinatura(assinaturas, papel));
}
