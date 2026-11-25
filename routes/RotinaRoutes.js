import express from 'express';

import RotinaController from '../controllers/RotinaController.js';

const router = express.Router();

router.get('/api/rotinas/atualizar-prazos', RotinaController.atualizarPrazos);
router.post('/api/rotinas/atualizar-prazos', RotinaController.atualizarPrazos);
router.get('/api/rotinas/notificacoes', RotinaController.notificacoes);
router.post('/api/rotinas/notificacoes', RotinaController.notificacoes);

export default router;
