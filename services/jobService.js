const Job = require("../models/Job");

const searchJobs = async (query, location) => {
    if (!query) {
        throw new Error("Query is required");
    }

    // Combine query and location if provided
    const searchTerm = location ? `${query} jobs in ${location}` : `${query} jobs`;

    // 1. Check Database for existing jobs with this search query
    // We use a regex to match the exact search term case-insensitively if needed, 
    // but for caching, exact string match on 'searchQuery' is efficient.
    const cachedJobs = await Job.find({ searchQuery: searchTerm });

    if (cachedJobs.length > 0) {
        // console.log("Serving from cache");
        return { organic: cachedJobs };
        // Note: Structuring response to match Serper's 'organic' or 'jobs' structure 
        // to keep frontend consistent. Serper returns { organic: [...] } usually for job queries.
    }

    // 2. If not in DB, fetch from API
    const myHeaders = new Headers();
    myHeaders.append("X-API-KEY", "ef03689fe415af1f08eb265cf795275c4f6c7086");
    myHeaders.append("Content-Type", "application/json");

    const raw = JSON.stringify({
        "q": searchTerm,
        "tbs": "qdr:m", // Jobs from the past month
        "num": 20      // Number of results
    });

    const requestOptions = {
        method: 'POST',
        headers: myHeaders,
        body: raw,
        redirect: 'follow'
    };

    const response = await fetch("https://google.serper.dev/search", requestOptions);

    if (!response.ok) {
        throw new Error(`Serper API error: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();
    const jobsToSave = result.organic || [];

    // 3. Save results to DB
    if (jobsToSave.length > 0) {
        const jobsWithQuery = jobsToSave.map(job => ({
            searchQuery: searchTerm,
            title: job.title,
            company: job.company || "", // Handle missing fields
            location: job.location || "",
            link: job.link,
            salary: job.salary || "",
            datePosted: job.date || "", // Serper often uses 'date'
            description: job.snippet || "" // Serper provided snippet
        }));

        await Job.insertMany(jobsWithQuery);
    }

    return result;
};

module.exports = {
    searchJobs
};
