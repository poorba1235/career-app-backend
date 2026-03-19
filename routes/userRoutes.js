const express = require("express");
const router = express.Router();
const User = require("../models/User");
const jwt = require("jsonwebtoken");

// Middleware to verify token
const verifyToken = (req, res, next) => {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ error: "Access denied" });

    try {
        const verified = jwt.verify(token, process.env.JWT_SECRET);
        req.user = verified;
        next();
    } catch (err) {
        res.status(400).json({ error: "Invalid token" });
    }
};

// Get User Profile
router.get("/profile", verifyToken, async (req, res) => {
    try {
        if (req.user.id === '507f1f77bcf86cd799439011') {
            return res.json({
                _id: '507f1f77bcf86cd799439011',
                name: 'Admin',
                email: process.env.ADMIN_EMAIL,
                role: 'admin',
                status: 'active'
            });
        }
        const user = await User.findById(req.user.id).select("-passwordHash");
        if (!user) return res.status(404).json({ error: "User not found" });
        res.json(user);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update User Profile (Visa, Education, etc.)
router.put("/update-profile", verifyToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const updates = req.body;

        const user = await User.findByIdAndUpdate(userId, updates, { new: true });
        res.json(user);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

const adminMiddleware = require("../middleware/adminMiddleware");

// Get All Users (Admin Only)
router.get("/all-users", verifyToken, adminMiddleware, async (req, res) => {
    try {
        const users = await User.find({}).select("-passwordHash");
        res.json(users);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update User Status (Admin Only)
router.put("/update-status/:id", verifyToken, adminMiddleware, async (req, res) => {
    try {
        const { status } = req.body;
        const user = await User.findByIdAndUpdate(req.params.id, { status }, { new: true }).select("-passwordHash");
        res.json(user);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// Get User Stats (Overview)
router.get("/stats", verifyToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const interviewCount = await require("../models/Interview").countDocuments({ userId });
        const cvCount = await require("../models/Cvs").countDocuments({ user: userId });

        // Get last interview score (only completed or scored ones)
        const lastInterview = await require("../models/Interview").findOne({
            userId,
            overallScore: { $exists: true, $ne: null }
        })
            .sort({ createdAt: -1 })
            .select('overallScore');

        res.json({
            interviewCount,
            cvCount,
            lastInterviewScore: lastInterview ? lastInterview.overallScore : null
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
