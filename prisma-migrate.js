const { execSync } = require('child_process');

const directUrl = process.env.DIRECT_URL;
if (!directUrl || directUrl.trim() === '') {
  console.log('DIRECT_URL is empty or missing. Falling back to DATABASE_URL for migrations.');
  process.env.DIRECT_URL = process.env.DATABASE_URL;
}

try {
  console.log('Running database migrations...');
  execSync('npx prisma migrate deploy', { stdio: 'inherit' });
  console.log('Database migrations completed successfully.');
} catch (error) {
  console.error('Database migration failed:', error.message);
  process.exit(1);
}
