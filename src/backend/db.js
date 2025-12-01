// src/backend/db.js
import mysql from 'mysql2/promise';

const pool = mysql.createPool({
  host: 'database-estoquepremium.cr24k20qw9ew.us-east-2.rds.amazonaws.com',
  user: 'admin',
  password: 'Th3m!Hpao4s4hRPS',
  database: 'estoquepremium',
  port: 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

export default pool;
