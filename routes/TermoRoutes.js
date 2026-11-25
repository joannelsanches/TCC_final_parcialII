import express from 'express';

import { gerenciarExclusoes } from '../middlewares/permissoes.js';
import { verificarCsrf } from '../middlewares/csrf.js';
import TermoController from '../controllers/TermoController.js';
import { uploadDocumento } from '../config/upload.js';
import { autenticado, autorizar } from '../middlewares/autenticacao.js';

const router = express.Router();
router.get('/termos', autenticado, TermoController.listar);
router.post(
  '/termos',
  autenticado,
  autorizar('ESTUDANTE'),
  verificarCsrf,
  TermoController.solicitar
);
router.post(
  '/termos/:id/documentos',
  autenticado,
  autorizar('ESTUDANTE'),
  uploadDocumento.single('documento'),
  verificarCsrf,
  TermoController.enviarDocumento
);
router.post(
  '/termos/:id/tce-assinado',
  autenticado,
  autorizar('ESTUDANTE'),
  uploadDocumento.single('tceAssinado'),
  verificarCsrf,
  TermoController.enviarTceAssinado
);
router.post(
  '/termos/:id/enviar-analise',
  autenticado,
  autorizar('ESTUDANTE'),
  verificarCsrf,
  TermoController.enviarAnalise
);
router.get('/termos/documentos/:documentoId', autenticado, TermoController.documento);
router.get('/termos/:id/tce-assinado', autenticado, TermoController.tceAssinado);
router.post(
  '/termos/:id/analisar',
  autenticado,
  autorizar('ADMIN'),
  verificarCsrf,
  TermoController.analisar
);
router.post(
  '/termos/:id/iniciar',
  autenticado,
  autorizar('ADMIN'),
  verificarCsrf,
  TermoController.iniciar
);
router.post(
  '/termos/:id/documentos/:documentoId/validar',
  autenticado,
  autorizar('ADMIN'),
  verificarCsrf,
  TermoController.validarDocumento
);
router.post(
  '/termos/:id/encerrar',
  autenticado,
  autorizar('ADMIN'),
  verificarCsrf,
  TermoController.encerrar
);
router.post(
  '/termos/:id/rescindir',
  autenticado,
  autorizar('ADMIN'),
  verificarCsrf,
  TermoController.rescindir
);
router.post(
  '/termos/:id/corrigir',
  autenticado,
  autorizar('ESTUDANTE'),
  verificarCsrf,
  TermoController.corrigirRascunho
);
router.post(
  '/termos/:id/aditivos',
  autenticado,
  autorizar('ADMIN'),
  gerenciarExclusoes,
  uploadDocumento.fields([
    { name: 'aditivo', maxCount: 1 },
    { name: 'autorizacao', maxCount: 1 },
    { name: 'apolice', maxCount: 1 }
  ]),
  verificarCsrf,
  TermoController.registrarAditivo
);
export default router;
