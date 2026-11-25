import 'dotenv/config';

import mongoose, { conectarBanco } from '../config/conexao.js';
import { inicializarDadosInstitucionais } from '../services/dadosInstitucionais.js';

try {
  await conectarBanco();
  const { campus, area, curso } = await inicializarDadosInstitucionais();
  console.log(`Dados institucionais disponíveis: ${campus.nome}, ${area.nome}, ${curso.nome}.`);
} catch (erro) {
  console.error(`Não foi possível inicializar os dados institucionais: ${erro.message}`);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
