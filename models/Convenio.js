import mongoose from '../config/conexao.js';
import { historicoStatusSchema } from './schemasComuns.js';

function obrigatorioForaDoRascunho() {
  return !['RASCUNHO', 'ARQUIVADO'].includes(this.status);
}

const documentoParaAssinaturaSchema = new mongoose.Schema(
  {
    caminho: String,
    nomeOriginal: String,
    mimetype: { type: String, enum: ['application/pdf'] },
    tamanho: Number,
    dataEnvio: Date,
    enviadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' }
  },
  { _id: false }
);

const documentoAssinadoSchema = new mongoose.Schema(
  {
    caminho: String,
    nomeOriginal: String,
    mimetype: { type: String, enum: ['application/pdf'] },
    tamanho: Number,
    dataEnvio: Date,
    dataRecebimento: Date,
    enviadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' },
    nomeSignatario: { type: String, trim: true },
    funcaoSignatario: { type: String, trim: true },
    dataAssinatura: Date,
    observacoes: { type: String, trim: true, maxlength: 1000 }
  },
  { _id: false }
);

const schema = new mongoose.Schema(
  {
    empresa: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Empresa',
      required: true
    },

    numero: {
      type: String,
      required: obrigatorioForaDoRascunho,
      unique: true,
      sparse: true,
      trim: true
    },

    dataInicial: {
      type: Date,
      required: obrigatorioForaDoRascunho
    },

    dataFinal: {
      type: Date,
      required: obrigatorioForaDoRascunho
    },

    status: {
      type: String,
      enum: [
        'RASCUNHO',
        'AGUARDANDO_ASSINATURAS',
        'PENDENTE',
        'ATIVO',
        'REPROVADO',
        'INATIVO',
        'VENCIDO',
        'ARQUIVADO'
      ],
      default: 'RASCUNHO'
    },
    documentoParaAssinatura: documentoParaAssinaturaSchema,
    pdfAssinado: documentoAssinadoSchema,
    assinaturas: [
      {
        nome: { type: String, trim: true },
        funcao: { type: String, trim: true },
        entidade: { type: String, trim: true },
        papel: { type: String, enum: ['EMPRESA', 'INSTITUICAO'] },
        dataAssinatura: Date
      }
    ],
    dataEnvioAnalise: Date,
    dataEnvioAssinatura: Date,
    dataRecebimentoDocumentoAssinado: Date,
    dataAprovacao: Date,
    justificativa: { type: String, trim: true },
    aprovadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' },
    enviadoParaAssinaturaPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' },
    documentoAssinadoEnviadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' },
    ultimaAlteracaoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' },
    regularizacaoPendente: { type: Boolean, default: false },
    arquivado: { type: Boolean, default: false, index: true },
    dataArquivamento: Date,
    arquivadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' },
    revisoes: [
      {
        data: { type: Date, default: Date.now },
        alteradoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' },
        motivo: String,
        dados: mongoose.Schema.Types.Mixed
      }
    ],
    historicoStatus: [historicoStatusSchema]
  },
  {
    timestamps: true,
    optimisticConcurrency: true
  }
);

schema.pre('validate', function validarVigencia() {
  if (
    this.dataInicial &&
    this.dataFinal &&
    new Date(this.dataFinal) <= new Date(this.dataInicial)
  ) {
    this.invalidate('dataFinal', 'A data final deve ser posterior à data inicial.');
  }
});

export default mongoose.model('Convenio', schema);
