const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const path = require("path");

dotenv.config();

// Global Environment Check for Vercel/Production
const criticalEnvVars = ["MONGO_URI", "JWT_SECRET", "OPENAI_API_KEY"];
criticalEnvVars.forEach(v => {
    if (!process.env[v]) {
        console.error(`CRITICAL: Environment variable ${v} is missing!`);
    }
});

const authRouter = require("./routes/authRoutes");
const userRouter = require("./routes/userRoutes");
const jobRouter = require("./routes/job-routes");
const cvRouter = require("./routes/cvAnalysis");
const webScrapeRouter = require("./routes/webScrapeRoutes");
const interviewRouter = require("./routes/interviewRoutes");
const connectDB = require("./config/db");

const app = express();

// 1. MUST BE FIRST: CORS and Preflight
app.use(
    cors({
        origin: ["http://localhost:5173", "https://career-app-frontend-mu.vercel.app", "*"],
        credentials: true,
        methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization"]
    })
);
app.options(/.*/, cors());

// 2. Body Parsers
app.use(express.json());

// 3. Database Connection Middleware
// We ensure the connection is established for EVERY request in serverless fashion
app.use(async (req, res, next) => {
    try {
        await connectDB();
        next();
    } catch (err) {
        console.error("Database connection middleware error:", err.message);
        res.status(500).json({
            error: "Database connection failed",
            details: "Please ensure your MongoDB IP whitelist is set to allow all (0.0.0.0/0) for Vercel."
        });
    }
});

// 4. Routes
app.use("/api/auth", authRouter);
app.use("/api/user", userRouter);
app.use("/api/jobs", jobRouter);
app.use("/api/cv", cvRouter);
app.use("/api/scrape", webScrapeRouter);
app.use("/api/interview", interviewRouter);
app.use('/api/uploads', express.static(path.join(__dirname, 'uploads')));

// Root status route
app.get("/", (req, res) => {
    res.json({ message: "Job Finder API is running..." });
});

module.exports = app;

const PORT = process.env.PORT || 5000;
if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
}

