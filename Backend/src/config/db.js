import mysql from 'mysql2/promise';
import Redis from 'ioredis';
import { env } from './env.js';

// MySQL Connection Pool
export const pool = mysql.createPool({
  uri: env.DATABASE_URL,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// Helper function for running queries easily
export const query = async (sql, params = []) => {
  const [rows] = await pool.execute(sql, params);
  return rows;
};

// Redis Client
export const redis = new Redis(env.REDIS_URL);

redis.on('error', (err) => {
  console.error('Redis connection error:', err.message);
});