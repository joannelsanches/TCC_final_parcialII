import mongoose from 'mongoose';

function mensagensDoErro(erro) {
  const erros = [erro, erro?.cause, erro?.reason?.error];
  for (const servidor of erro?.reason?.servers?.values?.() || []) {
    erros.push(servidor.error, servidor.error?.cause);
  }
  return erros
    .filter(Boolean)
    .map((item) => String(item.code || '') + ' ' + String(item.message || ''))
    .join(' ');
}

export function mensagemFalhaMongo(erro) {
  if (erro?.code === 'MONGODB_CONFIGURACAO') return erro.message;
  const texto = mensagensDoErro(erro);
  if (/AuthenticationFailed|bad auth|authentication failed|\b18\b/i.test(texto))
    return 'O MongoDB recusou a autenticação. Confira o usuário, a senha e as permissões da conexão em MONGODB_URI.';
  if (/ECONNREFUSED/i.test(texto))
    return 'A conexão com o MongoDB foi recusada. Se usa um banco local, inicie o servidor mongod. Se usa Atlas, confira se MONGODB_URI aponta para o cluster, em vez do endereço local. Consulte docs/BANCO.md.';
  if (/ENOTFOUND|querySrv|EAI_AGAIN|ENODATA/i.test(texto))
    return 'Não foi possível localizar o servidor MongoDB. Confira o endereço do cluster e a resolução DNS da rede.';
  if (/not authorized|Unauthorized|\b13\b/i.test(texto))
    return 'O usuário MongoDB não tem as permissões necessárias. Confira o acesso à base e a criação dos índices da aplicação.';
  if (/certificate|TLS|SSL|CERT_/i.test(texto))
    return 'Não foi possível validar a conexão TLS com o MongoDB. Confira os certificados, a data do computador e os requisitos do provedor.';
  if (
    /timeout|timed out|ETIMEDOUT|ServerSelection|ReplicaSetNoPrimary/i.test(
      texto + ' ' + erro?.name
    )
  )
    return 'O MongoDB não respondeu dentro do limite de conexão. Confira o servidor, o replica set e a liberação de acesso da rede ao cluster.';
  return 'Não foi possível conectar ao MongoDB. Confira MONGODB_URI e as orientações em docs/BANCO.md. Os detalhes da conexão foram omitidos para proteger as credenciais.';
}

function erroConfiguracao(mensagem) {
  const erro = new Error(mensagem);
  erro.code = 'MONGODB_CONFIGURACAO';
  return erro;
}

export async function conectarBanco({
  somenteLeitura = false,
  tempoLimiteMs = Number(process.env.MONGODB_TIMEOUT_MS || 15000)
} = {}) {
  const uri = process.env.MONGODB_URI?.trim();
  if (!uri)
    throw erroConfiguracao(
      'Configure MONGODB_URI no .env ou no ambiente de implantação. Consulte .env.example e docs/BANCO.md.'
    );
  if (!/^mongodb(?:\+srv)?:\/\/\S+$/.test(uri))
    throw erroConfiguracao(
      'MONGODB_URI inválida. Informe uma conexão mongodb:// ou mongodb+srv:// sem espaços.'
    );
  if (!Number.isInteger(tempoLimiteMs) || tempoLimiteMs < 1000 || tempoLimiteMs > 60000)
    throw erroConfiguracao(
      'MONGODB_TIMEOUT_MS deve ser um número inteiro entre 1000 e 60000 milissegundos.'
    );
  try {
    console.log('Conectando ao MongoDB...');
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: tempoLimiteMs,
      connectTimeoutMS: tempoLimiteMs,
      ...(somenteLeitura ? { autoIndex: false, autoCreate: false } : {})
    });
    const servidor = await mongoose.connection.db.command({ hello: 1 });
    if (!somenteLeitura && !servidor.setName && servidor.msg !== 'isdbgrid')
      throw erroConfiguracao(
        'O MongoDB está em modo standalone. O StartIF utiliza transações: configure um replica set, como rs0, ou use Atlas. Consulte docs/BANCO.md.'
      );
    if (!somenteLeitura)
      await mongoose.connection
        .collection('sessoes')
        .createIndex({ expiraEm: 1 }, { expireAfterSeconds: 0 });
    console.log('MongoDB conectado.');
  } catch (erro) {
    await mongoose.disconnect().catch(() => {});
    const publico = new Error(mensagemFalhaMongo(erro));
    publico.code = 'MONGODB_CONEXAO';
    throw publico;
  }
}

export default mongoose;
