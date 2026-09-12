const bcrypt = require('bcryptjs');

const password = process.argv[2];

if (!password) {
  console.error('Usage: npm run hash:password -- your-password');
  process.exitCode = 1;
} else {
  bcrypt.hash(password, 12).then(hash => {
    console.log(hash);
  });
}
