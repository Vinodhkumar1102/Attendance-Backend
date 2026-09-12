const test = require('node:test');
const assert = require('node:assert/strict');

const {buildAdminLeaveNotification} = require('../controllers/leaveController');

test('buildAdminLeaveNotification creates a valid admin notification payload', () => {
  const leave = {
    _id: 'leave_123',
    employeeId: 'DV01',
    employeeName: 'John Smith',
    leaveType: 'Casual Leave',
    startDate: '2026-09-10',
    endDate: '2026-09-12',
    reason: 'Family event',
    status: 'Pending',
    createdAt: '2026-09-10T08:00:00.000Z'
  };

  const notification = buildAdminLeaveNotification(leave);

  assert.equal(notification.type, 'Leave');
  assert.equal(notification.title, 'New Leave Request');
  assert.equal(notification.message, 'John Smith requested Casual Leave for 3 days.');
  assert.equal(notification.status, 'Pending');
  assert.equal(notification.targetType, 'leave');
  assert.equal(notification.referenceId, 'leave_123');
  assert.equal(notification.unread, true);
});
