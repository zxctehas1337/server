const db = require('./utils/db');
const hash = require('./utils/hash');
const response = require('./utils/response');

module.exports = {
  db,
  hash,
  response,
  // Export utility functions
  init: () => require('./scripts/init-db'),
  migrate: () => require('./scripts/migrate-db'),
  reset: () => require('./scripts/reset-db')
};
