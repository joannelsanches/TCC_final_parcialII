import express from 'express';

import { verificarCsrf } from '../middlewares/csrf.js';
import AvaliacaoController from '../controllers/AvaliacaoController.js';
import { autenticado, autorizar } from '../middlewares/autenticacao.js';

const router = express.Router();
router.get('/avaliacoes', autenticado, AvaliacaoController.listar);
router.post(
  '/avaliacoes',
  autenticado,
  autorizar('ESTUDANTE', 'EMPRESA'),
  verificarCsrf,
  AvaliacaoController.criar
);
export default router;
