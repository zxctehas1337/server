// Standardize API responses
function success(res, data, statusCode = 200) {
  return res.status(statusCode).json({
    success: true,
    data
  });
}

function error(res, message, statusCode = 500, details = null) {
  return res.status(statusCode).json({
    success: false,
    error: message,
    ...(details && { details })
  });
}

// Common error responses
function badRequest(res, message = 'Bad request') {
  return error(res, message, 400);
}

function unauthorized(res, message = 'Unauthorized') {
  return error(res, message, 401);
}

function forbidden(res, message = 'Forbidden') {
  return error(res, message, 403);
}

function notFound(res, message = 'Not found') {
  return error(res, message, 404);
}

function conflict(res, message = 'Conflict') {
  return error(res, message, 409);
}

function serverError(res, message = 'Internal server error') {
  return error(res, message, 500);
}

module.exports = {
  success,
  error,
  badRequest,
  unauthorized,
  forbidden,
  notFound,
  conflict,
  serverError
};
