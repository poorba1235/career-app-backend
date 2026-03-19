const User = require("../models/User");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

// SIGNUP
exports.signup = async (data) => {
  const existingUser = await User.findOne({ email: data.email });
  if (existingUser) {
    throw new Error("User already exists");
  }

  const passwordHash = await bcrypt.hash(data.password, 10);

  const user = await User.create({
    ...data,
    passwordHash,
  });

  const token = jwt.sign(
    { id: user._id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: "1d" }
  );

  return { user, token };
};

// LOGIN
exports.login = async (email, password) => {
  // Check for Env Admin
  if (email === process.env.ADMIN_EMAIL && password === process.env.ADMIN_PSW) {
    const token = jwt.sign(
      { id: '507f1f77bcf86cd799439011', role: 'admin' },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );
    return {
      user: {
        _id: '507f1f77bcf86cd799439011',
        name: 'Admin',
        email: process.env.ADMIN_EMAIL,
        role: 'admin',
        status: 'active'
      },
      token
    };
  }

  const user = await User.findOne({ email });
  if (!user) {
    throw new Error("Invalid credentials");
  }

  if (user.status === 'hold') {
    throw new Error("Account is on hold");
  }

  const isMatch = await bcrypt.compare(password, user.passwordHash);
  if (!isMatch) {
    throw new Error("Invalid credentials");
  }

  const token = jwt.sign(
    { id: user._id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: "1d" }
  );

  return { user, token };
};

// FORGOT PASSWORD (basic version)
// FORGOT PASSWORD
exports.forgotPassword = async (email) => {
  const user = await User.findOne({ email });
  if (!user) {
    throw new Error("User not found");
  }

  // Generate Reset Token
  const crypto = require('crypto');
  const resetToken = crypto.randomBytes(20).toString('hex');

  // Hash token and set to resetPasswordToken field
  user.resetPasswordToken = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');

  // Set expire
  user.resetPasswordExpire = Date.now() + 10 * 60 * 1000; // 10 minutes

  await user.save();

  // Create reset URL
  const resetUrl = `http://localhost:5173/reset-password/${resetToken}`;

  const message = `
    You are receiving this email because you (or someone else) has requested the reset of a password.
    Please make a PUT request to: \n\n ${resetUrl}
  `;

  try {
    const nodemailer = require('nodemailer');

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Password Reset Token',
      text: message,
    });

    return "Email sent";
  } catch (err) {
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    await user.save({ validateBeforeSave: false });
    throw new Error("Email could not be sent");
  }
};

// RESET PASSWORD
exports.resetPassword = async (resetToken, newPassword) => {
  const crypto = require('crypto');

  // Get hashed token
  const resetPasswordToken = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');

  const user = await User.findOne({
    resetPasswordToken,
    resetPasswordExpire: { $gt: Date.now() },
  });

  if (!user) {
    throw new Error("Invalid token");
  }

  // Set new password
  user.passwordHash = await bcrypt.hash(newPassword, 10);
  user.resetPasswordToken = undefined;
  user.resetPasswordExpire = undefined;
  await user.save();

  return "Password updated successfully";
};
