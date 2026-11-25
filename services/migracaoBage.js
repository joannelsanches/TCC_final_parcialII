import { regrasPpcConferido } from '../utils/ppcsBage.js';
import mongoose from '../config/conexao.js';
import { CAMPUS_BAGE_ID, NOME_CAMPUS, campusBageId } from '../utils/campus.js';
import Notificacao from '../models/Notificacao.js';

const normalizar = (valor) =>
  String(valor || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
export const identificarCampusBage = (campus) =>
  normalizar(campus.cidade) === 'bage' && /(?:^|\b)bage(?:\b|$)/.test(normalizar(campus.nome));

export async function migrarBage({ simular = true, db = mongoose.connection } = {}) {
  const campi = await db.collection('campus').find({}).toArray();
  const idsBage = campi.filter(identificarCampusBage).map((campus) => campus._id);
  const antigosBage = idsBage.filter((id) => String(id) !== CAMPUS_BAGE_ID);

  const colisoesCampus = campi.filter(
    (campus) =>
      String(campus._id) !== CAMPUS_BAGE_ID &&
      campus.nome === NOME_CAMPUS &&
      campus.cidade === 'Bagé'
  );
  const nomeHistorico = (campus) => `${campus.nome} (histórico: ${campus._id})`;
  const operacoes = [
    ...colisoesCampus.map((campus) => [
      'campus',
      { _id: campus._id },
      {
        $set: {
          nomeOrigem: campus.nome,
          nome: nomeHistorico(campus),
          ativo: false,
          historicoPreservado: true
        }
      }
    ]),
    [
      'campus',
      { _id: campusBageId() },
      { $set: { nome: NOME_CAMPUS, cidade: 'Bagé', ativo: true } },
      true
    ],
    ...['cursos', 'estudantes', 'vagas'].map((colecao) => [
      colecao,
      { campus: { $in: antigosBage } },
      [
        {
          $set: { campusOrigem: { $ifNull: ['$campusOrigem', '$campus'] }, campus: campusBageId() }
        }
      ]
    ]),
    ['empresas', { campus: { $exists: false } }, { $set: { campus: campusBageId() } }],
    [
      'campus',
      { _id: { $ne: campusBageId() }, ativo: { $ne: false } },
      { $set: { ativo: false, historicoPreservado: true } }
    ],
    [
      'cursos',
      { campus: { $ne: campusBageId(), $nin: antigosBage }, ativo: { $ne: false } },
      { $set: { ativo: false, foraEscopo: true } }
    ],
    [
      'estudantes',
      { campus: { $ne: campusBageId(), $nin: antigosBage }, matriculaRegular: { $ne: false } },
      { $set: { matriculaRegular: false, foraEscopo: true } }
    ],
    [
      'vagas',
      { campus: { $ne: campusBageId(), $nin: antigosBage }, arquivada: { $ne: true } },
      {
        $set: {
          arquivada: true,
          status: 'ARQUIVADA',
          motivoFechamento: 'Fora do escopo Campus Bagé; histórico preservado.'
        }
      }
    ]
  ];
  const relatorio = { simular, campus: NOME_CAMPUS, referencias: {}, alteracoes: [] };
  relatorio.campiHistoricosRenomeados = colisoesCampus.map((campus) => ({
    id: String(campus._id),
    nomeAnterior: campus.nome,
    nomeHistorico: nomeHistorico(campus)
  }));
  for (const colecao of ['cursos', 'estudantes', 'empresas', 'vagas']) {
    relatorio.referencias[colecao] = await db
      .collection(colecao)
      .aggregate([{ $group: { _id: '$campus', quantidade: { $sum: 1 } } }])
      .toArray();
  }

  const cursos = await db
    .collection('cursos')
    .find({ campus: { $in: [...idsBage, campusBageId()] } })
    .toArray();
  const nomes = new Set();
  for (const curso of cursos) {
    if (nomes.has(curso.nome))
      throw new Error(
        `Dois cursos de Bagé têm o mesmo nome (${curso.nome}). Revise os vínculos antes da migração.`
      );
    nomes.add(curso.nome);
  }
  for (const curso of cursos) {
    const regra = regrasPpcConferido(curso.nome);
    if (!regra) {
      (relatorio.ppcsPendentes ||= []).push({ id: String(curso._id), nome: curso.nome });
      continue;
    }
    const campos = Object.fromEntries(
      Object.entries(regra).map(([chave, valor]) => ['regrasEstagio.' + chave, valor])
    );
    const diferente = Object.entries(regra).some(([chave, valor]) =>
      valor instanceof Date
        ? new Date(curso.regrasEstagio?.[chave]).getTime() !== valor.getTime()
        : String(curso.regrasEstagio?.[chave] ?? '') !== String(valor)
    );
    if (diferente) operacoes.push(['cursos', { _id: curso._id }, { $set: campos }]);
  }
  for (const [colecao, filtro, update, upsert] of operacoes) {
    const quantidade = await db.collection(colecao).countDocuments(filtro);
    relatorio.alteracoes.push({ colecao, quantidade, criaCampus: Boolean(upsert && !quantidade) });
    if (!simular) {
      if (upsert) await db.collection(colecao).updateOne(filtro, update, { upsert: true });
      else await db.collection(colecao).updateMany(filtro, update);
    }
  }
  if (!simular) {
    for (const canal of ['email'])
      await db.collection('notificacaos').updateMany({ [`${canal}.status`]: { $exists: false } }, [
        {
          $set: {
            [`${canal}.status`]:
              canal === 'email'
                ? { $cond: [`$${canal}.enviado`, 'ACEITO', 'DESATIVADO'] }
                : 'DESATIVADO',
            [`${canal}.tentativas`]: 0,
            [`${canal}.solicitado`]: false
          }
        }
      ]);
    const indices = await Notificacao.collection.indexes().catch(() => []);
    if (indices.some((indice) => indice.name === 'chaveUnica_1'))
      await Notificacao.collection.dropIndex('chaveUnica_1');
    await Notificacao.createIndexes();
  }
  return relatorio;
}
