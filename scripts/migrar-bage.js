import 'dotenv/config';

import mongoose, { conectarBanco } from '../config/conexao.js';
import { migrarBage } from '../services/migracaoBage.js';
const simular = process.argv.includes('--simular');
try {
  await conectarBanco({ somenteLeitura: simular });
  console.log(JSON.stringify(await migrarBage({ simular }), null, 2));
} catch (erro) {
  console.error(erro.message);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
