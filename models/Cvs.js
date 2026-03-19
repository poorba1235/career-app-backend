const mongoose = require('mongoose');

const cvSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    fileName: {
        type: String,
        required: true
    },
    fileText: {
        type: String, // Storing extracted text for search/reference
    },
    cvFilePath: {
        type: String, // Path to stored CV PDF
    },
    analysisPdfPath: {
        type: String, // Path to generated Analysis PDF
    },
    cvPdfData: {
        type: Buffer, // The raw bytes of the original CV PDF
    },
    analysisPdfData: {
        type: Buffer, // The raw bytes of the generated AI Report PDF
    },
    analysisResult: {
        type: Object, // Stores the JSON result from OpenAI
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('CV', cvSchema);
