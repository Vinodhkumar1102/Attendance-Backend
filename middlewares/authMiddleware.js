const jwt = require('jsonwebtoken');

const revokedTokens = new Set();

const getTokenFromRequest = request => {
  const authorization = request.headers.authorization || '';
  return authorization.startsWith('Bearer ')
    ? authorization.slice(7)
    : request.query.token || null;
};

const revokeToken = token => {
  if (token) {
    revokedTokens.add(token);
  }
};

const authMiddleware = (request, response, next) => {
  const token = getTokenFromRequest(request);

  if (!token || revokedTokens.has(token)) {
    return response.status(401).json({message: 'Authentication token is missing or revoked'});
  }

  try {
    request.admin = jwt.verify(token, process.env.JWT_SECRET);
    return next();
  } catch (error) {
    return response.status(401).json({message: 'Invalid or expired token'});
  }
};

module.exports = {authMiddleware, getTokenFromRequest, revokeToken};
