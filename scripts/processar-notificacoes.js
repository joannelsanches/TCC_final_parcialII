import 'dotenv/config';

import mongoose, { conectarBanco } from '../config/conexao.js';
import { processarFila, retomarNaoConfigurados } from '../services/filaNotificacoes.js';
await conectarBanco();
try {
  if (process.argv.includes('--retomar-nao-configurados'))
    console.log(JSON.stringify(await retomarNaoConfigurados()));
  console.log(JSON.stringify(await processarFila({ limite: 100, orcamentoMs: 55000 }), null, 2));
} finally {
  await mongoose.disconnect();
}
