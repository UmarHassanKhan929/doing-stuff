// src/examples/ecommerce.ts
import RedisTableAdapter from '../src/RedisTableAdapter';

interface ProductRow extends Record<string, string> {
  name: string;
  price: string;
  category: string;
  stock: string;
  rating: string;
}

interface OrderRow extends Record<string, string> {
  userId: string;
  productId: string;
  quantity: string;
  status: string;
  total: string;
}

async function ecommerceExample() {
  console.log('🛒 E-Commerce Example\n');

  const adapter = new RedisTableAdapter();

  try {
    // Create products table
    console.log('Creating products table...');
    await adapter.createTable('products', ['name', 'price', 'category', 'stock', 'rating']);
    console.log('✅ Products table created\n');

    // Create orders table
    console.log('Creating orders table...');
    await adapter.createTable('orders', ['userId', 'productId', 'quantity', 'status', 'total']);
    console.log('✅ Orders table created\n');

    // Insert products
    console.log('Adding products to catalog...');
    const p1 = await adapter.insert<ProductRow>('products', {
      name: 'Laptop Pro 15"',
      price: '1299',
      category: 'Electronics',
      stock: '50',
      rating: '4.5'
    });

    const p2 = await adapter.insert<ProductRow>('products', {
      name: 'Wireless Mouse',
      price: '29',
      category: 'Electronics',
      stock: '200',
      rating: '4.2'
    });

    const p3 = await adapter.insert<ProductRow>('products', {
      name: 'Office Chair Premium',
      price: '349',
      category: 'Furniture',
      stock: '15',
      rating: '4.7'
    });

    const p4 = await adapter.insert<ProductRow>('products', {
      name: 'Desk Lamp LED',
      price: '45',
      category: 'Furniture',
      stock: '100',
      rating: '4.0'
    });

    const p5 = await adapter.insert<ProductRow>('products', {
      name: 'Mechanical Keyboard',
      price: '129',
      category: 'Electronics',
      stock: '75',
      rating: '4.8'
    });

    const p6 = await adapter.insert<ProductRow>('products', {
      name: 'Monitor 27" 4K',
      price: '599',
      category: 'Electronics',
      stock: '30',
      rating: '4.6'
    });

    console.log('✅ 6 products added\n');

    // Create sorted index by price for price-based queries
    console.log('Creating price index...');
    await adapter.createSortedIndex('products', 'price', [
      { id: p1, score: 1299 },
      { id: p2, score: 29 },
      { id: p3, score: 349 },
      { id: p4, score: 45 },
      { id: p5, score: 129 },
      { id: p6, score: 599 }
    ]);
    console.log('✅ Price index created\n');

    // Create sorted index by rating for top-rated products
    console.log('Creating rating index...');
    await adapter.createSortedIndex('products', 'rating', [
      { id: p1, score: 4.5 },
      { id: p2, score: 4.2 },
      { id: p3, score: 4.7 },
      { id: p4, score: 4.0 },
      { id: p5, score: 4.8 },
      { id: p6, score: 4.6 }
    ]);
    console.log('✅ Rating index created\n');

    // SCENARIO 1: Browse products by category
    console.log('📱 BROWSING ELECTRONICS:');
    console.log('========================');
    const electronics = await adapter.findByField<ProductRow>('products', 'category', 'Electronics');
    electronics.forEach(product => {
      console.log(`- ${product.data.name.padEnd(25)} | $${product.data.price.padStart(6)} | ⭐ ${product.data.rating} | Stock: ${product.data.stock}`);
    });
    console.log('');

    // SCENARIO 2: Search by price range (affordable products $25-$500)
    console.log('💰 AFFORDABLE PRODUCTS ($25-$500):');
    console.log('===================================');
    const affordableProducts = await adapter.getRowsBySortedField<ProductRow>('products', 'price', {
      minScore: 25,
      maxScore: 500,
      order: 'asc'
    });
    affordableProducts.forEach((product, idx) => {
      console.log(`${idx + 1}. ${product.data.name.padEnd(25)} | $${product.data.price.padStart(6)} | ${product.data.category}`);
    });
    console.log('');

    // SCENARIO 3: Top-rated products
    console.log('⭐ TOP RATED PRODUCTS:');
    console.log('======================');
    const topRated = await adapter.getRowsBySortedField<ProductRow>('products', 'rating', {
      order: 'desc',
      limit: 3
    });
    topRated.forEach((product, idx) => {
      const stars = '⭐'.repeat(Math.floor(parseFloat(product.data.rating)));
      console.log(`${idx + 1}. ${product.data.name.padEnd(25)} | ${stars} ${product.data.rating} | $${product.data.price}`);
    });
    console.log('');

    // SCENARIO 4: Low stock alert
    console.log('⚠️  LOW STOCK ALERT (<20 items):');
    console.log('================================');
    const allProducts = await adapter.getAll<ProductRow>('products');
    const lowStock = allProducts.filter(p => parseInt(p.data.stock) < 20);
    lowStock.forEach(product => {
      console.log(`🔴 ${product.data.name.padEnd(25)} | Only ${product.data.stock} left!`);
    });
    console.log('');

    // SCENARIO 5: Customer places an order
    console.log('🛍️  PROCESSING ORDER:');
    console.log('=====================');
    const customerId = 'user_123';
    console.log(`Customer: ${customerId}`);
    console.log('Items to purchase:');
    console.log(`  - 1x Laptop Pro 15" ($1299)`);
    console.log(`  - 2x Wireless Mouse ($29 each)`);

    // Create orders
    const order1 = await adapter.insert<OrderRow>('orders', {
      userId: customerId,
      productId: p1,
      quantity: '1',
      status: 'processing',
      total: '1299'
    });

    const order2 = await adapter.insert<OrderRow>('orders', {
      userId: customerId,
      productId: p2,
      quantity: '2',
      status: 'processing',
      total: '58'
    });

    console.log(`✅ Order #${order1} created`);
    console.log(`✅ Order #${order2} created`);
    console.log('');

    // Update product stock
    console.log('Updating inventory...');
    await adapter.update('products', p1, { stock: '49' });
    await adapter.update('products', p2, { stock: '198' });
    console.log('✅ Inventory updated\n');

    // Get customer's orders
    console.log(`📦 ORDERS FOR CUSTOMER ${customerId}:`);
    console.log('=====================================');
    const customerOrders = await adapter.findByField<OrderRow>('orders', 'userId', customerId);
    let orderTotal = 0;
    for (const order of customerOrders) {
      const product = await adapter.getById<ProductRow>('products', order.data.productId);
      const itemTotal = parseInt(order.data.total);
      orderTotal += itemTotal;
      console.log(`Order #${order.id}:`);
      console.log(`  Product: ${product?.name}`);
      console.log(`  Quantity: ${order.data.quantity}`);
      console.log(`  Subtotal: $${order.data.total}`);
      console.log(`  Status: ${order.data.status}`);
      console.log('');
    }
    console.log(`💵 Total: $${orderTotal}\n`);

    // SCENARIO 6: Update order status
    console.log('📮 Shipping order...');
    await adapter.update('orders', order1, { status: 'shipped' });
    await adapter.update('orders', order2, { status: 'shipped' });
    console.log('✅ Orders shipped!\n');

    // SCENARIO 7: Product statistics
    console.log('📊 STORE STATISTICS:');
    console.log('====================');
    const totalProducts = await adapter.count('products');
    const electronicsCount = await adapter.countByField('products', 'category', 'Electronics');
    const furnitureCount = await adapter.countByField('products', 'category', 'Furniture');
    const totalOrders = await adapter.count('orders');

    const allProductsList = await adapter.getAll<ProductRow>('products');
    const totalInventoryValue = allProductsList.reduce((sum, p) => {
      return sum + (parseInt(p.data.price) * parseInt(p.data.stock));
    }, 0);
    const avgRating = allProductsList.reduce((sum, p) => sum + parseFloat(p.data.rating), 0) / allProductsList.length;

    console.log(`Total Products: ${totalProducts}`);
    console.log(`  - Electronics: ${electronicsCount}`);
    console.log(`  - Furniture: ${furnitureCount}`);
    console.log(`Total Orders: ${totalOrders}`);
    console.log(`Average Rating: ${avgRating.toFixed(2)} ⭐`);
    console.log(`Inventory Value: $${totalInventoryValue.toLocaleString()}`);
    console.log('');

    // SCENARIO 8: Best sellers (simulated with sorted set)
    console.log('Creating best sellers list...');
    await adapter.addMultipleToSortedSet('bestsellers', [
      { score: 150, member: p2 }, // Wireless Mouse - 150 sold
      { score: 89, member: p5 },  // Keyboard - 89 sold
      { score: 67, member: p1 },  // Laptop - 67 sold
      { score: 45, member: p6 },  // Monitor - 45 sold
      { score: 34, member: p4 },  // Lamp - 34 sold
      { score: 23, member: p3 }   // Chair - 23 sold
    ]);

    console.log('\n🔥 BEST SELLERS:');
    console.log('================');
    const bestsellers = await adapter.getSortedSetByRankReverse('bestsellers', 0, 4, true) as Array<{ member: string; score: number }>;

    for (let i = 0; i < bestsellers.length; i++) {
      const product = await adapter.getById<ProductRow>('products', bestsellers[i].member);
      const rank = i + 1;
      const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : '  ';
      console.log(`${medal} #${rank}: ${product?.name.padEnd(25)} | ${bestsellers[i].score} units sold | $${product?.price}`);
    }

    console.log('\n✨ E-commerce example completed successfully!');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    // Cleanup
    await adapter.dropTable('products');
    await adapter.dropTable('orders');
    await adapter.getRedis().del('bestsellers');
    await adapter.close();
  }
}

ecommerceExample();
