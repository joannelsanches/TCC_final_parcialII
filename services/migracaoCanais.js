import { createHash } from 'node:crypto';
import mongoose from '../config/conexao.js';
import Usuario from '../models/Usuario.js';
import Notificacao from '../models/Notificacao.js';

export async function migrarCanais({ simular = true } = {}) {
  const relatorio = { simular, usuarios: 0, notificacoes: 0, indices: 0 };
  const historico = mongoose.connection.collection('historicoCanaisRemovidos');
  const camposPermitidos = new Set(
    Object.keys(Notificacao.schema.paths).map((campo) => campo.split('.')[0])
  );
  camposPermitidos.add('__v');
  const existe = await mongoose.connection.db
    .listCollections({ name: Notificacao.collection.collectionName })
    .hasNext();
  const indices = existe ? await Notificacao.collection.indexes() : [];
  const camposDoCanal = new Set(Object.keys(Notificacao.schema.path('email').schema.paths));
  const canaisRemovidos = new Set();
  for (const indice of indices) {
    for (const campo of Object.keys(indice.key)) {
      const [raiz, ...partes] = campo.split('.');
      if (!camposPermitidos.has(raiz) && partes.length && camposDoCanal.has(partes.join('.')))
        canaisRemovidos.add(raiz);
    }
  }

  async function removerCampos(colecao, registro, removidos, atualizacao) {
    const chave = createHash('sha256')
      .update(
        JSON.stringify({ colecao: colecao.collectionName, id: String(registro._id), removidos })
      )
      .digest('hex');
    await mongoose.connection.transaction(async (session) => {
      await historico.updateOne(
        { _id: chave },
        {
          $setOnInsert: {
            colecao: colecao.collectionName,
            registro: registro._id,
            campos: removidos,
            data: new Date()
          }
        },
        { upsert: true, session }
      );
      const filtro = { _id: registro._id, ...Object.fromEntries(Object.entries(removidos)) };
      const alterado = await colecao.updateOne(filtro, atualizacao, { session });
      if (!alterado.matchedCount)
        throw new Error('Um registro mudou durante a migração. Execute a rotina novamente.');
    });
  }

  for await (const usuario of Usuario.collection.find({
    preferenciasNotificacao: { $type: 'object' }
  })) {
    const antigas = usuario.preferenciasNotificacao;
    const removidos = Object.fromEntries(
      Object.entries(antigas)
        .filter(([campo]) => campo !== 'email')
        .map(([campo, valor]) => ['preferenciasNotificacao.' + campo, valor])
    );
    if (!Object.keys(removidos).length) continue;
    relatorio.usuarios++;
    if (!simular)
      await removerCampos(Usuario.collection, usuario, removidos, {
        $unset: Object.fromEntries(Object.keys(removidos).map((c) => [c, '']))
      });
  }
  for await (const notificacao of Notificacao.collection.find({})) {
    const removidos = Object.fromEntries(
      Object.entries(notificacao).filter(([campo, valor]) => {
        if (camposPermitidos.has(campo)) return false;
        const possuiEstruturaDeCanal =
          valor &&
          typeof valor === 'object' &&
          typeof valor.status === 'string' &&
          ('tentativas' in valor || 'historico' in valor || 'solicitado' in valor);
        if (possuiEstruturaDeCanal) canaisRemovidos.add(campo);
        return canaisRemovidos.has(campo);
      })
    );
    if (!Object.keys(removidos).length) continue;
    relatorio.notificacoes++;
    if (!simular)
      await removerCampos(Notificacao.collection, notificacao, removidos, {
        $unset: Object.fromEntries(Object.keys(removidos).map((c) => [c, '']))
      });
  }
  for (const indice of indices) {
    if (
      indice.name !== '_id_' &&
      Object.keys(indice.key).some((campo) => canaisRemovidos.has(campo.split('.')[0]))
    ) {
      relatorio.indices++;
      if (!simular) await Notificacao.collection.dropIndex(indice.name);
    }
  }
  return relatorio;
}
