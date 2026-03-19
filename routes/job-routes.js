const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const jobService = require("../services/jobService");

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

// Search for jobs using SERPER API with Caching
router.get("/search", verifyToken, async (req, res) => {
    try {
        const { query, location } = req.query;
        console.log("Job search query:", query);
        console.log("Job search location:", location);
        const result = await jobService.searchJobs(query, location);
        res.json(result);
    } catch (error) {
        console.error("Job search error:", error);
        res.status(500).json({ error: error.message || "Failed to fetch jobs" });
    }
});

// Get Recommended Jobs based on User Profile
router.get("/recommendations", verifyToken, async (req, res) => {
    try {
        const User = require("../models/User");
        const Jobwebscrapes = require("../models/WebScrape");

        // 1. Get User Profile
        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ error: "User not found" });

        const { rolesInterest, locations } = user;
        const roles = rolesInterest?.roles || [];
        const userLocations = locations || [];

        console.log("DEBUG: User ID:", req.user.id);
        console.log("DEBUG: User Roles:", roles);
        console.log("DEBUG: User Locations:", userLocations);

        if (roles.length === 0) {
            console.log("DEBUG: No role preferences set, returning empty.");
            return res.json([]); // No role preferences set
        }

        // 2. Build Aggregation Pipeline for WebScrape
        console.log("DEBUG: Using WebScrape model for aggregation.");

        // Define match criteria
        const matchStage = {
            $or: []
        };

        // Add regex matches for job_title (was title in Job model)
        // User requested NO location matching, so we only use roles.
        if (roles.length > 0) {
            const roleRegex = roles.map(role => {
                const escaped = role.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const flexible = escaped.replace(/[\s-]/g, '[\\s-]');
                return new RegExp(flexible, 'i');
            });
            console.log("DEBUG: Generated Regexes:", roleRegex.map(r => r.source));

            // Match against nested job_title
            matchStage.$or.push({ "scrapedData.jobs.job_title": { $in: roleRegex } });
        }

        if (matchStage.$or.length === 0) {
            console.log("DEBUG: No match criteria generated. Returning empty.");
            return res.json([]);
        }

        const pipeline = [
            // 1. Unwind the jobs array so we can filter individual jobs
            { $unwind: "$scrapedData.jobs" },

            // 2. Match based on our criteria
            { $match: matchStage },

            // 3. Promote the job object to root and rename fields to match frontend expectation
            {
                $project: {
                    _id: { $ifNull: ["$scrapedData.jobs.job_id", "$scrapedData.jobs.job_url"] }, // Fallback to URL if ID missing
                    title: "$scrapedData.jobs.job_title",
                    company: "$scrapedData.jobs.company",
                    location: "$scrapedData.jobs.location",
                    description: "$scrapedData.jobs.job_description",
                    link: "$scrapedData.jobs.job_url",
                    datePosted: "$scrapedData.jobs.posted_date",
                    // Keep other fields if needed
                }
            },

            // 4. Sort and Limit
            { $sort: { datePosted: -1 } },
            { $limit: 10 }
        ];

        const jobs = await Jobwebscrapes.aggregate(pipeline);

        console.log("DEBUG: Jobs found via aggregation:", jobs.length);

        if (jobs.length === 0) {
            console.log("DEBUG: No matches found. Checking if any jobs exist in WebScrape collection:");
            // Debug: count total nested jobs
            const countResult = await Jobwebscrapes.aggregate([
                { $unwind: "$scrapedData.jobs" },
                { $count: "total" }
            ]);
            console.log("DEBUG: Total jobs in WebScrape:", countResult[0]?.total || 0);

            if (countResult[0]?.total > 0) {
                const sample = await Jobwebscrapes.aggregate([
                    { $unwind: "$scrapedData.jobs" },
                    { $project: { title: "$scrapedData.jobs.job_title", location: "$scrapedData.jobs.location" } },
                    { $limit: 5 }
                ]);
                console.log("DEBUG: Sample Job Titles from WebScrape:");
                sample.forEach(j => console.log(`  - "${j.title}"`));
            }
        }

        res.json(jobs);

    } catch (error) {
        console.error("Error fetching recommendations:", error);
        res.status(500).json({ error: "Failed to fetch recommendations" });
    }
});

module.exports = router;
