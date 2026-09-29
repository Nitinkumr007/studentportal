const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { MongoClient, ObjectId } = require('mongodb');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

// Global MongoDB Connection State
let mongoClient = null;
let currentDb = null;
let currentDbName = 'brdp_portal';
let currentUri = process.env.DATABASE_URL || 'mongodb://localhost:27017/brdp_portal';
let isConnectedToLiveDb = false;
let connectionError = null;

// Initial Dataset Loader
const { generateAllReports, buildFullStudentDataset, readBsonFile } = require('./generate_reports');

let mockData = { students: [], fee_ledgers: [], courses: [], sessions: [] };

try {
  const dataset = buildFullStudentDataset();
  mockData.students = dataset.students;
  mockData.fee_ledgers = dataset.ledgers;
  mockData.courses = readBsonFile('courses.bson');
  mockData.sessions = readBsonFile('sessions.bson');
  console.log(`Loaded ${mockData.students.length} students and ${mockData.fee_ledgers.length} fee ledgers across all courses and sessions.`);
} catch (e) {
  console.warn('Could not load student dataset:', e.message);
}

// Generate initial report CSV/JSON files into reports/ folder on startup
generateAllReports();

// Attempt MongoDB Connection
async function connectToMongo(uri) {
  try {
    if (mongoClient) {
      await mongoClient.close();
    }
    console.log(`Connecting to MongoDB URI: ${uri}`);
    mongoClient = new MongoClient(uri, { serverSelectionTimeoutMS: 3000 });
    await mongoClient.connect();
    
    const parsedUri = new URL(uri.startsWith('mongodb') ? uri : `mongodb://${uri}`);
    const pathnameDb = parsedUri.pathname ? parsedUri.pathname.replace('/', '') : '';
    currentDbName = pathnameDb || 'brdp_portal';
    
    currentDb = mongoClient.db(currentDbName);
    await currentDb.command({ ping: 1 });
    
    isConnectedToLiveDb = true;
    currentUri = uri;
    connectionError = null;
    console.log(`Successfully connected to Live MongoDB Database: ${currentDbName}`);
    return true;
  } catch (err) {
    console.warn(`MongoDB Connection Warning: ${err.message}`);
    isConnectedToLiveDb = false;
    connectionError = err.message;
    return false;
  }
}

connectToMongo(currentUri);

// Helper: Infer JSON Schema
function inferSchema(docs) {
  if (!docs || docs.length === 0) return { fields: [] };
  const fieldMap = {};
  const totalDocs = docs.length;

  docs.forEach(doc => {
    Object.keys(doc).forEach(key => {
      const val = doc[key];
      let type = typeof val;
      if (val === null) type = 'Null';
      else if (Array.isArray(val)) type = 'Array';
      else if (val instanceof Date || (typeof val === 'string' && !isNaN(Date.parse(val)) && val.includes('T'))) type = 'Date';
      else if (typeof val === 'string' && /^[0-9a-fA-F]{24}$/.test(val)) type = 'ObjectId';
      else if (type === 'object') type = 'Object';
      else if (type === 'string') type = 'String';
      else if (type === 'number') type = 'Number';
      else if (type === 'boolean') type = 'Boolean';

      if (!fieldMap[key]) {
        fieldMap[key] = { name: key, types: new Set([type]), count: 1, sampleValue: val };
      } else {
        fieldMap[key].types.add(type);
        fieldMap[key].count++;
      }
    });
  });

  const fields = Object.values(fieldMap).map(f => ({
    name: f.name,
    type: Array.from(f.types).join(' | '),
    presencePct: Math.round((f.count / totalDocs) * 100),
    required: f.count === totalDocs,
    sample: f.sampleValue
  }));

  return { fields, sampleCount: totalDocs };
}

// ─────────────────────────────────────────────
// EXCEL & CSV REPORTS API ENDPOINTS
// ─────────────────────────────────────────────

// Helper function for building Consolidated Fee Matrix
async function buildConsolidatedMatrixData() {
  let students = [];
  let ledgers = [];
  let courses = [];
  let sessions = [];

  if (isConnectedToLiveDb && currentDb) {
    students = await currentDb.collection('students').find().toArray();
    ledgers = await currentDb.collection('fee_ledgers').find().toArray();
    courses = await currentDb.collection('courses').find().toArray();
    sessions = await currentDb.collection('sessions').find().toArray();
  } else {
    students = mockData.students;
    ledgers = mockData.fee_ledgers;
    courses = mockData.courses;
    sessions = mockData.sessions;
  }

  const courseMap = {};
  courses.forEach(c => courseMap[String(c._id)] = c.code || c.name);

  const sessionMap = {};
  sessions.forEach(s => sessionMap[String(s._id)] = s.name);

  const ledgerMap = {};
  ledgers.forEach(l => {
    const sid = String(l.studentId);
    if (!ledgerMap[sid]) ledgerMap[sid] = {};
    ledgerMap[sid][l.semester] = l;
  });

  return students.map(s => {
    const sid = String(s._id);
    const sLedgers = ledgerMap[sid] || {};
    const courseName = s.course || courseMap[String(s.courseId)] || 'BA';
    const sessionName = s.session || sessionMap[String(s.sessionId)] || '2024-2027';

    let totalCourseFee = 0;
    let totalPaid = 0;
    let totalPending = 0;

    const row = {
      "Roll No": s.rollNo || s.enrollmentNo || '--',
      "Student Name": s.fullName || s.name || '--',
      "Father Name": s.fatherName || '--',
      "Phone / Contact": s.phone || '--',
      "Course": courseName,
      "Session": sessionName,
      "Current Semester": s.currentSemester || s.semester || 1,
      "Address": s.address ? (typeof s.address === 'object' ? `${s.address.city}, ${s.address.state}` : s.address) : '--',
      "Record Status": s.isDeleted === true ? "DELETED" : "ACTIVE"
    };

    for (let sem = 1; sem <= 6; sem++) {
      const l = sLedgers[sem];
      const semFee = l ? Number(l.totalAmount || 0) : 0;
      const semPaid = l ? Number(l.paidAmount || 0) : 0;
      const semPending = l ? Math.max(0, semFee - semPaid) : 0;

      row[`Sem ${sem} Fee (₹)`] = semFee;
      row[`Sem ${sem} Paid (₹)`] = semPaid;
      row[`Sem ${sem} Pending (₹)`] = semPending;

      totalCourseFee += semFee;
      totalPaid += semPaid;
      totalPending += semPending;
    }

    row["Total Course Fee (₹)"] = totalCourseFee;
    row["Total Paid (₹)"] = totalPaid;
    row["Overall Pending Balance (₹)"] = totalPending;
    row["Overall Status"] = totalPending === 0 && totalCourseFee > 0 ? "PAID" : (totalPaid > 0 ? "PARTIAL" : "PENDING");
    row["Calling Priority Tag"] = totalPending > 0 ? `CALL REQUIRED (DUE: ₹${totalPending})` : "FEES CLEARED";

    return row;
  });
}

// 1. Student Master Data Report Endpoint
app.get('/api/reports/students', async (req, res) => {
  try {
    let studentList = [];
    if (isConnectedToLiveDb && currentDb) {
      studentList = await currentDb.collection('students').find().toArray();
    } else {
      studentList = mockData.students;
    }

    const report = studentList.map(s => ({
      "Roll No": s.rollNo || s.enrollmentNo || '--',
      "Full Name": s.fullName || s.name || '--',
      "Father Name": s.fatherName || (s.guardian ? s.guardian.name : '--'),
      "Phone": s.phone || '--',
      "Course": s.course || '--',
      "Session": s.session || '2024-2027',
      "Current Semester": s.currentSemester || s.semester || 1,
      "College Code": s.collegeCode || 'BRDP',
      "Address": s.address ? (typeof s.address === 'object' ? `${s.address.city}, ${s.address.state}` : s.address) : '--',
      "Status": s.status || (s.isActive ? 'Active' : 'Inactive'),
      "Created Date": s.createdAt ? new Date(s.createdAt).toISOString().split('T')[0] : '--'
    }));

    res.json({ success: true, count: report.length, data: report });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Semester-Wise Fees Breakdown Report Endpoint
app.get('/api/reports/semester-fees', async (req, res) => {
  try {
    let ledgers = [];
    let students = [];

    if (isConnectedToLiveDb && currentDb) {
      ledgers = await currentDb.collection('fee_ledgers').find().toArray();
      students = await currentDb.collection('students').find().toArray();
    } else {
      ledgers = mockData.fee_ledgers;
      students = mockData.students;
    }

    const studentMap = {};
    students.forEach(s => studentMap[String(s._id)] = s);

    const report = ledgers.map(l => {
      const student = studentMap[String(l.studentId)] || {};
      const total = Number(l.totalAmount || 0);
      const paid = Number(l.paidAmount || 0);
      const pending = Math.max(0, total - paid);

      return {
        "Roll No": l.rollNo || student.rollNo || '--',
        "Student Name": l.studentName || student.fullName || student.name || '--',
        "Father Name": student.fatherName || '--',
        "Phone": student.phone || '--',
        "Course": student.course || '--',
        "Semester": `Semester ${l.semester}`,
        "Total Fee (₹)": total,
        "Paid Amount (₹)": paid,
        "Pending Amount (₹)": pending,
        "Fee Status": l.status || (pending === 0 ? 'PAID' : (paid > 0 ? 'PARTIAL' : 'PENDING')),
        "Due Date": l.dueDate ? new Date(l.dueDate).toISOString().split('T')[0] : '--'
      };
    });

    res.json({ success: true, count: report.length, data: report });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Consolidated Semester-Wise Matrix Report Endpoint
app.get('/api/reports/consolidated-matrix', async (req, res) => {
  try {
    const report = await buildConsolidatedMatrixData();
    res.json({ success: true, count: report.length, data: report });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3b. Student & User Master Semester Fees JSON Endpoint
app.get('/api/reports/student-user-fees', (req, res) => {
  const filePath = path.join(__dirname, 'reports', 'Student_User_Master_Semester_Fees_Report.json');
  if (fs.existsSync(filePath)) {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    res.json({ success: true, count: data.length, data: data });
  } else {
    const reports = generateAllReports();
    res.json({ success: true, count: reports.userMasterFeeReport.length, data: reports.userMasterFeeReport });
  }
});

// 4. Student Calling List Report Endpoint (Filtered for users with pending fee > 0)
app.get('/api/reports/calling-list', async (req, res) => {
  try {
    const report = await buildConsolidatedMatrixData();
    const callingList = report
      .filter(r => r["Overall Pending Balance (₹)"] > 0)
      .sort((a, b) => b["Overall Pending Balance (₹)"] - a["Overall Pending Balance (₹)"])
      .map((r, i) => ({
        "Priority": i + 1,
        "Roll No": r["Roll No"],
        "Student Name": r["Student Name"],
        "Father Name": r["Father Name"],
        "Phone / Contact": r["Phone / Contact"],
        "Overall Pending Balance (₹)": r["Overall Pending Balance (₹)"],
        "Current Semester": r["Current Semester"],
        "Course": r["Course"],
        "Session": r["Session"],
        "Address": r["Address"],
        "Calling Status": "PENDING CALL"
      }));

    res.json({ success: true, count: callingList.length, data: callingList });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. Download Direct CSV File Endpoint: Consolidated Fee Matrix
app.get('/api/reports/download/consolidated-matrix', (req, res) => {
  const filePath = path.join(__dirname, 'reports', 'Consolidated_Semester_Wise_Fee_Matrix.csv');
  if (fs.existsSync(filePath)) {
    res.download(filePath, 'Consolidated_Semester_Wise_Fee_Matrix.csv');
  } else {
    generateAllReports();
    res.download(filePath, 'Consolidated_Semester_Wise_Fee_Matrix.csv');
  }
});

// 6. Download Direct CSV File Endpoint: Student Calling List
app.get('/api/reports/download/calling-list', (req, res) => {
  const filePath = path.join(__dirname, 'reports', 'Student_Fee_Calling_List.csv');
  if (fs.existsSync(filePath)) {
    res.download(filePath, 'Student_Fee_Calling_List.csv');
  } else {
    generateAllReports();
    res.download(filePath, 'Student_Fee_Calling_List.csv');
  }
});
// 7. Download Direct CSV File Endpoint: Student Master Directory
app.get('/api/reports/download/student-directory', (req, res) => {
  const filePath = path.join(__dirname, 'reports', 'Student_Master_Directory.csv');
  if (fs.existsSync(filePath)) {
    res.download(filePath, 'Student_Master_Directory.csv');
  } else {
    generateAllReports();
    res.download(filePath, 'Student_Master_Directory.csv');
  }
});

// 8. Download Direct CSV File Endpoint: Student User Master & Semester Fees Report
app.get('/api/reports/download/student-user-fees', (req, res) => {
  const filePath = path.join(__dirname, 'reports', 'Student_User_Master_Semester_Fees_Report.csv');
  if (fs.existsSync(filePath)) {
    res.download(filePath, 'Student_User_Master_Semester_Fees_Report.csv');
  } else {
    generateAllReports();
    res.download(filePath, 'Student_User_Master_Semester_Fees_Report.csv');
  }
});

// Standard REST API Routes
app.post('/api/connect', async (req, res) => {
  const { uri } = req.body;
  if (!uri) return res.status(400).json({ error: 'MongoDB URI is required' });

  const success = await connectToMongo(uri);
  res.json({
    connected: isConnectedToLiveDb,
    uri: currentUri,
    dbName: currentDbName,
    mode: isConnectedToLiveDb ? 'LIVE_MONGODB' : 'SANDBOX_MOCK',
    error: connectionError
  });
});

app.get('/api/db/stats', async (req, res) => {
  try {
    if (isConnectedToLiveDb && currentDb) {
      const stats = await currentDb.stats();
      const collections = await currentDb.listCollections().toArray();
      res.json({
        dbName: currentDbName,
        mode: 'LIVE_MONGODB',
        collectionsCount: collections.length,
        documentsCount: stats.objects || 0,
        dataSizeMB: (stats.dataSize / (1024 * 1024)).toFixed(2),
        storageSizeMB: (stats.storageSize / (1024 * 1024)).toFixed(2),
        indexesCount: stats.indexes || 0,
        connectedUri: currentUri
      });
    } else {
      let totalDocs = 0;
      Object.values(mockData).forEach(arr => totalDocs += arr.length);
      res.json({
        dbName: currentDbName,
        mode: 'SANDBOX_MOCK',
        collectionsCount: Object.keys(mockData).length,
        documentsCount: totalDocs,
        dataSizeMB: (0.45).toFixed(2),
        storageSizeMB: (1.20).toFixed(2),
        indexesCount: 14,
        connectedUri: currentUri
      });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/collections', async (req, res) => {
  try {
    if (isConnectedToLiveDb && currentDb) {
      const collectionsRaw = await currentDb.listCollections().toArray();
      const collections = await Promise.all(collectionsRaw.map(async c => {
        const count = await currentDb.collection(c.name).countDocuments();
        return { name: c.name, count, type: 'collection' };
      }));
      res.json({ collections });
    } else {
      const collections = Object.keys(mockData).map(key => ({
        name: key,
        count: mockData[key].length,
        type: 'collection'
      }));
      res.json({ collections });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/collections/:name/schema', async (req, res) => {
  const collName = req.params.name;
  try {
    let docs = [];
    if (isConnectedToLiveDb && currentDb) {
      docs = await currentDb.collection(collName).find().limit(100).toArray();
    } else {
      docs = mockData[collName] || [];
    }
    const schema = inferSchema(docs);
    res.json({ collection: collName, schema, documentCount: docs.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/collections/:name/documents', async (req, res) => {
  const collName = req.params.name;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const search = req.query.search || '';

  try {
    if (isConnectedToLiveDb && currentDb) {
      const query = search ? { $text: { $search: search } } : {};
      const total = await currentDb.collection(collName).countDocuments(query);
      const docs = await currentDb.collection(collName)
        .find(query)
        .skip((page - 1) * limit)
        .limit(limit)
        .toArray();
      res.json({ documents: docs, total, page, totalPages: Math.ceil(total / limit) });
    } else {
      let docs = mockData[collName] ? [...mockData[collName]] : [];
      if (search) {
        const searchLower = search.toLowerCase();
        docs = docs.filter(d => JSON.stringify(d).toLowerCase().includes(searchLower));
      }
      const total = docs.length;
      const paginatedDocs = docs.slice((page - 1) * limit, page * limit);
      res.json({ documents: paginatedDocs, total, page, totalPages: Math.ceil(total / limit) });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🚀 BRDP Student & Fee Excel Report Generator Server`);
  console.log(`URL: http://localhost:${PORT}`);
  console.log(`====================================================`);
});
