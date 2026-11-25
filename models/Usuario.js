import mongoose from '../config/conexao.js';

const schema = new mongoose.Schema({
  nome: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  senhaHash: {
    type: String,
    required() {
      return !this.google?.sub;
    },
    select: false
  },
  google: {
    sub: { type: String, trim: true },
    email: { type: String, lowercase: true, trim: true },
    foto: String,
    vinculadoEm: Date
  },
  tipo: {
    type: String,
    enum: ['ESTUDANTE', 'EMPRESA', 'ADMIN'],
    required: true
  },
  funcaoAdministrativa: {
    type: String,
    enum: ['ADMINISTRADOR', 'COORDENADOR', 'SETOR_ESTAGIOS'],
    default: undefined
  },
  ativo: {
    type: Boolean,
    default: true
  },
  preferenciasNotificacao: {
    email: { type: Boolean, default: true }
  },
  dataCriacao: {
    type: Date,
    default: Date.now
  }
});

schema.index(
  { 'google.sub': 1 },
  { unique: true, partialFilterExpression: { 'google.sub': { $type: 'string' } } }
);

export default mongoose.model('Usuario', schema);
