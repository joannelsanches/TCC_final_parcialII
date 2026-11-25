import express from 'express';

import { verificarCsrf } from '../middlewares/csrf.js';
import NotificacaoController from '../controllers/NotificacaoController.js';
import { autenticado, autorizar } from '../middlewares/autenticacao.js';

const router = express.Router();
router.get('/notificacoes', autenticado, NotificacaoController.listar);
router.post('/notificacoes/:id/ler', autenticado, verificarCsrf, NotificacaoController.ler);
router.post(
  '/notificacoes/marcar-todas-lidas',
  autenticado,
  verificarCsrf,
  NotificacaoController.marcarTodasLidas
);
router.get(
  '/admin/notificacoes',
  autenticado,
  autorizar('ADMIN'),
  NotificacaoController.formularioAdmin
);
router.post(
  '/admin/notificacoes',
  autenticado,
  autorizar('ADMIN'),
  verificarCsrf,
  NotificacaoController.enviar
);
export default router;
