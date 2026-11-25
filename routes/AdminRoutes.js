import express from 'express';

import { verificarCsrf } from '../middlewares/csrf.js';
import AdminController from '../controllers/AdminController.js';
import { autenticado, autorizar } from '../middlewares/autenticacao.js';

const router = express.Router();
router.use('/admin', autenticado, autorizar('ADMIN'));
router.get('/admin', AdminController.painel);
router.get('/admin/usuarios', AdminController.usuarios);
router.post('/admin/usuarios/:id/alternar', verificarCsrf, AdminController.alternarUsuario);
router.post('/admin/usuarios/:id/matricula', verificarCsrf, AdminController.alternarMatricula);
router.get('/admin/empresas', AdminController.empresas);
router.post('/admin/empresas/:id/status', verificarCsrf, AdminController.statusEmpresa);
router.get('/admin/cadastros', AdminController.cadastros);
router.get('/admin/areas', AdminController.areas);
router.post('/admin/areas', verificarCsrf, AdminController.criarArea);
router.get('/admin/areas/:id/editar', AdminController.editarAreaForm);
router.post('/admin/areas/:id/editar', verificarCsrf, AdminController.atualizarArea);
router.get('/admin/cursos', AdminController.cursos);
router.post('/admin/cursos', verificarCsrf, AdminController.criarCurso);
router.get('/admin/cursos/:id/editar', AdminController.editarCursoForm);
router.post('/admin/cursos/:id/editar', verificarCsrf, AdminController.atualizarCurso);
router.post('/admin/cursos/:id', verificarCsrf, AdminController.atualizarCurso);
router.post('/admin/cadastros/:tipo/:id/alternar', verificarCsrf, AdminController.alternarCadastro);
router.post('/admin/cadastros/:tipo/:id/excluir', verificarCsrf, AdminController.excluirCadastro);
router.get('/admin/relatorios', AdminController.relatorios);
export default router;
