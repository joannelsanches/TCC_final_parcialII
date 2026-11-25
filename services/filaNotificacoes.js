import { randomUUID } from 'node:crypto';
import Notificacao from '../models/Notificacao.js';
import Usuario from '../models/Usuario.js';
import Vaga from '../models/Vaga.js';
import Estudante from '../models/Estudante.js';
import { filtroVagasPublicas } from './vagas.js';
import { campusBageId } from '../utils/campus.js';
import { canalPermitido } from '../utils/preferenciasNotificacao.js';
import { enviarEmail, smtpConfigurado } from './emailService.js';

export const MAX_TENTATIVAS = 3;

export function estadoDoResultado(resultado, tentativa) {
  if (resultado.aceito || resultado.enviado) return 'ACEITO';
  if (resultado.naoConfigurado) return 'NAO_CONFIGURADO';
  if (resultado.incerto) return 'INCERTO';
  return resultado.retentavel && tentativa < MAX_TENTATIVAS ? 'FALHA_RETRY' : 'FALHA';
}

async function ofertaAindaCompativel(notificacao, agora) {
  const estudante = await Estudante.findOne({
    usuario: notificacao.destinatario,
    campus: campusBageId()
  }).select('curso');
  return Boolean(
    estudante &&
    (await Vaga.exists({
      _id: notificacao.referencia,
      ...filtroVagasPublicas(agora),
      cursosCompativeis: estudante.curso
    }))
  );
}

export async function processarFila({
  limite = 20,
  agora = new Date(),
  orcamentoMs = 20000,
  emailSender = enviarEmail
} = {}) {
  const inicio = Date.now();
  const resultados = { processadas: 0, email: {} };
  await Notificacao.updateMany(
    { 'email.status': 'PROCESSANDO', 'email.bloqueadoAte': { $lte: agora } },
    {
      $set: {
        'email.status': 'INCERTO',
        'email.erro': 'Execução interrompida. Conferir o provedor antes de reenviar.'
      },
      $unset: { 'email.lockId': '', 'email.bloqueadoAte': '' },
      $push: {
        'email.historico': {
          $each: [
            {
              status: 'INCERTO',
              data: agora,
              erro: 'Resultado do processamento anterior não confirmado.'
            }
          ],
          $slice: -30
        }
      }
    }
  );
  const quantidade = Math.min(Math.max(Number(limite) || 20, 1), 100);
  for (let i = 0; i < quantidade && Date.now() - inicio < orcamentoMs; i++) {
    const lockId = randomUUID();
    const notificacao = await Notificacao.findOneAndUpdate(
      {
        'email.status': { $in: ['PENDENTE', 'FALHA_RETRY'] },
        'email.tentativas': { $lt: MAX_TENTATIVAS },
        'email.proximaTentativa': { $lte: agora }
      },
      {
        $set: {
          'email.status': 'PROCESSANDO',
          'email.lockId': lockId,
          'email.ultimaTentativa': agora,
          'email.bloqueadoAte': new Date(agora.getTime() + 120000)
        },
        $inc: { 'email.tentativas': 1 }
      },
      { new: true, sort: { data: 1 } }
    );
    if (!notificacao) break;
    const usuario = await Usuario.findById(notificacao.destinatario);
    let resposta, status;
    if (!canalPermitido(usuario, 'email', notificacao.email.solicitado)) status = 'DESATIVADO';
    else if (
      notificacao.tipoEvento === 'VAGA_APROVADA' &&
      !(await ofertaAindaCompativel(notificacao, agora))
    )
      status = 'CANCELADO';
    else {
      await Notificacao.updateOne(
        { _id: notificacao._id, 'email.lockId': lockId },
        { $set: { 'email.destino': usuario.email } }
      );
      try {
        resposta = await emailSender({
          para: usuario.email,
          assunto: notificacao.titulo,
          mensagem: notificacao.mensagem,
          link: notificacao.link,
          messageId: `<${notificacao._id}@startif.local>`
        });
      } catch {
        resposta = { incerto: true, erro: 'Resultado externo não confirmado.' };
      }
      status = estadoDoResultado(resposta, notificacao.email.tentativas);
    }
    const campos = {
      'email.status': status,
      'email.erro': resposta?.erro || '',
      'email.proximaTentativa': new Date(
        agora.getTime() + 60000 * 5 ** notificacao.email.tentativas
      )
    };
    if (resposta?.messageId) campos['email.messageId'] = resposta.messageId;
    if (status === 'ACEITO') {
      campos['email.enviado'] = true;
      campos['email.dataEnvio'] = new Date();
    }
    await Notificacao.updateOne(
      { _id: notificacao._id, 'email.lockId': lockId, 'email.status': 'PROCESSANDO' },
      {
        $set: campos,
        $unset: { 'email.lockId': '', 'email.bloqueadoAte': '' },
        $push: {
          'email.historico': {
            $each: [{ status, data: new Date(), erro: resposta?.erro }],
            $slice: -30
          }
        }
      }
    );
    resultados.processadas++;
    resultados.email[status] = (resultados.email[status] || 0) + 1;
  }
  return resultados;
}

export async function retomarNaoConfigurados() {
  if (!smtpConfigurado()) return { email: 'NAO_CONFIGURADO' };
  const resultado = await Notificacao.updateMany(
    { 'email.status': 'NAO_CONFIGURADO' },
    {
      $set: {
        'email.status': 'PENDENTE',
        'email.tentativas': 0,
        'email.proximaTentativa': new Date()
      }
    }
  );
  return { email: resultado.modifiedCount };
}
