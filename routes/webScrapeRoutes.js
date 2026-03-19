const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const WebScrape = require("../models/WebScrape");
const adminMiddleware = require("../middleware/adminMiddleware");

const verifyToken = (req, res, next) => {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ error: "Access denied" });

    try {
        const verified = jwt.verify(token, process.env.JWT_SECRET);
        req.user = verified;
        next();
    } catch (err) {
        res.status(400).json({ error: "Invalid Token" });
    }
};

// Get all URLs for the authenticated user (admin)
router.get("/urls", verifyToken, adminMiddleware, async (req, res) => {
    try {
        const urls = await WebScrape.find({})
            .sort({ createdAt: -1 });
        res.json(urls);
    } catch (error) {
        console.error("Error fetching URLs:", error);
        res.status(500).json({ error: "Failed to fetch URLs" });
    }
});

// Get all jobs from completed scrapes (accessible to all authenticated users)
router.get("/jobs", verifyToken, async (req, res) => {
    try {
        const scrapes = await WebScrape.find({
            status: 'completed'
        }).sort({ createdAt: -1 });

        // Flatten all jobs from all completed scrapes
        const allJobs = [];
        scrapes.forEach(scrape => {
            if (scrape.scrapedData && scrape.scrapedData.jobs) {
                scrape.scrapedData.jobs.forEach(job => {
                    // Convert Mongoose subdocument to plain object
                    const jobObj = job.toObject ? job.toObject() : job;
                    allJobs.push({
                        ...jobObj,
                        sourceUrl: scrape.url,
                        scrapedAt: scrape.createdAt
                    });
                });
            }
        });

        res.json(allJobs);
    } catch (error) {
        console.error("Error fetching scraped jobs:", error);
        res.status(500).json({ error: "Failed to fetch jobs" });
    }
});

// Re-scrape a specific URL by ID
router.post("/rescrape/:id", verifyToken, adminMiddleware, async (req, res) => {
    try {
        const { id } = req.params;

        // Find the URL record
        const webScrape = await WebScrape.findOne({
            _id: id
        });

        if (!webScrape) {
            return res.status(404).json({ error: "URL not found" });
        }

        // Update status to processing
        webScrape.status = 'processing';
        await webScrape.save();

        // Respond immediately
        res.json({ message: "Re-scraping started", data: webScrape });

        // Trigger scraping in background
        (async () => {
            try {
                // Call the scraping API
                const scrapeResponse = await fetch('http://127.0.0.1:8000/extract-jobs', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ url: webScrape.url })
                });

                if (scrapeResponse.ok) {
                    const scrapeData = await scrapeResponse.json();

                    // Check if the API response indicates success
                    if (scrapeData.success !== false) {
                        const newJobs = scrapeData.jobs || [];
                        const existingJobs = webScrape.scrapedData?.jobs || [];
                        const existingJobUrls = new Set(
                            existingJobs.filter(job => job.job_url).map(job => job.job_url)
                        );
                        const uniqueNewJobs = newJobs.filter(job => {
                            if (!job.job_url) {
                                const jobSignature = `${job.job_title}|${job.company}|${job.location}`.toLowerCase();
                                return !existingJobs.some(existingJob =>
                                    `${existingJob.job_title}|${existingJob.company}|${existingJob.location}`.toLowerCase() === jobSignature
                                );
                            }
                            return !existingJobUrls.has(job.job_url);
                        });
                        const allJobs = [...existingJobs, ...uniqueNewJobs];

                        webScrape.status = 'completed';
                        webScrape.scrapedData = {
                            total_jobs: allJobs.length,
                            jobs: allJobs
                        };
                        console.log(`Re-scrape complete: ${uniqueNewJobs.length} new jobs added`);
                    } else {
                        webScrape.status = 'failed';
                        webScrape.errorMessage = 'Re-scraping failed';
                    }
                } else {
                    webScrape.status = 'failed';
                    webScrape.errorMessage = `Scraping API returned status ${scrapeResponse.status}`;
                }
                await webScrape.save();
            } catch (error) {
                console.error("Error calling scraping API:", error);
                webScrape.status = 'failed';
                webScrape.errorMessage = error.message;
                await webScrape.save();
            }
        })();
    } catch (error) {
        console.error("Error re-scraping URL:", error);
        res.status(500).json({ error: "Failed to re-scrape URL" });
    }
});

// Add new URL and trigger scraping - Admin Only
router.post('/load', verifyToken, adminMiddleware, async (req, res) => {
    try {
        const { url } = req.body;
        if (!url) {
            return res.status(400).json({ error: "URL is required" });
        }

        try {
            new URL(url);
        } catch (e) {
            return res.status(400).json({ error: "Invalid URL format" });
        }

        const webScrape = new WebScrape({
            userId: req.user.id,
            url: url,
            status: 'processing'
        });

        await webScrape.save();

        // Respond immediately
        res.status(201).json({
            message: "URL added successfully. Processing will take approximately 1 minute.",
            data: webScrape
        });

        // Trigger scraping in background
        (async () => {
            try {
                const scrapeResponse = await fetch('http://127.0.0.1:8000/extract-jobs', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ url: url })
                });

                if (scrapeResponse.ok) {
                    const scrapeData = await scrapeResponse.json();
                    if (scrapeData.success !== false) {
                        webScrape.status = 'completed';
                        webScrape.scrapedData = {
                            total_jobs: scrapeData.total_jobs || 0,
                            jobs: scrapeData.jobs || []
                        };
                    } else {
                        webScrape.status = 'failed';
                        webScrape.errorMessage = 'Scraping failed';
                    }
                } else {
                    webScrape.status = 'failed';
                    webScrape.errorMessage = `Scraping API returned status ${scrapeResponse.status}`;
                }
                await webScrape.save();
            } catch (error) {
                console.error("Error calling scraping API:", error);
                webScrape.status = 'failed';
                webScrape.errorMessage = error.message;
                await webScrape.save();
            }
        })();

    } catch (error) {
        console.error("Error adding URL:", error);
        res.status(500).json({ error: "Failed to add URL" });
    }
});

// Delete a URL by ID (admin)
router.delete("/url/:id", verifyToken, adminMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const webScrape = await WebScrape.findOne({
            _id: id
        });

        if (!webScrape) {
            return res.status(404).json({ error: "URL not found" });
        }

        await WebScrape.deleteOne({ _id: id });
        res.json({ message: "URL deleted successfully" });
    } catch (error) {
        console.error("Error deleting URL:", error);
        res.status(500).json({ error: "Failed to delete URL" });
    }
});

module.exports = router;
