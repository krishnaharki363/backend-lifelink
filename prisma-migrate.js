const { execSync } = require('child_process');

// Load environment variables for local testing
if (process.env.NODE_ENV !== 'production') {
  try {
    require('dotenv').config();
  } catch (e) {
    // Ignore if dotenv is not available
  }
}

let directUrl = process.env.DIRECT_URL;

if (!directUrl || directUrl.trim() === '') {
  const dbUrl = process.env.DATABASE_URL;
  if (dbUrl) {
    try {
      // Use URL constructor (available globally in Node)
      const url = new URL(dbUrl);
      if (url.hostname.includes('-pooler')) {
        url.hostname = url.hostname.replace('-pooler', '');
        url.searchParams.delete('pgbouncer');
        url.searchParams.delete('connection_limit');
        directUrl = url.toString();
        process.env.DIRECT_URL = directUrl;
        console.log('Automatically derived DIRECT_URL from DATABASE_URL for Neon PostgreSQL.');
      }
    } catch (e) {
      console.log('Failed to parse DATABASE_URL to derive DIRECT_URL:', e.message);
    }
  }
}

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
