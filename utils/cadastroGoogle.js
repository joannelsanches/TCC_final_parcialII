export const TIPOS_CADASTRO_GOOGLE = ['ESTUDANTE', 'EMPRESA'];

const camposPermitidos = [
  'cpf',
  'matricula',
  'curso',
  'cnpj',
  'razaoSocial',
  'nomeFantasia',
  'telefone',
  'emailContato',
  'responsavelNome',
  'responsavelCargo',
  'descricao',
  'enderecoLogradouro',
  'enderecoNumero',
  'enderecoComplemento',
  'enderecoBairro',
  'enderecoCidade',
  'enderecoEstado',
  'enderecoCep',
  'preferenciasInformadas',
  'receberEmail'
];

export function guardarRascunhoGoogle(req, tipo) {
  const identidade = req.session.cadastroGoogle;
  if (!identidade || !TIPOS_CADASTRO_GOOGLE.includes(tipo)) return;
  req.session.rascunhoCadastroGoogle = {
    sub: identidade.sub,
    tipo,
    salvoEm: Date.now(),
    valores: Object.fromEntries(
      camposPermitidos
        .filter((campo) => typeof req.body[campo] === 'string')
        .map((campo) => [campo, req.body[campo].slice(0, 3000)])
    )
  };
}

export function valoresRascunhoGoogle(req, identidade, tipo) {
  const rascunho = req.session.rascunhoCadastroGoogle;
  const idade = Date.now() - rascunho?.salvoEm;
  return rascunho?.sub === identidade.sub &&
    rascunho.tipo === tipo &&
    Number.isFinite(idade) &&
    idade >= 0 &&
    idade < 60 * 60 * 1000
    ? rascunho.valores
    : {};
}
