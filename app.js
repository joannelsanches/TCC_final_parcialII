import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import express from 'express';
import session from 'express-session';

import routes from './routes/index.js';
import { formatarCep, formatarEndereco, formatarLocalizacaoResumida } from './utils/endereco.js';
import { formatarNomeProprio } from './utils/formatacao.js';
import { montarLinhaTempoEstagio } from './utils/processoEstagio.js';
import { montarChecklistDocumentos } from './utils/documentosTermo.js';
import Notificacao from './models/Notificacao.js';
import { prepararCsrf, protegerCsrf } from './middlewares/csrf.js';
import RotinaRoutes from './routes/RotinaRoutes.js';
import { MongoSessionStore } from './services/sessoes.js';
import { envolverRotasAsync } from './utils/rotasAsync.js';
import { podeGerenciarExclusoes } from './middlewares/permissoes.js';
import { carregarUsuario } from './services/autenticacao.js';
import { avatarDoUsuario } from './services/avatar.js';

const app = express();
const __dirname = dirname(fileURLToPath(import.meta.url));
const segredoSessao = process.env.SESSION_SECRET;

if (process.env.NODE_ENV === 'production' && !segredoSessao) {
  throw new Error('SESSION_SECRET é obrigatória em produção.');
}

app.disable('x-powered-by');
if (process.env.NODE_ENV === 'production') app.set('trust proxy', 1);
app.set('view engine', 'ejs');
app.set('views', join(__dirname, 'views'));
Object.assign(app.locals, {
  usuarioLogado: null,
  avatarUsuario: {},
  mensagem: null,
  notificacoesNaoLidas: 0
});

app.use(envolverRotasAsync(RotinaRoutes));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(join(__dirname, 'public')));
app.use(
  session({
    store: process.env.MONGODB_URI ? new MongoSessionStore() : undefined,
    secret: segredoSessao || 'somente-desenvolvimento-troque-no-env',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 1000 * 60 * 60 * 8
    }
  })
);
app.use(carregarUsuario);
app.use(prepararCsrf);

app.use(async (req, res, next) => {
  try {
    res.locals.usuarioLogado = req.session.usuario || null;
    res.locals.avatarUsuario = await avatarDoUsuario(req.usuario);
    res.locals.googleCadastro = null;
    res.locals.podeGerenciarExclusoes = podeGerenciarExclusoes(req.session.usuario);
    res.locals.mensagem = req.session.mensagem || null;
    res.locals.erros = {};
    res.locals.valores = {};
    res.locals.formatarData = (data) =>
      data ? new Date(data).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '—';
    res.locals.formatarMoeda = (valor) =>
      Number(valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    res.locals.formatarEndereco = formatarEndereco;
    res.locals.formatarLocalizacaoResumida = formatarLocalizacaoResumida;
    res.locals.formatarCep = formatarCep;
    res.locals.formatarNomeProprio = formatarNomeProprio;
    res.locals.montarLinhaTempoEstagio = montarLinhaTempoEstagio;
    res.locals.montarChecklistDocumentos = montarChecklistDocumentos;
    res.locals.iniciais = (nome = '') =>
      nome
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((parte) => parte[0]?.toUpperCase())
        .join('') || 'SI';
    res.locals.notificacoesNaoLidas = req.session.usuario
      ? await Notificacao.countDocuments({ destinatario: req.session.usuario.id, lida: false })
      : 0;
    delete req.session.mensagem;
    next();
  } catch (erro) {
    next(erro);
  }
});

app.use(protegerCsrf);
app.use(envolverRotasAsync(routes));
app.use((req, res) => res.status(404).render('erro/404'));
app.use((erro, req, res, next) => {
  console.error(erro);
  const texto =
    erro.code === 'LIMIT_FILE_SIZE'
      ? 'O arquivo ultrapassa o limite permitido.'
      : erro.message || 'Não foi possível concluir a operação.';
  const status =
    erro.status ||
    (erro.name === 'VersionError'
      ? 409
      : erro.name === 'MulterError' ||
          erro.name === 'CastError' ||
          ['LIMIT_FILE_SIZE', 'ARQUIVO_INVALIDO'].includes(erro.code)
        ? 400
        : 500);
  return res.status(status).render('erro/500', { erro: texto });
});

export default app;
