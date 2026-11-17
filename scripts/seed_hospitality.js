const { db } = require('../src/config/database');

async function seedHospitalityDefaults() {
  console.log('[Seed] Updating property imagery and photo gallery...');
  const defaultPropertyGallery = [
    {
      id: 'prop_img_1',
      image_url: 'https://images.unsplash.com/photo-1540555700478-4be289fbecef?auto=format&fit=crop&w=1200&q=80',
      caption: 'Resort Beachfront Sunset Deck',
      category: 'Beachfront & Exterior',
      alt_text: 'Beachfront Sunset Deck with Ocean View',
      is_primary: true
    },
    {
      id: 'prop_img_2',
      image_url: 'https://images.unsplash.com/photo-1571896349842-33c89424de2d?auto=format&fit=crop&w=1200&q=80',
      caption: 'Infinity Pool & Coconut Palms',
      category: 'Pool & Recreation',
      alt_text: 'Resort Infinity Swimming Pool',
      is_primary: false
    },
    {
      id: 'prop_img_3',
      image_url: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1200&q=80',
      caption: 'Open-Air Coastal Dining & Bar',
      category: 'Dining & Restaurant',
      alt_text: 'Beachside Coastal Restaurant',
      is_primary: false
    },
    {
      id: 'prop_img_4',
      image_url: 'https://images.unsplash.com/photo-1596394516093-501ba68a0ba6?auto=format&fit=crop&w=1200&q=80',
      caption: 'Tropical Gardens & Pathway',
      category: 'Gardens & Campus',
      alt_text: 'Lush Tropical Garden Pathway',
      is_primary: false
    },
    {
      id: 'prop_img_5',
      image_url: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1200&q=80',
      caption: 'Direct Beach Access & Sunset Gazebos',
      category: 'Beachfront & Exterior',
      alt_text: 'Direct Golden Sand Beach Access',
      is_primary: false
    }
  ];

  db.prepare(`
    UPDATE properties 
    SET cover_image_url = 'https://images.unsplash.com/photo-1540555700478-4be289fbecef?auto=format&fit=crop&w=1600&q=80',
        logo_url = 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=400&q=80',
        gallery_json = ?
    WHERE id = 1
  `).run(JSON.stringify(defaultPropertyGallery));

  console.log('[Seed] Inserting room photographs...');
  db.prepare('DELETE FROM hospitality_room_images WHERE property_id = 1').run();

  const images = [
    // Deluxe Sea View Room (id: 1)
    { room_type_id: 1, image_url: 'https://images.unsplash.com/photo-1590490360182-c33d57733427?auto=format&fit=crop&w=1200&q=80', caption: 'Oceanfront Balcony & Master Bedroom', alt_text: 'Deluxe Sea View Balcony', is_primary: 1, display_order: 1 },
    { room_type_id: 1, image_url: 'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&w=1200&q=80', caption: 'King Sized Bed with Sea Breeze', alt_text: 'Deluxe King Bed', is_primary: 0, display_order: 2 },
    { room_type_id: 1, image_url: 'https://images.unsplash.com/photo-1584132967334-10e028bd69f7?auto=format&fit=crop&w=1200&q=80', caption: 'En-suite Luxury Bath with Rain Shower', alt_text: 'Deluxe Bathroom', is_primary: 0, display_order: 3 },

    // Luxury Coconut Cottage (id: 2)
    { room_type_id: 2, image_url: 'https://images.unsplash.com/photo-1566665797739-1674de7a421a?auto=format&fit=crop&w=1200&q=80', caption: 'Private Garden Cottage Exterior & Porch', alt_text: 'Cottage Exterior', is_primary: 1, display_order: 1 },
    { room_type_id: 2, image_url: 'https://images.unsplash.com/photo-1618773928121-c32242e63f39?auto=format&fit=crop&w=1200&q=80', caption: 'Rustic Wooden Interiors with Garden View', alt_text: 'Cottage Bedroom Interior', is_primary: 0, display_order: 2 },

    // Family Ocean Suite (id: 3)
    { room_type_id: 3, image_url: 'https://images.unsplash.com/photo-1631049307264-da0ec9d70304?auto=format&fit=crop&w=1200&q=80', caption: 'Panoramic Two-Bedroom Ocean Suite', alt_text: 'Family Ocean Suite Panoramic', is_primary: 1, display_order: 1 },
    { room_type_id: 3, image_url: 'https://images.unsplash.com/photo-1595576508898-0ad5c879a061?auto=format&fit=crop&w=1200&q=80', caption: 'Living Lounge & Sunset Balcony', alt_text: 'Suite Living Lounge', is_primary: 0, display_order: 2 }
  ];

  const insertImg = db.prepare(`
    INSERT INTO hospitality_room_images (
      tenant_id, property_id, room_type_id, image_url, caption, alt_text, is_primary, display_order
    ) VALUES (1, 1, ?, ?, ?, ?, ?, ?)
  `);

  for (const img of images) {
    insertImg.run(img.room_type_id, img.image_url, img.caption, img.alt_text, img.is_primary, img.display_order);
    if (img.is_primary) {
      db.prepare('UPDATE room_types SET primary_image_url = ? WHERE id = ?').run(img.image_url, img.room_type_id);
    }
  }

  console.log('[Seed] Seeding physical rooms if empty...');
  const physCount = Number(db.prepare('SELECT COUNT(*) as c FROM hospitality_physical_rooms WHERE property_id = 1').get()?.c || 0);
  if (physCount === 0) {
    const insertRoom = db.prepare(`
      INSERT INTO hospitality_physical_rooms (
        tenant_id, property_id, room_type_id, room_number, floor_or_building, operational_status, notes
      ) VALUES (1, 1, ?, ?, ?, ?, ?)
    `);
    insertRoom.run(1, '101', 'Ground Floor - Ocean Wing', 'OPERATIONAL', 'Direct beach access');
    insertRoom.run(1, '102', 'Ground Floor - Ocean Wing', 'OPERATIONAL', 'Prime garden & sea view');
    insertRoom.run(1, '103', 'First Floor - Ocean Wing', 'MAINTENANCE', 'Scheduled AC filter cleaning');
    insertRoom.run(2, 'C-01', 'Coconut Grove Sector', 'OPERATIONAL', 'Private hammock included');
    insertRoom.run(2, 'C-02', 'Coconut Grove Sector', 'OPERATIONAL', 'Quiet private pathway');
    insertRoom.run(3, '301', 'Penthouse Level', 'OPERATIONAL', 'Corner master suite with jacuzzi');
  }

  console.log('[Seed] Seeding completed successfully!');
}

seedHospitalityDefaults().catch(err => {
  console.error('[Seed Error]', err);
  process.exit(1);
});
