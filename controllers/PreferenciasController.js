import Usuario from '../models/Usuario.js';
import Notificacao from '../models/Notificacao.js';
import { preferenciasDoFormulario } from '../utils/preferenciasNotificacao.js';
import { smtpConfigurado } from '../services/emailService.js';
import { mensagem } from '../utils/mensagens.js';

export default class PreferenciasController {
  static async formulario(req, res) {
    const usuario = await Usuario.findById(req.session.usuario.id);
    return res.render('preferencias/notificacoes', {
      usuario,
      smtp: smtpConfigurado()
    });
  }
  static async salvar(req, res) {
    const usuario = await Usuario.findById(req.session.usuario.id);
    try {
      const preferencias = preferenciasDoFormulario(
        req.body,
        usuario.preferenciasNotificacao?.toObject() || {}
      );
      usuario.preferenciasNotificacao = preferencias;
      await usuario.save();
      for (const canal of ['email'])
        if (!preferencias[canal])
          await Notificacao.updateMany(
            {
              destinatario: usuario._id,
              [`${canal}.status`]: { $in: ['PENDENTE', 'FALHA_RETRY', 'NAO_CONFIGURADO'] }
            },
            { $set: { [`${canal}.status`]: 'DESATIVADO' } }
          );
      mensagem(
        req,
        'sucesso',
        'Preferências salvas. As notificações internas continuam disponíveis.'
      );
      return res.redirect('/preferencias/notificacoes');
    } catch (erro) {
      return res.status(422).render('preferencias/notificacoes', {
        usuario,
        valores: req.body,
        erros: { geral: erro.message },
        smtp: smtpConfigurado()
      });
    }
  }
}
