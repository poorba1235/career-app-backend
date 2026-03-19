const express = require('express');
const router = express.Router();
const multer = require('multer');
const cvService = require('../services/cvService');
const fs = require('fs');
const path = require('path');
const { generateAnalysisPDF } = require('../utils/pdfGenerator');
const jwt = require('jsonwebtoken');
const CV = require('../models/Cvs');
// Configure Multer for memory storage
const storage = multer.memoryStorage();

const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/pdf') {
            cb(null, true);
        } else {
            cb(new Error('Only PDF files are allowed!'), false);
        }
    }
});



// Middleware to verify token (copied from userRoutes - usually should be in a shared middleware file)
const verifyToken = (req, res, next) => {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ error: "Access denied. Please login." });

    try {
        const verified = jwt.verify(token, process.env.JWT_SECRET);
        req.user = verified;
        next();
    } catch (err) {
        res.status(400).json({ error: "Invalid token" });
    }
};

// POST /api/cv/analyze
router.post('/analyze', verifyToken, upload.single('cv'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No CV file uploaded.' });
        }

        // 1. Extract and Analyze Text directly from RAM Buffer
        const fileBuffer = req.file.buffer;
        let analysis;
        try {
            console.log("Analyzing CV...");
            analysis = await cvService.analyzeCV(fileBuffer);
        } catch (error) {
            console.error("CV Service Analysis Error:", error.message);
            return res.status(500).json({
                error: 'Failed to analyze CV',
                details: error.message
            });
        }

        // 2. Generate PDF Report entirely in RAM (This comment is duplicated from the original, but kept as per instruction)
        const reportBuffer = await generateAnalysisPDF(analysis);

        // 3. Save result and RAW Byte Buffers to DB
        const newCV = new CV({
            user: req.user.id,
            fileName: req.file.originalname,
            fileText: analysis.summary,
            cvPdfData: fileBuffer,
            analysisPdfData: reportBuffer,
            analysisResult: analysis
        });

        await newCV.save();

        // 4. Generate local API URLs that stream the buffers
        const cvDownloadUrl = `/api/cv/download/cv/${newCV._id}`;
        const reportDownloadUrl = `/api/cv/download/report/${newCV._id}`;

        newCV.cvFilePath = cvDownloadUrl;
        newCV.analysisPdfPath = reportDownloadUrl;
        await newCV.save();

        // Return analysis + custom stream URLs
        res.json({
            ...analysis,
            cvFilePath: cvDownloadUrl,
            reportPath: reportDownloadUrl
        });

    } catch (error) {
        console.error("CV Analysis Error:", error);
        res.status(500).json({ error: error.message || 'Failed to analyze CV' });
    }
});

// GET /api/cv/history
router.get('/history', verifyToken, async (req, res) => {
    try {
        const cvs = await CV.find({ user: req.user.id })
            .sort({ createdAt: -1 })
            .select('-cvPdfData -analysisPdfData'); // Exclude heavy buffers!

        res.json(cvs);
    } catch (error) {
        console.error("Error fetching CV history:", error);
        res.status(500).json({ error: "Failed to fetch CV history" });
    }
});

// GET stream raw original CV PDF
router.get('/download/cv/:id', async (req, res) => {
    try {
        const cv = await CV.findById(req.params.id);
        if (!cv || !cv.cvPdfData) return res.status(404).send('CV File Not Found');

        res.set('Content-Type', 'application/pdf');
        res.send(cv.cvPdfData);
    } catch (e) {
        res.status(500).send('Server Error fetching CV stream');
    }
});

// GET stream raw generated AI Report PDF
router.get('/download/report/:id', async (req, res) => {
    try {
        const cv = await CV.findById(req.params.id);
        if (!cv || !cv.analysisPdfData) return res.status(404).send('Report File Not Found');

        res.set('Content-Type', 'application/pdf');
        res.send(cv.analysisPdfData);
    } catch (e) {
        res.status(500).send('Server Error fetching Report stream');
    }
});

module.exports = router;
