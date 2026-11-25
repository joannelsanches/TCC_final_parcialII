import express from 'express';

import { verificarCsrf } from '../middlewares/csrf.js';
import CandidaturaController from '../controllers/CandidaturaController.js';
import { autenticado, autorizar } from '../middlewares/autenticacao.js';

const router = express.Router();
router.post(
  '/candidaturas/:vagaId',
  autenticado,
  autorizar('ESTUDANTE'),
  verificarCsrf,
  CandidaturaController.candidatar
);
router.post(
  '/estudante/candidaturas/:id/cancelar',
  autenticado,
  autorizar('ESTUDANTE'),
  verificarCsrf,
  CandidaturaController.cancelar
);
router.post(
  '/empresa/candidaturas/:id/status',
  autenticado,
  autorizar('EMPRESA'),
  verificarCsrf,
  CandidaturaController.atualizar
);
export default router;
