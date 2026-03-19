const { initializeApp } = require('firebase/app');
const { getStorage } = require('firebase/storage');

const firebaseConfig = {
  apiKey: "AIzaSyA5UaVtR8jMRIN9w9B_rG04MRAd47SY4Fw",
  authDomain: "career-4cc05.firebaseapp.com",
  projectId: "career-4cc05",
  storageBucket: "career-4cc05.firebasestorage.app",
  messagingSenderId: "163626399643",
  appId: "1:163626399643:web:5087c4b7fc27ae4ebcd33e",
  measurementId: "G-BF9MYFQB5F"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Cloud Storage and get a reference to the service
const storage = getStorage(app);

module.exports = { storage };
