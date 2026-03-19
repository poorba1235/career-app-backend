const mongoose = require("mongoose");

const jobSchema = new mongoose.Schema({
    searchQuery: {
        type: String,
        required: true,
        index: true // Improve search performance
    },
    title: {
        type: String,
        required: true,
    },
    company: {
        type: String,
    },
    location: {
        type: String,
    },
    description: {
        type: String,
    },
    link: {
        type: String,
    },
    salary: {
        type: String,
    },
    datePosted: {
        type: String, // Serper returns relative dates (e.g., "1 day ago")
    },
    logo: {
        type: String
    },
    platform: {
        type: String
    },
    createdAt: {
        type: Date,
        default: Date.now,
        expires: 86400 // Optional: Expires documents after 24 hours (86400 seconds)
    }
});

module.exports = mongoose.model("Job", jobSchema);
