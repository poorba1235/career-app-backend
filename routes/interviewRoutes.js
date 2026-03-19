const express = require('express');
const router = express.Router();
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const OpenAI = require('openai');
const jwt = require('jsonwebtoken');
const Sentiment = require('sentiment');
const Interview = require('../models/Interview');
const { toFile } = require('openai');
const readabilityMeter = require('readability-meter');


const upload = multer({ storage: multer.memoryStorage() });
const sentimentAnalyzer = new Sentiment();
const openai = new OpenAI({
    apiKey: (process.env.OPENAI_API_KEY || "").trim(),
});

// Check if OpenAI key is missing
if (!process.env.OPENAI_API_KEY) {
    console.warn("WARNING: OPENAI_API_KEY is missing from environment variables!");
}

// Helper to delete file
const deleteFile = (filePath) => {
    fs.unlink(filePath, (err) => {
        if (err) console.error('Error deleting file:', err);
    });
};

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

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Detect if a string is predominantly non-English.
 * We check for non-Latin / non-ASCII characters that indicate another script.
 */
const isNonEnglish = (text) => {
    if (!text || text.trim().length === 0) return false;
    // Match Arabic, Hindi/Devanagari, Chinese, Japanese, Korean, Thai, etc.
    const nonLatinPattern = /[\u0600-\u06FF\u0900-\u097F\u4E00-\u9FFF\u3040-\u309F\u30A0-\u30FF\uAC00-\uD7AF\u0E00-\u0E7F\u0400-\u04FF]/;
    const nonLatinChars = (text.match(nonLatinPattern) || []).length;
    return nonLatinChars / text.length > 0.15;
};

/**
 * Detect if an answer is likely noise, silence hallucination, or lacks meaningful content.
 */
const isMeaningless = (text) => {
    if (!text) return true;
    const clean = text.trim().toLowerCase().replace(/[.,!?;:]/g, '');
    if (!clean || clean.length === 0) return true;

    // Common Whisper hallucinations and filler words
    const fillerWords = new Set(['you', 'yeah', 'uh', 'um', 'like', 'thank you', 'okay', 'yes', 'no', 'so', 'right', 'bye', 'hi', 'hello', 'actually', 'well', 'i', 'mean', 'you know', 'sorry', 'apologies', 'excuse', 'me']);

    const words = clean.split(/\s+/);

    // If it's a very short response (1-3 words), check if it consists only of filler/meaningless words
    if (words.length <= 3) {
        return words.every(w => fillerWords.has(w) || w.length < 3);
    }

    // If it's "thank you so much" or similar polite noises
    if (clean === 'thank you' || clean === 'thank you so much' || clean === 'thanks' || clean === 'thanks a lot') {
        return true;
    }

    return false;
};

/**
 * Enhanced Confidence Marker Analysis
 */
const analyzeConfidenceMarkers = (text) => {
    const strongWords = new Set(['definitely', 'absolutely', 'clearly', 'expert', 'achieved', 'led', 'delivered', 'proven', 'thrive', 'excellent', 'passionate', 'ensure', 'manage', 'execute', 'strong']);
    const weakWords = new Set(['maybe', 'guess', 'something', 'kind of', 'sort of', 'perhaps', 'hope', 'try', 'think so', 'basically', 'actually', 'just']);

    const tokens = (text.toLowerCase().match(/\b\w+\b/g) || []);
    let strengthScore = 0;

    tokens.forEach(token => {
        if (strongWords.has(token)) strengthScore += 5;
        if (weakWords.has(token)) strengthScore -= 3;
    });

    return strengthScore;
};

/**
 * Enhanced Readability Analysis
 */
const analyzeReadability = (text) => {
    try {
        const result = readabilityMeter.fleschEase(text);
        const score = result.score;
        if (score > 80) return 70;
        if (score < 30) return 60;
        return Math.min(score, 100);
    } catch (e) {
        return 50;
    }
};

/**
 * Analyze transcript for Confidence and Communication metrics
 */
const analyzeTranscriptMetrics = (transcript) => {
    if (!transcript || transcript.trim().length === 0) {
        return { confidence: 0, communication: 0 };
    }

    const candidateSpeechOnly = transcript.split('\n')
        .filter(line => line.startsWith('A: ') && !line.includes('[No answer / silence]'))
        .map(line => line.replace('A: ', ''))
        .join(' ');

    if (!candidateSpeechOnly.trim()) {
        return { confidence: 0, communication: 0 };
    }

    const words = (candidateSpeechOnly.toLowerCase().match(/\b\w+\b/g) || []);
    const totalWords = words.length;

    if (totalWords === 0) return { confidence: 0, communication: 0 };

    // 1. Calculate Communication
    const uniqueWords = new Set(words).size;
    const lexicalDiversity = uniqueWords / totalWords;
    const readabilityScore = analyzeReadability(candidateSpeechOnly);
    const lengthFactor = Math.min(Math.sqrt(totalWords / 80), 1.0);

    let communicationScore = (lexicalDiversity * 40) + (readabilityScore * 0.4) + (lengthFactor * 20);
    communicationScore = Math.floor(communicationScore);

    // 2. Calculate Confidence
    const sentimentResult = sentimentAnalyzer.analyze(candidateSpeechOnly);
    const sentimentBonus = Math.min(Math.max(sentimentResult.comparative * 25, -25), 25);
    const strengthBonus = analyzeConfidenceMarkers(candidateSpeechOnly);

    const fillerWords = ['um', 'uh', 'like', 'you know', 'sorry', 'apologies'];
    let fillerCount = 0;
    fillerWords.forEach(fw => {
        const regex = new RegExp(`\\b${fw}\\b`, 'gi');
        const matches = candidateSpeechOnly.match(regex);
        if (matches) fillerCount += matches.length;
    });

    const responseDepthBonus = Math.min(Math.sqrt(totalWords / 100) * 80, 85);
    let confidenceScore = responseDepthBonus + sentimentBonus + strengthBonus - (fillerCount * 4);

    return {
        confidence: Math.min(Math.max(Math.floor(confidenceScore), 0), 100),
        communication: Math.min(Math.max(communicationScore, 0), 100)
    };
};

/**
 * Generate TTS audio and return base64.
 */
const generateAudio = async (text) => {
    const mp3 = await openai.audio.speech.create({
        model: "tts-1",
        voice: "shimmer", // warmer, more human-sounding voice
        input: text,
    });
    const buffer = Buffer.from(await mp3.arrayBuffer());
    return buffer.toString('base64');
};

// ─── Start Interview ──────────────────────────────────────────────────────────

router.post('/start', verifyToken, async (req, res) => {
    try {
        let { targetRole, jobDescription, questionCount } = req.body;

        // Ensure questionCount is between 1 and 30, defaulting to 5
        const totalQuestions = Math.min(Math.max(parseInt(questionCount) || 5, 1), 30);

        const interview = new Interview({
            userId: req.user.id,
            targetRole,
            jobDescription,
            totalQuestions
        });

        console.log("Starting interview for role:", targetRole);

        // Generate a warm, human welcome + first question in one go
        let completion;
        try {
            completion = await openai.chat.completions.create({
                messages: [
                    {
                        role: "system",
                        content: `You are Sarah, a warm and experienced hiring manager conducting a real job interview. 
Your tone is friendly, professional, and conversational — like a real person, NOT an AI assistant. 
Do NOT use bullet points, numbered lists, or formal AI-style formatting. 
Speak naturally as if you are having a face-to-face conversation.
Never say "Certainly!", "Of course!", "Great question!", or similar AI filler phrases.
Ask exactly ONE question at a time.`
                    },
                    {
                        role: "user",
                        content: `Start the interview for a ${targetRole} position. 
Job description: ${jobDescription}

Begin with a brief, warm welcome (2-3 sentences max) that feels natural and human — something like you'd say walking into a real interview room. 
Then ask your first interview question. 
Keep the entire response under 80 words.`
                    }
                ],
                model: "gpt-4o-mini", // Safer and faster
            });
        } catch (openaiErr) {
            console.error("OpenAI Chat Completion Error:", openaiErr.message);
            throw new Error(`OpenAI Chat Error: ${openaiErr.message}`);
        }

        const welcomeAndFirstQ = completion.choices[0].message.content;

        let audioBase64 = "";
        try {
            audioBase64 = await generateAudio(welcomeAndFirstQ);
        } catch (audioErr) {
            console.error("OpenAI TTS Error:", audioErr.message);
            // Don't crash the whole route if only audio fails, but for now we throw to see 500
            throw new Error(`OpenAI Audio Error: ${audioErr.message}`);
        }

        interview.questions.push({ questionText: welcomeAndFirstQ });
        await interview.save();

        res.json({
            interviewId: interview._id,
            question: welcomeAndFirstQ,
            audio: audioBase64
        });

    } catch (error) {
        const rawKey = process.env.OPENAI_API_KEY || "";
        const maskedKey = rawKey.length > 20
            ? `${rawKey.substring(0, 8)}...${rawKey.substring(rawKey.length - 8)}`
            : "MISSING OR TOO SHORT";

        console.error('CRITICAL: Error starting interview:', error.message);
        console.error('DEBUG: Using API Key (Masked):', maskedKey);

        res.status(500).json({
            error: 'Failed to start interview',
            details: error.message,
            debug_key_used: maskedKey // Helps user verify they didn't paste half a key
        });
    }
});

// ─── Process Answer & Get Next Question ──────────────────────────────────────

router.post('/response', verifyToken, upload.single('audio'), async (req, res) => {
    try {
        const { interviewId, questionIndex } = req.body;
        const audioFile = req.file;

        if (!audioFile) {
            return res.status(400).json({ error: 'No audio provided' });
        }

        // 1. Transcribe User Audio
        // Create memory-based file for OpenAI
        const fileStream = await toFile(req.file.buffer, req.file.originalname, { type: req.file.mimetype });

        let userText = '';
        let processingError = false;
        try {
            const transcription = await openai.audio.transcriptions.create({
                file: fileStream,
                model: "whisper-1",
            });
            userText = transcription.text || '';
        } catch (transcribeErr) {
            console.error('Transcription error:', transcribeErr);
            userText = '';
            processingError = true;
        }

        // 2. Non-English detection
        if (isNonEnglish(userText)) {
            const reminderText = "Hey, just a quick note — this interview is in English. Could you please answer in English? Let me ask you the next question.";
            const audioBase64 = await generateAudio(reminderText);

            // Still need to update interview and move to next question
            const interview = await Interview.findOne({ _id: interviewId, userId: req.user.id });
            if (!interview) return res.status(404).json({ error: 'Interview not found' });

            const qIndex = parseInt(questionIndex) - 1;
            if (interview.questions[qIndex]) {
                interview.questions[qIndex].userTranscribedAnswer = '[Non-English response detected]';
            }

            const TOTAL_QUESTIONS = interview.totalQuestions || 5;
            if (interview.questions.length >= TOTAL_QUESTIONS) {
                await interview.save();
                return res.json({ userTranscript: userText, nextQuestion: null, audio: audioBase64, isCompleted: true, isNonEnglish: true });
            }

            // Generate next question
            const nextQ = await getNextQuestion(interview, qIndex, '[Non-English response]');
            interview.questions.push({ questionText: nextQ });
            await interview.save();

            return res.json({ userTranscript: userText, nextQuestion: nextQ, audio: audioBase64, isNonEnglish: true });
        }

        // 3. Update Interview Record
        const interview = await Interview.findOne({ _id: interviewId, userId: req.user.id });
        if (!interview) return res.status(404).json({ error: 'Interview not found' });

        const qIndex = parseInt(questionIndex) - 1;
        let answerText = userText;
        if (processingError) {
            answerText = '[Audio could not be processed]';
        } else if (isMeaningless(userText)) {
            answerText = '[No answer / silence]';
        }

        if (interview.questions[qIndex]) {
            interview.questions[qIndex].userTranscribedAnswer = answerText;
        }

        // 4. Check completion
        const TOTAL_QUESTIONS = interview.totalQuestions || 5;
        if (interview.questions.length >= TOTAL_QUESTIONS) {
            const closingText = "Thank you so much for your time today. You did great — I really enjoyed our conversation. Give me just a moment while I put together your feedback report.";
            const audioBase64 = await generateAudio(closingText);
            await interview.save();

            return res.json({
                userTranscript: userText,
                nextQuestion: null,
                audio: audioBase64,
                isCompleted: true
            });
        }

        // 5. Generate Next Question (human-style acknowledgment + new question)
        const nextResponseText = await getNextQuestion(interview, qIndex, answerText);
        const audioBase64 = await generateAudio(nextResponseText);

        interview.questions.push({ questionText: nextResponseText });
        await interview.save();

        res.json({
            userTranscript: userText,
            nextQuestion: nextResponseText,
            audio: audioBase64
        });

    } catch (error) {
        console.error('Error processing response:', error);
        res.status(500).json({ error: 'Failed to process response' });
    }
});

/**
 * Generate a natural next interview question.
 * Handles empty/short answers gracefully without re-asking.
 */
async function getNextQuestion(interview, qIndex, answerText) {
    const isError = answerText === '[Audio could not be processed]';
    const isSilent = answerText === '[No answer / silence]';
    const isShort = !isSilent && !isError && answerText.trim().length < 25;

    let userAnswerNote = `The candidate answered: "${answerText}"`;
    if (isSilent) {
        userAnswerNote = `The candidate gave no answer (silence) or meaningless audio. As a human interviewer, gracefully acknowledge this (e.g., "I didn't quite catch that", "Are you still there? I didn't hear an answer") and proceed naturally to ask the next question.`;
    } else if (isError) {
        userAnswerNote = `The candidate's audio could not be processed. As a human interviewer, gracefully acknowledge a potential technical issue (e.g., "It seems we had a small audio glitch", "I couldn't hear you clearly just now") before moving to the next question.`;
    } else if (isShort) {
        userAnswerNote = `The candidate gave a very brief or potentially meaningless answer: "${answerText}". As a human interviewer, acknowledge it naturally (e.g., "Got it," "Okay," or gently address the brevity if appropriate) and ask the next question.`;
    }

    const completion = await openai.chat.completions.create({
        messages: [
            {
                role: "system",
                content: `You are Sarah, a warm and experienced hiring manager conducting a real job interview for a ${interview.targetRole} role.
Your tone is conversational, human, and professional — NOT robotic or AI-like.
Do NOT use filler phrases like "Certainly!", "Great!", "Of course!", "Absolutely!", or "That's a great answer!"
Do NOT use bullet points or numbered lists.
Give a very brief natural acknowledgment (1 sentence max), then ask ONE new question.
Keep the total response under 60 words.`
            },
            {
                role: "user",
                content: `The interview question was: "${interview.questions[qIndex]?.questionText || 'the previous question'}".
${userAnswerNote}
Now give a brief, natural acknowledgment and ask the next relevant interview question for the ${interview.targetRole} role.
Job description context: ${interview.jobDescription.substring(0, 300)}`
            }
        ],
        model: "gpt-4o",
    });

    return completion.choices[0].message.content;
}

// ─── End Interview & Generate Report ─────────────────────────────────────────

router.post('/end', verifyToken, async (req, res) => {
    try {
        const { interviewId } = req.body;
        const interview = await Interview.findOne({ _id: interviewId, userId: req.user.id });
        if (!interview) return res.status(404).json({ error: 'Interview not found' });

        interview.status = 'completed';

        let transcript = "";
        let validAnswersCount = 0;
        interview.questions.forEach((q, i) => {
            const ans = q.userTranscribedAnswer;
            const meaningless = (ans === '[No answer / silence]' || ans === '[Audio could not be processed]' || !ans || isMeaningless(ans));

            if (!meaningless) {
                transcript += `Q${i + 1}: ${q.questionText}\nA: ${ans}\n\n`;
                validAnswersCount++;
            } else {
                transcript += `Q${i + 1}: ${q.questionText}\nA: [No answer / silence]\n\n`;
            }
        });

        const completion = await openai.chat.completions.create({
            messages: [
                {
                    role: "system",
                    content: `You are an expert senior interviewer. Analyze this interview transcript carefully.
                    
                    Metrics to measure:
                    1. COMMUNICATION: Clarity, grammar, vocabulary, and relevance. 
                       - If answers are absent, silent, or meaningless, Communication MUST be 0.
                       - If answers are very short (1-5 words) or vague, Communication MUST be extremely low (0-15).
                    2. CONFIDENCE: Tone, directness, and lack of filler words ("um", "uh", "you know").
                       - Frequent fillers, stuttering, or hesitant language MUST result in very low Confidence (0-20).
                    3. TECHNICAL KNOWLEDGE: Accuracy and depth of technical concepts.

                    Scoring Rules:
                    - Score 80-100: Exceptional, detailed, and accurate.
                    - Score 40-79: Average or good, but with some gaps or fillers.
                    - Score 0-39: Poor, vague, or contains mostly noise/fillers.
                    - EXTREME CRITICALITY: If the transcript for an answer is "[No answer / silence]", that question score is 0 and Communication/Confidence must not exceed 5.
                    - If ALL answers are empty or noise, Overall Score and ALL metrics MUST be 0.
                    - Be brutally honest. Do NOT give "default" scores like 30 or 75 unless specifically earned.

                    Output JSON:
                    {
                      "score": <0-100>,
                      "confidence_level": { "label": "Low" | "Medium" | "High", "score": <0-100> },
                      "interview_summary": "<2-3 sentence overview>",
                      "key_takeaways": ["<strength1>", ...],
                      "areas_for_improvement": ["<improvement1>", ...],
                      "metrics": {
                        "communication": <0-100>,
                        "technical_knowledge": <0-100>,
                        "confidence": <0-100>
                      },
                      "questions_analysis": [
                        { "question": "<text>", "feedback": "<detailed feedback>", "ideal_answer": "<text>" }
                      ]
                    }`
                },
                {
                    role: "user",
                    content: `Target Role: ${interview.targetRole}\nTranscript:\n${transcript || "No response provided."}`
                }
            ],
            model: "gpt-4o",
            response_format: { type: "json_object" }
        });

        const result = JSON.parse(completion.choices[0].message.content);
        console.log("DEBUG: OpenAI Raw Result:", JSON.stringify(result, null, 2));

        // Enforce rigid 0% score constraint manually just in case AI still hallucinates a small score for total silence
        if (validAnswersCount === 0) {
            console.log("DEBUG: All answers were meaningless. Hard-coded results to 0.");
            result.score = 0;
            result.metrics = {
                communication: 0,
                technical_knowledge: 0,
                confidence: 0
            };
        }

        // Override AI metrics with data-driven NPM calculations
        const npmMetrics = analyzeTranscriptMetrics(transcript);
        console.log("DEBUG: NPM-Calculated metrics for override:", npmMetrics);

        if (result.metrics) {
            result.metrics.confidence = npmMetrics.confidence;
            result.metrics.communication = npmMetrics.communication;
        }

        interview.overallFeedback = result.interview_summary;
        interview.overallScore = result.score;
        interview.analysis = {
            confidence_level: result.confidence_level || { label: 'Medium', score: 50 },
            interview_summary: result.interview_summary || '',
            key_takeaways: result.key_takeaways || [],
            areas_for_improvement: result.areas_for_improvement || [],
            metrics: result.metrics || {}
        };

        // Update per-question feedback
        if (result.questions_analysis && Array.isArray(result.questions_analysis)) {
            result.questions_analysis.forEach((qa, index) => {
                if (interview.questions[index]) {
                    interview.questions[index].aiFeedback = qa.feedback;
                    interview.questions[index].idealAnswer = qa.ideal_answer;
                }
            });
        }

        // ─── PDF Generation ───────────────────────────────────────────────────
        const PDFDocument = require('pdfkit');
        const doc = new PDFDocument({ margin: 50 });

        const buffers = [];
        doc.on('data', buffers.push.bind(buffers));

        const writePromise = new Promise((resolve, reject) => {
            doc.on('end', () => resolve(Buffer.concat(buffers)));
            doc.on('error', reject);
        });

        // Header
        doc.fontSize(22).font('Helvetica-Bold').text('Interview Performance Report', { align: 'center' });
        doc.moveDown(0.5);
        doc.fontSize(12).font('Helvetica').text(`Role: ${interview.targetRole}`, { align: 'center' });
        doc.text(`Date: ${new Date().toLocaleDateString()}`, { align: 'center' });
        doc.moveDown(1.5);

        // Score & Confidence
        doc.fontSize(18).font('Helvetica-Bold').text(`Overall Score: ${interview.overallScore}/100`, { align: 'center' });
        if (interview.analysis.confidence_level) {
            doc.fontSize(13).font('Helvetica').text(`Confidence Level: ${interview.analysis.confidence_level.label} (${interview.analysis.confidence_level.score}/100)`, { align: 'center' });
        }
        doc.moveDown(1);

        // Interview Summary
        doc.fontSize(14).font('Helvetica-Bold').text('Interview Summary:', { underline: true });
        doc.fontSize(12).font('Helvetica').text(interview.analysis.interview_summary || 'N/A');
        doc.moveDown(1);

        // Metrics
        doc.fontSize(14).font('Helvetica-Bold').text('Performance Metrics:', { underline: true });
        if (interview.analysis.metrics) {
            Object.entries(interview.analysis.metrics).forEach(([key, value]) => {
                doc.fontSize(12).font('Helvetica').text(`• ${key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}: ${value}/100`);
            });
        }
        doc.moveDown(1);

        // Key Strengths
        if (interview.analysis.key_takeaways?.length > 0) {
            doc.fontSize(14).font('Helvetica-Bold').text('Key Strengths:', { underline: true });
            interview.analysis.key_takeaways.forEach(p => doc.fontSize(12).font('Helvetica').text(`• ${p}`));
            doc.moveDown(1);
        }

        // Areas for Improvement
        if (interview.analysis.areas_for_improvement?.length > 0) {
            doc.fontSize(14).font('Helvetica-Bold').text('Areas for Improvement:', { underline: true });
            interview.analysis.areas_for_improvement.forEach((p, i) => doc.fontSize(12).font('Helvetica').text(`${i + 1}. ${p}`));
            doc.moveDown(1);
        }

        // Q&A Detailed Feedback
        doc.addPage();
        doc.fontSize(18).font('Helvetica-Bold').text('Detailed Q&A Feedback', { align: 'center' });
        doc.moveDown(1);

        interview.questions.forEach((q, i) => {
            doc.fontSize(13).font('Helvetica-Bold').text(`Question ${i + 1}:`);
            doc.fontSize(11).font('Helvetica').text(q.questionText);
            doc.moveDown(0.5);
            doc.fontSize(12).font('Helvetica-Bold').text('Your Answer:');
            const userAns = q.userTranscribedAnswer || '';
            const isMeaningless = userAns === '[No answer / silence]' || userAns === '[Audio could not be processed]' || userAns.trim().toLowerCase() === 'you';
            doc.font('Helvetica').text(isMeaningless ? '" "' : `"${userAns}"`);
            doc.moveDown(0.5);
            if (q.aiFeedback) {
                doc.fontSize(12).font('Helvetica-Bold').text('AI Feedback:');
                doc.font('Helvetica-Oblique').text(q.aiFeedback);
                doc.moveDown(0.5);
            }
            if (q.idealAnswer) {
                doc.fontSize(12).font('Helvetica-Bold').text('Ideal Answer:');
                doc.font('Helvetica').text(q.idealAnswer);
            }
            doc.moveDown(1.5);
        });

        doc.end();
        const reportBuffer = await writePromise; // Await collected buffer

        // 4. Generate local API URLs that stream the buffers
        const reportDownloadUrl = `/api/interview/download/report/${interview._id}`;

        // Save URL and raw data to DB
        interview.reportPdfData = reportBuffer;
        interview.reportPath = reportDownloadUrl;
        interview.markModified('questions');
        interview.markModified('analysis');
        await interview.save();

        res.json({
            report: interview.overallFeedback,
            score: interview.overallScore,
            analysis: interview.analysis,
            questions: interview.questions,
            reportPath: interview.reportPath
        });

    } catch (error) {
        console.error('Error ending interview:', error);
        res.status(500).json({ error: 'Failed to end interview' });
    }
});

// ─── History ──────────────────────────────────────────────────────────────────
router.get('/history', verifyToken, async (req, res) => {
    try {
        const interviews = await Interview.find({ userId: req.user.id })
            .sort({ createdAt: -1 })
            .select('targetRole jobDescription status overallScore createdAt reportPath'); // Excludes the heavy reportPdfData buffer!
        res.json(interviews);
    } catch (error) {
        console.error('Error fetching history:', error);
        res.status(500).json({ error: 'Failed to fetch interview history' });
    }
});

// ─── Download PDF Report Stream ───────────────────────────────────────────────
router.get('/download/report/:id', async (req, res) => {
    try {
        const interview = await Interview.findById(req.params.id);
        if (!interview || !interview.reportPdfData) return res.status(404).send('Report File Not Found');

        res.set('Content-Type', 'application/pdf');
        res.send(interview.reportPdfData);
    } catch (e) {
        console.error('Error fetching PDF stream:', e);
        res.status(500).send('Server Error fetching Report stream');
    }
});

module.exports = router;
