const test = require('node:test');
const assert = require('node:assert/strict');
const webhookService = require('../src/services/webhookService');
const metaWhatsAppService = require('../src/services/metaWhatsAppService');
const catalogService = require('../src/services/catalogService');
const messageExecutor = require('../src/services/workflow/nodeExecutors/messageExecutor');

test('Photo & Media Attachment Verification Suite', async (t) => {
  await t.test('1. Auto-Reply Bot Settings persists and returns welcomeMediaUrl', () => {
    const testUrl = 'https://resort.example.com/images/welcome-banner.jpg';
    webhookService.saveAutoReplySettings({
      welcomeMediaUrl: testUrl
    });

    const settings = webhookService.getAutoReplySettings();
    assert.equal(settings.welcomeMediaUrl, testUrl, 'welcomeMediaUrl must be persisted and returned');
  });

  await t.test('2. metaWhatsAppService.sendInteractiveButtons builds image header when headerMediaUrl is provided', async () => {
    const testMediaUrl = 'https://example.com/photo.png';
    const result = await metaWhatsAppService.sendInteractiveButtons({
      to: '919876543210',
      bodyText: 'Welcome to KonkanTrip Resort!',
      buttons: [{ id: 'b1', title: 'Book Now' }],
      headerMediaUrl: testMediaUrl,
      customCredentials: { isSimulation: true }
    });

    assert.equal(result.success, true);
    assert.ok(result.messageId);
    assert.equal(result.interactive.header.type, 'image');
    assert.equal(result.interactive.header.image.link, testMediaUrl);
  });

  await t.test('3. metaWhatsAppService.sendMediaMessage sends media message cleanly in simulation mode', async () => {
    const result = await metaWhatsAppService.sendMediaMessage({
      to: '919876543210',
      type: 'image',
      mediaUrl: 'https://example.com/villa.jpg',
      caption: 'Deluxe Sea Villa',
      customCredentials: { isSimulation: true }
    });

    assert.equal(result.success, true);
    assert.ok(result.messageId);
    assert.equal(result.type, 'image');
    assert.equal(result.mediaObject.link, 'https://example.com/villa.jpg');
    assert.equal(result.mediaObject.caption, 'Deluxe Sea Villa');
  });

  await t.test('4. Flow messageExecutor extracts mediaUrl, mediaType, and caption for SEND_MESSAGE step', async () => {
    const node = {
      id: 'node_photo_msg',
      type: 'SEND_MESSAGE',
      config: {
        text: 'Here is our beachfront view!',
        mediaUrl: 'https://resort.example.com/beach.jpg',
        mediaType: 'IMAGE',
        caption: 'Sunset over Konkan Beach'
      }
    };

    const execResult = await messageExecutor.execute(node, {
      variableContext: { contact: { name: 'Sunil' } }
    });

    assert.equal(execResult.action, 'CONTINUE');
    assert.ok(execResult.replyInteractive);
    assert.equal(execResult.replyInteractive.mediaUrl, 'https://resort.example.com/beach.jpg');
    assert.equal(execResult.replyInteractive.mediaType, 'IMAGE');
    assert.equal(execResult.replyInteractive.caption, 'Sunset over Konkan Beach');
  });

  await t.test('5. Catalog item supports image_url persistence in catalogService', () => {
    const entity = catalogService.createEntity({
      name: 'Test Photo Resort ' + Date.now(),
      domain: 'HOSPITALITY',
      phone_e164: '+919876543210',
      city: 'Alibaug'
    }, 1, 'system');

    const item = catalogService.createItem(entity.id, {
      title: 'Ocean Suite',
      item_type: 'ROOM',
      base_price: 6500,
      image_url: 'https://resort.example.com/ocean-suite.jpg'
    }, 1);

    assert.ok(item.id);
    assert.equal(item.image_url, 'https://resort.example.com/ocean-suite.jpg');

    const updated = catalogService.updateItem(item.id, {
      image_url: 'https://resort.example.com/ocean-suite-updated.jpg'
    }, 1, 'system');

    assert.equal(updated.image_url, 'https://resort.example.com/ocean-suite-updated.jpg');
  });
});
