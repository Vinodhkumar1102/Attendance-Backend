require('dotenv').config();

const cors = require('cors');
const express = require('express');
const connectDB = require('./config/db');
const adminRoutes = require('./routes/adminRoutes');
const departmentRoutes = require('./routes/departmentRoutes');
const employeeRoutes = require('./routes/employeeRoutes');
const companyProfileRoutes = require('./routes/companyProfileRoutes');
const holidayRoutes = require('./routes/holidayRoutes');
const userRoutes = require('./routes/userRoutes');
const attendanceRoutes = require('./routes/attendanceRoutes');
const leaveRoutes = require('./routes/leaveRoutes');
const payrollRoutes = require('./routes/payrollRoutes');
const contactRoutes = require('./routes/contactRoutes');

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
app.use('/api/admin', adminRoutes);
app.use('/api/departments', departmentRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/company-profile', companyProfileRoutes);
app.use('/api/holidays', holidayRoutes);
app.use('/api/users', userRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/leaves', leaveRoutes);
app.use('/api/payroll', payrollRoutes);
app.use('/api/contact', contactRoutes);
app.use('/uploads', express.static('uploads'));

app.get('/api', (request, response) => {
  response.json({status: 'ok', message: 'Attendance backend is running'});
});

const startServer = async () => {
  try {
    await connectDB();

    app.listen(port, () => {
      console.log(`Backend server listening on http://localhost:${port}`);
    });
  } catch (error) {
    process.exitCode = 1;
  }
};

startServer();
