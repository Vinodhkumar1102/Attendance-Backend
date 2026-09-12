const test = require('node:test');
const assert = require('node:assert/strict');

const {buildProfileUpdateNotification} = require('../controllers/employeeController');

test('buildProfileUpdateNotification creates an employee profile update notice', () => {
  const employee = {
    employeeId: 'DV05',
    fullName: 'Jane Doe',
    email: 'jane@example.com',
  };

  const notification = buildProfileUpdateNotification(employee, '2025-01-02T15:00:00.000Z');

  assert.equal(notification.type, 'Profile Update');
  assert.equal(notification.title, 'Profile Updated');
  assert.match(notification.message, /Jane Doe|profile/i);
  assert.equal(notification.unread, true);
  assert.equal(notification.status, 'Info');
  assert.ok(notification.id.includes('profile-'));
  assert.ok(notification.date);
});
