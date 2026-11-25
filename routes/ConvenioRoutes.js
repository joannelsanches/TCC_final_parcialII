import express from 'express';

import Convenio from '../models/Convenio.js';
import { gerenciarExclusoes } from '../middlewares/permissoes.js';
import { verificarCsrf } from '../middlewares/csrf.js';
import ConvenioController from '../controllers/ConvenioController.js';
import { autenticado, autorizar } from '../middlewares/autenticacao.js';
import { uploadDocumento } from '../config/upload.js';

const router = express.Router();
router.use(
  ['/admin/convenios/:id', '/empresa/convenios/:id'],
  autenticado,
  async (req, res, next) => {
    if (req.method !== 'POST') return next();
    try {
      const convenio = await Convenio.findById(req.params.id);
      if (convenio?.arquivado)
        return res.status(409).render('erro/403', {
          detalhe: 'Convênio arquivado: somente consulta e download do histórico são permitidos.'
        });
      return next();
    } catch (erro) {
      return next(erro);
    }
  }
);
router.get('/admin/convenios', autenticado, autorizar('ADMIN'), ConvenioController.listar);
router.post(
  '/admin/convenios',
  autenticado,
  autorizar('ADMIN'),
  uploadDocumento.fields([
    { name: 'documentoParaAssinatura', maxCount: 1 },
    { name: 'pdfAssinado', maxCount: 1 }
  ]),
  verificarCsrf,
  ConvenioController.salvar
);
router.get(
  '/admin/convenios/:id/editar',
  autenticado,
  autorizar('ADMIN'),
  ConvenioController.editarForm
);
router.post(
  '/admin/convenios/:id/editar',
  autenticado,
  autorizar('ADMIN'),
  uploadDocumento.fields([
    { name: 'documentoParaAssinatura', maxCount: 1 },
    { name: 'pdfAssinado', maxCount: 1 }
  ]),
  verificarCsrf,
  ConvenioController.editar
);
router.post(
  '/admin/convenios/:id/pdf',
  autenticado,
  autorizar('ADMIN'),
  uploadDocumento.single('pdfAssinado'),
  verificarCsrf,
  ConvenioController.atualizarDocumento
);
router.post(
  '/admin/convenios/:id/enviar-assinatura',
  autenticado,
  autorizar('ADMIN'),
  verificarCsrf,
  ConvenioController.enviarAssinatura
);
router.post(
  '/admin/convenios/:id/enviar-analise',
  autenticado,
  autorizar('ADMIN'),
  verificarCsrf,
  ConvenioController.enviarAnalise
);
router.post(
  '/admin/convenios/:id/status',
  autenticado,
  autorizar('ADMIN'),
  verificarCsrf,
  ConvenioController.status
);
router.post(
  '/admin/convenios/:id/excluir',
  autenticado,
  autorizar('ADMIN'),
  gerenciarExclusoes,
  verificarCsrf,
  ConvenioController.excluir
);
router.get(
  '/admin/convenios/:id',
  autenticado,
  autorizar('ADMIN'),
  ConvenioController.detalhesAdmin
);
router.get(
  '/empresa/convenios',
  autenticado,
  autorizar('EMPRESA'),
  ConvenioController.listarEmpresa
);
router.get(
  '/empresa/convenios/:id',
  autenticado,
  autorizar('EMPRESA'),
  ConvenioController.detalhesEmpresa
);
router.post(
  '/empresa/convenios/:id/documento-assinado',
  autenticado,
  autorizar('EMPRESA'),
  uploadDocumento.single('pdfAssinado'),
  verificarCsrf,
  ConvenioController.enviarDocumentoAssinado
);
router.get(
  '/convenios/:id/documento-assinatura',
  autenticado,
  ConvenioController.documentoParaAssinatura
);
router.get('/convenios/:id/pdf-assinado', autenticado, ConvenioController.pdfAssinado);
router.get('/convenios/:id/pdf', autenticado, ConvenioController.pdf);
router.get(
  '/convenios/:id/revisoes/:revisaoId/:tipo',
  autenticado,
  ConvenioController.documentoRevisao
);
export default router;
