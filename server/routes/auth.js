const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Joi = require('joi');
const db = require('../db');

// Predetermined list of valid batch years — keep this in sync with the
// frontend's BATCHES list in Auth.jsx.
const CURRENT_YEAR = new Date().getFullYear();
const VALID_BATCHES = Array.from({ length: 8 }, (_, i) => (CURRENT_YEAR - 1 - i).toString());

// Joi Validation Schema for Registration
const registerSchema = Joi.object({
  name: Joi.string().min(2).max(255).trim().required(),
  email: Joi.string().email().trim().lowercase().required(),
  password: Joi.string().min(6).max(100).required(),
  batch: Joi.string()
    .valid(...VALID_BATCHES)
    .required()
    .messages({
      'any.only': `Batch must be between: ${Math.min(...VALID_BATCHES)} and ${Math.max(...VALID_BATCHES)}`
    }),
  dept_code: Joi.string().max(10).trim().required()
});

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(6).max(100).required()
});

router.post('/register', async (req, res) => {
  try {
    // 1. Validate Input with Joi
    const { error, value } = registerSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ message: error.details[0].message });
    }

    const { name, email, password, batch, dept_code } = value;

    // 2. Check if User Already Exists
    const userCheck = await db.query('SELECT * FROM Users WHERE email = $1', [email]);
    if (userCheck.rows.length > 0) {
      return res.status(400).json({ message: 'User with this email already exists' });
    }

    // 3. Hash Password
    const saltRounds = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // 4. Insert New User into Database using dept_code
    const newUser = await db.query(
      `INSERT INTO Users (name, email, password, batch, dept_code) 
       VALUES ($1, $2, $3, $4, $5) 
       RETURNING user_id, name, email, batch, role, dept_code`,
      [name, email, hashedPassword, batch, dept_code]
    );

    const user = newUser.rows[0];

    // 5. Generate JWT Token
    const token = jwt.sign(
      { user_id: user.user_id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    // 6. Send Response
    res.status(201).json({
      message: 'User registered successfully',
      token,
      user
    });

  } catch (err) {
    console.error('Registration Error:', err);
    res.status(500).json({ message: 'Server error during registration' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { error, value } = loginSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ message: error.details[0].message });
    }

    const { email, password } = value;
    const result = await db.query('SELECT * FROM Users WHERE email = $1', [email]);
    const user = result.rows[0];

    // If no user found, halt early
    if (!user) {
      return res.status(400).json({ message: 'Invalid email or password' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid password or password' });
    }

    const token = jwt.sign(
      { user_id: user.user_id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Send response back to React
    return res.status(200).json({
      message: 'Login successful',
      token,
      user: {
        user_id: user.user_id,
        name: user.name,
        email: user.email,
        batch: user.batch,
        role: user.role,
        dept_code: user.dept_code
      }
    });
  } catch (err) {
    console.error('Login Error:', err);
    res.status(500).json({ message: 'Server error during login' });
  }
});

module.exports = router;