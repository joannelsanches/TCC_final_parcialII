import Vaga from '../models/Vaga.js';
import Candidatura from '../models/Candidatura.js';
import Termo from '../models/TermoCompromisso.js';
import Estudante from '../models/Estudante.js';
import Avaliacao from '../models/Avaliacao.js';
import Notificacao from '../models/Notificacao.js';
import { removerArquivoSeguro } from '../utils/arquivos.js';
import { campusBageId } from '../utils/campus.js';
import { inicioDoDiaInstitucional } from '../utils/datas.js';

export const filtroVagasPublicas = (data = new Date()) => ({
  status: 'ABERTA',
  arquivada: { $ne: true },
  campus: campusBageId(),
  prazo: { $gte: inicioDoDiaInstitucional(data) }
});

export async function excluirOuArquivarVaga(vaga, usuarioId) {
  const atual = await Vaga.findOneAndUpdate(
    { _id: vaga._id, arquivada: { $ne: true } },
    {
      $set: {
        arquivada: true,
        status: 'ARQUIVADA',
        dataArquivamento: new Date(),
        arquivadaPor: usuarioId
      },
      $inc: { __v: 1 },
      $push: {
        historicoStatus: {
          status: 'ARQUIVADA',
          alteradoPor: usuarioId,
          data: new Date(),
          observacao: 'Retirada das ofertas; verificação de histórico.'
        }
      }
    },
    { new: true }
  );
  if (!atual)
    return {
      tipo: 'ja_arquivada',
      mensagem: 'A vaga já foi retirada ou alterada. Atualize a página.'
    };
  const ids = await Candidatura.find({ vaga: vaga._id }).distinct('_id');
  const [termos, historicos, avaliacoes] = await Promise.all([
    Termo.countDocuments({ candidatura: { $in: ids } }),
    Estudante.countDocuments({ 'historicoEstagios.vaga': vaga._id }),
    Avaliacao.countDocuments({ vaga: vaga._id })
  ]);
  if (ids.length || termos || historicos || avaliacoes) {
    return {
      tipo: 'arquivada',
      mensagem:
        'Vaga arquivada: candidaturas, termos e documentos permanecem no histórico. Novas candidaturas estão bloqueadas.'
    };
  }

  const avisos = await Notificacao.countDocuments({ referencia: String(vaga._id) });
  if (avisos)
    return {
      tipo: 'arquivada',
      mensagem:
        'Vaga arquivada para preservar as notificações anteriores. Ela não recebe novas candidaturas.'
    };
  const removida = await Vaga.deleteOne({ _id: vaga._id, arquivada: true, __v: atual.__v });
  if (!removida.deletedCount)
    return {
      tipo: 'arquivada',
      mensagem: 'A vaga mudou durante a operação e foi mantida arquivada. Atualize a página.'
    };
  if (vaga.imagem?.caminho) await removerArquivoSeguro(vaga.imagem.caminho, 'vagas');
  return {
    tipo: 'excluida',
    mensagem: 'Vaga excluída definitivamente. Não havia processos vinculados.'
  };
}
