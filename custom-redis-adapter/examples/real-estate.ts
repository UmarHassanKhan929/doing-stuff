// src/examples/real-estate.ts
import RedisTableAdapter from '../src/RedisTableAdapter';

interface PropertyRow extends Record<string, string> {
  address: string;
  price: string;
  bedrooms: string;
  sqft: string;
  city: string;
}

async function realEstateExample() {
  console.log('🏠 Real Estate Listings Example\n');

  const adapter = new RedisTableAdapter();

  try {
    // Create properties table
    console.log('Creating properties table...');
    await adapter.createTable('properties', ['address', 'price', 'bedrooms', 'sqft', 'city']);
    console.log('✅ Table created\n');

    // Add properties
    console.log('Adding property listings...');
    const prop1 = await adapter.insert<PropertyRow>('properties', {
      address: '123 Main St, Downtown',
      price: '450000',
      bedrooms: '3',
      sqft: '2000',
      city: 'Austin'
    });
    console.log(`✅ Added: ${prop1} - $450k, 3BR, 2000sqft`);

    const prop2 = await adapter.insert<PropertyRow>('properties', {
      address: '456 Oak Ave, Suburb',
      price: '650000',
      bedrooms: '4',
      sqft: '2800',
      city: 'Austin'
    });
    console.log(`✅ Added: ${prop2} - $650k, 4BR, 2800sqft`);

    const prop3 = await adapter.insert<PropertyRow>('properties', {
      address: '789 Pine Rd, Historic District',
      price: '350000',
      bedrooms: '2',
      sqft: '1500',
      city: 'Dallas'
    });
    console.log(`✅ Added: ${prop3} - $350k, 2BR, 1500sqft`);

    const prop4 = await adapter.insert<PropertyRow>('properties', {
      address: '321 Elm St, Lake View',
      price: '750000',
      bedrooms: '5',
      sqft: '3200',
      city: 'Austin'
    });
    console.log(`✅ Added: ${prop4} - $750k, 5BR, 3200sqft\n`);

    // Create sorted indexes for price and size
    console.log('Creating sorted indexes...');
    await adapter.createSortedIndex('properties', 'price', [
      { id: prop1, score: 450000 },
      { id: prop2, score: 650000 },
      { id: prop3, score: 350000 },
      { id: prop4, score: 750000 }
    ]);

    await adapter.createSortedIndex('properties', 'sqft', [
      { id: prop1, score: 2000 },
      { id: prop2, score: 2800 },
      { id: prop3, score: 1500 },
      { id: prop4, score: 3200 }
    ]);
    console.log('✅ Price and size indexes created\n');

    // Find properties in price range $300k-$500k (affordable homes)
    console.log('🏠 Finding affordable homes ($300k-$500k)...');
    const affordableHomes = await adapter.getRowsBySortedField<PropertyRow>('properties', 'price', {
      minScore: 300000,
      maxScore: 500000,
      order: 'asc'
    });

    console.log(`✅ Found ${affordableHomes.length} affordable homes:`);
    affordableHomes.forEach(home => {
      console.log(`   💰 $${parseInt(home.data.price).toLocaleString()} - ${home.data.address}`);
      console.log(`      🏠 ${home.data.bedrooms}BR, ${home.data.sqft}sqft in ${home.data.city}\n`);
    });

    // Find properties by city
    console.log('🏙️  Finding all properties in Austin...');
    const austinHomes = await adapter.findByField<PropertyRow>('properties', 'city', 'Austin');
    console.log(`✅ Found ${austinHomes.length} properties in Austin:`);
    austinHomes.forEach(home => {
      console.log(`   📍 ${home.data.address} - $${parseInt(home.data.price).toLocaleString()}`);
    });
    console.log('');

    // Get largest properties (by square footage)
    console.log('📐 Finding largest properties by square footage...');
    const largestHomes = await adapter.getRowsBySortedField<PropertyRow>('properties', 'sqft', {
      order: 'desc',
      limit: 3
    });

    console.log('🏆 Top 3 largest properties:');
    largestHomes.forEach((home, index) => {
      const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉';
      console.log(`${medal} ${home.data.sqft}sqft - ${home.data.address}`);
    });
    console.log('');

    // Luxury properties (over $600k)
    console.log('💎 Finding luxury properties (over $600k)...');
    const luxuryHomes = await adapter.getRowsBySortedField<PropertyRow>('properties', 'price', {
      minScore: 600000,
      order: 'desc'
    });

    console.log(`✅ Found ${luxuryHomes.length} luxury properties:`);
    luxuryHomes.forEach(home => {
      console.log(`   🏰 $${parseInt(home.data.price).toLocaleString()} - ${home.data.bedrooms}BR ${home.data.sqft}sqft`);
      console.log(`      📍 ${home.data.address}\n`);
    });

    // Market analysis
    console.log('📊 MARKET ANALYSIS:');
    console.log('===================');
    const allProperties = await adapter.getAll<PropertyRow>('properties');
    const totalValue = allProperties.reduce((sum, prop) => sum + parseInt(prop.data.price), 0);
    const avgPrice = totalValue / allProperties.length;
    const avgSqft = allProperties.reduce((sum, prop) => sum + parseInt(prop.data.sqft), 0) / allProperties.length;

    console.log(`Total properties: ${allProperties.length}`);
    console.log(`Average price: $${Math.round(avgPrice).toLocaleString()}`);
    console.log(`Average size: ${Math.round(avgSqft)} sqft`);
    console.log(`Total market value: $${totalValue.toLocaleString()}`);

    console.log('\n✨ Real estate example completed successfully!');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    // Cleanup
    await adapter.dropTable('properties');
    await adapter.close();
  }
}

realEstateExample();
