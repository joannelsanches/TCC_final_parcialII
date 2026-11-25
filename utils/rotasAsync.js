export function envolverRotasAsync(router) {
  for (const layer of router.stack || []) {
    if (layer.route) {
      for (const handler of layer.route.stack) {
        const original = handler.handle;
        if (original.constructor.name === 'AsyncFunction')
          handler.handle = (req, res, next) =>
            Promise.resolve(original(req, res, next)).catch(next);
      }
    } else if (layer.handle?.stack) envolverRotasAsync(layer.handle);
    else if (layer.handle?.constructor.name === 'AsyncFunction') {
      const original = layer.handle;
      layer.handle = (req, res, next) => Promise.resolve(original(req, res, next)).catch(next);
    }
  }
  return router;
}
