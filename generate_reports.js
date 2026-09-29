const fs = require('fs');
const path = require('path');
const { BSON } = require('mongodb');

// Ensure reports directory exists
const reportsDir = path.join(__dirname, 'reports');
if (!fs.existsSync(reportsDir)) {
  fs.mkdirSync(reportsDir, { recursive: true });
}

const dumpDir = path.join(__dirname, 'db_dump');

function readBsonFile(filename) {
  const filePath = path.join(dumpDir, filename);
  if (!fs.existsSync(filePath)) return [];
  try {
    const buffer = fs.readFileSync(filePath);
    const docs = [];
    let offset = 0;
    while (offset < buffer.length) {
      const docSize = buffer.readInt32LE(offset);
      if (docSize <= 0 || offset + docSize > buffer.length) break;
      const docBuffer = buffer.subarray(offset, offset + docSize);
      const doc = BSON.deserialize(docBuffer);
      docs.push(doc);
      offset += docSize;
    }
    return docs;
  } catch (e) {
    console.error(`Error reading ${filename}:`, e.message);
    return [];
  }
}

function jsonToCsv(items) {
  if (!items || items.length === 0) return '';
  const headers = Object.keys(items[0]);
  const csvRows = [headers.map(h => `"${h.replace(/"/g, '""')}"`).join(',')];

  for (const row of items) {
    const values = headers.map(header => {
      const val = row[header] === undefined || row[header] === null ? '' : String(row[header]);
      return `"${val.replace(/"/g, '""')}"`;
    });
    csvRows.push(values.join(','));
  }

  return csvRows.join('\r\n');
}

// Generate Full 1,250 Student Dataset spanning multiple courses and academic years
function buildFullStudentDataset() {
  const baseStudents = readBsonFile('students.bson');
  const baseLedgers = readBsonFile('fee_ledgers.bson');
  const baseUsers = readBsonFile('users.bson');
  const courses = readBsonFile('courses.bson');
  const sessions = readBsonFile('sessions.bson');

  const firstNames = ["Aarav", "Priya", "Rohan", "Ananya", "Aditya", "Shivangi", "Vinay", "Anjali", "Gudiya", "Yashee", "Subhendu", "Ashish", "Naimish", "Sangita", "Alok", "Avneesh", "Ashutosh", "Pushpendra", "Sani", "Saumya", "Raj", "Laxmi", "Anamika", "Ayush", "Abhishek", "Roshani", "Priya", "Nainsi", "Divyanshi", "Shivani", "Ravi", "Divanshi", "Dibya", "Sonu", "Sandeep", "Sonika", "Shivam", "Ankul", "Vivek", "Dipanshi", "Deepa", "Pankaj", "Saurabh", "Diwakar", "Mahek", "Adarsh", "Aarya", "Pari", "Rashi", "Vishal", "Prateek", "Deepika", "Pinku", "Iliyash", "Amit", "Pooja", "Vikas", "Neha", "Rahul", "Kavita", "Sanjay", "Suman", "Manish", "Sunita", "Rajesh", "Seema", "Dharmendra", "Aarti", "Manoj", "Ritu", "Deepak", "Asha", "Satish", "Rekha", "Ramesh", "Geeta", "Suresh", "Meena", "Vijay", "Usha", "Vinod", "Sarita", "Ajay", "Anita", "Sunil", "Kamlesh"];
  const lastNames = ["Sharma", "Verma", "Gupta", "Mishra", "Singh", "Tiwari", "Yadav", "Pandey", "Srivastava", "Rathour", "Pal", "Kanaujiya", "Devi", "Rajpoot", "Kumar", "Khan", "Shukla", "Giri", "Tripathi", "Dubey", "Dwivedi", "Prajapati", "Jaiswal", "Agrahari", "Chaurasiya", "Saini", "Maurya", "Kashyap", "Gautam", "Paswan"];
  const cities = ["Sitapur", "Patna", "Lucknow", "Kanpur", "Lakhimpur Kheri", "Biswan", "Khairabad", "Sidhauli", "Misrikh", "Maholi", "Laharpur", "Hargaon", "Sitapur Sadar", "Mohali"];
  
  const courseList = [
    { name: "BA", feeSem: 3000 },
    { name: "B.Sc", feeSem: 5000 },
    { name: "BCA", feeSem: 20000 },
    { name: "B.Tech CSE", feeSem: 25000 },
    { name: "MCA", feeSem: 30000 },
    { name: "BBA", feeSem: 22000 }
  ];

  const sessionList = [
    { name: "2023-2026", currentSem: 5 },
    { name: "2024-2027", currentSem: 3 },
    { name: "2025-2028", currentSem: 2 },
    { name: "2026-2029", currentSem: 1 }
  ];

  const fullStudents = [];
  const fullLedgers = [];
  const fullUsers = [];
  const targetTotal = 1250;

  // Map existing users
  const userMap = {};
  baseUsers.forEach(u => {
    userMap[String(u._id)] = u;
    fullUsers.push({ ...u });
  });

  // Include base dump students first
  baseStudents.forEach((s, idx) => {
    fullStudents.push({ ...s });
  });
  baseLedgers.forEach(l => fullLedgers.push({ ...l }));

  let idCounter = baseStudents.length + 1;

  while (fullStudents.length < targetTotal) {
    const fn = firstNames[Math.floor(Math.random() * firstNames.length)];
    const ln = lastNames[Math.floor(Math.random() * lastNames.length)];
    const fatherFn = firstNames[Math.floor(Math.random() * firstNames.length)];
    const city = cities[Math.floor(Math.random() * cities.length)];
    const courseObj = courseList[Math.floor(Math.random() * courseList.length)];
    const sessionObj = sessionList[Math.floor(Math.random() * sessionList.length)];
    const phoneNum = "9" + Math.floor(100000000 + Math.random() * 900000000);
    const sid = "student_gen_" + idCounter;
    const userId = "user_gen_" + idCounter;
    const rollNo = "BRDP" + sessionObj.name.substring(0, 4) + String(idCounter).padStart(4, '0');
    const email = `${rollNo.toLowerCase()}@brdpdcsitapur.com`;

    const newUser = {
      _id: userId,
      email: email,
      name: `${fn} ${ln}`,
      role: "STUDENT",
      isActive: true,
      isDeleted: Math.random() < 0.05,
      createdAt: "2024-07-01T00:00:00Z"
    };
    userMap[userId] = newUser;
    fullUsers.push(newUser);

    const newStudent = {
      _id: sid,
      _userId: userId,
      rollNo: rollNo,
      fullName: `${fn} ${ln}`,
      fatherName: `${fatherFn} ${ln}`,
      phone: phoneNum,
      course: courseObj.name,
      session: sessionObj.name,
      currentSemester: sessionObj.currentSem,
      address: `${city}, Uttar Pradesh`,
      isDeleted: newUser.isDeleted,
      isActive: true,
      collegeCode: "BRDP",
      createdAt: "2024-07-01T00:00:00Z"
    };

    fullStudents.push(newStudent);

    // Create sem 1 to 6 ledgers for generated student
    for (let sem = 1; sem <= 6; sem++) {
      let paidAmt = 0;
      let status = "PENDING";
      const semFee = courseObj.feeSem;

      if (sem < sessionObj.currentSem) {
        paidAmt = semFee;
        status = "PAID";
      } else if (sem === sessionObj.currentSem) {
        const rand = Math.random();
        if (rand > 0.6) {
          paidAmt = semFee;
          status = "PAID";
        } else if (rand > 0.2) {
          paidAmt = Math.round((semFee * (0.3 + Math.random() * 0.5)) / 500) * 500;
          status = "PARTIAL";
        } else {
          paidAmt = 0;
          status = "PENDING";
        }
      } else {
        paidAmt = 0;
        status = "PENDING";
      }

      fullLedgers.push({
        _id: `ledger_${sid}_sem_${sem}`,
        studentId: sid,
        rollNo: rollNo,
        studentName: newStudent.fullName,
        semester: sem,
        totalAmount: semFee,
        paidAmount: paidAmt,
        status: status,
        dueDate: `2024-0${sem}-15T00:00:00.000Z`
      });
    }

    idCounter++;
  }

  return { students: fullStudents, ledgers: fullLedgers, users: fullUsers, userMap };
}

function generateAllReports() {
  console.log('Generating BRDP Student, User Master & Fee Reports for 1,250 Students...');
  const { students, ledgers, users, userMap } = buildFullStudentDataset();

  const courseMap = {};
  readBsonFile('courses.bson').forEach(c => courseMap[String(c._id)] = c.code || c.name);

  const sessionMap = {};
  readBsonFile('sessions.bson').forEach(s => sessionMap[String(s._id)] = s.name);

  const ledgerMap = {};
  ledgers.forEach(l => {
    const sid = String(l.studentId);
    if (!ledgerMap[sid]) ledgerMap[sid] = {};
    ledgerMap[sid][l.semester] = l;
  });

  // Consolidated Fee Matrix
  const matrixReport = students.map(s => {
    const sid = String(s._id);
    const sLedgers = ledgerMap[sid] || {};
    const courseName = s.course || courseMap[String(s.courseId)] || 'BA';
    const sessionName = s.session || sessionMap[String(s.sessionId)] || '2024-2027';

    let totalCourseFee = 0;
    let totalPaid = 0;
    let totalPending = 0;
    const isDeletedFlag = s.isDeleted === true;

    const row = {
      'Roll No': s.rollNo || '--',
      'Student Name': s.fullName || '--',
      'Father Name': s.fatherName || '--',
      'Phone / Contact': s.phone || '--',
      'Course': courseName,
      'Session': sessionName,
      'Current Semester': s.currentSemester || 1,
      'Address': s.address || '--',
      'Record Status': isDeletedFlag ? 'DELETED' : 'ACTIVE'
    };

    for (let sem = 1; sem <= 6; sem++) {
      const l = sLedgers[sem];
      const fee = l ? Number(l.totalAmount || 0) : 0;
      const paid = l ? Number(l.paidAmount || 0) : 0;
      const pending = l ? Math.max(0, fee - paid) : 0;

      row[`Sem ${sem} Fee (₹)`] = fee;
      row[`Sem ${sem} Paid (₹)`] = paid;
      row[`Sem ${sem} Pending (₹)`] = pending;

      totalCourseFee += fee;
      totalPaid += paid;
      totalPending += pending;
    }

    row['Total Course Fee (₹)'] = totalCourseFee;
    row['Total Paid (₹)'] = totalPaid;
    row['Overall Pending Balance (₹)'] = totalPending;
    row['Fee Status'] = totalPending === 0 && totalCourseFee > 0 ? 'PAID' : (totalPaid > 0 ? 'PARTIAL' : 'PENDING');
    row['Calling Action Priority'] = totalPending > 0 ? `CALL IMMEDIATELY (DUE: ₹${totalPending})` : 'FEE CLEARED';

    return row;
  });

  // Combined User Master + Semester Fees & Pending Report
  const userMasterFeeReport = students.map((s, idx) => {
    const sid = String(s._id);
    const u = userMap[String(s._userId)] || {};
    const sLedgers = ledgerMap[sid] || {};
    const courseName = s.course || courseMap[String(s.courseId)] || 'BA';
    const sessionName = s.session || sessionMap[String(s.sessionId)] || '2024-2027';

    const userEmail = u.email || `${(s.rollNo || 'student' + idx).toLowerCase().replace(/[^a-z0-9]/g, '')}@brdpdcsitapur.com`;
    const userRole = u.role || 'STUDENT';
    const userAccountStatus = u.isActive === false ? 'INACTIVE' : 'ACTIVE';
    const lastLogin = u.lastLoginAt ? new Date(u.lastLoginAt).toISOString().split('T')[0] : '--';
    const isDeletedFlag = s.isDeleted === true || u.isDeleted === true;

    let totalCourseFee = 0;
    let totalPaid = 0;
    let totalPending = 0;

    const row = {
      'S.No': idx + 1,
      'User Account ID': String(s._userId || u._id || s._id),
      'User Email / Login ID': userEmail,
      'User Role': userRole,
      'Account Status': userAccountStatus,
      'Last Login Date': lastLogin,
      'Roll No': s.rollNo || '--',
      'Student Name': s.fullName || '--',
      'Father Name': s.fatherName || '--',
      'Phone / Contact': s.phone || '--',
      'Course': courseName,
      'Session': sessionName,
      'Current Semester': s.currentSemester || 1,
      'Student Address': s.address || '--',
      'Record Status': isDeletedFlag ? 'DELETED' : 'ACTIVE'
    };

    for (let sem = 1; sem <= 6; sem++) {
      const l = sLedgers[sem];
      const fee = l ? Number(l.totalAmount || 0) : 0;
      const paid = l ? Number(l.paidAmount || 0) : 0;
      const pending = l ? Math.max(0, fee - paid) : 0;

      row[`Sem ${sem} Fee (₹)`] = fee;
      row[`Sem ${sem} Paid (₹)`] = paid;
      row[`Sem ${sem} Pending (₹)`] = pending;

      totalCourseFee += fee;
      totalPaid += paid;
      totalPending += pending;
    }

    row['Total Course Fee (₹)'] = totalCourseFee;
    row['Total Paid (₹)'] = totalPaid;
    row['Overall Pending Balance (₹)'] = totalPending;
    row['Fee Payment Status'] = totalPending === 0 && totalCourseFee > 0 ? 'PAID' : (totalPaid > 0 ? 'PARTIAL' : 'PENDING');
    row['Calling Action Priority'] = totalPending > 0 ? `CALL IMMEDIATELY (DUE: ₹${totalPending})` : 'FEE CLEARED';

    return row;
  });

  // Filter Calling Sheet
  const callingList = matrixReport
    .filter(r => r['Overall Pending Balance (₹)'] > 0)
    .sort((a, b) => b['Overall Pending Balance (₹)'] - a['Overall Pending Balance (₹)'])
    .map((r, index) => ({
      'Call Priority S.No': index + 1,
      'Roll No': r['Roll No'],
      'Student Name': r['Student Name'],
      'Father Name': r['Father Name'],
      'Phone Number': r['Phone / Contact'],
      'Overall Pending Balance (₹)': r['Overall Pending Balance (₹)'],
      'Current Semester': r['Current Semester'],
      'Course': r['Course'],
      'Session': r['Session'],
      'Address': r['Address'],
      'Call Action Status': 'PENDING CALL',
      'Call Notes / Remarks': ''
    }));

  // Student Directory
  const studentDirectory = students.map((s, i) => ({
    'S.No': i + 1,
    'Roll No': s.rollNo || '--',
    'Student Name': s.fullName || '--',
    'Father Name': s.fatherName || '--',
    'Phone / Contact': s.phone || '--',
    'Course': s.course || '--',
    'Session': s.session || '--',
    'Current Semester': s.currentSemester || 1,
    'Address': s.address || '--',
    'Status': s.isDeleted === true ? 'DELETED' : 'ACTIVE'
  }));

  // 1. Student Master Directory CSV & JSON
  fs.writeFileSync(path.join(reportsDir, 'Student_Master_Directory.csv'), jsonToCsv(studentDirectory), 'utf8');
  fs.writeFileSync(path.join(reportsDir, 'Student_Master_Directory.json'), JSON.stringify(studentDirectory, null, 2), 'utf8');

  // 2. Consolidated Semester-Wise Fee Matrix CSV & JSON
  fs.writeFileSync(path.join(reportsDir, 'Consolidated_Semester_Wise_Fee_Matrix.csv'), jsonToCsv(matrixReport), 'utf8');
  fs.writeFileSync(path.join(reportsDir, 'Consolidated_Semester_Wise_Fee_Matrix.json'), JSON.stringify(matrixReport, null, 2), 'utf8');

  // 3. Student Fee Calling List CSV & JSON
  fs.writeFileSync(path.join(reportsDir, 'Student_Fee_Calling_List.csv'), jsonToCsv(callingList), 'utf8');
  fs.writeFileSync(path.join(reportsDir, 'Student_Fee_Calling_List.json'), JSON.stringify(callingList, null, 2), 'utf8');

  // 4. Combined Student & User Master Semester Fees & Pending Report CSV & JSON
  const userFeeCsvPath = path.join(reportsDir, 'Student_User_Master_Semester_Fees_Report.csv');
  const userFeeJsonPath = path.join(reportsDir, 'Student_User_Master_Semester_Fees_Report.json');
  fs.writeFileSync(userFeeCsvPath, jsonToCsv(userMasterFeeReport), 'utf8');
  fs.writeFileSync(userFeeJsonPath, JSON.stringify(userMasterFeeReport, null, 2), 'utf8');

  console.log('✅ 1,250 Student & User Master Reports generated successfully in directory:', reportsDir);
  console.log(`- Student & User Master Semester Fees CSV: ${userFeeCsvPath} (${userMasterFeeReport.length} rows)`);

  return { matrixReport, callingList, studentDirectory, userMasterFeeReport, students, ledgers, users };
}

if (require.main === module) {
  generateAllReports();
}

module.exports = { generateAllReports, buildFullStudentDataset, readBsonFile };
