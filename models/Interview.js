const mongoose = require('mongoose');

const interviewSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    targetRole: {
        type: String,
        required: true
    },
    jobDescription: {
        type: String,
        required: true
    },
    status: {
        type: String,
        enum: ['in-progress', 'completed', 'abandoned'],
        default: 'in-progress'
    },
    totalQuestions: {
        type: Number,
        default: 5
    },
    questions: [{
        questionText: String,
        userAudioUrl: String, // URL/Path to stored audio answer
        userTranscribedAnswer: String,
        aiFeedback: String,
        idealAnswer: String,
        score: Number,
        timestamp: {
            type: Date,
            default: Date.now
        }
    }],
    overallScore: Number,
    analysis: {
        type: Object, // Stores structured JSON: metrics, takeaways, improvements
        default: {}
    },
    overallFeedback: String,
    createdAt: {
        type: Date,
        default: Date.now
    },
    reportPath: {
        type: String // URL to PDF report
    },
    reportPdfData: {
        type: Buffer // The raw bytes of the final interview feedback PDF
    }
});

module.exports = mongoose.model('Interview', interviewSchema);
