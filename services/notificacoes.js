import Notificacao from '../models/Notificacao.js';
import Usuario from '../models/Usuario.js';

export async function criarNotificacao({
  destinatario,
  titulo,
  mensagem,
  link = '/notificacoes',
  tipoEvento,
  referencia,
  chaveUnica,
  enviarPorEmail = true,
  intervaloMinimoDias = 0,
  referenciaTemporal = new Date()
}) {
  const referenciaNormalizada = referencia ? String(referencia) : undefined;
  if (intervaloMinimoDias > 0 && tipoEvento && referenciaNormalizada) {
    const limite = new Date(
      new Date(referenciaTemporal).getTime() - intervaloMinimoDias * 86400000
    );
    if (
      await Notificacao.exists({
        destinatario,
        tipoEvento,
        referencia: referenciaNormalizada,
        data: { $gte: limite }
      })
    )
      return { criada: false, duplicada: true, intervalo: true };
  }
  try {
    const notificacao = await Notificacao.create({
      destinatario,
      titulo,
      mensagem,
      link,
      tipoEvento,
      referencia: referenciaNormalizada,
      chaveUnica,
      email: { solicitado: enviarPorEmail, status: enviarPorEmail ? 'PENDENTE' : 'DESATIVADO' }
    });
    return { criada: true, notificacao };
  } catch (erro) {
    if (erro.code === 11000 && chaveUnica) return { criada: false, duplicada: true };
    throw erro;
  }
}
export async function criarNotificacoes(destinatarios, dados) {
  const resultados = [];
  for (const destinatario of [...new Set(destinatarios.map(String))])
    resultados.push(await criarNotificacao({ ...dados, destinatario }));
  return resultados;
}
export async function notificarAdministradores(dados) {
  return criarNotificacoes(
    await Usuario.find({ tipo: 'ADMIN', ativo: true }).distinct('_id'),
    dados
  );
}
