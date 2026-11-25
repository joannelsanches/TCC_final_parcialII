import { pipeline } from 'node:stream/promises';

import mongoose from '../config/conexao.js';

export function bucketArquivos() {
  if (!mongoose.connection.db)
    throw new Error('MongoDB precisa estar conectado para acessar arquivos.');
  return new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: 'arquivosStartif' });
}
export function referenciaGridfs(caminho, pasta) {
  const match = /^gridfs:([a-z]+):([a-f0-9]{24})$/i.exec(String(caminho || ''));
  return match && match[1] === pasta ? new mongoose.Types.ObjectId(match[2]) : null;
}
export class GridfsStorage {
  constructor(pasta) {
    this.pasta = pasta;
  }
  _handleFile(req, arquivo, callback) {
    const stream = bucketArquivos().openUploadStream(arquivo.originalname, {
      metadata: { pasta: this.pasta, mimetype: arquivo.mimetype }
    });
    pipeline(arquivo.stream, stream).then(
      () =>
        callback(null, {
          path: `gridfs:${this.pasta}:${stream.id}`,
          pasta: this.pasta,
          size: stream.length
        }),
      async (erro) => {
        await bucketArquivos()
          .delete(stream.id)
          .catch(() => {});
        callback(erro);
      }
    );
  }
  _removeFile(req, arquivo, callback) {
    const id = referenciaGridfs(arquivo.path, this.pasta);
    if (!id) return callback(null);
    bucketArquivos()
      .delete(id)
      .then(() => callback(null), callback);
  }
}
