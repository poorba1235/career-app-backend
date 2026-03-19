const mongoose = require('mongoose');

// Job schema for individual job listings
const jobSchema = new mongoose.Schema({
    job_title: { type: String, default: null },
    company: { type: String, default: null },
    location: { type: String, default: null },
    employment_type: { type: String, default: null },
    work_mode: { type: String, default: null },
    department: { type: String, default: null },
    experience_level: { type: String, default: null },
    job_url: { type: String, default: null },
    application_url: { type: String, default: null },
    company_website: { type: String, default: null },
    salary: { type: String, default: null },
    salary_min: { type: Number, default: null },
    salary_max: { type: Number, default: null },
    salary_currency: { type: String, default: null },
    equity: { type: String, default: null },
    bonus: { type: String, default: null },
    benefits: { type: String, default: null },
    posted_date: { type: String, default: null },
    application_deadline: { type: String, default: null },
    start_date: { type: String, default: null },
    job_description: { type: String, default: null },
    responsibilities: { type: String, default: null },
    requirements: { type: String, default: null },
    required_skills: { type: String, default: null },
    preferred_qualifications: { type: String, default: null },
    preferred_skills: { type: String, default: null },
    education: { type: String, default: null },
    certifications: { type: String, default: null },
    company_description: { type: String, default: null },
    company_size: { type: String, default: null },
    company_industry: { type: String, default: null },
    company_culture: { type: String, default: null },
    company_values: { type: [String], default: [] },
    job_id: { type: String, default: null },
    number_of_positions: { type: Number, default: null },
    reports_to: { type: String, default: null },
    team_size: { type: String, default: null },
    relocation: { type: String, default: null },
    visa_sponsorship: { type: String, default: null },
    security_clearance: { type: String, default: null },
    travel_required: { type: String, default: null },
    contact_email: { type: String, default: null },
    contact_person: { type: String, default: null },
    tags: { type: [String], default: [] },
    raw_description: { type: String, default: null }
}, { _id: false });

const webScrapeSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    url: {
        type: String,
        required: true,
        trim: true
    },
    status: {
        type: String,
        enum: ['pending', 'processing', 'completed', 'failed'],
        default: 'pending'
    },
    scrapedData: {
        total_jobs: { type: Number, default: 0 },
        jobs: { type: [jobSchema], default: [] }
    },
    errorMessage: {
        type: String,
        default: null
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('WebScrape', webScrapeSchema);
