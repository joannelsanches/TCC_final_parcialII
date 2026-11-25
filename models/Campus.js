import mongoose from '../config/conexao.js';
import { CAMPUS_BAGE_ID } from '../utils/escopoInstitucional.js';

const schema = new mongoose.Schema(
  {
    _id: {
      type: mongoose.Schema.Types.ObjectId,
      default: () => new mongoose.Types.ObjectId(CAMPUS_BAGE_ID),
      validate: {
        validator: (value) => String(value) === CAMPUS_BAGE_ID,
        message: 'Somente o registro único do Campus Bagé pode ser gravado.'
      }
    },
    nome: {
      type: String,
      required: true,
      trim: true,
      validate: {
        validator: (value) => ['IFSul — Campus Bagé', 'Bagé', 'Campus Bagé'].includes(value),
        message: 'Somente Campus Bagé pode ser cadastrado.'
      }
    },
    cidade: {
      type: String,
      required: true,
      trim: true,
      validate: { validator: (value) => value === 'Bagé', message: 'O campus deve estar em Bagé.' }
    },
    ativo: {
      type: Boolean,
      default: true
    }
  },
  {
    timestamps: true
  }
);
schema.index({ nome: 1, cidade: 1 }, { unique: true });

export default mongoose.model('Campus', schema);
