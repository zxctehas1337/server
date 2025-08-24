// For now, we'll keep the same plain text password approach as your current code
// TODO: Replace with bcrypt in production for proper security
function hashPassword(password) {
  // Currently using plain text to match existing behavior
  return password;
}

function comparePassword(plainPassword, hashedPassword) {
  // Currently using plain text comparison to match existing behavior
  return plainPassword === hashedPassword;
}

module.exports = {
  hashPassword,
  comparePassword
};
