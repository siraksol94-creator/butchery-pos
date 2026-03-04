const pool = require('./config/database');
const bcrypt = require('bcrypt');

async function seedAdmin() {
  try {
    const hash = await bcrypt.hash('admin123', 10);
    
    // Update the existing placeholder user
    await pool.query(
      `UPDATE users SET password = $1 WHERE email = 'john.doe@butchery.com'`,
      [hash]
    );
    console.log('Updated john.doe@butchery.com password to: admin123');

    // Also create admin@butcherypro.com
    const result = await pool.query(
      `INSERT INTO users (first_name, last_name, email, password, phone, role, permissions, status)
       VALUES ('Admin', 'User', 'admin@butcherypro.com', $1, '+1 555-0100', 'Administrator', '{All Access}', 'Active')
       ON CONFLICT (email) DO UPDATE SET password = $1
       RETURNING id, email`,
      [hash]
    );
    console.log('Created/Updated admin@butcherypro.com with password: admin123');
    console.log(result.rows);
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await pool.end();
  }
}

seedAdmin();
