const test = require('node:test');
const assert = require('node:assert/strict');

const {buildPayrollNotification} = require('../controllers/payrollController');

test('buildPayrollNotification creates a payroll status notification for the employee', () => {
  const employee = {employeeId: 'DV05', fullName: 'Jane Doe'};
  const payroll = {_id: 'p123', payMonth: 'September 2026', status: 'Paid'};

  const notification = buildPayrollNotification(employee, payroll, 'Status Updated');

  assert.equal(notification.type, 'Payroll');
  assert.equal(notification.title, 'Payroll Updated');
  assert.match(notification.message, /September 2026|Paid/i);
  assert.equal(notification.unread, true);
  assert.equal(notification.status, 'Paid');
  assert.ok(notification.id.includes('payroll-'));
  assert.ok(notification.date);
});
