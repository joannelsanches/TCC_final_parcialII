import 'dotenv/config';

import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { basename } from 'node:path';

import mongoose, { conectarBanco } from '../config/conexao.js';
import { caminhoPertenceAPasta } from '../utils/arquivos.js';
const simular = process.argv.includes('--simular');
const relatorio = { simular, convertidos: 0, ausentes: [], ignorados: 0 };
function caminhos(obj, prefixo = '') {
  const resultado = [];
  for (const [key, value] of Object.entries(obj || {})) {
    const campo = prefixo ? prefixo + '.' + key : key;
    if (key === 'caminho' && typeof value === 'string') resultado.push([campo, value]);
    else if (
      value &&
      typeof value === 'object' &&
      !(value instanceof Date) &&
      !(value instanceof mongoose.Types.ObjectId)
    )
      resultado.push(...caminhos(value, campo));
  }
  return resultado;
}
try {
  await conectarBanco({ somenteLeitura: simular });
  const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
    bucketName: 'arquivosStartif'
  });
  for (const colecao of ['empresas', 'estudantes', 'vagas', 'convenios', 'termocompromissos']) {
    for await (const registro of mongoose.connection.collection(colecao).find({})) {
      for (const [campo, caminho] of caminhos(registro)) {
        if (caminho.startsWith('gridfs:')) continue;
        const pasta = ['empresas', 'estudantes', 'vagas', 'documentos', 'curriculos'].find((p) =>
          caminhoPertenceAPasta(caminho, p)
        );
        if (!pasta) {
          relatorio.ignorados++;
          continue;
        }
        try {
          await stat(caminho);
        } catch {
          relatorio.ausentes.push({ colecao, id: String(registro._id), campo });
          continue;
        }
        relatorio.convertidos++;
        if (simular) continue;
        const origem = `${colecao}:${registro._id}:${campo}:${caminho}`;
        let arquivo = await bucket.find({ 'metadata.origem': origem }).next();
        if (!arquivo) {
          const stream = bucket.openUploadStream(basename(caminho), {
            metadata: { pasta, origem }
          });
          await pipeline(createReadStream(caminho), stream);
          arquivo = { _id: stream.id };
        }
        await mongoose.connection
          .collection(colecao)
          .updateOne(
            { _id: registro._id, [campo]: caminho },
            { $set: { [campo]: `gridfs:${pasta}:${arquivo._id}` } }
          );
      }
    }
  }
  console.log(JSON.stringify(relatorio, null, 2));
  if (relatorio.ausentes.length) process.exitCode = 2;
} finally {
  await mongoose.disconnect();
}
