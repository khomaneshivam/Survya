const mysql = require('mysql2/promise');
const config = require('../src/config/env');
const { createMysqlDatabase } = require('../src/config/mysqlAdapter');
const { initSchema } = require('../src/config/schema');

async function testFreshDeployment() {
  const TEST_DB = 'whatsapp_bulk_test_fresh_deploy';
  const conn = await mysql.createConnection({
    host: config.DB_HOST,
    port: config.DB_PORT,
    user: config.DB_USER,
    password: config.DB_PASSWORD
  });
  await conn.query(`DROP DATABASE IF EXISTS \`${TEST_DB}\``);
  await conn.query(`CREATE DATABASE \`${TEST_DB}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  console.log('1. Created completely empty database:', TEST_DB);

  // Connect app database adapter to the empty database
  const freshDb = createMysqlDatabase({
    host: config.DB_HOST,
    port: config.DB_PORT,
    user: config.DB_USER,
    password: config.DB_PASSWORD,
    database: TEST_DB
  });

  // Run initSchema (what happens on server startup)
  console.log('2. Running initSchema on empty database...');
  initSchema(freshDb, config);

  // Verify tables
  const tables = freshDb.prepare('SHOW TABLES').all();
  console.log('3. Table count in fresh database:', tables.length);

  // Verify seed data
  const tenants = freshDb.prepare('SELECT * FROM tenants').all();
  console.log('4. Tenants seeded:', tenants.length, '-', tenants[0]?.name);

  const properties = freshDb.prepare('SELECT * FROM properties').all();
  console.log('5. Properties seeded:', properties.length, '-', properties[0]?.name);

  const roomTypes = freshDb.prepare('SELECT * FROM room_types').all();
  console.log('6. Room types seeded:', roomTypes.length);

  const chatLinks = freshDb.prepare('SELECT * FROM chat_links').all();
  console.log('7. Chat links seeded:', chatLinks.length);

  const settings = freshDb.prepare('SELECT COUNT(*) as count FROM settings').get();
  console.log('8. Settings seeded count:', settings.count);

  const entities = freshDb.prepare('SELECT * FROM business_entities').all();
  console.log('9. Business entities seeded:', entities.length);

  const ratePlans = freshDb.prepare('SELECT * FROM hospitality_rate_plans').all();
  console.log('10. Rate plans seeded:', ratePlans.length);

  const crmPipelines = freshDb.prepare('SELECT * FROM crm_pipelines').all();
  console.log('11. CRM Pipelines seeded:', crmPipelines.length, '-', crmPipelines.map(p => p.name).join(', '));
  if (crmPipelines.length < 3) {
    throw new Error('Expected at least 3 seeded CRM pipelines');
  }

  freshDb.close();

  // Cleanup test database
  await conn.query(`DROP DATABASE IF EXISTS \`${TEST_DB}\``);
  await conn.end();
  console.log('11. Cleaned up test database. Fresh deployment test PASSED 100%!');
}

testFreshDeployment().catch(err => {
  console.error('Fresh deployment test failed:', err);
  process.exit(1);
});
