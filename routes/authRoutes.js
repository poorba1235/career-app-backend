const express = require("express");
const router = express.Router();
const authService = require("../services/authService");

// SIGNUP
router.post("/signup", async (req, res) => {
  try {
    const user = await authService.signup(req.body);
    res.status(201).json(user);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// LOGIN
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    console.log(email, password);
    const result = await authService.login(email, password);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// FORGOT PASSWORD
// FORGOT PASSWORD
router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;
    const message = await authService.forgotPassword(email);
    res.json({ message });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// RESET PASSWORD
router.put("/reset-password/:resetToken", async (req, res) => {
  try {
    const { resetToken } = req.params;
    const { password } = req.body;
    console.log(resetToken);
    const message = await authService.resetPassword(resetToken, password);
    res.json({ message });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
