import { randomBytes } from 'node:crypto';
import { OAuth2Client } from 'google-auth-library';
import { tokensIguais } from '../middlewares/csrf.js';
import { TIPOS_CADASTRO_GOOGLE } from '../utils/cadastroGoogle.js';

export const DURACAO_AUTENTICACAO_GOOGLE_MS = 10 * 60 * 1000;

export function googleConfigurado() {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      process.env.GOOGLE_CALLBACK_URL
  );
}

export function criarClienteGoogle() {
  if (!googleConfigurado()) throw new Error('O login com Google está indisponível no momento.');
  const callback = new URL(process.env.GOOGLE_CALLBACK_URL);
  if (
    callback.protocol !== 'https:' &&
    !(callback.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(callback.hostname))
  ) {
    throw new Error('A URL de retorno do Google precisa usar HTTPS ou localhost.');
  }
  return new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    callback.href
  );
}

export function fotoGoogleValida(valor) {
  try {
    const url = new URL(valor);
    return url.protocol === 'https:' &&
      /^lh[3-6]\.googleusercontent\.com$/.test(url.hostname) &&
      !url.username &&
      !url.password
      ? url.href
      : '';
  } catch {
    return '';
  }
}

export async function prepararAutenticacaoGoogle({
  intencao = 'LOGIN',
  usuarioId,
  tipoCadastro,
  cliente = criarClienteGoogle(),
  agora = Date.now()
} = {}) {
  if (tipoCadastro !== undefined && !TIPOS_CADASTRO_GOOGLE.includes(tipoCadastro)) {
    throw new Error('Escolha estudante ou empresa para criar sua conta.');
  }
  const { codeVerifier, codeChallenge } = await cliente.generateCodeVerifierAsync();
  const transacao = {
    state: randomBytes(32).toString('hex'),
    nonce: randomBytes(32).toString('hex'),
    codeVerifier,
    criadaEm: agora,
    intencao,
    usuarioId,
    tipoCadastro
  };
  const url = cliente.generateAuthUrl({
    scope: ['openid', 'email', 'profile'],
    response_type: 'code',
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    state: transacao.state,
    nonce: transacao.nonce,
    prompt: 'select_account'
  });
  return { url, transacao };
}

export function conferirRetornoGoogle(query, transacao, agora = Date.now()) {
  if (
    !transacao ||
    !tokensIguais(query.state, transacao.state) ||
    !Number.isFinite(transacao.criadaEm) ||
    agora - transacao.criadaEm > DURACAO_AUTENTICACAO_GOOGLE_MS ||
    agora < transacao.criadaEm
  ) {
    throw new Error('A tentativa de login expirou ou não foi reconhecida. Inicie novamente.');
  }
  if (query.error)
    throw new Error(
      query.error === 'access_denied'
        ? 'O acesso com Google foi cancelado.'
        : 'O Google não autorizou o acesso. Tente novamente.'
    );
  if (typeof query.code !== 'string' || !query.code)
    throw new Error('O Google não retornou um código de autenticação válido.');
}

export async function validarIdentidadeGoogle(
  code,
  transacao,
  { cliente = criarClienteGoogle() } = {}
) {
  const { tokens } = await cliente.getToken({
    code,
    codeVerifier: transacao.codeVerifier,
    redirect_uri: process.env.GOOGLE_CALLBACK_URL
  });
  if (!tokens.id_token) throw new Error('O Google não retornou a identidade da conta.');
  const ticket = await cliente.verifyIdToken({
    idToken: tokens.id_token,
    audience: process.env.GOOGLE_CLIENT_ID
  });
  const identidade = ticket.getPayload();
  if (
    !identidade ||
    typeof identidade.sub !== 'string' ||
    !identidade.sub ||
    identidade.email_verified !== true ||
    typeof identidade.email !== 'string' ||
    !identidade.email ||
    !['https://accounts.google.com', 'accounts.google.com'].includes(identidade.iss) ||
    identidade.aud !== process.env.GOOGLE_CLIENT_ID ||
    !Number.isFinite(identidade.exp) ||
    identidade.exp * 1000 <= Date.now() ||
    !tokensIguais(identidade.nonce, transacao.nonce)
  ) {
    throw new Error('Não foi possível confirmar a identidade e o e-mail da conta Google.');
  }
  return {
    sub: identidade.sub,
    email: identidade.email.trim().toLowerCase(),
    nome: String(identidade.name || identidade.email).slice(0, 150),
    foto: fotoGoogleValida(identidade.picture)
  };
}
