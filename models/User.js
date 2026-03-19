const mongoose = require("mongoose");

const educationSchema = new mongoose.Schema({
  university: String,
  degreeLevel: String,
  fieldOfStudy: String,
  graduationDate: Date,
});

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
    },
    visaStatus: String,
    education: [educationSchema],
    rolesInterest: {
      roles: [String],
      industries: [String],
    },
    locations: [String],
    salary: mongoose.Schema.Types.Mixed,
    passwordHash: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      default: "user",
    },
    status: {
      type: String,
      enum: ["active", "hold"],
      default: "active",
    },
    resetPasswordToken: String,
    resetPasswordExpire: Date,
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("User", userSchema);
