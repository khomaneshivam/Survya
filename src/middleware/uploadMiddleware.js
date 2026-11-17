const multer = require("multer");
const path = require("path");
const fs = require("fs");

// In-memory file uploader for spreadsheets (Excel .xlsx, .xls, and .csv up to 25MB)
const contactStorage = multer.memoryStorage();
const contactUpload = multer({
  storage: contactStorage,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB limit
  fileFilter: (req, file, cb) => {
    const allowed = [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
      "text/csv",
      "application/csv"
    ];
    if (
      allowed.includes(file.mimetype) ||
      file.originalname.match(/\.(xlsx|xls|csv)$/i)
    ) {
      cb(null, true);
    } else {
      cb(new Error("Only Excel (.xlsx, .xls) and CSV (.csv) files are allowed."));
    }
  }
});

// Dedicated Media Uploader with Safe Filename Handling (Images, Documents, Videos up to 30MB)
const mediaStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, "..", "..", "public", "uploads");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || ".jpg";
    const safeExt = ext.replace(/[^a-zA-Z0-9.]/g, "").toLowerCase();
    const base = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, "_");
    cb(null, `media_${Date.now()}_${base}${safeExt}`);
  }
});

const mediaUpload = multer({
  storage: mediaStorage,
  limits: { fileSize: 30 * 1024 * 1024 }, // 30MB
  fileFilter: (req, file, cb) => {
    // Strictly prohibit SVG, HTML, and executable extensions to prevent Stored XSS
    if (
      file.mimetype === "image/svg+xml" ||
      file.originalname.match(/\.(svg|html|htm|xhtml|xml|js|exe|bat|cmd|sh|php)$/i)
    ) {
      return cb(new Error("File type not allowed for security reasons. SVGs and executable files are prohibited."));
    }

    const allowedMimes = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "application/pdf",
      "video/mp4",
      "video/3gpp"
    ];
    const allowedExts = /\.(jpg|jpeg|png|webp|pdf|mp4|3gp)$/i;

    if (
      (allowedMimes.includes(file.mimetype) || file.mimetype.startsWith("image/") || file.mimetype.startsWith("video/")) &&
      file.originalname.match(allowedExts)
    ) {
      cb(null, true);
    } else {
      cb(new Error("Only standard image files (JPG, PNG, WEBP), PDF documents, or MP4 videos are allowed."));
    }
  }
});

module.exports = {
  contactUpload,
  mediaUpload
};

