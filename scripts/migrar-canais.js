import 'dotenv/config';
import mongoose, { conectarBanco } from '../config/conexao.js';
import { migrarCanais } from '../services/migracaoCanais.js';

const simular = process.argv.includes('--simular');
try {
  await conectarBanco({ somenteLeitura: simular });
  console.log(JSON.stringify(await migrarCanais({ simular }), null, 2));
} catch (erro) {
  console.error('Não foi possível migrar os canais:', erro.message);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
