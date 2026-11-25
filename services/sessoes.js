import session from 'express-session';

import mongoose from '../config/conexao.js';

export class MongoSessionStore extends session.Store {
  get collection() {
    return mongoose.connection.collection('sessoes');
  }
  get(sid, callback) {
    this.collection
      .findOne({ _id: sid, expiraEm: { $gt: new Date() } })
      .then((doc) => callback(null, doc?.sessao || null), callback);
  }
  set(sid, sessao, callback = () => {}) {
    const expiraEm = sessao.cookie.expires
      ? new Date(sessao.cookie.expires)
      : new Date(Date.now() + 28800000);
    this.collection
      .updateOne({ _id: sid }, { $set: { sessao, expiraEm } }, { upsert: true })
      .then(() => callback(), callback);
  }
  destroy(sid, callback = () => {}) {
    this.collection.deleteOne({ _id: sid }).then(() => callback(), callback);
  }
  touch(sid, sessao, callback = () => {}) {
    this.collection
      .updateOne({ _id: sid }, { $set: { expiraEm: new Date(sessao.cookie.expires) } })
      .then(() => callback(), callback);
  }
}
