import mongoose from '../config/conexao.js';

const canalSchema = new mongoose.Schema(
  {
    solicitado: { type: Boolean, default: true },
    enviado: { type: Boolean, default: false },
    status: {
      type: String,
      enum: [
        'PENDENTE',
        'PROCESSANDO',
        'ACEITO',
        'ENVIADO',
        'ENTREGUE',
        'LIDO',
        'FALHA_RETRY',
        'FALHA',
        'NAO_CONFIGURADO',
        'DESATIVADO',
        'INCERTO',
        'CANCELADO'
      ],
      default: 'PENDENTE'
    },
    tentativas: { type: Number, default: 0 },
    proximaTentativa: { type: Date, default: Date.now },
    ultimaTentativa: Date,
    bloqueadoAte: Date,
    lockId: String,
    messageId: { type: String, index: true },
    destino: String,
    dataEnvio: Date,
    dataEntrega: Date,
    dataLeitura: Date,
    erro: String,
    historico: [
      { status: String, data: { type: Date, default: Date.now }, erro: String, _id: false }
    ]
  },
  { _id: false }
);

const schema = new mongoose.Schema(
  {
    destinatario: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Usuario',
      required: true
    },
    titulo: {
      type: String,
      required: true,
      trim: true
    },
    mensagem: {
      type: String,
      required: true,
      trim: true
    },
    lida: {
      type: Boolean,
      default: false
    },
    data: {
      type: Date,
      default: Date.now
    },
    link: {
      type: String,
      trim: true
    },
    dataLeitura: Date,
    tipoEvento: { type: String, trim: true },
    referencia: { type: String, trim: true },
    chaveUnica: { type: String, trim: true },
    email: { type: canalSchema, default: () => ({}) }
  },
  {
    timestamps: true
  }
);

schema.index(
  { destinatario: 1, chaveUnica: 1 },
  { unique: true, partialFilterExpression: { chaveUnica: { $type: 'string' } } }
);
schema.index({ 'email.status': 1, 'email.proximaTentativa': 1 });

export default mongoose.model('Notificacao', schema);
