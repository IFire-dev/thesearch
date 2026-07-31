const bcrypt = require('bcryptjs');

// Checks submitted login credentials against .env values. The
// password is hashed (never stored in plaintext) — see the README
// for how to generate ADMIN_PASSWORD_HASH.
async function checkCredentials(username, password) {
  const expectedUsername = process.env.ADMIN_USERNAME;
  const expectedHash = process.env.ADMIN_PASSWORD_HASH;
  if (!expectedUsername || !expectedHash) return false;
  if (username !== expectedUsername) return false;
  return bcrypt.compare(password, expectedHash);
}

// Route guard for everything under /admin except the login page/
// endpoint themselves.
function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  res.redirect('/admin/login');
}

module.exports = { checkCredentials, requireAdmin };
