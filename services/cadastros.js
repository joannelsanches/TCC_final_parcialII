import mongoose from '../config/conexao.js';
import Usuario from '../models/Usuario.js';
import Estudante from '../models/Estudante.js';
import Empresa from '../models/Empresa.js';

export async function criarCadastro(dadosUsuario, dadosPerfil) {
  const ModeloPerfil = { ESTUDANTE: Estudante, EMPRESA: Empresa }[dadosUsuario.tipo];
  if (!ModeloPerfil) throw new Error('Perfil de cadastro inválido.');

  let usuario;
  await mongoose.connection.transaction(async (session) => {
    [usuario] = await Usuario.create([dadosUsuario], { session });
    await ModeloPerfil.create([{ ...dadosPerfil, usuario: usuario._id }], { session });
  });
  return usuario;
}
