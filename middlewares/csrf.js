import { randomBytes, timingSafeEqual } from 'node:crypto';

import { removerArquivoSeguro } from '../utils/arquivos.js';

export function tokensIguais(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
}

export function prepararCsrf(req, res, next) {
  req.session.csrfToken ||= randomBytes(32).toString('hex');
  res.locals.csrfToken = req.session.csrfToken;
  next();
}

export async function verificarCsrf(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (tokensIguais(req.session.csrfToken, req.body?._csrf || req.headers['x-csrf-token']))
    return next();
  const arquivos = [req.file, ...Object.values(req.files || {}).flat()].filter(Boolean);
  for (const arquivo of arquivos) {
    const pasta = arquivo.destination?.split('/').at(-1) || arquivo.pasta;
    if (pasta) await removerArquivoSeguro(arquivo.path, pasta);
  }
  return res.status(403).render('erro/403', {
    detalhe: 'A confirmação de segurança expirou. Atualize a página e tente novamente.'
  });
}

export function protegerCsrf(req, res, next) {
  if (req.is('multipart/form-data')) return next();
  return verificarCsrf(req, res, next);
}
