import express from 'express';

import { verificarCsrf } from '../middlewares/csrf.js';
import { gerenciarExclusoes } from '../middlewares/permissoes.js';
import VagaController from '../controllers/VagaController.js';
import { autenticado, autorizar } from '../middlewares/autenticacao.js';
import { uploadImagemVaga } from '../config/upload.js';

const router = express.Router();
router.get('/vagas', VagaController.listar);
router.get('/vagas/:id', VagaController.detalhes);
router.get('/empresa/vagas', autenticado, autorizar('EMPRESA'), VagaController.minhas);
router.get('/empresa/vagas/nova', autenticado, autorizar('EMPRESA'), VagaController.formulario);
router.post(
  '/empresa/vagas/nova',
  autenticado,
  autorizar('EMPRESA'),
  uploadImagemVaga.single('imagem'),
  verificarCsrf,
  VagaController.criar
);
router.get(
  '/empresa/vagas/:id/editar',
  autenticado,
  autorizar('EMPRESA'),
  VagaController.formulario
);
router.post(
  '/empresa/vagas/:id/editar',
  autenticado,
  autorizar('EMPRESA'),
  uploadImagemVaga.single('imagem'),
  verificarCsrf,
  VagaController.editar
);
router.post(
  '/empresa/vagas/:id/situacao',
  autenticado,
  autorizar('EMPRESA'),
  verificarCsrf,
  VagaController.alterarSituacao
);
router.post(
  '/empresa/vagas/:id/reabrir',
  autenticado,
  autorizar('EMPRESA'),
  verificarCsrf,
  VagaController.reabrir
);
router.post(
  '/empresa/vagas/:id/duplicar',
  autenticado,
  autorizar('EMPRESA'),
  verificarCsrf,
  VagaController.duplicar
);
router.post(
  '/empresa/vagas/:id/excluir',
  autenticado,
  autorizar('EMPRESA'),
  verificarCsrf,
  VagaController.excluir
);
router.post(
  '/admin/vagas/:id/excluir',
  autenticado,
  autorizar('ADMIN'),
  gerenciarExclusoes,
  verificarCsrf,
  VagaController.excluir
);
router.post(
  '/empresa/vagas/:id/rascunho/excluir',
  autenticado,
  autorizar('EMPRESA'),
  verificarCsrf,
  VagaController.excluirRascunho
);
router.post(
  '/empresa/vagas/:id/imagem/remover',
  autenticado,
  autorizar('EMPRESA'),
  verificarCsrf,
  VagaController.removerImagem
);
router.get('/admin/vagas', autenticado, autorizar('ADMIN'), VagaController.pendentes);
router.post(
  '/admin/vagas/:id/validar',
  autenticado,
  autorizar('ADMIN'),
  verificarCsrf,
  VagaController.validar
);
export default router;
