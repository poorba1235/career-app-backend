const mongoose = require("mongoose");
const dotenv = require("dotenv");
const path = require("path");

dotenv.config({ path: path.join(__dirname, '.env') });

const run = async () => {
    try {
        console.log("Connecting...");
        await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 5000 });
        console.log("Connected.");

        const jobCount = await mongoose.connection.collection('jobs').countDocuments();
        console.log("Total Jobs:", jobCount);

        const sample = await mongoose.connection.collection('jobs').findOne();
        console.log("Sample Job:", sample ? sample.title : "None");

    } catch (e) {
        console.error("Error:", e.message);
    } finally {
        await mongoose.disconnect();
        console.log("Done.");
    }
};

run();
