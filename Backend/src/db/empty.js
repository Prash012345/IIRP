import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function emptyDb() {
  const connection = await mysql.createConnection({
    uri: env.DATABASE_URL,
    multipleStatements: true,
  });

  try {
    console.log('Dropping and recreating schema...');
    const schemaSql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    await connection.query(schemaSql);

    console.log('Creating default admin user...');
    const passwordHash = await bcrypt.hash('password123', 10);
    await connection.execute(
      `INSERT INTO users (name, email, password_hash, role, title) VALUES 
       ('John', 'admin@incident.io', ?, 'ADMIN', 'Admin')`,
      [passwordHash]
    );

    console.log('Database is now completely empty!');
    console.log('   Login with: admin@incident.io / password123');
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await connection.end();
    process.exit(0);
  }
}

emptyDb();