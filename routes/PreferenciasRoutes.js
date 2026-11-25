import express from 'express';

import { verificarCsrf } from '../middlewares/csrf.js';
import { autenticado } from '../middlewares/autenticacao.js';
import PreferenciasController from '../controllers/PreferenciasController.js';

const router = express.Router();
router.get('/preferencias/notificacoes', autenticado, PreferenciasController.formulario);
router.post(
  '/preferencias/notificacoes',
  autenticado,
  verificarCsrf,
  PreferenciasController.salvar
);
export default router;
