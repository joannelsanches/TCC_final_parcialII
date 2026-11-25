import { existsSync, unlinkSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';

import { bucketArquivos, referenciaGridfs } from '../services/armazenamento.js';

export function pastaUpload(nome) {
  return resolve(process.cwd(), 'uploads', nome);
}

export function caminhoPertenceAPasta(caminho, nomePasta) {
  if (!caminho) return false;
  if (String(caminho).startsWith('gridfs:')) return Boolean(referenciaGridfs(caminho, nomePasta));
  const base = pastaUpload(nomePasta);
  const arquivo = resolve(caminho);
  const relativo = relative(base, arquivo);
  return Boolean(relativo && !relativo.startsWith('..') && !isAbsolute(relativo));
}

export function removerArquivoSeguro(caminho, nomePasta) {
  if (!caminhoPertenceAPasta(caminho, nomePasta)) return false;
  const id = referenciaGridfs(caminho, nomePasta);
  if (id)
    return bucketArquivos()
      .delete(id)
      .then(
        () => true,
        () => false
      );
  const arquivo = resolve(caminho);
  if (!existsSync(arquivo)) return true;
  try {
    unlinkSync(arquivo);
    return true;
  } catch (erro) {
    console.error(
      `Não foi possível remover um arquivo da pasta ${nomePasta}: ${erro.code || 'ERRO'}`
    );
    return false;
  }
}

export function arquivoSeguroExiste(caminho, nomePasta) {
  if (!caminhoPertenceAPasta(caminho, nomePasta)) return false;
  const id = referenciaGridfs(caminho, nomePasta);
  if (id) return bucketArquivos().find({ _id: id, 'metadata.pasta': nomePasta }).hasNext();
  return existsSync(resolve(caminho));
}

export async function servirArquivo(res, arquivo, pasta, { download = true, privado = true } = {}) {
  if (!arquivo?.caminho || !(await arquivoSeguroExiste(arquivo.caminho, pasta)))
    return res.status(404).end();
  res.setHeader('Cache-Control', privado ? 'private, no-store' : 'public, max-age=300');
  const id = referenciaGridfs(arquivo.caminho, pasta);
  if (!id)
    return download
      ? res.download(resolve(arquivo.caminho), arquivo.nomeOriginal)
      : res.sendFile(resolve(arquivo.caminho));
  res.type(arquivo.mimetype || 'application/octet-stream');
  if (download) res.attachment(arquivo.nomeOriginal || 'documento.pdf');
  bucketArquivos()
    .openDownloadStream(id)
    .on('error', (erro) => res.destroy(erro))
    .pipe(res);
}

export function metadadosUpload(arquivo) {
  if (!arquivo) return undefined;
  return {
    caminho: arquivo.path,
    nomeOriginal: arquivo.originalname,
    mimetype: arquivo.mimetype,
    tamanho: arquivo.size,
    dataEnvio: new Date()
  };
}
