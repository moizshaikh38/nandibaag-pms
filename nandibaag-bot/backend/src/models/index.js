const User = require('./User');
const Chat = require('./Chat');
const Lead = require('./Lead');
const FollowUp = require('./FollowUp');
const Booking = require('./Booking');
const Settings = require('./Settings');
const Series = require('./Series');
const Room = require('./Room');
const RoomBooking = require('./RoomBooking');
const MessageLog = require('./MessageLog');
const Session = require('./Session');
const ActivityLog = require('./ActivityLog');

module.exports = {
  User,
  Chat,
  Lead,
  FollowUp,
  Booking,
  Settings,
  Series,
  Room,
  RoomBooking,
  MessageLog,
  Session,
  ActivityLog,
  BaileysAuth: require('./BaileysAuth'),
  MessageQueue: require('./MessageQueue'),
  FailedMessage: require('./FailedMessage'),
  Staff: require('./Staff'),
  RoomReservation: require('./RoomReservation')
};
