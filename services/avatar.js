import Estudante from '../models/Estudante.js';
import { fotoGoogleValida } from './googleAuth.js';

export async function avatarDoUsuario(usuario) {
  if (!usuario) return {};
  if (usuario.tipo === 'ESTUDANTE') {
    const estudante = await Estudante.findOne({ usuario: usuario._id }).select(
      'fotoPerfil updatedAt'
    );
    if (estudante?.fotoPerfil?.caminho)
      return {
        src: `/midia/estudantes/${estudante._id}/foto?v=${new Date(estudante.updatedAt).getTime()}`
      };
  }
  return { src: fotoGoogleValida(usuario.google?.foto) };
}
