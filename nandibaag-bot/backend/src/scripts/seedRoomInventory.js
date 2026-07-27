#!/usr/bin/env node

/**
 * Idempotent seed script for Series and Room inventory.
 * Usage: npm run seed-rooms
 */

require('dotenv').config();
const mongoose = require('mongoose');
const { Series, Room } = require('../models');
const { mongoUri } = require('../config/env');

function range(start, end) {
  const nums = [];
  for (let i = start; i <= end; i++) {
    nums.push(String(i));
  }
  return nums;
}

const SEED_DATA = [
  {
    name: '100 Series',
    rooms: [
      { numbers: range(101, 106), capacity: 5 },
      { numbers: range(107, 110), capacity: 4 }
    ]
  },
  {
    name: '200 Series',
    rooms: [
      { numbers: range(201, 210), capacity: 4 }
    ]
  },
  {
    name: '500 Series',
    rooms: [
      { numbers: range(501, 509), capacity: 4 },
      { numbers: ['510'], capacity: 10 },
      { numbers: range(511, 515), capacity: 4 }
    ]
  },
  {
    name: '600 Series',
    rooms: [
      { numbers: range(601, 602), capacity: 4 },
      { numbers: ['603'], capacity: 22 },
      { numbers: range(604, 607), capacity: 4 },
      { numbers: ['608'], capacity: 18 },
      { numbers: range(609, 610), capacity: 4 },
      { numbers: ['611'], capacity: 2 },
      { numbers: range(612, 621), capacity: 4 },
      { numbers: ['622'], capacity: 2 }
    ]
  }
];

async function seed() {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║          Nandibaag — Room Inventory Seed                    ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(`  MongoDB: ${mongoUri}`);
  console.log('');

  await mongoose.connect(mongoUri);

  const summary = [];

  for (const seriesData of SEED_DATA) {
    let series = await Series.findOne({ name: seriesData.name });
    let seriesCreated = false;

    if (!series) {
      series = new Series({ name: seriesData.name, status: 'active' });
      await series.save();
      seriesCreated = true;
      console.log(`  ✅ Created series: ${seriesData.name}`);
    } else {
      console.log(`  ⏭️  Skipped series (exists): ${seriesData.name}`);
    }

    let roomsCreated = 0;
    let roomsSkipped = 0;

    for (const group of seriesData.rooms) {
      for (const roomNumber of group.numbers) {
        const existing = await Room.findOne({ seriesId: series._id, roomNumber });
        if (existing) {
          roomsSkipped++;
          continue;
        }

        const room = new Room({
          seriesId: series._id,
          roomNumber,
          capacity: group.capacity,
          status: 'active'
        });
        await room.save();
        roomsCreated++;
      }
    }

    const totalRooms = await Room.countDocuments({
      seriesId: series._id,
      status: { $ne: 'deleted' }
    });

    summary.push({
      name: seriesData.name,
      seriesCreated,
      roomsCreated,
      roomsSkipped,
      totalRooms
    });

    if (seriesData.rooms.length > 0) {
      console.log(`     Rooms: ${roomsCreated} created, ${roomsSkipped} skipped (total: ${totalRooms})`);
    } else {
      console.log(`     Rooms: none seeded (total: ${totalRooms})`);
    }
  }

  console.log('');
  console.log('── Summary ─────────────────────────────────────────────────');
  for (const s of summary) {
    console.log(`  ${s.name}: ${s.totalRooms} rooms (${s.roomsCreated} created, ${s.roomsSkipped} skipped)`);
  }
  console.log('');
  console.log('  Expected: 100 Series=10, 200 Series=0, 500 Series=15, 600 Series=22');
  console.log('  Done.\n');

  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
