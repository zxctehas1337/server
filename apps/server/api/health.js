const { success } = require('../utils/response');

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  return success(res, {
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'browser-messenger'
  });
}
