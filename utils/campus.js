import Campus from '../models/Campus.js';
import mongoose from '../config/conexao.js';
import { CAMPUS_BAGE_ID, NOME_CAMPUS } from './escopoInstitucional.js';
export { CAMPUS_BAGE_ID, NOME_CAMPUS } from './escopoInstitucional.js';

export const campusBageId = () => new mongoose.Types.ObjectId(CAMPUS_BAGE_ID);
export const pertenceABage = (id) => String(id?._id || id || '') === CAMPUS_BAGE_ID;

export function validarCampusInformado(id) {
  if (id && !pertenceABage(id)) {
    const erro = new Error('O StartIF atende exclusivamente ao IFSul — Campus Bagé.');
    erro.status = 422;
    throw erro;
  }
  return campusBageId();
}

export async function garantirCampusBage() {
  return Campus.findOneAndUpdate(
    { _id: campusBageId() },
    {
      $set: { nome: NOME_CAMPUS, cidade: 'Bagé', ativo: true }
    },
    { upsert: true, new: true, runValidators: true }
  );
}
