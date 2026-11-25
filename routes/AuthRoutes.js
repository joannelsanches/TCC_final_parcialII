import express from 'express';

import { verificarCsrf } from '../middlewares/csrf.js';
import AuthController from '../controllers/AuthController.js';
import GoogleAuthController from '../controllers/GoogleAuthController.js';
import { autenticado, visitante } from '../middlewares/autenticacao.js';
import { uploadLogoEmpresa } from '../config/upload.js';

const router = express.Router();
router.get('/auth/google', visitante, GoogleAuthController.entrar);
router.get('/auth/google/callback', GoogleAuthController.callback);
router.get('/auth/google/completar', visitante, GoogleAuthController.completarForm);
router.post('/auth/google/completar', visitante, verificarCsrf, GoogleAuthController.completar);
router.get('/conta/acesso', autenticado, GoogleAuthController.conta);
router.post('/conta/google/vincular', autenticado, verificarCsrf, GoogleAuthController.vincular);
router.get('/login', visitante, AuthController.loginForm);
router.post('/login', visitante, verificarCsrf, AuthController.entrar);
router.post('/logout', verificarCsrf, AuthController.sair);
router.get('/cadastro', visitante, AuthController.escolhaCadastro);
router.get('/cadastro/estudante', visitante, AuthController.cadastroEstudanteForm);
router.post('/cadastro/estudante', visitante, verificarCsrf, AuthController.cadastrarEstudante);
router.get('/cadastro/empresa', visitante, AuthController.cadastroEmpresaForm);
router.post(
  '/cadastro/empresa',
  visitante,
  uploadLogoEmpresa.single('logo'),
  verificarCsrf,
  AuthController.cadastrarEmpresa
);
export default router;
